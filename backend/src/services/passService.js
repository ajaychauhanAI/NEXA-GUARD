/**
 * Pass Lifecycle & Approval Management Service
 */

const db = require('../config/db');
const { calculatePassRiskScore } = require('../ai/riskEngine');
const { isWithinGeofence } = require('../utils/geo');
const { generateSecureQrToken, generateReturnCode, generateQrDataUrl } = require('./qrService');
const { logAudit } = require('../middleware/audit');
const emailService = require('./emailService');
const notificationService = require('./notificationService');

async function createPassRequest({ studentId, hostelId, passType, fromTime, toTime, reason, destination, requestLat, requestLng, user }) {
    // 1. Fetch hostel geofence settings
    const hostelRes = await db.query(`SELECT latitude, longitude, geofence_radius_meters FROM hostels WHERE id = $1`, [hostelId]);
    const hostel = hostelRes.rows[0];

    // 1b. Academic Lecture Hours & Pass Issuance Window Validation
    const reqFrom = new Date(fromTime);
    const reqTo = new Date(toTime);
    const fromHourDecimal = reqFrom.getHours() + reqFrom.getMinutes() / 60;
    const toHourDecimal = reqTo.getHours() + reqTo.getMinutes() / 60;
    const dayOfWeek = reqFrom.getDay(); // 0 is Sunday, 1-6 Mon-Sat
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 6;

    if (isWorkingDay && (passType === 'OUTPASS' || passType === 'DAY')) {
        const overlapsCollegeHours = (fromHourDecimal < 16.5 && toHourDecimal > 9.0);
        if (overlapsCollegeHours) {
            throw new Error('Academic Policy Restriction: Casual day outpasses are not permitted during active college lecture hours (09:00 AM - 04:30 PM). Evening pass window opens at 04:30 PM. (Emergency Exits are available 24/7).');
        }
    }

    // 2. Geofence Verification Check
    let isLocationVerified = true;
    let distanceMeters = 0;
    if (requestLat && requestLng && hostel) {
        const geoCheck = isWithinGeofence(
            parseFloat(requestLat),
            parseFloat(requestLng),
            parseFloat(hostel.latitude),
            parseFloat(hostel.longitude),
            hostel.geofence_radius_meters || 150
        );
        isLocationVerified = geoCheck.isVerified;
        distanceMeters = geoCheck.distance;
    }

    // 3. Generate Clash-Free Unique Request Number
    const maxReqRes = await db.query(`SELECT id FROM pass_requests ORDER BY id DESC LIMIT 1`);
    const nextSeq = (maxReqRes.rows[0] ? parseInt(maxReqRes.rows[0].id) : 0) + 1;
    const reqRand = Math.floor(100 + Math.random() * 900);
    const requestNumber = `REQ-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}-${reqRand}`;


    // 4. Calculate Explainable AI Risk Score
    const riskAnalysis = await calculatePassRiskScore({
        studentId,
        hostelId,
        passType,
        fromTime,
        toTime,
        isLocationVerified,
        requestLat,
        requestLng
    });

    // 5. Insert Pass Request
    const insertReqQuery = `
        INSERT INTO pass_requests (
            request_number, student_id, hostel_id, pass_type, from_time, to_time,
            reason, destination, request_location_lat, request_location_lng,
            location_verified, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
        RETURNING *;
    `;
    const reqRes = await db.query(insertReqQuery, [
        requestNumber, studentId, hostelId, passType, fromTime, toTime,
        reason, destination, requestLat ? parseFloat(requestLat) : null,
        requestLng ? parseFloat(requestLng) : null, isLocationVerified
    ]);
    const createdRequest = reqRes.rows[0];

    // 6. Save Location Verification Event
    if (requestLat && requestLng) {
        await db.query(`
            INSERT INTO locations (
                student_id, event_type, latitude, longitude, 
                distance_from_hostel_meters, is_geofence_verified
            ) VALUES ($1, 'REQUEST_CREATED', $2, $3, $4, $5)
        `, [studentId, parseFloat(requestLat), parseFloat(requestLng), distanceMeters, isLocationVerified]);
    }

    // 7. Store Explainable Risk Output
    await db.query(`
        INSERT INTO risk_scores (
            request_id, student_id, risk_score, risk_level, 
            recommendation, reasons, signals
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        createdRequest.id, studentId, riskAnalysis.riskScore,
        riskAnalysis.riskLevel, riskAnalysis.recommendation,
        JSON.stringify(riskAnalysis.reasons), JSON.stringify(riskAnalysis.signals)
    ]);

    // 8. If High Risk or Location Mismatch, trigger immediate Alert for Warden
    if (riskAnalysis.riskScore > 60 || !isLocationVerified) {
        await db.query(`
            INSERT INTO alerts (hostel_id, student_id, alert_type, severity, message)
            VALUES ($1, $2, $3, 'WARNING', $4)
        `, [
            hostelId, studentId,
            !isLocationVerified ? 'LOCATION_MISMATCH' : 'HIGH_RISK_REQUEST',
            `Pass request ${requestNumber} flagged with Risk Score ${riskAnalysis.riskScore}/100. ${riskAnalysis.reasons[0] || ''}`
        ]);
    }

    // 9. In-app notifications to Wardens
    notificationService.notifyWardens({
        hostelId,
        title: passType === 'EMERGENCY_EXIT' ? '🚨 Emergency Movement Request' : 'New Pass Request',
        message: `Student ${user.full_name || 'Resident'} submitted ${passType} (${requestNumber}) for: ${reason}`,
        notificationType: passType === 'EMERGENCY_EXIT' ? 'EMERGENCY_ALERT' : 'PASS_REQUEST',
        relatedId: createdRequest.id
    }).catch(e => console.warn('Wardens notification error:', e.message));

    if (passType === 'EMERGENCY_EXIT') {
        notificationService.notifyParentOfStudent({
            studentId,
            title: '🚨 Emergency Movement Request Initiated',
            message: `Emergency exit was requested by your ward. Destination: ${destination}`,
            notificationType: 'EMERGENCY_ALERT',
            relatedId: createdRequest.id
        }).catch(e => console.warn('Parent emergency notification error:', e.message));
    }

    // 10. Audit log
    await logAudit({
        hostelId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'PASS_REQUEST_CREATED',
        targetType: 'PASS_REQUEST',
        targetId: createdRequest.id,
        result: 'SUCCESS',
        context: { requestNumber, riskScore: riskAnalysis.riskScore, riskLevel: riskAnalysis.riskLevel }
    });

    // 11. Advanced AI Tiered Autonomous Approval Engine
    // Routine low-risk day outpasses (score <= 30, clean record, gate compliant) are auto-approved by AI
    const durationHours = (new Date(toTime).getTime() - new Date(fromTime).getTime()) / (3600 * 1000);
    const toDateObj = new Date(toTime);
    const returnHour = toDateObj.getHours();

    const activeAlertsRes = await db.query(
        `SELECT COUNT(*) as count FROM alerts WHERE student_id = $1 AND is_resolved = FALSE`,
        [studentId]
    );
    const hasActiveAlerts = parseInt(activeAlertsRes.rows[0].count) > 0;

    const isRoutineDayPass = (passType === 'OUTPASS' || passType === 'DAY') && durationHours <= 4.5;
    const isLowRisk = riskAnalysis.riskScore <= 30 && riskAnalysis.riskLevel === 'LOW';
    const isAcademicSafe = !riskAnalysis.signals?.academicHoursBreach;
    const isEligibleForAIApproval = isRoutineDayPass && isLowRisk && isAcademicSafe && !hasActiveAlerts && isLocationVerified;

    if (isEligibleForAIApproval) {
        const systemReviewer = {
            id: user.id,
            email: 'ai-engine@nexa-guard.internal',
            role: 'AI_AGENT'
        };
        const aiApprovedPass = await approvePassRequest({
            requestId: createdRequest.id,
            reviewerUser: systemReviewer,
            overrideNotes: `🤖 AI Autonomous Approved: Routine evening outpass compliant with gate closing deadline (Risk Score: ${riskAnalysis.riskScore}/100). Clean institutional record.`
        });

        const qrDataUrl = await generateQrDataUrl(aiApprovedPass.qr_token);

        return {
            request: { ...createdRequest, status: 'APPROVED' },
            riskAnalysis,
            pass: { ...aiApprovedPass, qr_code: qrDataUrl },
            autoApproved: true,
            message: '🤖 Pass safely Auto-Approved by NEXA-GUARD AI Engine.'
        };
    }

    return {
        request: createdRequest,
        riskAnalysis
    };
}

async function approvePassRequest({ requestId, reviewerUser, overrideNotes }) {
    const reqRes = await db.query(`SELECT * FROM pass_requests WHERE id = $1 AND status = 'PENDING'`, [requestId]);
    if (reqRes.rows.length === 0) {
        throw new Error('Pass request not found or is no longer pending.');
    }
    const passReq = reqRes.rows[0];

    // Mark Request as APPROVED
    await db.query(`
        UPDATE pass_requests
        SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(), warden_override_notes = $2
        WHERE id = $3
    `, [reviewerUser.id, overrideNotes || null, requestId]);

    // Generate Clash-Free Pass Number, QR Token & 6-Digit Return Code
    const maxPassRes = await db.query(`SELECT id FROM passes ORDER BY id DESC LIMIT 1`);
    const passSeq = (maxPassRes.rows[0] ? parseInt(maxPassRes.rows[0].id) : 0) + 1;
    const passRand = Math.floor(100 + Math.random() * 900);
    const passNumber = `PASS-${new Date().getFullYear()}-${String(passSeq).padStart(4, '0')}-${passRand}`;
    const qrToken = generateSecureQrToken(passNumber, passReq.student_id);

    const returnCode = generateReturnCode();

    const insertPassQuery = `
        INSERT INTO passes (
            pass_number, request_id, student_id, hostel_id, pass_type,
            valid_from, valid_until, qr_token, return_code, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'APPROVED')
        RETURNING *;
    `;
    const passResult = await db.query(insertPassQuery, [
        passNumber, requestId, passReq.student_id, passReq.hostel_id,
        passReq.pass_type, passReq.from_time, passReq.to_time,
        qrToken, returnCode
    ]);
    const pass = passResult.rows[0];

    // Log Pass Event
    await db.query(`
        INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
        VALUES ($1, 'APPROVED', $2, $3)
    `, [pass.id, reviewerUser.id, overrideNotes || 'Approved by hostel warden']);

    // Log Audit
    await logAudit({
        hostelId: passReq.hostel_id,
        actorId: reviewerUser.id,
        actorEmail: reviewerUser.email,
        actorRole: reviewerUser.role,
        action: 'PASS_APPROVED',
        targetType: 'PASS',
        targetId: pass.id,
        result: 'SUCCESS',
        context: { passNumber, studentId: passReq.student_id }
    });

    // Send in-app notification to student
    notificationService.notifyStudent({
        studentId: passReq.student_id,
        title: 'Pass Approved',
        message: `Your ${passReq.pass_type} (Pass #${passNumber}) to '${passReq.destination}' has been approved. Use your QR code or 6-digit return code at the gate.`,
        notificationType: 'PASS_APPROVED',
        relatedId: pass.id
    }).catch(e => console.warn('Student approval notification error:', e.message));

    // Send Pass Approved notification email asynchronously
    db.query(`
        SELECT u.id, u.email, u.full_name, h.id as hostel_id, h.name as hostel_name
        FROM students s
        JOIN users u ON u.id = s.user_id
        JOIN hostels h ON h.id = s.hostel_id
        WHERE s.id = $1
    `, [passReq.student_id]).then(stuRes => {
        if (stuRes.rows.length > 0) {
            const studentUser = stuRes.rows[0];
            emailService.sendPassApproved({
                studentUser: { id: studentUser.id, email: studentUser.email, full_name: studentUser.full_name },
                pass: { ...pass, destination: passReq.destination },
                hostel: { id: studentUser.hostel_id, name: studentUser.hostel_name }
            }).catch(e => console.error('Error sending pass approval email:', e.message));
        }
    }).catch(e => console.error('Error querying student for approval email:', e.message));

    return pass;
}

