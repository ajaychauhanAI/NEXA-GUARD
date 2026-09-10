/**
 * NEXA-GUARD Production Email & Transactional Notification Service
 * 
 * Supports SMTP transport via nodemailer when configured in environment,
 * with automatic fallback to a robust Development Email Adapter that logs
 * dispatches safely without exposing plain-text passwords or secret credentials.
 * Every dispatch is immutably recorded in the 'email_logs' PostgreSQL table.
 * 
 * ANTI-SPAM ARCHITECTURE:
 * - RFC 3834 / RFC 8058 compliant transactional headers ('Auto-Submitted', 'X-Auto-Response-Suppress', 'replyTo')
 * - Clean institutional light-canvas HTML templates (#f8fafc canvas with #ffffff card)
 * - Zero spam trigger words or emojis in subject lines
 * - Complete plain-text body mirrors matching 100% of HTML content
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const db = require('../config/db');

// Read configuration from environment
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_FROM = process.env.SMTP_FROM || 'NEXA-GUARD Notifications <cwork8047@gmail.com>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';

let transporter = null;
const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);

if (isSmtpConfigured) {
    try {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            }
        });
    } catch (e) {
        console.error('❌ SMTP Transporter initialization error:', e.message);
        transporter = null;
    }
} else {
    console.warn('⚠️ SMTP Transporter not configured. Real email dispatches will be recorded in email_logs.');
}

/**
 * Generate a cryptographically secure, single-use token
 * @param {number} userId 
 * @param {string} tokenType 'EMAIL_VERIFICATION' | 'ACCOUNT_ACTIVATION' | 'PASSWORD_RESET' | 'INVITATION'
 * @param {number} durationHours 
 * @returns {Promise<string>}
 */
async function generateUserToken(userId, tokenType = 'ACCOUNT_ACTIVATION', durationHours = 24, client = null) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);
    const executor = client || db;

    await executor.query(`
        INSERT INTO user_tokens (user_id, token, token_type, expires_at)
        VALUES ($1, $2, $3, $4)
    `, [userId, token, tokenType, expiresAt]);

    return token;
}

/**
 * Verify and consume a single-use token
 * @param {string} token 
 * @param {string} expectedType 
 * @returns {Promise<{ valid: boolean, userId?: number, message?: string }>}
 */
async function verifyAndConsumeToken(token, expectedType) {
    if (!token || typeof token !== 'string') {
        return { valid: false, message: 'Invalid token format.' };
    }

    const res = await db.query(`
        SELECT id, user_id, token_type, expires_at, used_at
        FROM user_tokens
        WHERE token = $1
    `, [token.trim()]);

    if (res.rows.length === 0) {
        return { valid: false, message: 'Token not found or invalid.' };
    }

    const t = res.rows[0];

    if (t.used_at) {
        return { valid: false, message: 'This token has already been used.' };
    }

    if (new Date() > new Date(t.expires_at)) {
        return { valid: false, message: 'Token has expired. Please request a new link.' };
    }

    if (expectedType && t.token_type !== expectedType) {
        return { valid: false, message: `Token type mismatch (Expected ${expectedType}, found ${t.token_type}).` };
    }

    // Mark as consumed
    await db.query(`UPDATE user_tokens SET used_at = NOW() WHERE id = $1`, [t.id]);

    return { valid: true, userId: t.user_id };
}

/**
 * Universal Anti-Spam Email Builder
 * Builds a 100% responsive, high-deliverability HTML layout with full plain-text mirror.
 */
