/**
 * NEXA-GUARD AI Risk Intelligence Engine
 * 
 * Multi-source, explainable risk scoring system.
 * Aggregates signals across:
 * - Movement timing (curfew proximity, night hours)
 * - Frequency of pass requests within 72 hours
 * - Historical late return ratio
 * - Location verification / geofence compliance
 * - Student current disciplinary status & active fines
 * - Past failed gate scan attempts
 */

const db = require('../config/db');
const { evaluateBaselineDeviation } = require('./baselineEngine');

async function calculatePassRiskScore({ studentId, hostelId, passType, fromTime, toTime, isLocationVerified, requestLat, requestLng }) {
    let riskScore = 0;
    const reasons = [];
    const signals = {};

    const reqFrom = new Date(fromTime);
    const reqTo = new Date(toTime);
    const fromHour = reqFrom.getHours();
    const toHour = reqTo.getHours();
    const durationHours = (reqTo.getTime() - reqFrom.getTime()) / (1000 * 60 * 60);

    // 0. SIGNAL: Personal Behavioral Baseline Deviation
    let baselineData = null;
    try {
        const baselineEval = await evaluateBaselineDeviation(studentId, fromTime, toTime, hostelId);
        baselineData = baselineEval.baseline;
        if (baselineEval.deviationPoints > 0) {
            riskScore += baselineEval.deviationPoints;
            signals.baselineDeviation = baselineEval.deviationPoints;
            reasons.push(...baselineEval.reasons);
        }
    } catch (e) {
        console.warn('Baseline deviation eval non-blocking error:', e.message);
    }

    // Fetch hostel information and institutional gate policies
    let hostelType = 'BOYS';
    let gateClosingTimeStr = '21:30';
    let graceMinutes = 15;
    try {
        const hostelRes = await db.query('SELECT hostel_type FROM hostels WHERE id = $1', [hostelId]);
        if (hostelRes.rows.length > 0 && hostelRes.rows[0].hostel_type) {
            hostelType = hostelRes.rows[0].hostel_type;
        }

        const policyRes = await db.query(
            `SELECT policy_code, policy_value FROM policies WHERE hostel_id = $1 AND policy_code IN ('CURFEW_RULES', 'GATE_RULES')`,
            [hostelId]
        );
        if (policyRes.rows.length > 0) {
            const val = typeof policyRes.rows[0].policy_value === 'string' 
                ? JSON.parse(policyRes.rows[0].policy_value) 
                : policyRes.rows[0].policy_value;
            if (hostelType === 'GIRLS') {
                gateClosingTimeStr = val.girlsGateClosing || '20:30';
            } else {
                gateClosingTimeStr = val.boysGateClosing || val.curfewTime || '21:30';
            }
            if (val.graceMinutes) graceMinutes = parseInt(val.graceMinutes);
        } else {
            gateClosingTimeStr = hostelType === 'GIRLS' ? '20:30' : '21:30';
        }
    } catch (e) {
        console.warn('Hostel policy lookup non-blocking warning:', e.message);
    }

    const [gcHour, gcMin] = gateClosingTimeStr.split(':').map(Number);
    const gateClosingDecimal = gcHour + (gcMin || 0) / 60;
    const toHourDecimal = toHour + reqTo.getMinutes() / 60;
    const fromHourDecimal = fromHour + reqFrom.getMinutes() / 60;
    const dayOfWeek = reqFrom.getDay(); // 0 is Sun, 1-6 Mon-Sat
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 6;

    // Academic Hours Protection: Mon-Sat 09:00 to 16:30
    if (isWorkingDay && (passType === 'OUTPASS' || passType === 'DAY')) {
        const overlapsCollegeHours = (fromHourDecimal < 16.5 && toHourDecimal > 9.0);
        if (overlapsCollegeHours) {
            signals.academicHoursBreach = true;
            riskScore += 35;
            reasons.push('Academic Hours Breach: Outpass overlaps with active college lecture hours (09:00 - 16:30). Casual passes restricted during classes.');
        }
    }

    // 1. SIGNAL: Timing Risk & Gate Closing Deadline
    let timingRisk = 0;
    const isOverGateDeadline = toHourDecimal > gateClosingDecimal;
    const isApproachingGateDeadline = (gateClosingDecimal - toHourDecimal <= 0.5) && !isOverGateDeadline;

    if (isOverGateDeadline) {
        timingRisk += 40;
        reasons.push(`Return deadline (${String(toHour).padStart(2, '0')}:${String(reqTo.getMinutes()).padStart(2, '0')}) exceeds institutional ${hostelType === 'GIRLS' ? 'Girls' : 'Boys'} gate closing deadline (${gateClosingTimeStr}).`);
    } else if (isApproachingGateDeadline) {
        timingRisk += 15;
        reasons.push(`Return window approaches evening gate closing deadline (${gateClosingTimeStr}).`);
    }

    if (fromHour >= 22 || fromHour < 5) {
        timingRisk += 25;
        reasons.push(`Movement request initiated during late night hours (${fromHour}:00 hrs).`);
    }

    if (passType === 'OUTPASS' && durationHours > 6) {
        timingRisk += 15;
        reasons.push(`Outpass duration exceeds standard 6-hour limit (${durationHours.toFixed(1)} hrs requested).`);
    } else if (passType === 'HOME_PASS') {
        reasons.push(`Home Pass leave: Multi-day visit (${Math.max(1, Math.ceil(durationHours / 24))} days) requires mandatory parent verification and warden approval.`);
    } else if (passType === 'EMERGENCY_EXIT') {
        timingRisk += 10;
        reasons.push('Emergency exit: High priority incident requiring warden authorization.');
    }
    signals.timingRisk = Math.min(timingRisk, 45);
    riskScore += signals.timingRisk;

    // 2. SIGNAL: Movement Frequency Analysis (Recent 72 Hours)
    const recentRequestsQuery = `
        SELECT COUNT(*) as recent_count
        FROM pass_requests
        WHERE student_id = $1 
          AND created_at >= NOW() - INTERVAL '72 hours'
          AND status IN ('PENDING', 'APPROVED')
    `;
    const freqRes = await db.query(recentRequestsQuery, [studentId]);
    const recentCount = parseInt(freqRes.rows[0]?.recent_count || 0);

    let frequencyRisk = 0;
    if (recentCount >= 4) {
        frequencyRisk = 25;
        reasons.push(`High movement velocity: ${recentCount} requests submitted within the past 72 hours.`);
    } else if (recentCount >= 2) {
        frequencyRisk = 10;
        reasons.push(`Moderate movement frequency: ${recentCount} passes recorded in recent 72 hours.`);
    }
    signals.frequencyRisk = frequencyRisk;
    riskScore += frequencyRisk;

    // 3. SIGNAL: Historical Late Return & Policy Violation Rate
    const historyQuery = `
        SELECT 
            COUNT(*) as total_completed,
            COUNT(CASE WHEN delay_minutes > 15 THEN 1 END) as late_returns,
            COALESCE(AVG(CASE WHEN delay_minutes > 15 THEN delay_minutes END), 0) as avg_delay
        FROM passes
        WHERE student_id = $1 AND status IN ('USED', 'OVERDUE')
    `;
    const histRes = await db.query(historyQuery, [studentId]);
    const hist = histRes.rows[0];
    const totalCompleted = parseInt(hist?.total_completed || 0);
    const lateReturns = parseInt(hist?.late_returns || 0);
    const avgDelay = Math.round(parseFloat(hist?.avg_delay || 0));

    let historyRisk = 0;
    if (lateReturns >= 3) {
        historyRisk = 30;
        reasons.push(`Chronic delay history: ${lateReturns} overdue returns recorded (avg delay ${avgDelay} mins).`);
    } else if (lateReturns >= 1) {
        historyRisk = 15;
        reasons.push(`Past tardiness noted: ${lateReturns} late return on record.`);
    } else if (totalCompleted >= 3 && lateReturns === 0) {
        reasons.push(`Clean punctuality record across ${totalCompleted} previous campus movements.`);
    }
    signals.historyRisk = historyRisk;
    riskScore += historyRisk;

    // 4. SIGNAL: Geofence Verification Status
    let locationRisk = 0;
    if (isLocationVerified === false) {
        locationRisk = 15;
        reasons.push('Location check failed: Request created outside verified campus perimeter.');
    } else if (isLocationVerified === true) {
        reasons.push('Location verified: Initiated from within authorized hostel boundaries.');
    }
    signals.locationRisk = locationRisk;
    riskScore += locationRisk;

    // 5. SIGNAL: Unpaid Fines / Suspensions / Active Flags
    const finesQuery = `SELECT COUNT(*) as unpaid_fines FROM fines WHERE student_id = $1 AND status = 'UNPAID'`;
    const fineRes = await db.query(finesQuery, [studentId]);
    const unpaidFines = parseInt(fineRes.rows[0]?.unpaid_fines || 0);

    let disciplinaryRisk = 0;
    if (unpaidFines > 0) {
        disciplinaryRisk = 15;
        reasons.push(`Disciplinary alert: ${unpaidFines} pending unpaid fine(s) on student profile.`);
    }
    signals.disciplinaryRisk = disciplinaryRisk;
    riskScore += disciplinaryRisk;

    // Normalize final score between 0 and 100
    riskScore = Math.min(Math.max(riskScore, 0), 100);

    // Determine Risk Level & Actionable Recommendation (SIH Tiered Architecture)
    let riskLevel = 'LOW';
    let recommendation = 'AUTO_APPROVE';

    if (passType === 'EMERGENCY_EXIT') {
        riskLevel = 'HIGH';
        recommendation = 'EMERGENCY_WARDEN_DISPATCH';
    } else if (passType === 'HOME_PASS') {
        riskLevel = riskScore > 50 ? 'HIGH' : 'MEDIUM';
        recommendation = 'WARDEN_PARENT_VERIFICATION';
    } else if (riskScore > 60 || signals.academicHoursBreach || isOverGateDeadline || disciplinaryRisk > 0) {
        riskLevel = 'HIGH';
        recommendation = 'MANDATORY_WARDEN_OVERRIDE';
    } else if (riskScore > 30) {
        riskLevel = 'MEDIUM';
        recommendation = 'WARDEN_REVIEW';
    } else {
        riskLevel = 'LOW';
        recommendation = 'AUTO_APPROVE';
    }

    if (reasons.length === 0) {
        reasons.push('Standard daytime movement request compliant with institutional policies.');
    }

    return {
        riskScore,
        riskLevel,
        recommendation,
        reasons,
        signals,
        baseline: baselineData
    };
}

module.exports = {
    calculatePassRiskScore
};