async function rejectPassRequest({ requestId, reviewerUser, rejectionReason }) {
    const reqRes = await db.query(`SELECT * FROM pass_requests WHERE id = $1 AND status = 'PENDING'`, [requestId]);
    if (reqRes.rows.length === 0) {
        throw new Error('Pass request not found or already processed.');
    }
    const passReq = reqRes.rows[0];

    await db.query(`
        UPDATE pass_requests
        SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
        WHERE id = $3
    `, [reviewerUser.id, rejectionReason || 'Declined by hostel authority', requestId]);

    await logAudit({
        hostelId: passReq.hostel_id,
        actorId: reviewerUser.id,
        actorEmail: reviewerUser.email,
        actorRole: reviewerUser.role,
        action: 'PASS_REJECTED',
        targetType: 'PASS_REQUEST',
        targetId: requestId,
        result: 'SUCCESS',
        context: { rejectionReason }
    });

    // Send in-app notification to student
    notificationService.notifyStudent({
        studentId: passReq.student_id,
        title: 'Pass Request Declined',
        message: `Your ${passReq.pass_type} request (${passReq.request_number}) was declined: ${rejectionReason || 'Declined by authority'}`,
        notificationType: 'PASS_REJECTED',
        relatedId: requestId
    }).catch(e => console.warn('Student rejection notification error:', e.message));

    // Send Pass Rejected notification email asynchronously
    db.query(`
        SELECT u.id, u.email, u.full_name, h.id as hostel_id, h.name as hostel_name
        FROM students s
        JOIN users u ON u.id = s.user_id
        JOIN hostels h ON h.id = s.hostel_id
        WHERE s.id = $1
    `, [passReq.student_id]).then(stuRes => {
        if (stuRes.rows.length > 0) {
            const studentUser = stuRes.rows[0];
            emailService.sendPassRejected({
                studentUser: { id: studentUser.id, email: studentUser.email, full_name: studentUser.full_name },
                request: passReq,
                reason: rejectionReason,
                hostel: { id: studentUser.hostel_id, name: studentUser.hostel_name }
            }).catch(e => console.error('Error sending pass rejection email:', e.message));
        }
    }).catch(e => console.error('Error querying student for rejection email:', e.message));

    return { success: true, message: 'Pass request rejected successfully.' };
}

