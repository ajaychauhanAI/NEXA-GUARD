const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// All user management routes require authentication and appropriate roles
router.use(authenticateToken);

// Role creation by Hostel Admin / Super Admin
router.post('/warden', requireRole('HOSTEL_ADMIN', 'SUPER_ADMIN'), userController.createWarden);
router.post('/guard', requireRole('HOSTEL_ADMIN', 'SUPER_ADMIN'), userController.createGuard);
router.post('/parent', requireRole('HOSTEL_ADMIN', 'WARDEN', 'SUPER_ADMIN'), userController.createParent);
router.post('/:id/resend-invitation', requireRole('HOSTEL_ADMIN', 'SUPER_ADMIN'), userController.resendInvitation);

// List institutional users
router.get('/', requireRole('HOSTEL_ADMIN', 'SUPER_ADMIN'), userController.getUsers);

module.exports = router;
