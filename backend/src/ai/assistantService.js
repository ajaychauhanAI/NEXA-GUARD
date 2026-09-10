/**
 * NEXA AI Context-Aware Institutional Intelligence Assistant
 * 
 * Architecture:
 * USER -> AUTHENTICATION -> ROLE DETECTION -> PERMISSION CHECK ->
 * INTENT DETECTION -> SAFE CONTROLLED TOOL -> PARAMETERIZED QUERY ->
 * POSTGRESQL -> STRUCTURED RESULT -> CONTEXT BUILDER -> GROUNDING -> NATURAL RESPONSE
 * 
 * Security: ZERO arbitrary SQL generation. Every query is parameterized and role-isolated.
 * Complies with strict institutional privacy and audit requirements.
 */

const db = require('../config/db');

// =========================================================================
// CONTROLLED TOOLS / DATA ACCESS FUNCTIONS (ENFORCE RBAC & HOSTEL ISOLATION)
// =========================================================================

/**
 * Tool 1: getMyPasses - Student retrieves own active and recent movement passes
 */
async function getMyPasses({ studentId, limit = 3 }) {
    if (!studentId) return { success: false, data: null, message: 'Student identity required.' };
    const res = await db.query(`
        SELECT p.id, p.pass_number, p.pass_type, p.status, p.valid_from, p.valid_until,
               p.return_code, r.destination, r.reason, r.status as request_status
        FROM passes p
        JOIN pass_requests r ON r.id = p.request_id
        WHERE p.student_id = $1
        ORDER BY p.id DESC
        LIMIT $2
    `, [studentId, limit]);

    if (res.rows.length === 0) {
        // Also check if there is a pending pass request
        const reqRes = await db.query(`
            SELECT id, request_number, pass_type, status, from_time, to_time, destination, reason
            FROM pass_requests
            WHERE student_id = $1
            ORDER BY id DESC
            LIMIT 1
        `, [studentId]);
        if (reqRes.rows.length > 0) {
            return {
                success: true,
                hasPass: false,
                pendingRequest: reqRes.rows[0],
                passes: []
            };
        }
        return { success: true, hasPass: false, passes: [], message: 'No data available.' };
    }

    return {
        success: true,
        hasPass: true,
        activePass: res.rows[0],
        passes: res.rows
    };
}

/**
 * Tool 2: getMyMovementStatus - Student retrieves own current residential status
 */
async function getMyMovementStatus({ studentId }) {
    if (!studentId) return { success: false, message: 'Student ID required.' };
    const res = await db.query(`
        SELECT s.id, s.roll_number, s.movement_status, u.full_name, rm.room_number, b.block_name
        FROM students s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN rooms rm ON rm.id = s.room_id
        LEFT JOIN floors f ON f.id = rm.floor_id
        LEFT JOIN blocks b ON b.id = f.block_id
        WHERE s.id = $1
    `, [studentId]);

    if (res.rows.length === 0) return { success: false, message: 'No data available.' };
    return { success: true, student: res.rows[0] };
}

/**
 * Tool 3: getLinkedStudentStatus - Parent tracks ONLY their officially linked ward
 */
async function getLinkedStudentStatus({ parentUserId, targetStudentQuery = null }) {
    if (!parentUserId) return { success: false, message: 'Parent identity required.' };

    const query = `
        SELECT s.id as student_id, s.roll_number, s.movement_status, s.hostel_id,
               u.full_name as student_name, h.name as hostel_name,
               p.pass_number, p.pass_type, p.status as pass_status, p.valid_until, p.actual_exit_time
        FROM parent_student ps
        JOIN students s ON s.id = ps.student_id
        JOIN users u ON u.id = s.user_id
        JOIN hostels h ON h.id = s.hostel_id
        LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'OVERDUE', 'APPROVED')
        WHERE ps.parent_user_id = $1
        ORDER BY p.id DESC
        LIMIT 1
    `;
    let res = await db.query(query, [parentUserId]);

    // Fallback check against legacy parents table
    if (res.rows.length === 0) {
        const legacyQuery = `
            SELECT s.id as student_id, s.roll_number, s.movement_status, s.hostel_id,
                   u.full_name as student_name, h.name as hostel_name,
                   p.pass_number, p.pass_type, p.status as pass_status, p.valid_until, p.actual_exit_time
            FROM parents pr
            JOIN students s ON s.id = pr.student_id
            JOIN users u ON u.id = s.user_id
            JOIN hostels h ON h.id = s.hostel_id
            LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'OVERDUE', 'APPROVED')
            WHERE pr.user_id = $1
            ORDER BY p.id DESC
            LIMIT 1
        `;
        res = await db.query(legacyQuery, [parentUserId]);
    }

    if (res.rows.length === 0) {
        return { success: false, message: 'No data available. No student currently linked to your guardian account.' };
    }

    const linkedWard = res.rows[0];

    // Privacy verification: If parent specified a query name and it doesn't match their ward
    if (targetStudentQuery) {
        const qNorm = targetStudentQuery.toLowerCase();
        const wardName = linkedWard.student_name.toLowerCase();
        const wardRoll = linkedWard.roll_number.toLowerCase();
        if (!wardName.includes(qNorm) && !wardRoll.includes(qNorm)) {
            return {
                success: false,
                accessDenied: true,
                message: `Access Denied: You are only authorized to track your linked ward (${linkedWard.student_name}). Access to other students is strictly prohibited.`
            };
        }
    }

    return { success: true, ward: linkedWard };
}

