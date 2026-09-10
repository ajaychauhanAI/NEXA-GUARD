/**
 * Disciplinary Fines Controller
 */

const db = require('../config/db');
const { logAudit } = require('../middleware/audit');

async function getFines(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { studentId, status } = req.query;

        let query = `
            SELECT f.*, 
                   s.roll_number, u.full_name as student_name,
                   iu.full_name as issued_by_name,
                   p.pass_number
            FROM fines f
            JOIN students s ON s.id = f.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN users iu ON iu.id = f.issued_by
            LEFT JOIN passes p ON p.id = f.pass_id
            WHERE s.hostel_id = $1
        `;
        const params = [hostelId];

        if (req.user.role === 'STUDENT') {
            params.push(req.user.student_id);
            query += ` AND f.student_id = $${params.length}`;
        } else if (studentId) {
            params.push(studentId);
            query += ` AND f.student_id = $${params.length}`;
        }

        if (status) {
            params.push(status);
            query += ` AND f.status = $${params.length}`;
        }

        query += ` ORDER BY f.issued_at DESC`;
        const result = await db.query(query, params);
        res.json({ success: true, count: result.rows.length, fines: result.rows });
    } catch (err) {
        console.error('Error fetching fines:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving fines.' });
    }
}

async function createFine(req, res) {
    try {
        const { studentId, reason, amount, notes, passId } = req.body;

        if (!studentId || !reason || !amount) {
            return res.status(400).json({ success: false, message: 'Student ID, reason, and amount are required.' });
        }

        const fineNumber = `FIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const insertQuery = `
            INSERT INTO fines (fine_number, student_id, pass_id, reason, amount, status, issued_by, notes)
            VALUES ($1, $2, $3, $4, $5, 'UNPAID', $6, $7)
            RETURNING *;
        `;
        const result = await db.query(insertQuery, [
            fineNumber, studentId, passId || null, reason, parseFloat(amount), req.user.id, notes || null
        ]);

        await logAudit({
            hostelId: req.user.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'FINE_CREATED',
            targetType: 'FINE',
            targetId: result.rows[0].id,
            result: 'SUCCESS',
            context: { fineNumber, amount }
        });

        res.status(201).json({ success: true, message: 'Fine assessed successfully.', fine: result.rows[0] });
    } catch (err) {
        console.error('Error creating fine:', err);
        res.status(500).json({ success: false, message: 'Server error creating fine.' });
    }
}

async function updateFineStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['PAID', 'WAIVED', 'UNPAID'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid fine status.' });
        }

        const paidAt = status === 'PAID' ? 'NOW()' : 'NULL';
        await db.query(`UPDATE fines SET status = $1, paid_at = ${paidAt} WHERE id = $2`, [status, id]);

        await logAudit({
            hostelId: req.user.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'FINE_STATUS_UPDATED',
            targetType: 'FINE',
            targetId: id,
            result: 'SUCCESS',
            context: { newStatus: status }
        });

        res.json({ success: true, message: `Fine marked as ${status}.` });
    } catch (err) {
        console.error('Error updating fine status:', err);
        res.status(500).json({ success: false, message: 'Server error updating fine status.' });
    }
}

module.exports = {
    getFines,
    createFine,
    updateFineStatus
};
