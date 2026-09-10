/**
 * System Audit Log Controller
 */

const db = require('../config/db');

async function getAuditLogs(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { action, actorRole, result: filterResult, limit = 50 } = req.query;

        let query = `
            SELECT * FROM audit_logs
            WHERE (hostel_id = $1 OR hostel_id IS NULL)
        `;
        const params = [hostelId];

        if (action) {
            params.push(action);
            query += ` AND action = $${params.length}`;
        }

        if (actorRole) {
            params.push(actorRole);
            query += ` AND actor_role = $${params.length}`;
        }

        if (filterResult) {
            params.push(filterResult);
            query += ` AND result = $${params.length}`;
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const logs = await db.query(query, params);
        res.json({ success: true, count: logs.rows.length, auditLogs: logs.rows });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving audit logs.' });
    }
}

module.exports = {
    getAuditLogs
};
