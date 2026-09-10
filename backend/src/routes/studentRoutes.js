const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN', 'SECURITY_GUARD'), studentController.getStudents);
router.post('/', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), studentController.createStudent);
router.post('/bulk', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), studentController.importStudents);
router.post('/import-csv', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), studentController.importStudents);
router.get('/:id', authenticateToken, studentController.getStudentById);
router.put('/:id/status', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), studentController.updateStudentStatus);
router.put('/:id/room', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), studentController.allocateStudentRoom);

module.exports = router;

