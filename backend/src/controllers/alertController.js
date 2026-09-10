/**
 * Institutional Alerts & Notification Controller
 */

const db = require('../config/db');

async function getAlerts(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { isResolved = 'false', limit = 50 } = req.query;

        const query = `
            SELECT a.*, 
                   s.roll_number, u.full_name as student_name,
                   p.pass_number
            FROM alerts a
            LEFT JOIN students s ON s.id = a.student_id
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN passes p ON p.id = a.pass_id
            WHERE a.hostel_id = $1 AND a.is_resolved = $2
            ORDER BY a.created_at DESC
            LIMIT $3
        `;
        const result = await db.query(query, [hostelId, isResolved === 'true', parseInt(limit)]);
        res.json({ success: true, count: result.rows.length, alerts: result.rows });
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving alerts.' });
    }
}

async function resolveAlert(req, res) {
    try {
        const { id } = req.params;
        await db.query(`UPDATE alerts SET is_resolved = TRUE, resolved_at = NOW() WHERE id = $1`, [id]);
        res.json({ success: true, message: 'Alert resolved successfully.' });
    } catch (err) {
        console.error('Error resolving alert:', err);
        res.status(500).json({ success: false, message: 'Server error resolving alert.' });
    }
}

async function getNotifications(req, res) {
    try {
        const userId = req.user.id;
        const result = await db.query(`
            SELECT * FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 30
        `, [userId]);
        res.json({ success: true, count: result.rows.length, notifications: result.rows });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving notifications.' });
    }
}

async function markNotificationRead(req, res) {
    try {
        const { id } = req.params;
        await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) {
        console.error('Error marking notification read:', err);
        res.status(500).json({ success: false, message: 'Server error updating notification.' });
    }
}

module.exports = {
    getAlerts,
    resolveAlert,
    getNotifications,
    markNotificationRead
};
