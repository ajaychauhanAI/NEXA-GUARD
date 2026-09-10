const express = require('express');
const router = express.Router();
const fineController = require('../controllers/fineController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/', authenticateToken, fineController.getFines);
router.post('/', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), fineController.createFine);
router.put('/:id/status', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), fineController.updateFineStatus);

module.exports = router;
