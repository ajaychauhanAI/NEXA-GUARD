/**
 * Pass Requests & Movement Approval Controller
 */

const db = require('../config/db');
const passService = require('../services/passService');
const { generateQrDataUrl } = require('../services/qrService');
const { logAudit } = require('../middleware/audit');

async function createRequest(req, res) {
    try {
        const { passType, fromTime, toTime, reason, destination, requestLat, requestLng } = req.body;

        if (!passType || !fromTime || !toTime || !reason || !destination) {
            return res.status(400).json({
                success: false,
                message: 'All pass request fields are mandatory (type, fromTime, toTime, reason, destination).'
            });
        }

        const studentId = req.user.student_id;
        if (!studentId) {
            return res.status(403).json({ success: false, message: 'Only registered hostel students can apply for passes.' });
        }

        // Check if student already has a pending or active pass
        const activeCheck = await db.query(`
            SELECT id, status FROM pass_requests
            WHERE student_id = $1 AND status = 'PENDING'
        `, [studentId]);

        if (activeCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending movement request under review. Please wait for warden decision or cancel the existing request.'
            });
        }

        const result = await passService.createPassRequest({
            studentId,
            hostelId: req.user.hostel_id || 1,
            passType,
            fromTime,
            toTime,
            reason,
            destination,
            requestLat,
            requestLng,
            user: req.user
        });

        res.status(201).json({
            success: true,
            message: result.message || 'Pass request submitted successfully. Explainable AI risk evaluation completed.',
            request: result.request,
            riskAnalysis: result.riskAnalysis,
            autoApproved: result.autoApproved || false,
            pass: result.pass || null
        });
    } catch (err) {
        console.error('Error creating pass request:', err);
        res.status(500).json({ success: false, message: err.message || 'Server error creating pass request.' });
    }
}

async function getRequests(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { status, studentId, riskLevel, limit = 50 } = req.query;

        let query = `
            SELECT r.*, 
                   s.roll_number, s.course, s.branch, s.photo_url,
                   u.full_name as student_name, u.phone as student_phone,
                   rm.room_number, b.block_name,
                   rs.risk_score, rs.risk_level, rs.recommendation, rs.reasons, rs.signals
            FROM pass_requests r
            JOIN students s ON s.id = r.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN risk_scores rs ON rs.request_id = r.id
            WHERE r.hostel_id = $1
        `;
        const params = [hostelId];

        // If logged in as STUDENT, only return their own requests
        if (req.user.role === 'STUDENT') {
            params.push(req.user.student_id);
            query += ` AND r.student_id = $${params.length}`;
        } else if (studentId) {
            params.push(studentId);
            query += ` AND r.student_id = $${params.length}`;
        }

        if (status) {
            params.push(status);
            query += ` AND r.status = $${params.length}`;
        }

        if (riskLevel) {
            params.push(riskLevel);
            query += ` AND rs.risk_level = $${params.length}`;
        }

        query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);
        res.json({
            success: true,
            count: result.rows.length,
            requests: result.rows
        });
    } catch (err) {
        console.error('Error fetching pass requests:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving pass requests.' });
    }
}

async function getRequestById(req, res) {
    try {
        const { id } = req.params;
        const query = `
            SELECT r.*, 
                   s.roll_number, s.course, s.branch, s.photo_url, s.movement_status,
                   u.full_name as student_name, u.phone as student_phone,
                   rm.room_number, b.block_name,
                   rs.risk_score, rs.risk_level, rs.recommendation, rs.reasons, rs.signals,
                   p.id as pass_id, p.pass_number, p.status as pass_status, p.return_code
            FROM pass_requests r
            JOIN students s ON s.id = r.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN risk_scores rs ON rs.request_id = r.id
            LEFT JOIN passes p ON p.request_id = r.id
            WHERE r.id = $1
        `;
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pass request not found.' });
        }

        res.json({ success: true, request: result.rows[0] });
    } catch (err) {
        console.error('Error fetching request by ID:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving request details.' });
    }
}

async function approveRequest(req, res) {
    try {
        const { id } = req.params;
        const { overrideNotes } = req.body;

        const pass = await passService.approvePassRequest({
            requestId: id,
            reviewerUser: req.user,
            overrideNotes
        });

        res.json({
            success: true,
            message: 'Pass approved successfully. Gate QR token generated.',
            pass
        });
    } catch (err) {
        console.error('Error approving pass request:', err);
        res.status(400).json({ success: false, message: err.message || 'Failed to approve pass request.' });
    }
}

async function rejectRequest(req, res) {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
        }

        const result = await passService.rejectPassRequest({
            requestId: id,
            reviewerUser: req.user,
            rejectionReason
        });

        res.json(result);
    } catch (err) {
        console.error('Error rejecting pass request:', err);
        res.status(400).json({ success: false, message: err.message || 'Failed to reject pass request.' });
    }
}

async function getActivePass(req, res) {
    try {
        const studentId = req.user.student_id;
        if (!studentId) {
            return res.status(403).json({ success: false, message: 'No student linked to this session.' });
        }

        const passQuery = `
            SELECT p.*, r.reason, r.destination, r.pass_type,
                   s.roll_number, u.full_name as student_name,
                   rm.room_number, b.block_name,
                   rs.risk_score, rs.risk_level
            FROM passes p
            JOIN pass_requests r ON r.id = p.request_id
            JOIN students s ON s.id = p.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN risk_scores rs ON rs.request_id = r.id
            WHERE p.student_id = $1 AND p.status IN ('APPROVED', 'ACTIVE', 'OVERDUE')
            ORDER BY p.id DESC LIMIT 1
        `;
        const result = await db.query(passQuery, [studentId]);

        if (result.rows.length === 0) {
            return res.json({ success: true, activePass: null });
        }

        const pass = result.rows[0];

        // Generate base64 Data URL for the QR code
        const qrDataUrl = await generateQrDataUrl(pass.qr_token);

        res.json({
            success: true,
            activePass: {
                ...pass,
                qrDataUrl
            }
        });
    } catch (err) {
        console.error('Error fetching active pass:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving active pass.' });
    }
}

async function cancelRequest(req, res) {
    try {
        const { id } = req.params;
        const studentId = req.user.student_id;

        const checkRes = await db.query(`
            SELECT * FROM pass_requests WHERE id = $1 AND student_id = $2 AND status = 'PENDING'
        `, [id, studentId]);

        if (checkRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled.' });
        }

        await db.query(`UPDATE pass_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [id]);

        await logAudit({
            hostelId: req.user.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'PASS_CANCELLED',
            targetType: 'PASS_REQUEST',
            targetId: id,
            result: 'SUCCESS'
        });

        res.json({ success: true, message: 'Pass request cancelled successfully.' });
    } catch (err) {
        console.error('Error cancelling pass request:', err);
        res.status(500).json({ success: false, message: 'Server error cancelling pass request.' });
    }
}

async function batchApprove(req, res) {
    try {
        const { requestIds, notes } = req.body;
        if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Please provide an array of request IDs to approve.' });
        }

        const result = await passService.batchApprovePasses({
            requestIds,
            reviewerUser: req.user,
            overrideNotes: notes
        });

        res.json({
            success: true,
            message: `Batch approved ${result.approvedCount} passes successfully.`,
            ...result
        });
    } catch (err) {
        console.error('Error in batch pass approval:', err);
        res.status(400).json({ success: false, message: err.message || 'Batch pass approval failed.' });
    }
}

module.exports = {
    createRequest,
    getRequests,
    getRequestById,
    approveRequest,
    rejectRequest,
    getActivePass,
    cancelRequest,
    batchApprove
};
