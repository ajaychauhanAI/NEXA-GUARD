/**
 * Centralized Audit Logging Service
 */

const db = require('../config/db');

async function logAudit({ hostelId, actorId, actorEmail, actorRole, action, targetType, targetId, result = 'SUCCESS', ipAddress, userAgent, context }) {
    try {
        const query = `
            INSERT INTO audit_logs (
                hostel_id, actor_id, actor_email, actor_role, action,
                target_type, target_id, result, ip_address, user_agent, context
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        await db.query(query, [
            hostelId || null,
            actorId || null,
            actorEmail || 'SYSTEM',
            actorRole || 'SYSTEM',
            action,
            targetType || null,
            targetId ? String(targetId) : null,
            result,
            ipAddress || '127.0.0.1',
            userAgent || null,
            context ? JSON.stringify(context) : null
        ]);
    } catch (err) {
        console.error('Failed to write audit log:', err.message);
    }
}

module.exports = {
    logAudit
};