async function batchApprovePasses({ requestIds, reviewerUser, overrideNotes }) {
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
        throw new Error('Please select at least one pass request to approve.');
    }
    const approvedPasses = [];
    const errors = [];

    for (const reqId of requestIds) {
        try {
            // Safety Check: High Risk passes, Home Passes, and Emergency Exits cannot be batch-approved blindly
            const chkRes = await db.query(`
                SELECT pr.pass_type, rs.risk_level, rs.risk_score
                FROM pass_requests pr
                LEFT JOIN risk_scores rs ON rs.request_id = pr.id
                WHERE pr.id = $1
            `, [parseInt(reqId)]);
            const reqInfo = chkRes.rows[0];
            if (reqInfo && (reqInfo.risk_level === 'HIGH' || reqInfo.pass_type === 'HOME_PASS' || reqInfo.pass_type === 'EMERGENCY_EXIT')) {
                errors.push({ requestId: reqId, error: `Pass #${reqId} (${reqInfo.pass_type}, Risk: ${reqInfo.risk_score || 0}/100) is flagged HIGH RISK and requires individual Warden review with parent verification.` });
                continue;
            }

            const pass = await approvePassRequest({
                requestId: parseInt(reqId),
                reviewerUser,
                overrideNotes: overrideNotes || 'Verified & Approved by Warden'
            });
            approvedPasses.push(pass);
        } catch (err) {
            errors.push({ requestId: reqId, error: err.message });
        }
    }

    return {
        approvedCount: approvedPasses.length,
        failedCount: errors.length,
        approvedPasses,
        errors
    };
}

module.exports = {
    createPassRequest,
    approvePassRequest,
    rejectPassRequest,
    batchApprovePasses
};
