/**
 * NEXA-GUARD Personal Behavioral Baseline Engine
 * 
 * Computes an individualized empirical movement baseline for resident students
 * from historical gate events and completed passes. Detects behavioral deviations
 * without subjective profiling.
 * 
 * If fewer than 3 movements exist, marks as 'Insufficient historical data'
 * rather than fabricating baseline confidence.
 */

const db = require('../config/db');

/**
 * Calculates or refreshes a student's personal behavioral baseline
 * @param {number} studentId 
 * @param {number} hostelId 
 */
async function getOrComputeStudentBaseline(studentId, hostelId = 1) {
    // 1. Query student's historical completed passes
    const passHistoryRes = await db.query(`
        SELECT actual_exit_time, actual_return_time, valid_from, valid_until, delay_minutes
        FROM passes
        WHERE student_id = $1 AND (status = 'USED' OR actual_return_time IS NOT NULL OR delay_minutes IS NOT NULL)
        ORDER BY created_at DESC
        LIMIT 30
    `, [studentId]);

    const passes = passHistoryRes.rows;
    const totalMovements = passes.length;

    // Check if sufficient data exists (minimum 3 movements)
    if (totalMovements < 3) {
        return {
            student_id: studentId,
            hostel_id: hostelId,
            hasSufficientData: false,
            message: 'Insufficient historical data for reliable personal baseline (minimum 3 completed movements required).',
            total_recorded_movements: totalMovements,
            typical_exit_hour: null,
            typical_return_hour: null,
            avg_duration_minutes: null,
            punctuality_rate: null
        };
    }

    let exitHourSum = 0;
    let returnHourSum = 0;
    let durationSum = 0;
    let onTimeCount = 0;

    for (const p of passes) {
        const exitDate = p.actual_exit_time ? new Date(p.actual_exit_time) : new Date(p.valid_from);
        const returnDate = p.actual_return_time ? new Date(p.actual_return_time) : new Date(p.valid_until);

        exitHourSum += exitDate.getHours() + (exitDate.getMinutes() / 60);
        returnHourSum += returnDate.getHours() + (returnDate.getMinutes() / 60);

        const duration = Math.max(30, (returnDate.getTime() - exitDate.getTime()) / 60000);
        durationSum += duration;

        if (!p.delay_minutes || p.delay_minutes <= 15) {
            onTimeCount++;
        }
    }

    const typicalExitHour = parseFloat((exitHourSum / passes.length).toFixed(2));
    const typicalReturnHour = parseFloat((returnHourSum / passes.length).toFixed(2));
    const avgDurationMins = Math.round(durationSum / passes.length);
    const punctualityRate = parseFloat(((onTimeCount / passes.length) * 100).toFixed(1));

    // Weekly pass velocity calculation
    const weeklyVelocityRes = await db.query(`
        SELECT COUNT(*) as pass_count
        FROM passes
        WHERE student_id = $1 AND created_at >= NOW() - INTERVAL '28 days'
    `, [studentId]);
    const avgWeeklyPasses = parseFloat((parseInt(weeklyVelocityRes.rows[0]?.pass_count || 0) / 4).toFixed(2));

    // Upsert into movement_baselines
    const upsertRes = await db.query(`
        INSERT INTO movement_baselines (
            student_id, hostel_id, typical_exit_hour, typical_return_hour,
            avg_duration_minutes, avg_weekly_passes, punctuality_rate,
            total_recorded_movements, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (student_id) DO UPDATE SET
            typical_exit_hour = EXCLUDED.typical_exit_hour,
            typical_return_hour = EXCLUDED.typical_return_hour,
            avg_duration_minutes = EXCLUDED.avg_duration_minutes,
            avg_weekly_passes = EXCLUDED.avg_weekly_passes,
            punctuality_rate = EXCLUDED.punctuality_rate,
            total_recorded_movements = EXCLUDED.total_recorded_movements,
            last_updated = NOW()
        RETURNING *;
    `, [
        studentId, hostelId, typicalExitHour, typicalReturnHour,
        avgDurationMins, avgWeeklyPasses, punctualityRate, totalMovements
    ]);

    return {
        ...upsertRes.rows[0],
        hasSufficientData: true
    };
}