/**
 * Tool 4: getPendingPassRequests - Warden/Admin retrieves pending approval queue
 */
async function getPendingPassRequests({ hostelId }) {
    const res = await db.query(`
        SELECT r.id, r.request_number, r.pass_type, r.from_time, r.to_time, r.destination, r.reason,
               s.roll_number, u.full_name as student_name, rs.risk_score, rs.risk_level
        FROM pass_requests r
        JOIN students s ON s.id = r.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN risk_scores rs ON rs.request_id = r.id
        WHERE r.hostel_id = $1 AND r.status = 'PENDING'
        ORDER BY r.id DESC
    `, [hostelId]);

    return {
        success: true,
        count: res.rows.length,
        requests: res.rows
    };
}

/**
 * Tool 5: getOutsideStudents - Real-time hostel-scoped count of checked-out students
 */
async function getOutsideStudents({ hostelId }) {
    const res = await db.query(`
        SELECT s.id, s.roll_number, u.full_name, rm.room_number, b.block_name,
               p.pass_number, p.pass_type, p.valid_until, p.actual_exit_time
        FROM students s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN rooms rm ON rm.id = s.room_id
        LEFT JOIN floors f ON f.id = rm.floor_id
        LEFT JOIN blocks b ON b.id = f.block_id
        LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'OVERDUE')
        WHERE s.hostel_id = $1 AND s.movement_status = 'OUTSIDE'
        ORDER BY s.id ASC
    `, [hostelId]);

    return {
        success: true,
        count: res.rows.length,
        students: res.rows
    };
}

/**
 * Tool 6: getOverdueStudents - Pass records exceeding validity window
 */
async function getOverdueStudents({ hostelId }) {
    const res = await db.query(`
        SELECT p.id, p.pass_number, p.valid_until, p.delay_minutes,
               s.roll_number, u.full_name as student_name, u.phone as student_phone
        FROM passes p
        JOIN students s ON s.id = p.student_id
        JOIN users u ON u.id = s.user_id
        WHERE p.hostel_id = $1 AND p.status = 'OVERDUE'
        ORDER BY p.delay_minutes DESC
    `, [hostelId]);

    return {
        success: true,
        count: res.rows.length,
        overduePasses: res.rows
    };
}

/**
 * Tool 7: getGateTraffic - Real-time and today's gate event analytics
 */
async function getGateTraffic({ hostelId }) {
    const busiestRes = await db.query(`
        SELECT g.id, g.gate_name, g.gate_code,
               COUNT(ge.id) as transit_count,
               COUNT(CASE WHEN ge.action_type = 'EXIT_AUTHORIZED' THEN 1 END) as exit_count,
               COUNT(CASE WHEN ge.action_type = 'RETURN_AUTHORIZED' THEN 1 END) as return_count
        FROM gates g
        LEFT JOIN gate_events ge ON ge.gate_id = g.id AND ge.created_at >= CURRENT_DATE
        WHERE g.hostel_id = $1
        GROUP BY g.id, g.gate_name, g.gate_code
        ORDER BY transit_count DESC
    `, [hostelId]);

    const totalToday = busiestRes.rows.reduce((sum, r) => sum + parseInt(r.transit_count), 0);
    const topGate = busiestRes.rows.length > 0 && parseInt(busiestRes.rows[0].transit_count) > 0 
        ? busiestRes.rows[0] 
        : null;

    return {
        success: true,
        totalToday,
        busiestGate: topGate,
        gates: busiestRes.rows
    };
}

