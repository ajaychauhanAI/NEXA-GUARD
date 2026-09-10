const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.get('/', authenticateToken, requireRole('HOSTEL_ADMIN'), auditController.getAuditLogs);

module.exports = router;
