/**
 * NEXA-GUARD Centralized In-App Notification Service
 * 
 * Manages institutional in-app notifications stored in PostgreSQL `notifications` table.
 * Enforces role-based delivery:
 * - Student receives pass approval/rejection and disciplinary fine alerts
 * - Wardens receive new pass requests, overdue movements, and critical anomaly alerts
 * - Parents receive exit/return transit events and overdue curfew notifications for their linked ward
 */

const db = require('../config/db');

/**
 * Creates an in-app notification record for a specific user
 * @param {Object} param0
 * @param {number} param0.userId
 * @param {string} param0.title
 * @param {string} param0.message
 * @param {string} param0.notificationType 'PASS_REQUEST' | 'PASS_APPROVED' | 'PASS_REJECTED' | 'GATE_EXIT' | 'GATE_RETURN' | 'LATE_RETURN' | 'FINE_ISSUED' | 'EMERGENCY_ALERT' | 'SECURITY_ALERT'
 * @param {number} [param0.relatedId]
 */
async function createNotification({ userId, title, message, notificationType, relatedId = null }) {
    if (!userId || !title || !message) return null;
    try {
        const query = `
            INSERT INTO notifications (user_id, title, message, notification_type, related_id, is_read)
            VALUES ($1, $2, $3, $4, $5, FALSE)
            RETURNING *;
        `;
        const res = await db.query(query, [userId, title, message, notificationType, relatedId]);
        return res.rows[0];
    } catch (err) {
        console.error('Error creating in-app notification:', err.message);
        return null;
    }
}

/**
 * Dispatches in-app notification to all active wardens for a given hostel
 */
async function notifyWardens({ hostelId, title, message, notificationType, relatedId = null }) {
    try {
        const wardensRes = await db.query(`
            SELECT id FROM users 
            WHERE hostel_id = $1 AND role = 'WARDEN' AND status = 'ACTIVE'
        `, [hostelId]);

        const promises = wardensRes.rows.map(w =>
            createNotification({
                userId: w.id,
                title,
                message,
                notificationType,
                relatedId
            })
        );
        return await Promise.all(promises);
    } catch (err) {
        console.error('Error notifying wardens:', err.message);
        return [];
    }
}

/**
 * Dispatches in-app notification to the linked parent/guardian of a student
 */
async function notifyParentOfStudent({ studentId, title, message, notificationType, relatedId = null }) {
    try {
        // Find parent user_id via parents or parent_student
        const parentRes = await db.query(`
            SELECT u.id as user_id
            FROM users u
            WHERE u.id IN (
                SELECT user_id FROM parents WHERE student_id = $1
                UNION
                SELECT parent_user_id FROM parent_student WHERE student_id = $1
            ) AND u.status = 'ACTIVE'
        `, [studentId]);

        const promises = parentRes.rows.map(p =>
            createNotification({
                userId: p.user_id,
                title,
                message,
                notificationType,
                relatedId
            })
        );
        return await Promise.all(promises);
    } catch (err) {
        console.error('Error notifying student parent:', err.message);
        return [];
    }
}

/**
 * Dispatches in-app notification to a student by their student_id
 */
async function notifyStudent({ studentId, title, message, notificationType, relatedId = null }) {
    try {
        const stuRes = await db.query(`SELECT user_id FROM students WHERE id = $1`, [studentId]);
        if (stuRes.rows.length === 0) return null;

        return await createNotification({
            userId: stuRes.rows[0].user_id,
            title,
            message,
            notificationType,
            relatedId
        });
    } catch (err) {
        console.error('Error notifying student:', err.message);
        return null;
    }
}

/**
 * Fetches notifications for a user with unread count
 */
async function getUserNotifications(userId, limit = 50) {
    const listRes = await db.query(`
        SELECT * FROM notifications 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
    `, [userId, limit]);

    const countRes = await db.query(`
        SELECT COUNT(*) as unread_count 
        FROM notifications 
        WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);

    return {
        notifications: listRes.rows,
        unreadCount: parseInt(countRes.rows[0]?.unread_count || 0)
    };
}

/**
 * Marks a notification as read (scoped to the owning user for security)
 */
async function markNotificationAsRead(notificationId, userId) {
    const res = await db.query(`
        UPDATE notifications 
        SET is_read = TRUE 
        WHERE id = $1 AND user_id = $2
        RETURNING *;
    `, [notificationId, userId]);

    return res.rows[0] || null;
}

/**
 * Marks all notifications as read for a user
 */
async function markAllNotificationsAsRead(userId) {
    const res = await db.query(`
        UPDATE notifications 
        SET is_read = TRUE 
        WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);

    return { updatedCount: res.rowCount };
}

module.exports = {
    createNotification,
    notifyWardens,
    notifyParentOfStudent,
    notifyStudent,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
};
