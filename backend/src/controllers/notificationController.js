/**
 * NEXA-GUARD Notification Controller
 * Endpoints for in-app notification retrieval and status updates
 */

const notificationService = require('../services/notificationService');

async function getNotifications(req, res) {
    try {
        const userId = req.user.id;
        const result = await notificationService.getUserNotifications(userId);
        res.json({
            success: true,
            notifications: result.notifications,
            unreadCount: result.unreadCount
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving notifications.' });
    }
}

async function markAsRead(req, res) {
    try {
        const notificationId = parseInt(req.params.id);
        const userId = req.user.id;

        if (!notificationId) {
            return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
        }

        const updated = await notificationService.markNotificationAsRead(notificationId, userId);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Notification not found or unauthorized.' });
        }

        res.json({ success: true, notification: updated });
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({ success: false, message: 'Server error updating notification status.' });
    }
}

async function markAllRead(req, res) {
    try {
        const userId = req.user.id;
        const result = await notificationService.markAllNotificationsAsRead(userId);
        res.json({ success: true, updatedCount: result.updatedCount });
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        res.status(500).json({ success: false, message: 'Server error marking all notifications as read.' });
    }
}

module.exports = {
    getNotifications,
    markAsRead,
    markAllRead
};