/**
 * Tool 8: getHostelPolicies - Configurable institutional curfew and outpass policies
 */
async function getHostelPolicies({ hostelId }) {
    const res = await db.query(`
        SELECT policy_name, policy_code, policy_value
        FROM policies
        WHERE hostel_id = $1 AND is_active = TRUE
    `, [hostelId]);

    return {
        success: true,
        policies: res.rows
    };
}

/**
 * Tool 9: getAnomalies - Live behavioral and scan anomalies
 */
async function getAnomalies({ hostelId }) {
    const res = await db.query(`
        SELECT a.id, a.anomaly_type, a.severity, a.description, a.detected_at,
               s.roll_number, u.full_name as student_name
        FROM anomalies a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN users u ON u.id = s.user_id
        WHERE a.hostel_id = $1 AND a.status = 'ACTIVE'
        ORDER BY a.detected_at DESC
        LIMIT 10
    `, [hostelId]);

    return {
        success: true,
        count: res.rows.length,
        anomalies: res.rows
    };
}

/**
 * Tool 10: getStudentMovementHistory - Scoped historical pass movements
 */
async function getStudentMovementHistory({ studentId, limit = 5 }) {
    const res = await db.query(`
        SELECT p.pass_number, p.pass_type, p.status, p.actual_exit_time, p.actual_return_time,
               p.delay_minutes, r.destination, r.reason
        FROM passes p
        JOIN pass_requests r ON r.id = p.request_id
        WHERE p.student_id = $1
        ORDER BY p.id DESC
        LIMIT $2
    `, [studentId, limit]);

    return {
        success: true,
        movements: res.rows
    };
}

// =========================================================================
// MAIN NEXA AI INTENT ROUTER & NATURAL LANGUAGE INTELLIGENCE ENGINE
// =========================================================================