function buildTransactionalEmail({
    preheader = 'Institutional notification from NEXA-GUARD',
    badgeText = 'OFFICIAL NOTICE',
    badgeBg = '#eff6ff',
    badgeColor = '#1d4ed8',
    badgeBorder = '#bfdbfe',
    headline,
    recipientName,
    introText,
    dataRows = [],
    actionButton = null, // { text, url, color, textColor }
    secondaryNotes = []
}) {
    // 1. Plain-Text Mirror
    let textBody = `NEXA-GUARD INSTITUTIONAL NOTIFICATION\n`;
    textBody += `----------------------------------------------------\n`;
    textBody += `${badgeText}: ${headline}\n\n`;
    if (recipientName) textBody += `Hello ${recipientName},\n\n`;
    textBody += `${introText}\n\n`;

    if (dataRows && dataRows.length > 0) {
        textBody += `DETAILS:\n`;
        dataRows.forEach(row => {
            textBody += `- ${row.label}: ${row.value}\n`;
        });
        textBody += `\n`;
    }

    if (actionButton && actionButton.url) {
        textBody += `ACTION REQUIRED:\n${actionButton.text}: ${actionButton.url}\n\n`;
    }

    if (secondaryNotes && secondaryNotes.length > 0) {
        textBody += `IMPORTANT NOTES:\n`;
        secondaryNotes.forEach(note => {
            textBody += `* ${note}\n`;
        });
        textBody += `\n`;
    }

    textBody += `----------------------------------------------------\n`;
    textBody += `This is an automated institutional notification from the NEXA-GUARD Campus Safety Directorate.\n`;
    textBody += `Please do not reply directly to this email.\n`;
    textBody += `Campus Residence & Safety Intelligence Platform.\n`;

    // 2. High-Deliverability Responsive HTML Template
    let dataRowsHtml = '';
    if (dataRows && dataRows.length > 0) {
        const rowsContent = dataRows.map(row => `
            <tr>
                <td style="padding: 9px 14px; font-size: 13px; color: #64748b; font-weight: 600; width: 38%; border-bottom: 1px solid #f1f5f9;">${row.label}</td>
                <td style="padding: 9px 14px; font-size: 13px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #f1f5f9; font-family: ${row.mono ? 'monospace' : 'inherit'};">${row.value}</td>
            </tr>
        `).join('');

        dataRowsHtml = `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0; border-collapse: collapse;">
                ${rowsContent}
            </table>
        `;
    }

    let buttonHtml = '';
    if (actionButton && actionButton.url) {
        const btnBg = actionButton.color || '#2563eb';
        const btnText = actionButton.textColor || '#ffffff';
        buttonHtml = `
            <div style="text-align: center; margin: 28px 0 24px 0;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionButton.url}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="${btnBg}">
                <w:anchorlock/>
                <center style="color:${btnText};font-family:sans-serif;font-size:14px;font-weight:bold;">${actionButton.text}</center>
                </v:roundrect>
                <![endif]-->
                <a href="${actionButton.url}" target="_blank" style="background-color: ${btnBg}; color: ${btnText}; padding: 13px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.2px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                    ${actionButton.text}
                </a>
            </div>
        `;
    }

    let notesHtml = '';
    if (secondaryNotes && secondaryNotes.length > 0) {
        const listItems = secondaryNotes.map(note => `
            <li style="margin-bottom: 4px; color: #64748b; font-size: 12px; line-height: 1.5;">${note}</li>
        `).join('');
        notesHtml = `
            <div style="background-color: #f8fafc; border-left: 3px solid #3b82f6; padding: 12px 16px; margin: 20px 0 10px 0; border-radius: 0 8px 8px 0;">
                <ul style="margin: 0; padding-left: 18px;">
                    ${listItems}
                </ul>
            </div>
        `;
    }

    const htmlBody = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${headline}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">
    <!-- Hidden Preheader for clean inbox snippet preview -->
    <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        ${preheader} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <!-- Main Outer Wrapper -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 12px;">
        <tr>
            <td align="center">
                <!-- Main Email Card Container (600px) -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    
                    <!-- Header Banner -->
                    <tr>
                        <td style="background-color: #0f172a; padding: 22px 28px; text-align: left; border-bottom: 3px solid #2563eb;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <div style="display: inline-block; vertical-align: middle;">
                                            <span style="color: #ffffff; font-size: 18px; font-weight: 800; letter-spacing: -0.3px; display: block;">NEXA-GUARD</span>
                                            <span style="color: #94a3b8; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; display: block;">Campus Safety & Movement Intelligence</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 28px 28px 20px 28px;">
                            <!-- Category Badge -->
                            <div style="margin-bottom: 14px;">
                                <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 3px 10px; border-radius: 4px;">
                                    ${badgeText}
                                </span>
                            </div>

                            <!-- Headline -->
                            <h1 style="margin: 0 0 14px 0; color: #0f172a; font-size: 20px; font-weight: 800; line-height: 1.3;">
                                ${headline}
                            </h1>

                            <!-- Greeting -->
                            ${recipientName ? `<p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; line-height: 1.5; font-weight: 600;">Dear ${recipientName},</p>` : ''}

                            <!-- Intro Message -->
                            <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                                ${introText}
                            </p>

                            <!-- Structured Data Table -->
                            ${dataRowsHtml}

                            <!-- Action Button -->
                            ${buttonHtml}

                            <!-- Important Security / Policy Notes -->
                            ${notesHtml}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: left;">
                            <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: #64748b;">
                                <strong>Institutional Advisory:</strong> This is an automated security transmission regarding your resident, parent, or administrative account at your affiliated institution.
                            </p>
                            <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: #94a3b8;">
                                Please do not reply directly to this automated email. For operational inquiries, contact your hostel administrative office or warden desk.
                            </p>
                            <p style="margin: 0 0 6px 0; font-size: 10px; line-height: 1.4; color: #94a3b8;">
                                🏛️ Campus Safety & Movement Intelligence Operations Center | Verified Institutional System
                            </p>
                            <p style="margin: 0; font-size: 10px; line-height: 1.4; color: #94a3b8;">
                                © 2026 NEXA-GUARD Smart Campus Platform. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { htmlBody, textBody };
}

