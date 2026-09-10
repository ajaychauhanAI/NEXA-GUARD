const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.post('/risk-score', authenticateToken, aiController.calculateRisk);
router.get('/anomalies', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), aiController.getAnomalies);
router.get('/insights', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), aiController.getInsights);
router.get('/resource-recommendations', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), aiController.getInsights);
router.get('/predictions', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), aiController.getPredictions);
router.get('/operational-score', authenticateToken, requireRole('HOSTEL_ADMIN', 'WARDEN'), aiController.getOperationalScore);
router.get('/baselines/:studentId', authenticateToken, aiController.getStudentBaseline);
router.post('/chat', authenticateToken, aiController.chatAssistant);
router.post('/assistant', authenticateToken, aiController.chatAssistant);

module.exports = router;
