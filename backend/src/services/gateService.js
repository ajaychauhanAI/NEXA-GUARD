/**
 * Gate Management & Movement Tracking Service
 * 
 * Enforces atomic state transitions between student residential status (IN_HOSTEL / OUTSIDE)
 * and pass lifecycle (APPROVED -> ACTIVE -> USED / OVERDUE), records audit events,
 * detects curfew breaches, and logs AI human feedback data.
 */

const db = require('../config/db');
const { logAudit } = require('../middleware/audit');
const emailService = require('./emailService');
const notificationService = require('./notificationService');

async function scanGateToken({ tokenOrCode, gateId, guardUser }) {
    if (!tokenOrCode) {
        return {
            isValid: false,
            verificationStatus: 'INVALID_TOKEN',
            message: 'No QR token or return code provided.'
        };
    }

    const hostelId = guardUser.hostel_id || 1;

    // Lookup pass by either qr_token or 6-digit return_code within the guard's hostel (Multi-tenant check)
    const query = `
        SELECT p.*, r.reason, r.destination,
               s.id as student_id, s.roll_number, s.course, s.branch, s.photo_url, s.movement_status,
               u.full_name as student_name, u.phone as student_phone,
               rm.room_number, b.block_name,
               rs.risk_score, rs.risk_level, rs.recommendation
        FROM passes p
        JOIN pass_requests r ON r.id = p.request_id
        JOIN students s ON s.id = p.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN rooms rm ON rm.id = s.room_id
        LEFT JOIN floors f ON f.id = rm.floor_id
        LEFT JOIN blocks b ON b.id = f.block_id
        LEFT JOIN risk_scores rs ON rs.request_id = r.id
        WHERE (p.qr_token = $1 OR p.return_code = $1)
          AND p.hostel_id = $2
        ORDER BY p.id DESC LIMIT 1
    `;
    const res = await db.query(query, [tokenOrCode.trim(), hostelId]);

    if (res.rows.length === 0) {
        await db.query(`
            INSERT INTO gate_events (hostel_id, gate_id, guard_id, action_type, verification_status, denial_reason)
            VALUES ($1, $2, $3, 'SCAN_DENIED', 'INVALID_TOKEN', 'Unrecognized QR token / Return code in this hostel')
        `, [hostelId, gateId, guardUser.id]);

        return {
            isValid: false,
            canExit: false,
            canReturn: false,
            verificationStatus: 'INVALID_TOKEN',
            message: 'Unrecognized pass token. No matching record in this hostel database.'
        };
    }

    const pass = res.rows[0];
    const now = new Date();
    const validUntil = new Date(pass.valid_until);

    let verificationStatus = 'VALID';
    let canExit = false;
    let canReturn = false;
    let denialReason = null;

    if (pass.status === 'APPROVED') {
        if (pass.movement_status === 'OUTSIDE') {
            verificationStatus = 'MANUAL_REVIEW';
            denialReason = 'Conflict: Pass is APPROVED but student is already marked OUTSIDE campus.';
        } else {
            canExit = true;
            verificationStatus = 'VALID';
        }
    } else if (pass.status === 'ACTIVE' || pass.status === 'OVERDUE') {
        if (pass.movement_status === 'IN_HOSTEL') {
            verificationStatus = 'MANUAL_REVIEW';
            denialReason = 'Conflict: Pass is ACTIVE but student is already marked IN_HOSTEL.';
        } else {
            canReturn = true;
            verificationStatus = 'VALID';
            if (now > validUntil) {
                verificationStatus = 'MANUAL_REVIEW';
                denialReason = `Pass expired ${Math.round((now - validUntil) / 60000)} minutes ago. Overdue check-in required.`;
            }
        }
    } else if (pass.status === 'USED') {
        verificationStatus = 'ALREADY_USED';
        denialReason = 'This movement pass has already been closed and marked USED.';
    } else if (pass.status === 'EXPIRED') {
        verificationStatus = 'EXPIRED';
        denialReason = 'Pass has expired without gate check-out.';
    } else if (pass.status === 'CANCELLED') {
        verificationStatus = 'CANCELLED';
        denialReason = 'Movement pass was cancelled prior to departure.';
    }

    await db.query(`
        INSERT INTO gate_events (hostel_id, gate_id, guard_id, pass_id, student_id, action_type, verification_status, denial_reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
        hostelId, gateId, guardUser.id, pass.id, pass.student_id,
        verificationStatus === 'VALID' ? 'SCAN_VERIFIED' : 'SCAN_DENIED',
        verificationStatus, denialReason
    ]);

    return {
        isValid: verificationStatus === 'VALID' || verificationStatus === 'MANUAL_REVIEW',
        verificationStatus,
        canExit,
        canReturn,
        message: denialReason || 'Pass verified successfully. Authorized for gate transit.',
        student: {
            id: pass.student_id,
            name: pass.student_name,
            rollNumber: pass.roll_number,
            course: pass.course,
            branch: pass.branch,
            block: pass.block_name,
            room: pass.room_number,
            photoUrl: pass.photo_url,
            phone: pass.student_phone,
            movementStatus: pass.movement_status
        },
        pass: {
            id: pass.id,
            passNumber: pass.pass_number,
            passType: pass.pass_type,
            validFrom: pass.valid_from,
            validUntil: pass.valid_until,
            status: pass.status,
            destination: pass.destination,
            reason: pass.reason,
            riskScore: pass.risk_score,
            riskLevel: pass.risk_level,
            returnCode: pass.return_code
        }
    };
}

async function authorizeExit({ passId, gateId, guardUser }) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const hostelId = guardUser.hostel_id || 1;
        const passRes = await client.query(`
            SELECT p.*, s.movement_status, s.user_id, u.full_name as student_name
            FROM passes p
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            WHERE p.id = $1 AND p.hostel_id = $2
            FOR UPDATE
        `, [passId, hostelId]);

        if (passRes.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new Error('Pass not found in your institutional jurisdiction.');
        }

        const pass = passRes.rows[0];

        // State Machine Validations
        if (pass.status !== 'APPROVED') {
            await client.query('ROLLBACK');
            throw new Error(`Cannot authorize exit. Pass status is ${pass.status} (must be APPROVED).`);
        }

        if (pass.movement_status === 'OUTSIDE') {
            await client.query('ROLLBACK');
            throw new Error('Invalid movement transition: Student is already marked OUTSIDE campus.');
        }

        // 1. Update Pass to ACTIVE
        await client.query(`
            UPDATE passes
            SET status = 'ACTIVE', actual_exit_time = NOW(), exit_gate_id = $1, exit_guard_id = $2, updated_at = NOW()
            WHERE id = $3
        `, [gateId, guardUser.id, passId]);

        // 2. Update Student movement_status to OUTSIDE
        await client.query(`
            UPDATE students
            SET movement_status = 'OUTSIDE', updated_at = NOW()
            WHERE id = $1
        `, [pass.student_id]);

        // 3. Log gate and pass events
        await client.query(`
            INSERT INTO gate_events (hostel_id, gate_id, guard_id, pass_id, student_id, action_type, verification_status)
            VALUES ($1, $2, $3, $4, $5, 'EXIT_AUTHORIZED', 'VALID')
        `, [hostelId, gateId, guardUser.id, passId, pass.student_id]);

        await client.query(`
            INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
            VALUES ($1, 'EXIT', $2, 'Student exited via Gate ID ' || $3)
        `, [passId, guardUser.id, gateId]);

        await client.query('COMMIT');

        // Notify linked parent in-app
        notificationService.notifyParentOfStudent({
            studentId: pass.student_id,
            title: 'Ward Exited Campus Gate',
            message: `Your ward ${pass.student_name} has checked out through gate with Pass #${pass.pass_number}.`,
            notificationType: 'GATE_EXIT',
            relatedId: passId
        }).catch(e => console.warn('Parent exit notification error:', e.message));

        await logAudit({
            hostelId,
            actorId: guardUser.id,
            actorEmail: guardUser.email,
            actorRole: guardUser.role,
            action: 'GATE_EXIT',
            targetType: 'PASS',
            targetId: String(passId),
            result: 'SUCCESS',
            context: { gateId, studentId: pass.student_id }
        });

        return { success: true, message: 'Exit transit verified. Student status set to OUTSIDE.' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function verifyReturn({ passIdOrCode, gateId, guardUser }) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const hostelId = guardUser.hostel_id || 1;
        const passRes = await client.query(`
            SELECT p.*, s.roll_number, s.movement_status, s.user_id,
                   u.full_name as student_name, u.email as student_email
            FROM passes p
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            WHERE (p.id = $1 OR p.return_code = $2 OR p.qr_token = $2)
              AND p.hostel_id = $3
            FOR UPDATE
        `, [parseInt(passIdOrCode) || 0, String(passIdOrCode).trim(), hostelId]);

        if (passRes.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new Error('Movement pass not found in your institutional jurisdiction.');
        }

        const pass = passRes.rows[0];

        // State Machine Validations
        if (pass.status !== 'ACTIVE' && pass.status !== 'OVERDUE') {
            await client.query('ROLLBACK');
            throw new Error(`Cannot verify return. Pass status is ${pass.status} (must be ACTIVE or OVERDUE).`);
        }

        if (pass.movement_status === 'IN_HOSTEL') {
            await client.query('ROLLBACK');
            throw new Error('Invalid movement transition: Student is already marked IN_HOSTEL.');
        }

        const now = new Date();
        const validUntil = new Date(pass.valid_until);
        let delayMinutes = 0;
        let isLate = false;

        if (now > validUntil) {
            delayMinutes = Math.round((now.getTime() - validUntil.getTime()) / (1000 * 60));
            isLate = delayMinutes > 15; // 15-minute institutional grace window
        }

        // 1. Update Pass to USED
        await client.query(`
            UPDATE passes
            SET status = 'USED', actual_return_time = NOW(), return_gate_id = $1, return_guard_id = $2, delay_minutes = $3, updated_at = NOW()
            WHERE id = $4
        `, [gateId, guardUser.id, delayMinutes, pass.id]);

        // 2. Update Student to IN_HOSTEL
        await client.query(`
            UPDATE students
            SET movement_status = 'IN_HOSTEL', updated_at = NOW()
            WHERE id = $1
        `, [pass.student_id]);

        // 3. Log gate and pass events
        await client.query(`
            INSERT INTO gate_events (hostel_id, gate_id, guard_id, pass_id, student_id, action_type, verification_status)
            VALUES ($1, $2, $3, $4, $5, 'RETURN_AUTHORIZED', 'VALID')
        `, [hostelId, gateId, guardUser.id, pass.id, pass.student_id]);

        await client.query(`
            INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
            VALUES ($1, 'RETURN', $2, $3)
        `, [pass.id, guardUser.id, isLate ? `Returned late by ${delayMinutes} minutes` : 'Returned on schedule']);

        // 4. Record Human Decision in AI Feedback Loop
        await client.query(`
            INSERT INTO ai_feedback (hostel_id, pass_id, request_id, actual_outcome, decision_notes, actor_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            hostelId, pass.id, pass.request_id,
            isLate ? 'OVERDUE' : 'RETURNED_ON_TIME',
            isLate ? `Late by ${delayMinutes} mins` : 'Punctual return',
            guardUser.id
        ]);

        // 5. If Late Return, issue Alert and Automated Fine
        if (isLate) {
            await client.query(`
                INSERT INTO alerts (hostel_id, student_id, pass_id, alert_type, severity, message)
                VALUES ($1, $2, $3, 'LATE_RETURN', 'WARNING', $4)
            `, [
                hostelId, pass.student_id, pass.id,
                `Late Return: Student ${pass.student_name} (${pass.roll_number}) checked in ${delayMinutes} minutes overdue.`
            ]);

            const fineNumber = `FIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const fineAmount = Math.ceil(delayMinutes / 60) * 100.00;
            await client.query(`
                INSERT INTO fines (fine_number, student_id, pass_id, reason, amount, status, issued_by, notes)
                VALUES ($1, $2, $3, $4, $5, 'UNPAID', $6, $7)
            `, [
                fineNumber, pass.student_id, pass.id,
                `Curfew delay of ${delayMinutes} minutes on pass ${pass.pass_number}`,
                fineAmount, guardUser.id, 'Automated curfew policy assessment'
            ]);

            // Query parent email if available
            const parentRes = await client.query(`
                SELECT u.email FROM users u
                JOIN parent_student ps ON ps.parent_user_id = u.id
                WHERE ps.student_id = $1 LIMIT 1
            `, [pass.student_id]);
            const parentEmail = parentRes.rows[0]?.email;

            // Trigger email notification
            emailService.sendLateReturnAlert({
                studentUser: { id: pass.user_id, email: pass.student_email, full_name: pass.student_name },
                parentEmail,
                pass,
                delayMinutes,
                hostel: { id: hostelId }
            }).catch(e => console.error('Late return email dispatch error:', e.message));
        }

        await client.query('COMMIT');

        // Notify linked parent in-app
        notificationService.notifyParentOfStudent({
            studentId: pass.student_id,
            title: isLate ? 'Ward Returned (Delayed)' : 'Ward Returned to Hostel',
            message: isLate
                ? `Your ward ${pass.student_name} has returned to the hostel with a recorded delay of ${delayMinutes} minutes.`
                : `Your ward ${pass.student_name} has safely returned inside the hostel.`,
            notificationType: isLate ? 'LATE_RETURN' : 'GATE_RETURN',
            relatedId: pass.id
        }).catch(e => console.warn('Parent return notification error:', e.message));

        await logAudit({
            hostelId,
            actorId: guardUser.id,
            actorEmail: guardUser.email,
            actorRole: guardUser.role,
            action: isLate ? 'LATE_RETURN' : 'GATE_RETURN',
            targetType: 'PASS',
            targetId: String(pass.id),
            result: 'SUCCESS',
            context: { delayMinutes, isLate, gateId }
        });

        return {
            success: true,
            message: isLate ? `Return registered with ${delayMinutes} mins delay. Late return alert recorded.` : 'Welcome back! Return verified on schedule.',
            isLate,
            delayMinutes
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    scanGateToken,
    authorizeExit,
    verifyReturn
};
