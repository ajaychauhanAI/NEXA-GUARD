/**
 * Institutional Analytics & Executive Metrics Controller
 */

const db = require('../config/db');

async function getOverview(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;

        // 1. Total Students & Status Breakdown
        const studentStatsRes = await db.query(`
            SELECT 
                COUNT(*) as total_students,
                COUNT(CASE WHEN movement_status = 'IN_HOSTEL' THEN 1 END) as inside_hostel,
                COUNT(CASE WHEN movement_status = 'OUTSIDE' THEN 1 END) as outside_hostel,
                COUNT(CASE WHEN movement_status = 'SUSPENDED' THEN 1 END) as suspended
            FROM students
            WHERE hostel_id = $1
        `, [hostelId]);
        const studentStats = studentStatsRes.rows[0];

        // 2. Active Passes & Overdue Passes
        const passStatsRes = await db.query(`
            SELECT 
                COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_passes,
                COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_passes,
                COUNT(CASE WHEN status = 'OVERDUE' OR (status = 'ACTIVE' AND valid_until < NOW()) THEN 1 END) as overdue_passes
            FROM passes
            WHERE hostel_id = $1
        `, [hostelId]);
        const passStats = passStatsRes.rows[0];

        // 3. Pending Requests & High Risk count
        const reqStatsRes = await db.query(`
            SELECT 
                COUNT(*) as pending_requests,
                COUNT(CASE WHEN rs.risk_level = 'HIGH' THEN 1 END) as high_risk_requests
            FROM pass_requests pr
            LEFT JOIN risk_scores rs ON rs.request_id = pr.id
            WHERE pr.hostel_id = $1 AND pr.status = 'PENDING'
        `, [hostelId]);
        const reqStats = reqStatsRes.rows[0];

        // 4. Today's Movements
        const todayMovRes = await db.query(`
            SELECT COUNT(*) as today_movements
            FROM gate_events
            WHERE hostel_id = $1 AND created_at >= CURRENT_DATE
        `, [hostelId]);
        const todayMovements = parseInt(todayMovRes.rows[0].today_movements);

        // 5. Active Alerts count
        const alertRes = await db.query(`SELECT COUNT(*) as active_alerts FROM alerts WHERE hostel_id = $1 AND is_resolved = FALSE`, [hostelId]);
        const activeAlerts = parseInt(alertRes.rows[0].active_alerts);

        res.json({
            success: true,
            metrics: {
                totalStudents: parseInt(studentStats.total_students),
                insideHostel: parseInt(studentStats.inside_hostel),
                outsideHostel: parseInt(studentStats.outside_hostel),
                suspended: parseInt(studentStats.suspended),
                activePasses: parseInt(passStats.active_passes),
                approvedPasses: parseInt(passStats.approved_passes),
                overduePasses: parseInt(passStats.overdue_passes),
                pendingRequests: parseInt(reqStats.pending_requests),
                highRiskRequests: parseInt(reqStats.high_risk_requests),
                todayMovements,
                activeAlerts
            }
        });
    } catch (err) {
        console.error('Error fetching analytics overview:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving analytics overview.' });
    }
}

