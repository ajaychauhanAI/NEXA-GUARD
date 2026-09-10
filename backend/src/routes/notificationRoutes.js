const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, notificationController.getNotifications);
router.post('/:id/read', authenticateToken, notificationController.markAsRead);
router.post('/read-all', authenticateToken, notificationController.markAllRead);

module.exports = router;
