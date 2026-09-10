/**
 * Authentication & Session Management Controller
 * 
 * Supports JWT authentication, secure verification tokens, account activation,
 * password reset, session refresh, and immutable audit logging.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const emailService = require('../services/emailService');

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        const userQuery = `
            SELECT u.*, 
                   s.id as student_id, s.roll_number, s.movement_status, s.photo_url,
                   p.id as parent_id, COALESCE(p.student_id, ps.student_id) as ward_student_id
            FROM users u
            LEFT JOIN students s ON s.user_id = u.id
            LEFT JOIN parents p ON p.user_id = u.id
            LEFT JOIN parent_student ps ON ps.parent_user_id = u.id
            WHERE LOWER(u.email) = LOWER($1)
        `;
        const result = await db.query(userQuery, [email.trim()]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const user = result.rows[0];

        // Strict Account Status Check
        if (user.status === 'PENDING_VERIFICATION') {
            return res.status(403).json({
                success: false,
                status: 'PENDING_VERIFICATION',
                message: 'Account email verification is pending. Please click the verification link sent to your registered email.'
            });
        }

        if (user.status === 'INVITED') {
            return res.status(403).json({
                success: false,
                status: 'INVITED',
                message: 'Account has not been activated yet. Please click the activation link sent to your registered email to set your password.'
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                status: user.status,
                message: `Account is currently ${user.status.toLowerCase()}. Please contact your institutional administrator.`
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            await logAudit({
                hostelId: user.hostel_id,
                actorEmail: email,
                action: 'LOGIN_FAILED',
                result: 'FAILURE',
                ipAddress: req.ip,
                context: { reason: 'Incorrect password' }
            });

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        // Update last login timestamp
        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role, email: user.email, hostelId: user.hostel_id },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        const redirectMap = {
            'SUPER_ADMIN': '/admin.html',
            'HOSTEL_ADMIN': '/admin.html',
            'WARDEN': '/warden.html',
            'SECURITY_GUARD': '/guard.html',
            'STUDENT': '/student.html',
            'PARENT': '/parent.html'
        };

        await logAudit({
            hostelId: user.hostel_id,
            actorId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            action: 'LOGIN',
            result: 'SUCCESS',
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Authentication successful.',
            token,
            redirectUrl: redirectMap[user.role] || '/index.html',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                phone: user.phone,
                hostelId: user.hostel_id,
                status: user.status,
                studentId: user.student_id,
                rollNumber: user.roll_number,
                movementStatus: user.movement_status,
                photoUrl: user.photo_url,
                parentId: user.parent_id,
                wardStudentId: user.ward_student_id
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during authentication.' });
    }
}

async function register(req, res) {
    try {
        const { email, password, fullName, phone, role, hostelId, rollNumber, course, branch, year } = req.body;

        if (!email || !fullName || !role) {
            return res.status(400).json({ success: false, message: 'Email, Full Name, and Role are required.' });
        }

        const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        // For initial admin registration with password, default to ACTIVE (or PENDING_VERIFICATION if verification enforced)
        const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('Default@123', 10);
        const status = password ? 'ACTIVE' : 'INVITED';

        const userRes = await db.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, email, full_name, role, status;
        `, [hostelId || 1, email.trim().toLowerCase(), passwordHash, fullName, phone || '', role, status]);

        const newUser = userRes.rows[0];

        // Link role
        await db.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = $2))
            ON CONFLICT DO NOTHING;
        `, [newUser.id, role]);

        // If student, create student record
        if (role === 'STUDENT' && rollNumber) {
            const stuUid = `STU-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
            await db.query(`
                INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, emergency_contact)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING;
            `, [newUser.id, hostelId || 1, stuUid, rollNumber, course || 'B.Tech', branch || 'Computer Science', parseInt(year) || 1, phone || '']);
        }

        // Generate token and dispatch email
        const tokenType = status === 'ACTIVE' ? 'EMAIL_VERIFICATION' : 'ACCOUNT_ACTIVATION';
        const token = await emailService.generateUserToken(newUser.id, tokenType, 24);

        if (status === 'ACTIVE') {
            await emailService.sendEmailVerification({ user: newUser, hostelId: hostelId || 1, verificationToken: token });
        } else {
            await emailService.sendAccountActivation({ user: newUser, hostel: { id: hostelId || 1, name: 'Hostel' }, activationToken: token, roleName: role });
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Confirmation email dispatched.',
            user: newUser,
            verificationToken: token // Included for development/testing ease
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration: ' + err.message });
    }
}

/**
 * Verify Email using single-use token
 * POST /api/auth/verify-email
 */
