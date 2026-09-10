const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/overview', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getOverview);
router.get('/movements', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getMovements);
router.get('/late-returns', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getLateReturns);
router.get('/gates', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getGates);
router.get('/blocks', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getBlocks);
router.get('/mess', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), analyticsController.getMessHeadcount);

module.exports = router;
