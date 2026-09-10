const express = require('express');
const router = express.Router();
const hostelController = require('../controllers/hostelController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/profile', authenticateToken, hostelController.getHostelProfile);
router.get('/staff', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), hostelController.getStaff);
router.post('/staff', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addStaff);
router.get('/parents', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), hostelController.getParents);
router.get('/rooms', authenticateToken, hostelController.getRooms);
router.get('/floors', authenticateToken, hostelController.getFloors);
router.post('/floors', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addFloor);
router.delete('/floors/:id', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.deleteFloor);
router.post('/rooms', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addRoom);
router.put('/rooms/:id', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.updateRoom);
router.delete('/rooms/:id', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.deleteRoom);
router.get('/blocks', authenticateToken, hostelController.getBlocks);
router.post('/blocks', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addBlock);
router.post('/gates', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addGate);
router.post('/zones', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.addZone);
router.post('/setup', hostelController.setupWizard);
router.post('/', hostelController.registerHostel);
router.put('/settings', authenticateToken, requireRole('HOSTEL_ADMIN'), hostelController.updateHostelSettings);
router.put('/policies', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), hostelController.updatePolicies);
router.get('/:id?', authenticateToken, hostelController.getHostel);

module.exports = router;
