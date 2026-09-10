/**
 * AI Intelligence Controller
 * Unified endpoint handlers for Explainable Risk Scoring, Behavioral Anomaly Radar,
 * Movement Predictions, Personal Behavioral Baselines, and Operational Intelligence Scoring.
 */

const { calculatePassRiskScore } = require('../ai/riskEngine');
const { scanAndDetectAnomalies } = require('../ai/anomalyEngine');
const { generateResourceInsights } = require('../ai/resourceOptimizer');
const { handleAssistantQuery } = require('../ai/assistantService');
const { generateMovementPredictions } = require('../ai/predictionEngine');
const { computeOperationalScore } = require('../ai/insightEngine');
const { getOrComputeStudentBaseline } = require('../ai/baselineEngine');

async function calculateRisk(req, res) {
    try {
        const { studentId, passType, fromTime, toTime, isLocationVerified, requestLat, requestLng } = req.body;
        const targetStudentId = studentId || req.user.student_id;

        const analysis = await calculatePassRiskScore({
            studentId: targetStudentId,
            hostelId: req.user.hostel_id || 1,
            passType: passType || 'OUTPASS',
            fromTime: fromTime || new Date().toISOString(),
            toTime: toTime || new Date(Date.now() + 4 * 3600000).toISOString(),
            isLocationVerified: isLocationVerified ?? true,
            requestLat,
            requestLng
        });

        res.json({ success: true, analysis });
    } catch (err) {
        console.error('AI risk calculation error:', err);
        res.status(500).json({ success: false, message: 'Server error computing AI risk score.' });
    }
}

async function getAnomalies(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const anomalies = await scanAndDetectAnomalies(hostelId);
        res.json({ success: true, count: anomalies.length, anomalies });
    } catch (err) {
        console.error('Error detecting anomalies:', err);
        res.status(500).json({ success: false, message: 'Server error executing anomaly detection.' });
    }
}

async function getInsights(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const insights = await generateResourceInsights(hostelId);
        res.json({ success: true, ...insights });
    } catch (err) {
        console.error('Error generating AI resource insights:', err);
        res.status(500).json({ success: false, message: 'Server error generating operational insights.' });
    }
}

async function getPredictions(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const predictions = await generateMovementPredictions(hostelId);
        res.json(predictions);
    } catch (err) {
        console.error('Error generating predictions:', err);
        res.status(500).json({ success: false, message: 'Server error generating predictive forecast.' });
    }
}

async function getOperationalScore(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const scoreData = await computeOperationalScore(hostelId);
        res.json({ success: true, ...scoreData });
    } catch (err) {
        console.error('Error computing operational score:', err);
        res.status(500).json({ success: false, message: 'Server error calculating operational intelligence score.' });
    }
}

async function getStudentBaseline(req, res) {
    try {
        const studentId = parseInt(req.params.studentId) || req.user.student_id;
        const hostelId = req.user.hostel_id || 1;
        if (!studentId) {
            return res.status(400).json({ success: false, message: 'Student ID required.' });
        }

        const baseline = await getOrComputeStudentBaseline(studentId, hostelId);
        res.json({ success: true, baseline });
    } catch (err) {
        console.error('Error retrieving student baseline:', err);
        res.status(500).json({ success: false, message: 'Server error fetching behavioral baseline.' });
    }
}

async function chatAssistant(req, res) {
    try {
        const queryText = req.body.message || req.body.query || req.body.prompt;
        if (!queryText) {
            return res.status(400).json({ success: false, message: 'Message or query text is required.' });
        }

        const reply = await handleAssistantQuery(req.user, queryText);
        res.json({ success: true, ...reply });
    } catch (err) {
        console.error('Error in NEXA AI assistant:', err);
        res.status(500).json({ success: false, message: 'Server error processing AI assistant query.' });
    }
}

module.exports = {
    calculateRisk,
    getAnomalies,
    getInsights,
    getPredictions,
    getOperationalScore,
    getStudentBaseline,
    chatAssistant
};
