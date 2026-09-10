const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/', authenticateToken, alertController.getAlerts);
router.put('/:id/resolve', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), alertController.resolveAlert);
router.get('/notifications', authenticateToken, alertController.getNotifications);
router.put('/notifications/:id/read', authenticateToken, alertController.markNotificationRead);

module.exports = router;
