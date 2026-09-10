/**
 * Student Directory & Profile Management Controller
 * Enforces Institutional Multi-Tenant Isolation & Account Activation Token Lifecycle
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAudit } = require('../middleware/audit');
const emailService = require('../services/emailService');

async function getStudents(req, res) {
    try {
        const userHostelId = req.user.hostel_id || 1;
        const { search, status, blockId, limit = 100 } = req.query;

        let query = `
            SELECT s.*, u.full_name, u.email, u.phone, u.status as account_status,
                   rm.room_number, f.floor_name, b.block_name, b.block_code,
                   p.pass_number as active_pass_number, p.pass_type as active_pass_type, p.valid_until as active_pass_until,
                   pu.full_name as guardian_name, pu.email as guardian_email, pu.phone as guardian_phone, pr.relationship as guardian_relationship
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN passes p ON p.student_id = s.id AND p.status IN ('APPROVED', 'ACTIVE')
            LEFT JOIN parents pr ON pr.student_id = s.id
            LEFT JOIN users pu ON pu.id = pr.user_id
            WHERE 1=1
        `;
        const params = [];

        // Role-based scoping & multi-tenant isolation
        if (req.user.role !== 'SUPER_ADMIN') {
            params.push(userHostelId);
            query += ` AND s.hostel_id = $${params.length}`;
        }

        if (req.user.role === 'STUDENT') {
            params.push(req.user.id);
            query += ` AND s.user_id = $${params.length}`;
        } else if (req.user.role === 'PARENT') {
            params.push(req.user.id);
            query += ` AND s.id IN (SELECT student_id FROM parents WHERE user_id = $${params.length})`;
        }

        if (status) {
            params.push(status);
            query += ` AND s.movement_status = $${params.length}`;
        }

        if (blockId) {
            params.push(blockId);
            query += ` AND b.id = $${params.length}`;
        }

        if (search) {
            params.push(`%${search.trim()}%`);
            query += ` AND (u.full_name ILIKE $${params.length} OR s.roll_number ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
        }

        query += ` ORDER BY s.id ASC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);
        res.json({
            success: true,
            count: result.rows.length,
            students: result.rows
        });
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving students.' });
    }
}

async function getStudentById(req, res) {
    try {
        const { id } = req.params;
        const studentRes = await db.query(`
            SELECT s.*, u.full_name, u.email, u.phone, u.status as account_status,
                   rm.room_number, f.floor_name, b.block_name,
                   pr.relationship, pu.full_name as guardian_name, pu.phone as guardian_phone, pu.email as guardian_email
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            LEFT JOIN parents pr ON pr.student_id = s.id
            LEFT JOIN users pu ON pu.id = pr.user_id
            WHERE s.id = $1
        `, [id]);

        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const student = studentRes.rows[0];

        // Multi-tenant & Role-based isolation check
        if (req.user.role !== 'SUPER_ADMIN' && student.hostel_id !== req.user.hostel_id) {
            return res.status(403).json({ success: false, message: 'Access denied: Cannot access student records from another hostel.' });
        }

        if (req.user.role === 'STUDENT' && student.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied: Students can only view their own profile.' });
        }

        if (req.user.role === 'PARENT') {
            const parentCheck = await db.query(
                `SELECT id FROM parents WHERE user_id = $1 AND student_id = $2`,
                [req.user.id, student.id]
            );
            if (parentCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'Access denied: Parents can only view their linked ward.' });
            }
        }

        // Fetch recent passes
        const passesRes = await db.query(`
            SELECT p.*, r.reason, r.destination, rs.risk_score, rs.risk_level
            FROM passes p
            JOIN pass_requests r ON r.id = p.request_id
            LEFT JOIN risk_scores rs ON rs.request_id = r.id
            WHERE p.student_id = $1
            ORDER BY p.id DESC LIMIT 10
        `, [id]);

        // Fetch fines
        const finesRes = await db.query(`
            SELECT * FROM fines WHERE student_id = $1 ORDER BY id DESC
        `, [id]);

        res.json({
            success: true,
            student,
            passes: passesRes.rows,
            fines: finesRes.rows
        });
    } catch (err) {
        console.error('Error fetching student profile:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving student profile.' });
    }
}

async function updateStudentStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['IN_HOSTEL', 'OUTSIDE', 'SUSPENDED', 'BLOCKED', 'INACTIVE'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid student movement status.' });
        }

        // Tenant check
        const targetStudent = await db.query('SELECT hostel_id FROM students WHERE id = $1', [id]);
        if (targetStudent.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }
        if (req.user.role !== 'SUPER_ADMIN' && targetStudent.rows[0].hostel_id !== req.user.hostel_id) {
            return res.status(403).json({ success: false, message: 'Access denied: Cross-tenant modification prohibited.' });
        }

        await db.query(`UPDATE students SET movement_status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);

        await logAudit({
            hostelId: req.user.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'STUDENT_STATUS_UPDATED',
            targetType: 'STUDENT',
            targetId: id,
            result: 'SUCCESS',
            context: { newStatus: status }
        });

        res.json({ success: true, message: `Student status updated to ${status}.` });
    } catch (err) {
        console.error('Error updating student status:', err);
        res.status(500).json({ success: false, message: 'Server error updating student status.' });
    }
}

async function createStudent(req, res) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const {
            fullName, email, password, phone,
            rollNumber, course = 'B.Tech', branch = 'Computer Science', year = 1,
            roomId, emergencyContact,
            guardianName, guardianPhone, guardianEmail, relationship = 'FATHER'
        } = req.body;

        const hostelId = req.user?.hostel_id || req.body.hostelId || 1;

        if (!fullName || !email || !rollNumber) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Full name, student email, and roll number are required.' });
        }

        if (!guardianEmail || !guardianEmail.includes('@')) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'A valid Guardian / Parent email address is required for parent portal access and movement notifications. (Zero random emails).' });
        }

        // Check if user exists
        const userExists = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        if (userExists.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'A user with this email address already exists.' });
        }

        // Check if roll number exists in this hostel
        const rollExists = await client.query('SELECT id FROM students WHERE hostel_id = $1 AND roll_number = $2', [hostelId, rollNumber.trim()]);
        if (rollExists.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'A student with this roll number already exists.' });
        }

        // Retrieve hostel details for email invitation
        const hostelRes = await client.query('SELECT id, name, hostel_code FROM hostels WHERE id = $1', [hostelId]);
        const hostel = hostelRes.rows[0] || { id: hostelId, name: 'Campus Residence', hostel_code: 'HST-001' };

        // 1. Create Student User Account
        // If password is explicitly provided in demo, use it; otherwise use secure random placeholder with INVITED status
        const isQuickActive = Boolean(password);
        const initialStatus = isQuickActive ? 'ACTIVE' : 'INVITED';
        const initialPassHash = await bcrypt.hash(password || crypto.randomBytes(16).toString('hex'), 10);

        const userRes = await client.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, 'STUDENT', $6)
            RETURNING id, email, full_name, role, status;
        `, [hostelId, email.trim().toLowerCase(), initialPassHash, fullName.trim(), phone || '', initialStatus]);
        const newUser = userRes.rows[0];

        await client.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = 'STUDENT'))
            ON CONFLICT DO NOTHING;
        `, [newUser.id]);

        // 2. Create Student Profile
        const currentYear = new Date().getFullYear();
        const randId = Math.floor(1000 + Math.random() * 9000);
        const stuUid = `STU-${currentYear}-${randId}`;

        const stuRes = await client.query(`
            INSERT INTO students (
                user_id, hostel_id, student_uid, roll_number, course, branch, year,
                room_id, emergency_contact, movement_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'IN_HOSTEL')
            RETURNING *;
        `, [
            newUser.id, hostelId, stuUid, rollNumber.trim(), course, branch, parseInt(year) || 1,
            roomId ? parseInt(roomId) : null, emergencyContact || phone || '+91-0000000000'
        ]);
        const newStudent = stuRes.rows[0];

        // 3. Update room occupancy if assigned
        if (roomId) {
            await client.query(`UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = $1`, [roomId]);
        }

        // 4. Generate Student Account Activation Token
        const studentActivationToken = await emailService.generateUserToken(newUser.id, 'ACCOUNT_ACTIVATION', 48, client);

        // 5. Create Parent Profile & Invitation if guardian details provided
        let parentActivationToken = null;
        let parentUserObj = null;
        if (guardianName && guardianEmail) {
            const parentEmail = guardianEmail.trim().toLowerCase();
            let parentUserId;

            const existingParent = await client.query('SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1)', [parentEmail]);
            if (existingParent.rows.length > 0) {
                parentUserId = existingParent.rows[0].id;
                parentUserObj = existingParent.rows[0];
            } else {
                const parentPassHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
                const parentUserRes = await client.query(`
                    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
                    VALUES ($1, $2, $3, $4, $5, 'PARENT', 'INVITED')
                    RETURNING id, email, full_name;
                `, [hostelId, parentEmail, parentPassHash, guardianName.trim(), guardianPhone || '']);
                parentUserId = parentUserRes.rows[0].id;
                parentUserObj = parentUserRes.rows[0];

                await client.query(`
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES ($1, (SELECT id FROM roles WHERE name = 'PARENT'))
                    ON CONFLICT DO NOTHING;
                `, [parentUserId]);

                parentActivationToken = await emailService.generateUserToken(parentUserId, 'ACCOUNT_ACTIVATION', 48, client);
            }

            // Link in parents table
            await client.query(`
                INSERT INTO parents (user_id, student_id, relationship)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING;
            `, [parentUserId, newStudent.id, relationship]);

            // Link in parent_student relation
            await client.query(`
                INSERT INTO parent_student (parent_user_id, student_id, relationship)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING;
            `, [parentUserId, newStudent.id, relationship]);
        }

        await client.query('COMMIT');

        // Dispatch Student & Parent Invitation Emails after commit
        emailService.sendStudentInvitation({
            studentUser: newUser,
            studentDetails: newStudent,
            hostel,
            activationToken: studentActivationToken
        }).catch(e => console.error('Student invitation email error:', e.message));

        if (parentUserObj && parentActivationToken) {
            emailService.sendParentInvitation({
                parentUser: parentUserObj,
                student: { ...newStudent, full_name: fullName },
                hostel,
                activationToken: parentActivationToken
            }).catch(e => console.error('Parent invitation email error:', e.message));
        }

        await logAudit({
            hostelId,
            actorId: req.user?.id || newUser.id,
            actorEmail: req.user?.email || email,
            actorRole: req.user?.role || 'STUDENT',
            action: 'STUDENT_ONBOARDED',
            targetType: 'STUDENT',
            targetId: newStudent.id,
            result: 'SUCCESS',
            context: { rollNumber, fullName, status: initialStatus }
        });

        res.status(201).json({
            success: true,
            message: 'Student onboarded successfully. Institutional invitation email dispatched.',
            student: { ...newStudent, full_name: fullName, email, status: initialStatus },
            activationToken: studentActivationToken,
            parentActivationToken
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating student:', err);
        res.status(500).json({ success: false, message: 'Server error creating student: ' + err.message });
    } finally {
        client.release();
    }
}

async function importStudents(req, res) {
    const client = await db.getClient();
    try {
        const hostelId = req.user?.hostel_id || 1;
        let studentsList = req.body.students;

        if (!studentsList && req.body.csv) {
            const lines = req.body.csv.trim().split('\n');
            if (lines.length > 1) {
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                studentsList = [];
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',').map(c => c.trim());
                    if (row.length >= 3) {
                        const sObj = {};
                        headers.forEach((h, idx) => { sObj[h] = row[idx]; });
                        studentsList.push(sObj);
                    }
                }
            }
        }

        if (!Array.isArray(studentsList) || studentsList.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No student records provided. Please supply an array of students or CSV text.'
            });
        }

        const hostelRes = await client.query('SELECT id, name, hostel_code FROM hostels WHERE id = $1', [hostelId]);
        const hostel = hostelRes.rows[0] || { id: hostelId, name: 'Campus Residence', hostel_code: 'HST-001' };

        let importedCount = 0;
        let failedCount = 0;
        const errors = [];
        const invitations = [];

        await client.query('BEGIN');
        const currentYear = new Date().getFullYear();

        for (let i = 0; i < studentsList.length; i++) {
            const s = studentsList[i];
            const fullName = s.fullName || s.full_name || s.name;
            const rollNumber = s.rollNumber || s.roll_number || s.roll;
            const email = s.email ? s.email.trim() : null;
            const phone = s.phone || '+91-0000000000';
            const course = s.course || 'B.Tech';
            const branch = s.branch || 'General';
            const year = parseInt(s.year) || 1;

            if (!fullName || !rollNumber || !email) {
                failedCount++;
                errors.push(`Row ${i + 1}: Missing student name, roll number, or official email address.`);
                continue;
            }

            try {
                // Check existing
                const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
                if (existing.rows.length > 0) {
                    failedCount++;
                    errors.push(`Row ${i + 1} (${rollNumber}): User email already exists.`);
                    continue;
                }

                // Insert User with INVITED status
                const randomPass = crypto.randomBytes(16).toString('hex');
                const passHash = await bcrypt.hash(randomPass, 10);
                const userRes = await client.query(`
                    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
                    VALUES ($1, $2, $3, $4, $5, 'STUDENT', 'INVITED')
                    RETURNING id;
                `, [hostelId, email.trim().toLowerCase(), passHash, fullName.trim(), phone]);
                const userId = userRes.rows[0].id;

                await client.query(`
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES ($1, (SELECT id FROM roles WHERE name = 'STUDENT'))
                    ON CONFLICT DO NOTHING;
                `, [userId]);

                // Insert Student profile
                const stuUid = `STU-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;
                const stuRes = await client.query(`
                    INSERT INTO students (
                        user_id, hostel_id, student_uid, roll_number, course, branch, year,
                        emergency_contact, movement_status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'IN_HOSTEL')
                    RETURNING *;
                `, [userId, hostelId, stuUid, rollNumber.trim(), course, branch, year, phone]);

                // Generate single-use activation token
                const token = await emailService.generateUserToken(userId, 'ACCOUNT_ACTIVATION', 48, client);
                invitations.push({
                    studentUser: { id: userId, email: email.trim().toLowerCase(), full_name: fullName.trim() },
                    studentDetails: stuRes.rows[0],
                    hostel,
                    activationToken: token
                });

                importedCount++;
            } catch (rowErr) {
                failedCount++;
                errors.push(`Row ${i + 1} (${rollNumber}): ${rowErr.message}`);
            }
        }

        await client.query('COMMIT');

        // Dispatch invitation emails asynchronously
        for (const inv of invitations) {
            emailService.sendStudentInvitation(inv).catch(e => console.error('Bulk invitation email error:', e.message));
        }

        await logAudit({
            hostelId,
            actorId: req.user?.id,
            actorEmail: req.user?.email,
            actorRole: req.user?.role,
            action: 'STUDENTS_BULK_IMPORTED',
            targetType: 'STUDENT',
            result: 'SUCCESS',
            context: { importedCount, failedCount }
        });

        res.json({
            success: true,
            message: `Successfully imported ${importedCount} students. Activation invitations dispatched. ${failedCount} skipped or failed.`,
            importedCount,
            failedCount,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in bulk import:', err);
        res.status(500).json({ success: false, message: 'Bulk student import failed: ' + err.message });
    } finally {
        client.release();
    }
}

async function allocateStudentRoom(req, res) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { roomId } = req.body;

        const stuRes = await client.query('SELECT s.*, u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = $1', [id]);
        if (stuRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }
        const student = stuRes.rows[0];

        if (req.user.role !== 'SUPER_ADMIN' && student.hostel_id !== req.user.hostel_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Access denied: Cross-tenant modification prohibited.' });
        }

        const oldRoomId = student.room_id;
        const newRoomId = roomId ? parseInt(roomId) : null;

        if (oldRoomId === newRoomId) {
            await client.query('ROLLBACK');
            return res.json({ success: true, message: 'Student is already assigned to this room.', roomId: newRoomId });
        }

        let newRoom = null;
        if (newRoomId) {
            const roomRes = await client.query(`
                SELECT r.*, f.floor_name, b.block_name 
                FROM rooms r
                JOIN floors f ON f.id = r.floor_id
                JOIN blocks b ON b.id = f.block_id
                WHERE r.id = $1 AND b.hostel_id = $2
            `, [newRoomId, student.hostel_id]);

            if (roomRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Selected room not found in this hostel.' });
            }
            newRoom = roomRes.rows[0];

            if (newRoom.current_occupancy >= newRoom.capacity) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: `Room ${newRoom.room_number} is already at full capacity (${newRoom.capacity}/${newRoom.capacity}).` });
            }
        }

        if (oldRoomId) {
            await client.query('UPDATE rooms SET current_occupancy = GREATEST(0, current_occupancy - 1) WHERE id = $1', [oldRoomId]);
        }

        if (newRoomId) {
            await client.query('UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = $1', [newRoomId]);
        }

        await client.query('UPDATE students SET room_id = $1, updated_at = NOW() WHERE id = $2', [newRoomId, id]);

        await client.query('COMMIT');

        await logAudit({
            hostelId: student.hostel_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'STUDENT_ROOM_ALLOCATED',
            targetType: 'STUDENT',
            targetId: id,
            result: 'SUCCESS',
            context: {
                studentName: student.full_name,
                oldRoomId,
                newRoomId,
                newRoomNumber: newRoom ? newRoom.room_number : null
            }
        });

        res.json({
            success: true,
            message: newRoomId ? `Student successfully assigned to Room ${newRoom.room_number} (${newRoom.block_name}).` : 'Room unassigned from student.',
            roomId: newRoomId,
            roomNumber: newRoom ? newRoom.room_number : null,
            blockName: newRoom ? newRoom.block_name : null,
            floorName: newRoom ? newRoom.floor_name : null
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error allocating student room:', err);
        res.status(500).json({ success: false, message: 'Server error allocating room: ' + err.message });
    } finally {
        client.release();
    }
}

module.exports = {
    getStudents,
    getStudentById,
    updateStudentStatus,
    allocateStudentRoom,
    createStudent,
    importStudents
};

