/**
 * NEXA-GUARD Idempotent Background Curfew & Movement Monitor
 * 
 * Periodically scans active movements across all registered hostels:
 * - Identifies passes exceeding curfew deadlines and configured grace periods
 * - Transition passes from 'ACTIVE' to 'OVERDUE'
 * - Idempotently issues Late Return alerts and policy-based fines without duplicate spam
 * - Dispatches transactional email notifications to students and linked guardians
 * - Triggers continuous anomaly detection across all operational hostels
 */

const db = require('../config/db');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { scanAndDetectAnomalies } = require('../ai/anomalyEngine');

let monitorInterval = null;

async function runCurfewCheck() {
    try {
        // Query active passes that have passed valid_until
        const overduePassesQuery = `
            SELECT p.id, p.pass_number, p.student_id, p.hostel_id, p.valid_until,
                   s.roll_number, u.full_name as student_name, u.email as student_email,
                   h.name as hostel_name,
                   pu.email as parent_email
            FROM passes p
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            JOIN hostels h ON h.id = p.hostel_id
            LEFT JOIN parents pr ON pr.student_id = s.id
            LEFT JOIN users pu ON pu.id = pr.user_id
            WHERE p.status IN ('ACTIVE', 'APPROVED')
              AND p.valid_until < NOW()
        `;
        const res = await db.query(overduePassesQuery);

        for (const pass of res.rows) {
            const delayMinutes = Math.round((Date.now() - new Date(pass.valid_until).getTime()) / 60000);

            // Fetch policy for this hostel or default to 15 min grace
            let graceMinutes = 15;
            let fineAmount = 100.00;

            const policyRes = await db.query(
                `SELECT policy_value FROM policies WHERE hostel_id = $1 AND policy_code = 'CURFEW_RULES'`,
                [pass.hostel_id]
            );
            if (policyRes.rows.length > 0) {
                const val = typeof policyRes.rows[0].policy_value === 'string' 
                    ? JSON.parse(policyRes.rows[0].policy_value) 
                    : policyRes.rows[0].policy_value;
                if (val.graceMinutes) graceMinutes = parseInt(val.graceMinutes);
                if (val.finePerLateHour) fineAmount = parseFloat(val.finePerLateHour);
            }

            if (delayMinutes > graceMinutes) {
                // 1. Atomically update pass status to OVERDUE
                await db.query(
                    `UPDATE passes SET status = 'OVERDUE', delay_minutes = $1, updated_at = NOW() WHERE id = $2 AND status != 'OVERDUE'`,
                    [delayMinutes, pass.id]
                );

                // 2. Idempotent Alert Creation: only create if not already alerted
                const alertCheck = await db.query(
                    `SELECT id FROM alerts WHERE pass_id = $1 AND alert_type = 'LATE_RETURN'`,
                    [pass.id]
                );
                if (alertCheck.rows.length === 0) {
                    await db.query(`
                        INSERT INTO alerts (hostel_id, student_id, pass_id, alert_type, severity, message)
                        VALUES ($1, $2, $3, 'LATE_RETURN', 'WARNING', $4)
                    `, [
                        pass.hostel_id,
                        pass.student_id,
                        pass.id,
                        `Late Return Alert: Student ${pass.student_name} (${pass.roll_number}) has exceeded gate return deadline by ${delayMinutes} minutes.`
                    ]);

                    // In-app notifications to wardens and linked parents
                    notificationService.notifyWardens({
                        hostelId: pass.hostel_id,
                        title: '⚠️ Late Return Alert (Gate Deadline Exceeded)',
                        message: `Student ${pass.student_name} (${pass.roll_number}) is overdue by ${delayMinutes} minutes past gate entry deadline on pass ${pass.pass_number}.`,
                        notificationType: 'LATE_RETURN',
                        relatedId: pass.id
                    }).catch(e => console.warn('Warden overdue notification error:', e.message));

                    notificationService.notifyParentOfStudent({
                        studentId: pass.student_id,
                        title: '⚠️ Late Gate Return Notice',
                        message: `Your ward ${pass.student_name} has exceeded the approved gate return deadline by ${delayMinutes} minutes on pass ${pass.pass_number}.`,
                        notificationType: 'LATE_RETURN',
                        relatedId: pass.id
                    }).catch(e => console.warn('Parent overdue notification error:', e.message));

                    // Dispatch late return alert email to resident and linked parent
                    emailService.sendLateReturnAlert({
                        studentUser: { id: pass.student_id, email: pass.student_email, full_name: pass.student_name },
                        parentEmail: pass.parent_email,
                        pass: { pass_number: pass.pass_number },
                        delayMinutes,
                        hostel: { id: pass.hostel_id, name: pass.hostel_name }
                    }).catch(e => console.error('Late return alert email error:', e.message));
                }

                // 3. Idempotent Disciplinary Fine: exactly one fine per overdue pass
                const fineCheck = await db.query(
                    `SELECT id FROM fines WHERE pass_id = $1`,
                    [pass.id]
                );
                if (fineCheck.rows.length === 0) {
                    const fineNumber = `FIN-${new Date().getFullYear()}-${String(pass.id).padStart(4, '0')}`;
                    await db.query(`
                        INSERT INTO fines (fine_number, student_id, pass_id, reason, amount, status, notes)
                        VALUES ($1, $2, $3, 'Curfew violation exceeding grace period', $4, 'UNPAID', 'Automated disciplinary fine triggered by background curfew monitor')
                    `, [fineNumber, pass.student_id, pass.id, fineAmount]);

                    // In-app notification to student
                    notificationService.notifyStudent({
                        studentId: pass.student_id,
                        title: 'Disciplinary Fine Issued',
                        message: `A fine of ₹${parseFloat(fineAmount).toFixed(2)} (${fineNumber}) has been issued for curfew delay of ${delayMinutes} minutes.`,
                        notificationType: 'FINE_ISSUED',
                        relatedId: pass.id
                    }).catch(e => console.warn('Student fine notification error:', e.message));

                    // Dispatch fine email
                    emailService.sendFineIssued({
                        studentUser: { id: pass.student_id, email: pass.student_email, full_name: pass.student_name },
                        fine: { fine_number: fineNumber, amount: fineAmount, reason: 'Curfew violation exceeding grace period' },
                        hostel: { id: pass.hostel_id, name: pass.hostel_name }
                    }).catch(e => console.warn('Fine email dispatch error:', e.message));
                }
            }
        }

        // 4. Run Anomaly Engine across all registered hostels
        const hostelsRes = await db.query(`SELECT id FROM hostels`);
        for (const h of hostelsRes.rows) {
            try {
                await scanAndDetectAnomalies(h.id);
            } catch (anomErr) {
                console.error(`Anomaly scan error for hostel ${h.id}:`, anomErr.message);
            }
        }

    } catch (err) {
        console.error('Error executing curfew monitor check:', err.message);
    }
}

function startCurfewMonitor(intervalMs = 60000) {
    if (monitorInterval) {
        clearInterval(monitorInterval);
    }
    // Run an immediate check on startup
    runCurfewCheck();
    monitorInterval = setInterval(runCurfewCheck, intervalMs);
    console.log(`🛡️ NEXA-GUARD Background Curfew & Movement Monitor scheduled (every ${intervalMs / 1000}s)`);
}

function stopCurfewMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

module.exports = {
    runCurfewCheck,
    startCurfewMonitor,
    stopCurfewMonitor
};