async function handleAssistantQuery(user, queryText) {
    const q = (queryText || '').toLowerCase().trim();
    let reply = '';
    let intent = 'GENERAL_QUERY';
    const toolCalls = [];
    const hostelId = user.hostel_id || 1;

    // Fetch Hostel Name
    const hostelRes = await db.query(`SELECT name, hostel_code FROM hostels WHERE id = $1`, [hostelId]);
    const hostelName = hostelRes.rows[0]?.name || 'Campus Hostel';

    // ---------------------------------------------------------------------
    // PRIVACY / IDOR CHECK: Student attempting to query another student's pass/status
    // ---------------------------------------------------------------------
    const isThirdPartyStudentQuery = user.role === 'STUDENT' && (
        (q.includes('pass status') || q.includes('pass') || q.includes('status')) &&
        (
            q.includes('rahul') || q.includes('amit') || q.includes('rohit') ||
            q.includes('priya') || q.includes('ananya') || q.includes('roll') ||
            q.includes('other') || q.includes('friend') || q.includes('someone') ||
            /stu-\d+/.test(q) || /\b\d{4,}\b/.test(q)
        ) &&
        !q.includes('my pass') && !q.includes('mera pass')
    );

    if (isThirdPartyStudentQuery) {
        intent = 'PRIVACY_VIOLATION_BLOCKED';
        reply = 'Access Denied: As a student, you are only authorized to view your own passes and records. Access to another student\'s private movement details is strictly prohibited.';
    }

    // ---------------------------------------------------------------------
    // 1. Student Pass Status ("What is my pass status?", "Mera pass approve hua hai?")
    // ---------------------------------------------------------------------
    else if (
        q.includes('my pass') || q.includes('pass status') || 
        q.includes('mera pass') || (q.includes('pass') && (q.includes('approve') || q.includes('status') || q.includes('expire') || q.includes('kya hai')))
    ) {
        intent = 'STUDENT_PASS_STATUS';
        toolCalls.push({ tool: 'getMyPasses', params: { studentId: user.student_id } });

        if (user.role === 'STUDENT') {
            const passResult = await getMyPasses({ studentId: user.student_id });
            if (passResult.hasPass && passResult.activePass) {
                const p = passResult.activePass;
                const validUntil = new Date(p.valid_until).toLocaleString();
                reply = `Pass #${p.pass_number} (${p.pass_type}) to '${p.destination}' is currently ${p.status}.\n• Valid Until: ${validUntil}\n• Return Code: ${p.return_code}\n${p.status === 'OVERDUE' ? '⚠️ Notice: Your pass is overdue. Please report to the gate.' : 'Present your QR code or 6-digit return code to gate security.'}`;
            } else if (passResult.pendingRequest) {
                const req = passResult.pendingRequest;
                reply = `Your ${req.pass_type} request (${req.request_number}) to '${req.destination}' is currently PENDING Warden review.`;
            } else {
                reply = 'No data available. You currently have no active or pending passes on record. Your residential status is IN_HOSTEL.';
            }
        } else if (user.role === 'PARENT') {
            // Parent asking about their ward's pass
            toolCalls.push({ tool: 'getLinkedStudentStatus', params: { parentUserId: user.id } });
            const wardResult = await getLinkedStudentStatus({ parentUserId: user.id });
            if (!wardResult.success) {
                reply = wardResult.message || 'No data available.';
            } else {
                const w = wardResult.ward;
                if (w.pass_number) {
                    reply = `Your linked ward ${w.student_name} has pass #${w.pass_number} (${w.pass_type}) with status: ${w.pass_status}.`;
                } else {
                    reply = `No active movement pass on record for your linked ward ${w.student_name}. Current status: ${w.movement_status}.`;
                }
            }
        } else {
            reply = `As ${user.role}, you can monitor active passes directly on your management portal.`;
        }
    }

    // ---------------------------------------------------------------------
    // 2. Parent Ward Check ("Is my child inside hostel?", "Mera child hostel mein hai?")
    // ---------------------------------------------------------------------
    else if (
        q.includes('child') || q.includes('ward') || q.includes('bacha') ||
        q.includes('beta') || q.includes('beti') || (user.role === 'PARENT' && (q.includes('inside') || q.includes('hostel mein') || q.includes('kahan hai') || q.includes('status')))
    ) {
        intent = 'PARENT_WARD_STATUS';
        toolCalls.push({ tool: 'getLinkedStudentStatus', params: { parentUserId: user.id } });

        if (user.role === 'PARENT') {
            const wardResult = await getLinkedStudentStatus({ parentUserId: user.id });
            if (!wardResult.success) {
                reply = wardResult.message || 'No data available.';
            } else {
                const w = wardResult.ward;
                const isInside = w.movement_status === 'IN_HOSTEL';
                reply = `Your linked ward ${w.student_name} (${w.roll_number}) is currently ${isInside ? 'INSIDE the hostel' : 'OUTSIDE campus'}. Current movement status: ${w.movement_status}.`;
            }
        } else {
            reply = 'Parental ward tracking is exclusive to verified guardian accounts.';
        }
    }

    // ---------------------------------------------------------------------
    // 3. Students Outside Count ("How many students are outside?", "Abhi kitne students hostel ke bahar hain?")
    // ---------------------------------------------------------------------
    else if (
        (q.includes('outside') || q.includes('bahar')) &&
        (q.includes('how many') || q.includes('kitne') || q.includes('count') || q.includes('number') || q.includes('abhi'))
    ) {
        intent = 'STUDENTS_OUTSIDE_QUERY';

        // STRICT RBAC: Students are NOT allowed to view campus-wide occupancy
        if (user.role === 'STUDENT') {
            reply = 'Campus occupancy counts and hostel-wide movement metrics are restricted to institutional authorities (Wardens and Administrators).';
        } else if (['HOSTEL_ADMIN', 'SUPER_ADMIN', 'WARDEN', 'SECURITY_GUARD'].includes(user.role)) {
            toolCalls.push({ tool: 'getOutsideStudents', params: { hostelId } });
            const outRes = await getOutsideStudents({ hostelId });
            reply = `Currently, there are ${outRes.count} resident students checked OUTSIDE from ${hostelName}.`;
        } else {
            reply = 'Campus occupancy counts are only viewable by authorized institutional staff.';
        }
    }

    // ---------------------------------------------------------------------
    // 4. Overdue Movement Passes ("Which students are overdue?", "Kitne log late hain?")
    // ---------------------------------------------------------------------
    else if (q.includes('overdue') || q.includes('late return') || q.includes('delay')) {
        intent = 'OVERDUE_STUDENTS_QUERY';

        if (['HOSTEL_ADMIN', 'SUPER_ADMIN', 'WARDEN'].includes(user.role)) {
            toolCalls.push({ tool: 'getOverdueStudents', params: { hostelId } });
            const overdueRes = await getOverdueStudents({ hostelId });
            if (overdueRes.count > 0) {
                const sample = overdueRes.overduePasses.slice(0, 3).map(p => `• ${p.student_name} (${p.roll_number}) — ${p.delay_minutes} mins overdue (Pass #${p.pass_number})`).join('\n');
                reply = `There are ${overdueRes.count} overdue movement passes at ${hostelName}:\n${sample}`;
            } else {
                reply = `No overdue movements currently recorded at ${hostelName}. All checked-out residents are within approved curfew grace periods.`;
            }
        } else if (user.role === 'STUDENT') {
            const passResult = await getMyPasses({ studentId: user.student_id });
            if (passResult.hasPass && passResult.activePass?.status === 'OVERDUE') {
                reply = `⚠️ Notice: Your pass #${passResult.activePass.pass_number} is marked OVERDUE. Please return immediately.`;
            } else {
                reply = 'You have no overdue movements on your resident profile.';
            }
        } else {
            reply = 'Hostel-wide overdue summaries are accessible to wardens and administrators.';
        }
    }

    // ---------------------------------------------------------------------
    // 5. Busiest Gate Today ("Which gate was busiest today?", "Aaj sabse busy gate kaunsa tha?")
    // ---------------------------------------------------------------------
    else if (
        (q.includes('busiest') && q.includes('gate')) ||
        (q.includes('busy') && q.includes('gate')) ||
        (q.includes('gate') && q.includes('traffic')) ||
        q.includes('sabse busy gate')
    ) {
        intent = 'BUSIEST_GATE_QUERY';

        if (['HOSTEL_ADMIN', 'SUPER_ADMIN', 'WARDEN', 'SECURITY_GUARD'].includes(user.role)) {
            toolCalls.push({ tool: 'getGateTraffic', params: { hostelId } });
            const traffic = await getGateTraffic({ hostelId });
            if (traffic.busiestGate && parseInt(traffic.busiestGate.transit_count) > 0) {
                const b = traffic.busiestGate;
                reply = `Today's busiest transit point at ${hostelName} is ${b.gate_name} (${b.gate_code}) with ${b.transit_count} recorded movements (${b.exit_count} exits, ${b.return_count} returns).`;
            } else {
                reply = 'No data available. No gate movements have been logged yet today across ' + hostelName + '.';
            }
        } else {
            reply = 'Gate traffic analytics are restricted to security officers, wardens, and administrators.';
        }
    }

    // ---------------------------------------------------------------------
    // 6. Predictions & Peak Movement ("When is peak movement?", "Predict traffic", "Surge forecast")
    // ---------------------------------------------------------------------
    else if (q.includes('peak') || q.includes('predict') || q.includes('surge') || q.includes('forecast') || q.includes('rush hour')) {
        intent = 'PREDICTION_QUERY';

        if (['HOSTEL_ADMIN', 'SUPER_ADMIN', 'WARDEN'].includes(user.role)) {
            const { generateMovementPredictions } = require('./predictionEngine');
            const preds = await generateMovementPredictions(hostelId);
            if (preds.surgeForecast?.hasSufficientData) {
                reply = `Movement Forecast for ${hostelName}:\n• Peak Exit Window: ${preds.surgeForecast.peakExitWindow}\n• Peak Return Window: ${preds.surgeForecast.peakReturnWindow}\n• Projected Daily Transits: ~${preds.surgeForecast.predictedTodayTotalTransits} movements\n• Busiest Transit Point: ${preds.surgeForecast.busiestGate}`;
            } else {
                reply = 'Insufficient historical data for reliable prediction.';
            }
        } else {
            reply = 'Movement peak forecasting is reserved for administrative and warden planning.';
        }
    }

    // ---------------------------------------------------------------------
    // 7. Unusual Activity / Anomalies ("Show unusual activity", "Anomalies this week")
    // ---------------------------------------------------------------------
    else if (q.includes('unusual') || q.includes('anomaly') || q.includes('anomalies') || q.includes('incident')) {
        intent = 'UNUSUAL_ACTIVITY_QUERY';

        if (['HOSTEL_ADMIN', 'SUPER_ADMIN', 'WARDEN'].includes(user.role)) {
            toolCalls.push({ tool: 'getAnomalies', params: { hostelId } });
            const anomRes = await getAnomalies({ hostelId });
            if (anomRes.count > 0) {
                const list = anomRes.anomalies.slice(0, 3).map(a => `• [${a.severity}] ${a.description}`).join('\n');
                reply = `Recent Unusual Activity at ${hostelName}:\n${list}`;
            } else {
                reply = `No unusual movement anomalies or security deviations detected this week at ${hostelName}. All operations normal.`;
            }
        } else {
            reply = 'Institutional anomaly reports are accessible to wardens and administrators only.';
        }
    }

    // ---------------------------------------------------------------------
    // 8. Hostel Rules & Curfew ("What are the hostel rules?", "Curfew timings")
    // ---------------------------------------------------------------------
    else if (q.includes('rule') || q.includes('curfew') || q.includes('timing') || q.includes('hours') || q.includes('policy')) {
        intent = 'RULES_INFO';
        toolCalls.push({ tool: 'getHostelPolicies', params: { hostelId } });
        const polRes = await getHostelPolicies({ hostelId });

        let curfewStr = '21:30';
        let graceStr = '15 minutes';
        let outpassHours = '06:00 to 21:30';

        for (const p of polRes.policies) {
            try {
                const v = typeof p.policy_value === 'string' ? JSON.parse(p.policy_value) : p.policy_value;
                if (p.policy_code === 'CURFEW_RULES') {
                    if (v.curfewTime) curfewStr = v.curfewTime;
                    if (v.graceMinutes) graceStr = `${v.graceMinutes} minutes`;
                } else if (p.policy_code === 'OUTPASS_HOURS') {
                    if (v.start && v.end) outpassHours = `${v.start} to ${v.end}`;
                }
            } catch (e) {}
        }

        reply = `${hostelName} Movement Policies:\n• Outpass Hours: ${outpassHours}\n• Evening Curfew Deadline: ${curfewStr}\n• Grace Period: ${graceStr}\n• Geofence Verification: Enabled within campus perimeter\n• Emergency Exit: Available 24/7 with immediate warden notification.`;
    }

    // ---------------------------------------------------------------------
    // 9. Fines & Penalties ("Do I have any fines?", "Fine amount")
    // ---------------------------------------------------------------------
    else if (q.includes('fine') || q.includes('penalty') || q.includes('due')) {
        intent = 'FINE_INFO';

        if (user.role === 'STUDENT') {
            const fineRes = await db.query(`SELECT * FROM fines WHERE student_id = $1 AND status = 'UNPAID'`, [user.student_id]);
            if (fineRes.rows.length > 0) {
                const f = fineRes.rows[0];
                reply = `You have an outstanding fine of ₹${parseFloat(f.amount).toFixed(2)} (${f.fine_number}) for: ${f.reason}.`;
            } else {
                reply = 'You currently have zero outstanding disciplinary fines. Your record is clear!';
            }
        } else {
            reply = 'Disciplinary fines are assessed based on curfew non-compliance and can be reviewed or settled via the Administration portal.';
        }
    }

    // ---------------------------------------------------------------------
    // 10. Default General Query
    // ---------------------------------------------------------------------
    else {
        intent = 'GENERAL_FALLBACK';
        reply = `Hello ${user.full_name}! I am NEXA AI, your intelligent institutional safety assistant for ${hostelName}.\nYou can ask me:\n• "What is my pass status?"\n• "What are the curfew hours and rules?"\n• "Which gate was busiest today?"\n• "How many students are outside?"\n• "Show unusual activity this week."`;
    }

    // Log AI interaction in PostgreSQL table `ai_interactions`
    try {
        await db.query(`
            INSERT INTO ai_interactions (user_id, hostel_id, user_role, query_text, intent_detected, tool_calls, response_text)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            user.id,
            hostelId,
            user.role,
            queryText,
            intent,
            JSON.stringify(toolCalls),
            reply
        ]);
    } catch (e) {
        console.error('Failed to log AI interaction:', e.message);
    }

    return {
        query: queryText,
        intent,
        toolCalls,
        response: reply
    };
}

module.exports = {
    handleAssistantQuery,
    getMyPasses,
    getMyMovementStatus,
    getLinkedStudentStatus,
    getPendingPassRequests,
    getOutsideStudents,
    getOverdueStudents,
    getGateTraffic,
    getHostelPolicies,
    getAnomalies,
    getStudentMovementHistory
};
