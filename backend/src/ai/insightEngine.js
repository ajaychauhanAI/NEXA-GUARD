/**
 * NEXA-GUARD Institutional Operational Intelligence Engine
 * 
 * Computes the multi-factor Operational Intelligence Score (0–100)
 * from live PostgreSQL compliance, gate efficiency, anomaly resolution, and policy records.
 */

const db = require('../config/db');

/**
 * Computes the Operational Intelligence Score and sub-factor metrics
 * @param {number} hostelId 
 */
async function computeOperationalScore(hostelId = 1) {
    // 1. Movement Compliance Factor (Weight: 35 points)
    const passComplianceRes = await db.query(`
        SELECT 
            COUNT(*) as total_passes,
            COUNT(CASE WHEN delay_minutes <= 15 OR delay_minutes IS NULL THEN 1 END) as on_time_passes,
            COUNT(CASE WHEN status = 'OVERDUE' OR delay_minutes > 15 THEN 1 END) as overdue_passes
        FROM passes
        WHERE hostel_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [hostelId]);

    const totalPasses = parseInt(passComplianceRes.rows[0].total_passes) || 1;
    const onTimePasses = parseInt(passComplianceRes.rows[0].on_time_passes) || 1;
    const overduePasses = parseInt(passComplianceRes.rows[0].overdue_passes) || 0;
    const complianceRate = Math.min(100, Math.round((onTimePasses / totalPasses) * 100));
    const complianceScore = parseFloat(((complianceRate / 100) * 35).toFixed(1));

    // 2. Gate Verification Efficiency (Weight: 25 points)
    const gateScansRes = await db.query(`
        SELECT 
            COUNT(*) as total_scans,
            COUNT(CASE WHEN verification_status = 'VALID' THEN 1 END) as valid_scans,
            COUNT(CASE WHEN verification_status != 'VALID' THEN 1 END) as failed_scans
        FROM gate_events
        WHERE hostel_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [hostelId]);

    const totalScans = parseInt(gateScansRes.rows[0].total_scans) || 1;
    const validScans = parseInt(gateScansRes.rows[0].valid_scans) || 1;
    const failedScans = parseInt(gateScansRes.rows[0].failed_scans) || 0;
    const gateSuccessRate = Math.min(100, Math.round((validScans / totalScans) * 100));
    const gateEfficiencyScore = parseFloat(((gateSuccessRate / 100) * 25).toFixed(1));

    // 3. Anomaly Resolution & Security Health (Weight: 20 points)
    const anomalyRes = await db.query(`
        SELECT 
            COUNT(*) as total_anomalies,
            COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved_anomalies,
            COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_anomalies
        FROM anomalies
        WHERE hostel_id = $1
    `, [hostelId]);

    const totalAnomalies = parseInt(anomalyRes.rows[0].total_anomalies);
    const activeAnomalies = parseInt(anomalyRes.rows[0].active_anomalies);
    let anomalyScore = 20.0;
    if (totalAnomalies > 0) {
        const unresolvedRatio = activeAnomalies / totalAnomalies;
        anomalyScore = parseFloat(Math.max(5, (20 - (unresolvedRatio * 15))).toFixed(1));
    }

    // 4. Policy & Geofence Adherence (Weight: 20 points)
    const geoRes = await db.query(`
        SELECT 
            COUNT(*) as total_requests,
            COUNT(CASE WHEN location_verified = TRUE THEN 1 END) as verified_requests
        FROM pass_requests
        WHERE hostel_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [hostelId]);

    const totalRequests = parseInt(geoRes.rows[0].total_requests) || 1;
    const verifiedRequests = parseInt(geoRes.rows[0].verified_requests) || 1;
    const geoAdherenceRate = Math.min(100, Math.round((verifiedRequests / totalRequests) * 100));
    const policyAdherenceScore = parseFloat(((geoAdherenceRate / 100) * 20).toFixed(1));

    // Composite Total Score
    const compositeScore = Math.round(complianceScore + gateEfficiencyScore + anomalyScore + policyAdherenceScore);

    let statusGrade = 'OPTIMAL';
    let statusColor = 'emerald';
    if (compositeScore < 50) {
        statusGrade = 'CRITICAL_ATTENTION';
        statusColor = 'red';
    } else if (compositeScore < 70) {
        statusGrade = 'NEEDS_ATTENTION';
        statusColor = 'amber';
    } else if (compositeScore < 85) {
        statusGrade = 'ADEQUATE';
        statusColor = 'blue';
    }

    return {
        operationalScore: compositeScore,
        statusGrade,
        statusColor,
        components: {
            movementCompliance: {
                score: complianceScore,
                max: 35,
                metricLabel: `${complianceRate}% On-Time Returns`,
                overdueCount: overduePasses
            },
            gateEfficiency: {
                score: gateEfficiencyScore,
                max: 25,
                metricLabel: `${gateSuccessRate}% Valid QR Scans`,
                failedAttempts: failedScans
            },
            anomalyResolution: {
                score: anomalyScore,
                max: 20,
                metricLabel: `${activeAnomalies} Active Anomalies`,
                activeCount: activeAnomalies
            },
            policyAdherence: {
                score: policyAdherenceScore,
                max: 20,
                metricLabel: `${geoAdherenceRate}% Verified Geofence Passes`,
                verifiedRequests
            }
        },
        calculatedAt: new Date().toISOString()
    };
}

module.exports = {
    computeOperationalScore
};
