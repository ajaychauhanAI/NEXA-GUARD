/**
 * Institutional User Management & Role Creation Controller
 * 
 * Allows HOSTEL_ADMIN to invite and onboard Wardens, Security Guards, and Parents
 * with cryptographic activation tokens, email invitations, and multi-tenant isolation.
 */

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAudit } = require('../middleware/audit');
const emailService = require('../services/emailService');

/**
 * Invite / Create Warden
 * POST /api/users/warden
 */
async function createWarden(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { fullName, email, phone, staffId, assignedBlocks } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ success: false, message: 'Full Name and Email are required.' });
        }

        const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        const tempHash = await bcrypt.hash('Temp@' + Math.random().toString(36).substring(2, 8), 10);

        const userRes = await db.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, 'WARDEN', 'INVITED')
            RETURNING id, email, full_name, role, status, created_at;
        `, [hostelId, email.trim().toLowerCase(), tempHash, fullName.trim(), phone || '']);
        const newWarden = userRes.rows[0];

        // Link role
        await db.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = 'WARDEN'))
            ON CONFLICT DO NOTHING;
        `, [newWarden.id]);

        // Generate single-use activation token
        const token = await emailService.generateUserToken(newWarden.id, 'ACCOUNT_ACTIVATION', 48);

        // Fetch hostel details for invitation email
        const hRes = await db.query(`SELECT id, name FROM hostels WHERE id = $1`, [hostelId]);
        const hostel = hRes.rows[0] || { id: hostelId, name: 'Campus Hostel' };

        await emailService.sendWardenInvitation({ wardenUser: newWarden, hostel, activationToken: token });

        await logAudit({
            hostelId,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'WARDEN_INVITED',
            targetType: 'USER',
            targetId: String(newWarden.id),
            result: 'SUCCESS',
            context: { email: newWarden.email, assignedBlocks }
        });

        res.status(201).json({
            success: true,
            message: 'Warden invited successfully. Activation email dispatched.',
            user: newWarden,
            activationToken: token
        });
    } catch (err) {
        console.error('Error creating warden:', err);
        res.status(500).json({ success: false, message: 'Server error creating warden.' });
    }
}

/**
 * Invite / Create Security Guard
 * POST /api/users/guard
 */
async function createGuard(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { fullName, email, phone, staffId, assignedGateIds } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ success: false, message: 'Full Name and Email are required.' });
        }

        const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        const tempHash = await bcrypt.hash('Temp@' + Math.random().toString(36).substring(2, 8), 10);

        const userRes = await db.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, 'SECURITY_GUARD', 'INVITED')
            RETURNING id, email, full_name, role, status, created_at;
        `, [hostelId, email.trim().toLowerCase(), tempHash, fullName.trim(), phone || '']);
        const newGuard = userRes.rows[0];

        // Link role
        await db.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = 'SECURITY_GUARD'))
            ON CONFLICT DO NOTHING;
        `, [newGuard.id]);

        const token = await emailService.generateUserToken(newGuard.id, 'ACCOUNT_ACTIVATION', 48);

        const hRes = await db.query(`SELECT id, name FROM hostels WHERE id = $1`, [hostelId]);
        const hostel = hRes.rows[0] || { id: hostelId, name: 'Campus Hostel' };

        await emailService.sendGuardInvitation({ guardUser: newGuard, hostel, activationToken: token });

        await logAudit({
            hostelId,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'GUARD_INVITED',
            targetType: 'USER',
            targetId: String(newGuard.id),
            result: 'SUCCESS',
            context: { email: newGuard.email, assignedGateIds }
        });

        res.status(201).json({
            success: true,
            message: 'Security Guard invited successfully. Activation email dispatched.',
            user: newGuard,
            activationToken: token
        });
    } catch (err) {
        console.error('Error creating guard:', err);
        res.status(500).json({ success: false, message: 'Server error creating guard.' });
    }
}

/**
 * Invite / Create Parent Linked to Student
 * POST /api/users/parent
 */
