/**
 * Security Guard Gate Terminal Controller
 */

const db = require('../config/db');
const gateService = require('../services/gateService');

async function scanToken(req, res) {
    try {
        const { token, returnCode, identifier: iden, gateId = 1 } = req.body;
        const identifier = token || returnCode || iden;

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'QR token or Return Code is required.' });
        }

        const result = await gateService.scanGateToken({
            tokenOrCode: identifier,
            gateId: parseInt(gateId),
            guardUser: req.user
        });

        res.json({
            success: result.isValid,
            ...result
        });
    } catch (err) {
        console.error('Gate scan error:', err);
        res.status(500).json({ success: false, message: 'Server error during gate verification scan.' });
    }
}

async function authorizeExit(req, res) {
    try {
        const { passId, gateId = 1 } = req.body;

        if (!passId) {
            return res.status(400).json({ success: false, message: 'Pass ID is required to authorize exit.' });
        }

        const result = await gateService.authorizeExit({
            passId: parseInt(passId),
            gateId: parseInt(gateId),
            guardUser: req.user
        });

        res.json(result);
    } catch (err) {
        console.error('Authorize exit error:', err);
        res.status(400).json({ success: false, message: err.message || 'Failed to authorize exit transit.' });
    }
}

async function verifyReturn(req, res) {
    try {
        const { passId, returnCode, token, gateId = 1 } = req.body;
        const identifier = passId || returnCode || token;

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Pass ID, Return Code, or QR Token is required.' });
        }

        const result = await gateService.verifyReturn({
            passIdOrCode: identifier,
            gateId: parseInt(gateId),
            guardUser: req.user
        });

        res.json(result);
    } catch (err) {
        console.error('Verify return error:', err);
        res.status(400).json({ success: false, message: err.message || 'Failed to verify return transit.' });
    }
}

async function getRecentScans(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const query = `
            SELECT ge.*, g.gate_name, g.gate_code,
                   s.roll_number, u.full_name as student_name,
                   p.pass_number, p.pass_type,
                   gu.full_name as guard_name
            FROM gate_events ge
            JOIN gates g ON g.id = ge.gate_id
            LEFT JOIN passes p ON p.id = ge.pass_id
            LEFT JOIN students s ON s.id = ge.student_id
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN users gu ON gu.id = ge.guard_id
            WHERE ge.hostel_id = $1
            ORDER BY ge.created_at DESC
            LIMIT 20
        `;
        const result = await db.query(query, [hostelId]);
        res.json({ success: true, scans: result.rows });
    } catch (err) {
        console.error('Error fetching recent gate scans:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving scan history.' });
    }
}

async function getActivePasses(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const query = `
            SELECT p.id, p.pass_number, p.pass_type, p.status as pass_status,
                   p.valid_from, p.valid_until, p.return_code, p.qr_token,
                   s.id as student_id, s.roll_number, s.movement_status,
                   u.full_name as student_name, u.phone as student_phone,
                   rm.room_number, b.block_name,
                   r.destination, r.reason
            FROM passes p
            JOIN pass_requests r ON r.id = p.request_id
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            WHERE p.hostel_id = $1 AND p.status IN ('APPROVED', 'ACTIVE', 'OVERDUE')
            ORDER BY p.id DESC
            LIMIT 25
        `;
        const result = await db.query(query, [hostelId]);
        res.json({ success: true, passes: result.rows });
    } catch (err) {
        console.error('Error fetching active passes for gate:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving active passes.' });
    }
}

module.exports = {
    scanToken,
    authorizeExit,
    verifyReturn,
    getRecentScans,
    getActivePasses
};

