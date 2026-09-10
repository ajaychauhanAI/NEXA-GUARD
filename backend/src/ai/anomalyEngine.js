/**
 * NEXA-GUARD AI Anomaly Detection Engine
 * 
 * Scans PostgreSQL relational movement logs for behavioral deviations,
 * scan anomalies, and policy non-compliance patterns.
 */

const db = require('../config/db');

async function scanAndDetectAnomalies(hostelId = 1) {
    const detected = [];

    // 1. ANOMALY: Unusual Movement Frequency (Students with >= 4 requests in last 72 hours)
    const freqQuery = `
        SELECT r.student_id, s.roll_number, u.full_name, COUNT(r.id) as req_count
        FROM pass_requests r
        JOIN students s ON s.id = r.student_id
        JOIN users u ON u.id = s.user_id
        WHERE r.hostel_id = $1 AND r.created_at >= NOW() - INTERVAL '72 hours'
        GROUP BY r.student_id, s.roll_number, u.full_name
        HAVING COUNT(r.id) >= 4
    `;
    const freqRes = await db.query(freqQuery, [hostelId]);
    for (const row of freqRes.rows) {
        detected.push({
            studentId: row.student_id,
            anomalyType: 'UNUSUAL_MOVEMENT_FREQUENCY',
            severity: 'HIGH',
            description: `Frequent Movement Velocity: Student ${row.full_name} (${row.roll_number}) submitted ${row.req_count} requests in 72 hours.`,
            evidence: { requestCount72h: parseInt(row.req_count), threshold: 3 }
        });
    }

    // 2. ANOMALY: Chronic Late Returns (Students with 2 or more overdue passes)
    const lateQuery = `
        SELECT p.student_id, s.roll_number, u.full_name, 
               COUNT(p.id) as late_count, 
               ROUND(AVG(p.delay_minutes)) as avg_delay
        FROM passes p
        JOIN students s ON s.id = p.student_id
        JOIN users u ON u.id = s.user_id
        WHERE p.hostel_id = $1 AND p.delay_minutes > 15
        GROUP BY p.student_id, s.roll_number, u.full_name
        HAVING COUNT(p.id) >= 2
    `;
    const lateRes = await db.query(lateQuery, [hostelId]);
    for (const row of lateRes.rows) {
        detected.push({
            studentId: row.student_id,
            anomalyType: 'CHRONIC_LATE_RETURNS',
            severity: 'MEDIUM',
            description: `Recurrent Late Return: Student ${row.full_name} (${row.roll_number}) recorded ${row.late_count} delayed check-ins (avg ${row.avg_delay} mins).`,
            evidence: { lateCount: parseInt(row.late_count), avgDelayMins: parseInt(row.avg_delay) }
        });
    }

    // 3. ANOMALY: Spike in Failed Gate Scans (Gate level)
    const failedScansQuery = `
        SELECT g.gate_code, g.gate_name, COUNT(ge.id) as failed_count
        FROM gate_events ge
        JOIN gates g ON g.id = ge.gate_id
        WHERE ge.hostel_id = $1 
          AND ge.action_type = 'SCAN_DENIED'
          AND ge.created_at >= NOW() - INTERVAL '2 hours'
        GROUP BY g.gate_code, g.gate_name
        HAVING COUNT(ge.id) >= 2
    `;
    const failRes = await db.query(failedScansQuery, [hostelId]);
    for (const row of failRes.rows) {
        detected.push({
            studentId: null,
            anomalyType: 'REPEATED_FAILED_GATE_SCANS',
            severity: 'HIGH',
            description: `Scan Rejection Surge: ${row.failed_count} unauthorized or invalid pass scans at ${row.gate_name} (${row.gate_code}) in last 2 hours.`,
            evidence: { gateCode: row.gate_code, failedAttempts: parseInt(row.failed_count) }
        });
    }

    // Persist new anomalies if not already recorded within the last 6 hours
    for (const anom of detected) {
        const checkQuery = `
            SELECT id FROM anomalies
            WHERE hostel_id = $1 
              AND anomaly_type = $2 
              AND (student_id = $3 OR ($3 IS NULL AND student_id IS NULL))
              AND detected_at >= NOW() - INTERVAL '6 hours'
        `;
        const exists = await db.query(checkQuery, [hostelId, anom.anomalyType, anom.studentId]);
        if (exists.rows.length === 0) {
            await db.query(`
                INSERT INTO anomalies (hostel_id, student_id, anomaly_type, severity, description, evidence, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
            `, [hostelId, anom.studentId, anom.anomalyType, anom.severity, anom.description, JSON.stringify(anom.evidence)]);
        }
    }

    // Return current active anomalies
    const allAnomaliesQuery = `
        SELECT a.*, s.roll_number, u.full_name as student_name
        FROM anomalies a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN users u ON u.id = s.user_id
        WHERE a.hostel_id = $1
        ORDER BY a.detected_at DESC
        LIMIT 20
    `;
    const result = await db.query(allAnomaliesQuery, [hostelId]);
    return result.rows;
}

module.exports = {
    scanAndDetectAnomalies
};
