const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.post('/scan', authenticateToken, requireRole('SECURITY_GUARD', 'HOSTEL_ADMIN', 'WARDEN'), gateController.scanToken);
router.post('/exit', authenticateToken, requireRole('SECURITY_GUARD', 'HOSTEL_ADMIN', 'WARDEN'), gateController.authorizeExit);
router.post('/return', authenticateToken, requireRole('SECURITY_GUARD', 'HOSTEL_ADMIN', 'WARDEN'), gateController.verifyReturn);
router.get('/recent', authenticateToken, requireRole('SECURITY_GUARD', 'HOSTEL_ADMIN', 'WARDEN'), gateController.getRecentScans);
router.get('/active-passes', authenticateToken, requireRole('SECURITY_GUARD', 'HOSTEL_ADMIN', 'WARDEN'), gateController.getActivePasses);

module.exports = router;