async function verifyEmail(req, res) {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Verification token is required.' });
        }

        let verification = await emailService.verifyAndConsumeToken(token, 'EMAIL_VERIFICATION');
        if (!verification.valid) {
            verification = await emailService.verifyAndConsumeToken(token, 'ACCOUNT_ACTIVATION');
        }
        if (!verification.valid) {
            verification = await emailService.verifyAndConsumeToken(token, 'INVITATION');
        }
        if (!verification.valid) {
            return res.status(400).json({ success: false, message: verification.message });
        }

        // Activate user and set password if provided
        let userResult;
        if (req.body.newPassword) {
            const passHash = await bcrypt.hash(req.body.newPassword, 10);
            userResult = await db.query(`UPDATE users SET password_hash = $1, status = 'ACTIVE', updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, role`, [passHash, verification.userId]);
        } else {
            userResult = await db.query(`UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING id, email, full_name, role`, [verification.userId]);
        }

        await logAudit({
            actorId: verification.userId,
            action: 'EMAIL_VERIFIED',
            result: 'SUCCESS',
            ipAddress: req.ip
        });

        const verifiedUser = userResult.rows[0];
        res.json({
            success: true,
            email: verifiedUser?.email,
            user: verifiedUser,
            message: 'Email verified successfully! You may now sign in.'
        });
    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ success: false, message: 'Server error during email verification.' });
    }
}

/**
 * Activate Invited Account & Set Password
 * POST /api/auth/activate
 */
async function activateAccount(req, res) {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
        }

        // Check if token is valid for activation, invitation, or verification
        let verification = await emailService.verifyAndConsumeToken(token, 'ACCOUNT_ACTIVATION');
        if (!verification.valid) {
            verification = await emailService.verifyAndConsumeToken(token, 'INVITATION');
        }
        if (!verification.valid) {
            verification = await emailService.verifyAndConsumeToken(token, 'EMAIL_VERIFICATION');
        }

        if (!verification.valid) {
            return res.status(400).json({ success: false, message: verification.message });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const updateRes = await db.query(`
            UPDATE users 
            SET password_hash = $1, status = 'ACTIVE', updated_at = NOW() 
            WHERE id = $2
            RETURNING id, email, full_name, role
        `, [passwordHash, verification.userId]);

        await logAudit({
            actorId: verification.userId,
            action: 'ACCOUNT_ACTIVATED',
            result: 'SUCCESS',
            ipAddress: req.ip
        });

        const activatedUser = updateRes.rows[0];
        res.json({
            success: true,
            email: activatedUser?.email,
            user: activatedUser,
            message: 'Account successfully activated! Please sign in with your new password.'
        });
    } catch (err) {
        console.error('Account activation error:', err);
        res.status(500).json({ success: false, message: 'Server error activating account.' });
    }
}

/**
 * Session Token Refresh
 * POST /api/auth/refresh
 */
async function refreshToken(req, res) {
    try {
        const authHeader = req.headers['authorization'];
        const oldToken = authHeader && authHeader.split(' ')[1];

        if (!oldToken) {
            return res.status(400).json({ success: false, message: 'Current token required.' });
        }

        const decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true });
        const userRes = await db.query(`SELECT id, email, role, hostel_id, status FROM users WHERE id = $1`, [decoded.userId]);

        if (userRes.rows.length === 0 || userRes.rows[0].status !== 'ACTIVE') {
            return res.status(401).json({ success: false, message: 'User session is no longer active.' });
        }

        const user = userRes.rows[0];
        const newToken = jwt.sign(
            { userId: user.id, role: user.role, email: user.email, hostelId: user.hostel_id },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({ success: true, token: newToken });
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token refresh failed.' });
    }
}

/**
 * Forgot Password Request
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const userRes = await db.query(`SELECT id, email, hostel_id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
        if (userRes.rows.length > 0) {
            const user = userRes.rows[0];
            const token = await emailService.generateUserToken(user.id, 'PASSWORD_RESET', 2);
            await emailService.sendPasswordReset({ user, hostelId: user.hostel_id, resetToken: token });
        }

        // Generic response to avoid user enumeration
        res.json({
            success: true,
            message: 'If an account exists with this email, password reset instructions have been sent.'
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, message: 'Server error processing request.' });
    }
}

/**
 * Reset Password with token
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res) {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const verification = await emailService.verifyAndConsumeToken(token, 'PASSWORD_RESET');
        if (!verification.valid) {
            return res.status(400).json({ success: false, message: verification.message });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, verification.userId]);

        await logAudit({
            actorId: verification.userId,
            action: 'PASSWORD_RESET',
            result: 'SUCCESS',
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Password has been reset successfully. Please log in.'
        });
    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ success: false, message: 'Server error resetting password.' });
    }
}

async function getMe(req, res) {
    res.json({
        success: true,
        user: req.user
    });
}

async function logout(req, res) {
    if (req.user) {
        await logAudit({
            hostelId: req.user.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'LOGOUT',
            result: 'SUCCESS',
            ipAddress: req.ip
        });
    }
    res.json({ success: true, message: 'Session closed successfully.' });
}

module.exports = {
    login,
    register,
    verifyEmail,
    activateAccount,
    refreshToken,
    forgotPassword,
    resetPassword,
    getMe,
    logout
};