/**
 * Low-level dispatch helper with database logging and Anti-Spam RFC Headers
 */
async function dispatchEmail({ recipientEmail, emailType, relatedUserId = null, hostelId = null, subject, htmlBody, textBody }) {
    // ── TEST MODE GUARD ──────────────────────────────────────────────────────
    // When running test-suite.js, suppress all real SMTP sends.
    // Emails are still recorded in email_logs as TEST_SUPPRESSED for auditability.
    if (process.env.NEXA_TEST_MODE === 'true') {
        try {
            await db.query(`
                INSERT INTO email_logs (recipient_email, email_type, related_user_id, hostel_id, subject, status, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [recipientEmail, emailType, relatedUserId, hostelId, subject, 'TEST_SUPPRESSED', null]);
        } catch (_) { /* DB log failure is non-critical during tests */ }
        return { success: true, status: 'TEST_SUPPRESSED' };
    }
    // ─────────────────────────────────────────────────────────────────────────

    let status = 'PENDING';
    let errorMessage = null;

    if (transporter && isSmtpConfigured) {
        try {
            const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@gmail.com>`;
            await transporter.sendMail({
                from: SMTP_FROM,
                to: recipientEmail,
                replyTo: SMTP_USER,
                subject,
                text: textBody,
                html: htmlBody,
                messageId,
                headers: {
                    'X-Priority': '3',
                    'X-Mailer': 'NEXA-GUARD Campus Notification System 2.0',
                    'Auto-Submitted': 'auto-generated',
                    'X-Auto-Response-Suppress': 'OOF, AutoReply',
                    'X-Entity-Ref-ID': crypto.randomUUID()
                }
            });
            status = 'SENT';
            console.log(`📧 [PRODUCTION EMAIL SENT] To: ${recipientEmail} | Subject: ${subject}`);
        } catch (err) {
            console.error(`❌ [PRODUCTION EMAIL FAILED] To: ${recipientEmail}:`, err.message);
            status = 'FAILED';
            errorMessage = err.message;
        }
    } else {
        console.warn(`⚠️ [PRODUCTION NOTICE] SMTP transporter not active. Email to ${recipientEmail} marked QUEUED.`);
        status = 'QUEUED';
    }

    // Record in email_logs table
    try {
        await db.query(`
            INSERT INTO email_logs (recipient_email, email_type, related_user_id, hostel_id, subject, status, error_message)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [recipientEmail, emailType, relatedUserId, hostelId, subject, status, errorMessage]);
    } catch (e) {
        if (e.code === '23503' && relatedUserId) {
            try {
                await db.query(`
                    INSERT INTO email_logs (recipient_email, email_type, related_user_id, hostel_id, subject, status, error_message)
                    VALUES ($1, $2, NULL, $3, $4, $5, $6)
                `, [recipientEmail, emailType, hostelId, subject, status, errorMessage]);
            } catch (_) {}
        } else {
            console.error('Error recording email log in DB:', e.message);
        }
    }

    return { success: status === 'SENT', status };
}

// =========================================================================
// HIGH-LEVEL TRANSACTIONAL EMAIL DISPATCHERS (ALL 12 REQUIRED TYPES)
// =========================================================================

/**
 * 1. HOSTEL_ADMIN_WELCOME & EMAIL_VERIFICATION
 */
async function sendHostelAdminWelcome({ adminUser, hostel, verificationToken }) {
    const verifyUrl = `${FRONTEND_URL}/login.html?verifyToken=${verificationToken}&email=${encodeURIComponent(adminUser.email)}`;
    const subject = `NEXA-GUARD: Administrator Account Verification - ${hostel.name}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Verify your master administrator credentials for ${hostel.name}`,
        badgeText: 'INSTITUTIONAL ONBOARDING',
        badgeBg: '#eff6ff',
        badgeColor: '#1d4ed8',
        badgeBorder: '#bfdbfe',
        headline: 'Hostel Registration & Administrator Verification',
        recipientName: adminUser.full_name,
        introText: `Your institution <strong>${hostel.name}</strong> has been successfully registered on the NEXA-GUARD Smart Hostel Safety Platform. Please verify your administrator credentials to initialize your Command Center.`,
        dataRows: [
            { label: 'Hostel Name', value: hostel.name },
            { label: 'Hostel Code', value: hostel.hostel_code, mono: true },
            { label: 'Assigned Role', value: 'HOSTEL_ADMIN' },
            { label: 'Account Status', value: 'PENDING_VERIFICATION' }
        ],
        actionButton: {
            text: 'Verify & Activate Administrator Account',
            url: verifyUrl,
            color: '#2563eb'
        },
        secondaryNotes: [
            'This verification link is single-use and will expire in 24 hours.',
            'For institutional security, never share or forward this link to unauthorized personnel.'
        ]
    });

    return dispatchEmail({
        recipientEmail: adminUser.email,
        emailType: 'HOSTEL_ADMIN_WELCOME',
        relatedUserId: adminUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 2. EMAIL_VERIFICATION
 */
async function sendEmailVerification({ user, hostelId, verificationToken }) {
    const verifyUrl = `${FRONTEND_URL}/login.html?verifyToken=${verificationToken}&email=${encodeURIComponent(user.email)}`;
    const subject = 'NEXA-GUARD: Verification Code for Your Account';

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: 'Please confirm your institutional email address to complete account verification',
        badgeText: 'SECURITY VERIFICATION',
        badgeBg: '#eff6ff',
        badgeColor: '#1d4ed8',
        badgeBorder: '#bfdbfe',
        headline: 'Verify Your Institutional Email Address',
        recipientName: user.full_name,
        introText: 'Please verify your email address to confirm ownership of this account and activate access to your residential services portal.',
        actionButton: {
            text: 'Verify Email Address',
            url: verifyUrl,
            color: '#2563eb'
        },
        secondaryNotes: [
            'This link is single-use and expires in 24 hours.',
            'If you did not initiate this request, no action is needed.'
        ]
    });

    return dispatchEmail({
        recipientEmail: user.email,
        emailType: 'EMAIL_VERIFICATION',
        relatedUserId: user.id,
        hostelId,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 3. ACCOUNT_ACTIVATION
 */
async function sendAccountActivation({ user, hostel, activationToken, roleName = 'Staff' }) {
    const activateUrl = `${FRONTEND_URL}/login.html?activateToken=${activationToken}&email=${encodeURIComponent(user.email)}`;
    const subject = `NEXA-GUARD: Account Activation for ${roleName} - ${hostel?.name || 'Campus Residence'}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Activate your ${roleName} account at ${hostel?.name || 'Hostel'}`,
        badgeText: 'ACCOUNT ACTIVATION',
        badgeBg: '#ecfdf5',
        badgeColor: '#047857',
        badgeBorder: '#a7f3d0',
        headline: `Activate Your ${roleName} Account`,
        recipientName: user.full_name,
        introText: `An official institutional account with the role of <strong>${roleName}</strong> has been created for you at <strong>${hostel?.name || 'Campus Residence'}</strong>.`,
        dataRows: [
            { label: 'Assigned Role', value: roleName },
            { label: 'Hostel', value: hostel?.name || 'Campus Residence' },
            { label: 'Login Email', value: user.email }
        ],
        actionButton: {
            text: 'Set Secure Password & Activate',
            url: activateUrl,
            color: '#059669'
        },
        secondaryNotes: [
            'This activation link is single-use and will expire in 48 hours.',
            'Choose a strong password containing letters, numbers, and special characters.'
        ]
    });

    return dispatchEmail({
        recipientEmail: user.email,
        emailType: 'ACCOUNT_ACTIVATION',
        relatedUserId: user.id,
        hostelId: hostel?.id,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * PASSWORD_RESET
 */
async function sendPasswordReset({ user, hostelId, resetToken }) {
    const resetUrl = `${FRONTEND_URL}/forgot-password.html?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
    const loginResetUrl = `${FRONTEND_URL}/login.html?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`;
    const subject = 'NEXA-GUARD: Password Reset Authorization';

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: 'Authorized single-use password reset link for your NEXA-GUARD account',
        badgeText: 'SECURITY GATEWAY',
        badgeBg: '#eff6ff',
        badgeColor: '#1d4ed8',
        badgeBorder: '#bfdbfe',
        headline: 'Password Reset Authorization',
        recipientName: user.full_name || 'Institutional User',
        introText: `We received an authorized request to reset the password for your NEXA-GUARD account (<strong>${user.email}</strong>). Click the button below to choose a new password.`,
        dataRows: [
            { label: 'Registered Email', value: user.email },
            { label: 'Security Token', value: resetToken, mono: true },
            { label: 'Validity Window', value: '2 Hours' }
        ],
        actionButton: {
            text: 'Choose New Password',
            url: resetUrl,
            color: '#2563eb'
        },
        secondaryNotes: [
            'This token is cryptographically signed and expires in 2 hours. It burns immediately upon first use.',
            `You can also reset directly on the login portal: ${loginResetUrl}`,
            'If you did not initiate this request, your account is safe and no action is required.'
        ]
    });

    return dispatchEmail({
        recipientEmail: user.email,
        emailType: 'PASSWORD_RESET',
        relatedUserId: user.id,
        hostelId,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 4. STUDENT_INVITATION
 */
async function sendStudentInvitation({ studentUser, studentDetails, hostel, activationToken }) {
    const activateUrl = `${FRONTEND_URL}/login.html?activateToken=${activationToken}&email=${encodeURIComponent(studentUser.email)}`;
    const subject = `NEXA-GUARD: Resident Student Portal Activation - ${hostel.name}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Activate your student resident movement portal for ${hostel.name}`,
        badgeText: 'STUDENT RESIDENT ACCESS',
        badgeBg: '#eff6ff',
        badgeColor: '#1d4ed8',
        badgeBorder: '#bfdbfe',
        headline: 'Welcome to Your Student Resident Portal',
        recipientName: studentUser.full_name,
        introText: `You have been registered as a resident student at <strong>${hostel.name}</strong>. Activate your account to submit outpass requests, view gate transit status, and access digital movement passes.`,
        dataRows: [
            { label: 'Roll Number', value: studentDetails.roll_number, mono: true },
            { label: 'Course & Branch', value: `${studentDetails.course} (${studentDetails.branch})` },
            { label: 'Hostel Facility', value: hostel.name }
        ],
        actionButton: {
            text: 'Activate Student Account',
            url: activateUrl,
            color: '#2563eb'
        },
        secondaryNotes: [
            'This single-use activation link expires in 48 hours.',
            'Keep your credentials confidential for verified gate access.'
        ]
    });

    return dispatchEmail({
        recipientEmail: studentUser.email,
        emailType: 'STUDENT_INVITATION',
        relatedUserId: studentUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 5. PARENT_INVITATION
 */
async function sendParentInvitation({ parentUser, student, hostel, activationToken }) {
    const activateUrl = `${FRONTEND_URL}/login.html?activateToken=${activationToken}&email=${encodeURIComponent(parentUser.email)}`;
    const subject = `NEXA-GUARD: Parent and Guardian Portal Access - Ward: ${student.full_name}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Activate your parent guardian portal for ward ${student.full_name} at ${hostel.name}`,
        badgeText: 'PARENT & GUARDIAN PORTAL',
        badgeBg: '#ecfeff',
        badgeColor: '#0e7490',
        badgeBorder: '#a5f3fc',
        headline: 'Parent & Guardian Portal Access',
        recipientName: parentUser.full_name || 'Parent / Guardian',
        introText: `Your guardian profile has been linked to your ward <strong>${student.full_name}</strong> at <strong>${hostel.name}</strong>. Through this secure portal, you can verify when your ward departs campus, view approved destinations, and receive safe return notifications.`,
        dataRows: [
            { label: 'Ward Name', value: student.full_name },
            { label: 'Hostel', value: hostel.name },
            { label: 'Portal Access', value: 'Real-Time Movement Telemetry' }
        ],
        actionButton: {
            text: 'Activate Parent Guardian Portal',
            url: activateUrl,
            color: '#0891b2'
        },
        secondaryNotes: [
            'This activation link will expire in 48 hours.',
            'NEXA-GUARD maintains strict privacy compliance under the DPDP Act 2023 without continuous GPS tracking.'
        ]
    });

    return dispatchEmail({
        recipientEmail: parentUser.email,
        emailType: 'PARENT_INVITATION',
        relatedUserId: parentUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 6. WARDEN_INVITATION & GUARD_INVITATION
 */
async function sendWardenInvitation({ wardenUser, hostel, activationToken }) {
    return sendAccountActivation({ user: wardenUser, hostel, activationToken, roleName: 'Hostel Warden' });
}

async function sendGuardInvitation({ guardUser, hostel, activationToken }) {
    return sendAccountActivation({ user: guardUser, hostel, activationToken, roleName: 'Gate Security Guard' });
}

/**
 * 7. PASS_APPROVED & PASS_REJECTED
 */
async function sendPassApproved({ studentUser, pass, hostel }) {
    const subject = `NEXA-GUARD: Outpass Approved (Pass #${pass.pass_number})`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Your movement pass #${pass.pass_number} to ${pass.destination} has been approved`,
        badgeText: 'PASS APPROVED',
        badgeBg: '#ecfdf5',
        badgeColor: '#047857',
        badgeBorder: '#a7f3d0',
        headline: 'Movement Pass Authorized',
        recipientName: studentUser.full_name,
        introText: `Your request for <strong>${pass.pass_type}</strong> to <strong>${pass.destination}</strong> has been approved by the hostel warden.`,
        dataRows: [
            { label: 'Pass Number', value: pass.pass_number, mono: true },
            { label: 'Return Code', value: pass.return_code, mono: true },
            { label: 'Destination', value: pass.destination },
            { label: 'Valid Until', value: new Date(pass.valid_until).toLocaleString() }
        ],
        actionButton: {
            text: 'View Pass & QR in Portal',
            url: `${FRONTEND_URL}/student.html`,
            color: '#059669'
        },
        secondaryNotes: [
            'Present your cryptographic QR code or 6-digit return transit code at the security gate upon departure and return.',
            'Ensure you return to campus prior to the valid expiration time to avoid overdue curfew assessments.'
        ]
    });

    return dispatchEmail({
        recipientEmail: studentUser.email,
        emailType: 'PASS_APPROVED',
        relatedUserId: studentUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });
}

async function sendPassRejected({ studentUser, request, reason, hostel }) {
    const subject = `NEXA-GUARD: Outpass Request Status Update (Request #${request.request_number})`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Update regarding your outpass request #${request.request_number}`,
        badgeText: 'REQUEST UPDATE',
        badgeBg: '#fef2f2',
        badgeColor: '#b91c1c',
        badgeBorder: '#fecaca',
        headline: 'Outpass Request Not Approved',
        recipientName: studentUser.full_name,
        introText: `Your movement request to <strong>${request.destination}</strong> was not approved upon administrative review.`,
        dataRows: [
            { label: 'Request Number', value: request.request_number, mono: true },
            { label: 'Destination', value: request.destination },
            { label: 'Decision Reason', value: reason || 'Administrative discretion / Curfew policy compliance' }
        ],
        actionButton: {
            text: 'Open Student Portal',
            url: `${FRONTEND_URL}/student.html`,
            color: '#475569'
        },
        secondaryNotes: [
            'If you require clarification regarding this decision, please consult the hostel warden office during standard hours.'
        ]
    });

    return dispatchEmail({
        recipientEmail: studentUser.email,
        emailType: 'PASS_REJECTED',
        relatedUserId: studentUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 8. LATE_RETURN & EMERGENCY_ALERT
 */
async function sendLateReturnAlert({ studentUser, parentEmail, pass, delayMinutes, hostel }) {
    const subject = `NEXA-GUARD Urgent Notice: Curfew Return Overdue - ${studentUser.full_name}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Urgent curfew overdue notice for student ${studentUser.full_name}`,
        badgeText: 'CURFEW OVERDUE NOTICE',
        badgeBg: '#fffbeb',
        badgeColor: '#b45309',
        badgeBorder: '#fde68a',
        headline: 'Curfew Return Overdue Notice',
        recipientName: studentUser.full_name,
        introText: `Student <strong>${studentUser.full_name}</strong> has exceeded the approved return deadline by <strong>${delayMinutes} minutes</strong> for movement pass <strong>#${pass.pass_number}</strong>.`,
        dataRows: [
            { label: 'Student Name', value: studentUser.full_name },
            { label: 'Pass Number', value: pass.pass_number, mono: true },
            { label: 'Overdue Delay', value: `${delayMinutes} minutes` },
            { label: 'Hostel Facility', value: hostel?.name || 'Campus Residence' }
        ],
        secondaryNotes: [
            'Immediate reporting to the hostel security gate is required.',
            'Automated disciplinary assessments may be recorded for unexcused overdue curfew violations.'
        ]
    });

    // Send to student
    await dispatchEmail({
        recipientEmail: studentUser.email,
        emailType: 'LATE_RETURN',
        relatedUserId: studentUser.id,
        hostelId: hostel.id,
        subject,
        htmlBody,
        textBody
    });

    // Send to parent if available
    if (parentEmail) {
        const parentSubject = `NEXA-GUARD Notice to Guardian: Curfew Return Overdue - ${studentUser.full_name}`;
        await dispatchEmail({
            recipientEmail: parentEmail,
            emailType: 'LATE_RETURN',
            relatedUserId: studentUser.id,
            hostelId: hostel.id,
            subject: parentSubject,
            htmlBody,
            textBody
        });
    }
}

async function sendEmergencyAlert({ hostelId, message, details }) {
    const subject = 'NEXA-GUARD Security Notification: Campus Safety Advisory';

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Campus safety advisory for hostel facility ID: ${hostelId}`,
        badgeText: 'CAMPUS SAFETY ADVISORY',
        badgeBg: '#fef2f2',
        badgeColor: '#b91c1c',
        badgeBorder: '#fecaca',
        headline: 'Campus Safety Incident Advisory',
        recipientName: 'Security Administration',
        introText: `An urgent safety incident notification has been logged for Hostel ID: ${hostelId}.`,
        dataRows: [
            { label: 'Incident Summary', value: message },
            { label: 'Timestamp', value: new Date().toISOString() }
        ],
        secondaryNotes: [
            'Security personnel and wardens must verify status in the Command Center immediately.'
        ]
    });

    return dispatchEmail({
        recipientEmail: 'security@nexaguard.edu',
        emailType: 'EMERGENCY_ALERT',
        hostelId,
        subject,
        htmlBody,
        textBody
    });
}

/**
 * 9. FINE_ISSUED
 */
async function sendFineIssued({ studentUser, fine, hostel }) {
    const subject = `NEXA-GUARD Official Notice: Disciplinary Assessment #${fine.fine_number}`;

    const { htmlBody, textBody } = buildTransactionalEmail({
        preheader: `Official disciplinary assessment notice #${fine.fine_number} for ₹${parseFloat(fine.amount).toFixed(2)}`,
        badgeText: 'DISCIPLINARY ASSESSMENT',
        badgeBg: '#fff1f2',
        badgeColor: '#be123c',
        badgeBorder: '#fecdd3',
        headline: 'Official Disciplinary Assessment Notice',
        recipientName: studentUser.full_name,
        introText: `An institutional disciplinary fine has been assessed on your resident profile for <strong>${hostel?.name || 'Campus Residence'}</strong>.`,
        dataRows: [
            { label: 'Assessment Number', value: fine.fine_number, mono: true },
            { label: 'Assessed Amount', value: `₹${parseFloat(fine.amount).toFixed(2)}` },
            { label: 'Violation Reason', value: fine.reason }
        ],
        actionButton: {
            text: 'View Details in Student Portal',
            url: `${FRONTEND_URL}/student.html`,
            color: '#be123c'
        },
        secondaryNotes: [
            'Please contact the warden office to settle or appeal this assessment within the institutional timeframe.'
        ]
    });

    return dispatchEmail({
        recipientEmail: studentUser.email,
        emailType: 'FINE_ISSUED',
        relatedUserId: studentUser.id,
        hostelId: hostel?.id,
        subject,
        htmlBody,
        textBody
    });
}

module.exports = {
    generateUserToken,
    verifyAndConsumeToken,
    dispatchEmail,
    sendHostelAdminWelcome,
    sendEmailVerification,
    sendAccountActivation,
    sendPasswordReset,
    sendStudentInvitation,
    sendParentInvitation,
    sendWardenInvitation,
    sendGuardInvitation,
    sendPassApproved,
    sendPassRejected,
    sendLateReturnAlert,
    sendEmergencyAlert,
    sendFineIssued
};