async function getMovements(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;

        // Hourly aggregation for the current week
        const hourlyRes = await db.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(CASE WHEN action_type = 'EXIT_AUTHORIZED' THEN 1 END) as exits,
                COUNT(CASE WHEN action_type = 'RETURN_AUTHORIZED' THEN 1 END) as entries
            FROM gate_events
            WHERE hostel_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY hour
            ORDER BY hour ASC
        `, [hostelId]);

        // Pass types distribution
        const passTypesRes = await db.query(`
            SELECT pass_type, COUNT(*) as count
            FROM pass_requests
            WHERE hostel_id = $1
            GROUP BY pass_type
        `, [hostelId]);

        // Block-wise movement
        const blockMovRes = await db.query(`
            SELECT b.block_name, b.block_code, COUNT(p.id) as movement_count
            FROM blocks b
            LEFT JOIN floors f ON f.block_id = b.id
            LEFT JOIN rooms r ON r.floor_id = f.id
            LEFT JOIN students s ON s.room_id = r.id
            LEFT JOIN passes p ON p.student_id = s.id
            WHERE b.hostel_id = $1
            GROUP BY b.id, b.block_name, b.block_code
            ORDER BY movement_count DESC
        `, [hostelId]);

        res.json({
            success: true,
            hourly: hourlyRes.rows,
            passTypes: passTypesRes.rows,
            blockMovements: blockMovRes.rows
        });
    } catch (err) {
        console.error('Error fetching movement analytics:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving movement analytics.' });
    }
}

async function getLateReturns(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const query = `
            SELECT p.id, p.pass_number, p.delay_minutes, p.actual_return_time, p.valid_until,
                   s.roll_number, s.course, s.branch,
                   u.full_name as student_name, u.phone as student_phone,
                   rm.room_number, b.block_name
            FROM passes p
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            WHERE p.hostel_id = $1 AND (p.status = 'OVERDUE' OR p.delay_minutes > 15)
            ORDER BY p.delay_minutes DESC, p.created_at DESC
            LIMIT 25
        `;
        const result = await db.query(query, [hostelId]);
        res.json({ success: true, count: result.rows.length, lateReturns: result.rows });
    } catch (err) {
        console.error('Error fetching late returns:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving late return records.' });
    }
}

async function getGates(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const gateStatsQuery = `
            SELECT 
                g.id, g.gate_name, g.gate_code, g.gate_type, g.status,
                COUNT(ge.id) as total_scans,
                COUNT(CASE WHEN ge.verification_status = 'VALID' THEN 1 END) as valid_scans,
                COUNT(CASE WHEN ge.verification_status != 'VALID' THEN 1 END) as denied_scans
            FROM gates g
            LEFT JOIN gate_events ge ON ge.gate_id = g.id AND ge.created_at >= NOW() - INTERVAL '7 days'
            WHERE g.hostel_id = $1
            GROUP BY g.id, g.gate_name, g.gate_code, g.gate_type, g.status
            ORDER BY total_scans DESC
        `;
        const result = await db.query(gateStatsQuery, [hostelId]);
        res.json({ success: true, count: result.rows.length, gates: result.rows });
    } catch (err) {
        console.error('Error fetching gate analytics:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving gate analytics.' });
    }
}

async function getBlocks(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const blockStatsQuery = `
            SELECT 
                b.id, b.block_name, b.block_code,
                COUNT(DISTINCT r.id) as total_rooms,
                COALESCE(SUM(r.capacity), 0) as total_capacity,
                COUNT(DISTINCT s.id) as resident_students,
                COUNT(DISTINCT CASE WHEN s.movement_status = 'OUTSIDE' THEN s.id END) as currently_outside,
                COUNT(DISTINCT CASE WHEN p.delay_minutes > 15 THEN p.id END) as overdue_passes
            FROM blocks b
            LEFT JOIN floors f ON f.block_id = b.id
            LEFT JOIN rooms r ON r.floor_id = f.id
            LEFT JOIN students s ON s.room_id = r.id
            LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'OVERDUE')
            WHERE b.hostel_id = $1
            GROUP BY b.id, b.block_name, b.block_code
            ORDER BY b.id ASC
        `;
        const result = await db.query(blockStatsQuery, [hostelId]);
        res.json({ success: true, count: result.rows.length, blocks: result.rows });
    } catch (err) {
        console.error('Error fetching block analytics:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving block analytics.' });
    }
}

async function getMessHeadcount(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;

        // 1. Overall student headcount breakdown
        const statsRes = await db.query(`
            SELECT 
                COUNT(*) as total_residents,
                COUNT(CASE WHEN s.movement_status = 'IN_HOSTEL' THEN 1 END) as in_hostel,
                COUNT(CASE WHEN s.movement_status IN ('OUTSIDE', 'ON_PASS') AND p.pass_type IN ('HOME', 'HOME_PASS') THEN 1 END) as on_home_pass,
                COUNT(CASE WHEN s.movement_status IN ('OUTSIDE', 'ON_PASS') AND (p.pass_type NOT IN ('HOME', 'HOME_PASS') OR p.pass_type IS NULL) THEN 1 END) as on_day_pass
            FROM students s
            LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'APPROVED')
            WHERE s.hostel_id = $1
        `, [hostelId]);
        const stats = statsRes.rows[0];

        const total = parseInt(stats.total_residents) || 0;
        const inHostel = parseInt(stats.in_hostel) || 0;
        const onHome = parseInt(stats.on_home_pass) || 0;
        const onDay = parseInt(stats.on_day_pass) || 0;

        // Meal plan calculations
        const breakfast = inHostel;
        const lunch = inHostel;
        const dinner = inHostel + onDay; // Day pass holders return before night closing
        const absent = onHome;
        const estimatedDailySavings = absent * 120; // Average ₹120 saved per student on home leave

        // Student details for mess roster
        const studentListRes = await db.query(`
            SELECT s.id, s.roll_number, s.movement_status,
                   u.full_name, u.phone,
                   rm.room_number, f.floor_name, b.block_name,
                   p.pass_type, p.valid_until, p.pass_number
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('ACTIVE', 'APPROVED')
            WHERE s.hostel_id = $1
            ORDER BY s.movement_status ASC, u.full_name ASC;
        `, [hostelId]);

        res.json({
            success: true,
            summary: {
                totalResidents: total,
                inHostel,
                onHomePass: onHome,
                onDayPass: onDay,
                meals: {
                    breakfast,
                    lunch,
                    dinner,
                    absentCount: absent,
                    costSavedToday: estimatedDailySavings
                }
            },
            students: studentListRes.rows
        });
    } catch (err) {
        console.error('Error fetching mess headcount:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving mess analytics.' });
    }
}

module.exports = {
    getOverview,
    getMovements,
    getLateReturns,
    getGates,
    getBlocks,
    getMessHeadcount
};

