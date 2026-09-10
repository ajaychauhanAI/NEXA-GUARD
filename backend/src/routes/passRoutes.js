const express = require('express');
const router = express.Router();
const passController = require('../controllers/passController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Pass Request creation & tracking
router.post('/requests', authenticateToken, requireRole('STUDENT'), passController.createRequest);
router.get('/requests', authenticateToken, passController.getRequests);
router.get('/requests/:id', authenticateToken, passController.getRequestById);
router.post('/requests/:id/approve', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), passController.approveRequest);
router.post('/requests/:id/reject', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), passController.rejectRequest);
router.post('/requests/:id/cancel', authenticateToken, requireRole('STUDENT'), passController.cancelRequest);
router.post('/batch-approve', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), passController.batchApprove);

// Active pass & QR code retrieval
router.get('/active', authenticateToken, requireRole('STUDENT'), passController.getActivePass);

module.exports = router;