async function createParent(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { fullName, email, phone, studentId, relationship = 'GUARDIAN' } = req.body;

        if (!fullName || !email || !studentId) {
            return res.status(400).json({ success: false, message: 'Full Name, Email, and linked Student ID are required.' });
        }

        // Multi-tenant isolation: Verify student belongs to this hostel
        const stuRes = await db.query(`
            SELECT s.id, s.roll_number, u.full_name, s.hostel_id
            FROM students s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = $1 AND s.hostel_id = $2
        `, [studentId, hostelId]);

        if (stuRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student record not found in your hostel.' });
        }
        const student = stuRes.rows[0];

        // Check if parent user already exists
        let parentUserId;
        const existingUser = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);

        if (existingUser.rows.length > 0) {
            parentUserId = existingUser.rows[0].id;
        } else {
            const tempHash = await bcrypt.hash('Temp@' + Math.random().toString(36).substring(2, 8), 10);
            const userRes = await db.query(`
                INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
                VALUES ($1, $2, $3, $4, $5, 'PARENT', 'INVITED')
                RETURNING id;
            `, [hostelId, email.trim().toLowerCase(), tempHash, fullName.trim(), phone || '']);
            parentUserId = userRes.rows[0].id;

            await db.query(`
                INSERT INTO user_roles (user_id, role_id)
                VALUES ($1, (SELECT id FROM roles WHERE name = 'PARENT'))
                ON CONFLICT DO NOTHING;
            `, [parentUserId]);
        }

        // Link parent to student in both parent_student and legacy parents table
        await db.query(`
            INSERT INTO parent_student (parent_user_id, student_id, relationship)
            VALUES ($1, $2, $3)
            ON CONFLICT (parent_user_id, student_id) DO NOTHING;
        `, [parentUserId, student.id, relationship]);

        await db.query(`
            INSERT INTO parents (user_id, student_id, relationship)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO NOTHING;
        `, [parentUserId, student.id, relationship]);

        const token = await emailService.generateUserToken(parentUserId, 'ACCOUNT_ACTIVATION', 72);

        const hRes = await db.query(`SELECT id, name FROM hostels WHERE id = $1`, [hostelId]);
        const hostel = hRes.rows[0] || { id: hostelId, name: 'Campus Hostel' };

        await emailService.sendParentInvitation({
            parentUser: { id: parentUserId, email: email.trim().toLowerCase(), full_name: fullName.trim() },
            student,
            hostel,
            activationToken: token
        });

        res.status(201).json({
            success: true,
            message: `Parent guardian successfully linked to student ${student.full_name}. Invitation sent.`,
            activationToken: token
        });
    } catch (err) {
        console.error('Error creating parent account:', err);
        res.status(500).json({ success: false, message: 'Server error creating parent account.' });
    }
}

/**
 * Resend Invitation Token & Email
 * POST /api/users/:id/resend-invitation
 */
async function resendInvitation(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const targetUserId = parseInt(req.params.id);

        const userRes = await db.query(`
            SELECT id, email, full_name, role, status, hostel_id
            FROM users
            WHERE id = $1 AND hostel_id = $2
        `, [targetUserId, hostelId]);

        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found in your hostel.' });
        }

        const user = userRes.rows[0];

        if (user.status === 'ACTIVE') {
            return res.status(400).json({ success: false, message: 'This user account is already active.' });
        }

        const tokenType = user.status === 'PENDING_VERIFICATION' ? 'EMAIL_VERIFICATION' : 'ACCOUNT_ACTIVATION';
        const token = await emailService.generateUserToken(user.id, tokenType, 48);

        const hRes = await db.query(`SELECT id, name FROM hostels WHERE id = $1`, [hostelId]);
        const hostel = hRes.rows[0] || { id: hostelId, name: 'Campus Hostel' };

        if (user.status === 'PENDING_VERIFICATION') {
            await emailService.sendEmailVerification({ user, hostelId, verificationToken: token });
        } else {
            await emailService.sendAccountActivation({ user, hostel, activationToken: token, roleName: user.role });
        }

        res.json({
            success: true,
            message: `Invitation email resent to ${user.email}.`,
            token
        });
    } catch (err) {
        console.error('Error resending invitation:', err);
        res.status(500).json({ success: false, message: 'Server error resending invitation.' });
    }
}

/**
 * List Institutional Users (Multi-Tenant Scoped)
 * GET /api/users
 */
async function getUsers(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { role, status, search } = req.query;

        let query = `
            SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.last_login, u.created_at,
                   s.roll_number, s.movement_status,
                   COUNT(DISTINCT ps.student_id) as linked_wards_count
            FROM users u
            LEFT JOIN students s ON s.user_id = u.id
            LEFT JOIN parent_student ps ON ps.parent_user_id = u.id
            WHERE u.hostel_id = $1
        `;
        const params = [hostelId];

        if (role) {
            params.push(role);
            query += ` AND u.role = $${params.length}`;
        }

        if (status) {
            params.push(status);
            query += ` AND u.status = $${params.length}`;
        }

        if (search) {
            params.push(`%${search.trim()}%`);
            query += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
        }

        query += ` GROUP BY u.id, s.id ORDER BY u.id ASC`;

        const result = await db.query(query, params);
        res.json({
            success: true,
            count: result.rows.length,
            users: result.rows
        });
    } catch (err) {
        console.error('Error retrieving users:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving users.' });
    }
}

module.exports = {
    createWarden,
    createGuard,
    createParent,
    resendInvitation,
    getUsers
};