/**
 * Evaluates behavioral deviation between a proposed movement request and baseline
 * @param {number} studentId 
 * @param {string|Date} requestedFromTime 
 * @param {string|Date} requestedToTime 
 * @param {number} hostelId 
 */
async function evaluateBaselineDeviation(studentId, requestedFromTime, requestedToTime, hostelId = 1) {
    const baseline = await getOrComputeStudentBaseline(studentId, hostelId);

    if (!baseline.hasSufficientData) {
        return {
            hasDeviation: false,
            deviationPoints: 0,
            reasons: [],
            baseline: {
                hasSufficientData: false,
                message: 'Insufficient historical data for baseline deviation evaluation.'
            }
        };
    }

    const fromDate = new Date(requestedFromTime);
    const toDate = new Date(requestedToTime);

    const requestedExitHour = fromDate.getHours() + (fromDate.getMinutes() / 60);
    const requestedReturnHour = toDate.getHours() + (toDate.getMinutes() / 60);
    const requestedDurationMins = (toDate.getTime() - fromDate.getTime()) / 60000;

    let deviationPoints = 0;
    const reasons = [];

    // 1. Return Timing Deviation (e.g. Student typically returns by 8:30 PM, now requesting past 11:00 PM)
    if (baseline.typical_return_hour !== null) {
        const returnDeltaHours = requestedReturnHour - parseFloat(baseline.typical_return_hour);
        if (returnDeltaHours > 2.0 && requestedReturnHour > 21.5) {
            deviationPoints += 15;
            const typicalFormatted = formatHour(parseFloat(baseline.typical_return_hour));
            const requestedFormatted = formatHour(requestedReturnHour);
            reasons.push(`Return time deviation: Resident typically returns by ${typicalFormatted}, but requested ${requestedFormatted} (+15 risk pts).`);
        }
    }

    // 2. Duration Deviation
    if (baseline.avg_duration_minutes && requestedDurationMins > (baseline.avg_duration_minutes * 2.2) && requestedDurationMins > 360) {
        deviationPoints += 10;
        reasons.push(`Duration anomaly: Requested duration (${Math.round(requestedDurationMins / 60)}h) significantly exceeds personal average (${Math.round(baseline.avg_duration_minutes / 60)}h) (+10 risk pts).`);
    }

    // 3. Chronic Tardiness Penalty / Punctuality Reward
    if (baseline.punctuality_rate !== null) {
        if (parseFloat(baseline.punctuality_rate) < 70) {
            deviationPoints += 15;
            reasons.push(`Low historical punctuality: Resident has on-time return rate of ${baseline.punctuality_rate}% (+15 risk pts).`);
        } else if (parseFloat(baseline.punctuality_rate) >= 95) {
            deviationPoints = Math.max(0, deviationPoints - 8);
            reasons.push(`Exemplary compliance history: Resident has ${baseline.punctuality_rate}% punctuality record (-8 risk pts).`);
        }
    }

    return {
        hasDeviation: deviationPoints > 0,
        deviationPoints,
        reasons,
        baseline: {
            hasSufficientData: true,
            typicalExitHour: formatHour(parseFloat(baseline.typical_exit_hour)),
            typicalReturnHour: formatHour(parseFloat(baseline.typical_return_hour)),
            avgDurationHours: (baseline.avg_duration_minutes / 60).toFixed(1),
            punctualityRate: `${baseline.punctuality_rate}%`,
            totalRecordedMovements: baseline.total_recorded_movements
        }
    };
}

function formatHour(h) {
    if (h === null || isNaN(h)) return 'N/A';
    const totalMinutes = Math.round(h * 60);
    const hour24 = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

module.exports = {
    getOrComputeStudentBaseline,
    evaluateBaselineDeviation
};
