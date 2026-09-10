/**
 * Hostel Registration & Structure Setup Controller
 */

const db = require('../config/db');
const { logAudit } = require('../middleware/audit');

async function getHostel(req, res) {
    try {
        const hostelId = req.params.id || req.user.hostel_id || 1;
        const hostelRes = await db.query(`SELECT * FROM hostels WHERE id = $1`, [hostelId]);

        if (hostelRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Hostel not found.' });
        }

        const hostel = hostelRes.rows[0];

        // Fetch Blocks, Floors, Rooms summary
        const blocksRes = await db.query(`
            SELECT b.*, COUNT(DISTINCT r.id) as total_rooms
            FROM blocks b
            LEFT JOIN floors f ON f.block_id = b.id
            LEFT JOIN rooms r ON r.floor_id = f.id
            WHERE b.hostel_id = $1
            GROUP BY b.id
            ORDER BY b.id ASC
        `, [hostelId]);

        // Fetch Gates
        const gatesRes = await db.query(`SELECT * FROM gates WHERE hostel_id = $1 ORDER BY id ASC`, [hostelId]);

        // Fetch Policies
        const policiesRes = await db.query(`SELECT * FROM policies WHERE hostel_id = $1 ORDER BY id ASC`, [hostelId]);

        // Fetch Total Students count
        const stuCount = await db.query(`SELECT COUNT(*) FROM students WHERE hostel_id = $1`, [hostelId]);

        res.json({
            success: true,
            hostel,
            totalStudents: parseInt(stuCount.rows[0].count),
            blocks: blocksRes.rows,
            gates: gatesRes.rows,
            policies: policiesRes.rows
        });
    } catch (err) {
        console.error('Error fetching hostel details:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving hostel details.' });
    }
}

const emailService = require('../services/emailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function registerHostel(req, res) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const {
            name, institutionName, hostelType, address, city, state,
            pincode, contactPhone, officialEmail, latitude, longitude,
            adminFullName, adminEmail, adminPassword, adminPhone
        } = req.body;

        if (!name || !institutionName) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Hostel name and institution name are required.' });
        }

        const countRes = await client.query(`SELECT COUNT(*) FROM hostels`);
        const nextId = parseInt(countRes.rows[0].count) + 1;
        const cityPrefix = city ? city.substring(0, 3).toUpperCase() : 'LKO';
        const hostelCode = `HST-${cityPrefix}-${String(nextId).padStart(3, '0')}`;

        const insertQuery = `
            INSERT INTO hostels (
                hostel_code, name, institution_name, hostel_type, address,
                city, state, pincode, contact_phone, official_email,
                latitude, longitude
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;
        const result = await client.query(insertQuery, [
            hostelCode, name, institutionName, hostelType || 'CO-ED', address || 'Campus Residential Complex',
            city || 'City Campus', state || 'State', pincode || '100001', contactPhone || '+91-0000000000',
            officialEmail || adminEmail || 'contact@hostel.edu',
            latitude || 26.8467, longitude || 80.9462
        ]);
        const newHostel = result.rows[0];

        // Create default institutional policies
        await client.query(`
            INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value) VALUES
            ($1, 'Allowed Outpass Windows & Academic Protection', 'OUTPASS_HOURS', '{"collegeHours": {"start": "09:00", "end": "16:30"}, "weekdayPassWindow": {"start": "16:30", "end": "18:30"}, "holidayMorningWindow": {"start": "07:00", "end": "11:00"}, "holidayEveningWindow": {"start": "16:00", "end": "19:00"}, "maxDurationHours": 6}'),
            ($1, 'Home Pass & Vacation Leave Policy', 'HOMEPASS_DURATION', '{"flexibleDuration": true, "requiresParentApproval": true}'),
            ($1, 'Hostel Gate Closing & Grace Timings', 'CURFEW_RULES', '{"boysGateClosing": "21:30", "girlsGateClosing": "20:30", "curfewTime": "21:30", "graceMinutes": 15, "finePerLateHour": 0}'),
            ($1, 'Geofence Verification Policy', 'GEOFENCE_RULES', '{"maxRadiusMeters": 150, "enforceAtRequest": true, "enforceAtGate": false}')
            ON CONFLICT DO NOTHING;
        `, [newHostel.id]);

        // If admin account details are provided, create the initial HOSTEL_ADMIN account
        let initialAdmin = null;
        let verificationToken = null;

        const effectiveAdminEmail = (adminEmail || officialEmail)?.trim().toLowerCase();
        const effectiveAdminName = adminFullName || `${name} Administrator`;

        if (effectiveAdminEmail) {
            const defaultPass = adminPassword || crypto.randomBytes(16).toString('hex');
            const passHash = await bcrypt.hash(defaultPass, 10);
            const adminStatus = adminPassword ? 'ACTIVE' : 'PENDING_VERIFICATION';

            const userRes = await client.query(`
                INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
                VALUES ($1, $2, $3, $4, $5, 'HOSTEL_ADMIN', $6)
                ON CONFLICT (email) DO UPDATE SET hostel_id = EXCLUDED.hostel_id, full_name = EXCLUDED.full_name
                RETURNING id, email, full_name, role, status;
            `, [newHostel.id, effectiveAdminEmail, passHash, effectiveAdminName, adminPhone || contactPhone || '', adminStatus]);
            initialAdmin = userRes.rows[0];

            await client.query(`
                INSERT INTO user_roles (user_id, role_id)
                VALUES ($1, (SELECT id FROM roles WHERE name = 'HOSTEL_ADMIN'))
                ON CONFLICT DO NOTHING;
            `, [initialAdmin.id]);

            // Generate cryptographic single-use verification token
            verificationToken = await emailService.generateUserToken(initialAdmin.id, 'EMAIL_VERIFICATION', 24, client);
        }

        await client.query('COMMIT');

        // Send institutional welcome and verification email after commit
        if (initialAdmin && verificationToken) {
            emailService.sendHostelAdminWelcome({
                adminUser: initialAdmin,
                hostel: newHostel,
                verificationToken
            }).catch(e => console.error('Error sending welcome email:', e.message));
        }

        await logAudit({
            hostelId: newHostel.id,
            actorId: initialAdmin?.id || req.user?.id,
            actorEmail: initialAdmin?.email || req.user?.email,
            actorRole: 'HOSTEL_ADMIN',
            action: 'HOSTEL_REGISTERED',
            targetType: 'HOSTEL',
            targetId: newHostel.id,
            result: 'SUCCESS',
            context: { hostelCode, name }
        });

        res.status(201).json({
            success: true,
            message: 'Hostel registered successfully. Administrator verification email dispatched.',
            hostel: newHostel,
            admin: initialAdmin,
            verificationToken
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Hostel registration error:', err);
        res.status(500).json({ success: false, message: 'Server error registering hostel: ' + err.message });
    } finally {
        client.release();
    }
}

async function updatePolicies(req, res) {
    try {
        const hostelId = req.user.hostel_id || 1;
        const { policies } = req.body; // Array of { code, value }

        if (!Array.isArray(policies)) {
            return res.status(400).json({ success: false, message: 'Invalid policies array.' });
        }

        for (const p of policies) {
            await db.query(`
                UPDATE policies
                SET policy_value = $1, updated_at = NOW()
                WHERE hostel_id = $2 AND policy_code = $3
            `, [JSON.stringify(p.value), hostelId, p.code]);
        }

        await logAudit({
            hostelId,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'POLICY_CHANGED',
            targetType: 'HOSTEL',
            targetId: hostelId,
            result: 'SUCCESS',
            context: { updatedCount: policies.length }
        });

        res.json({ success: true, message: 'Hostel policies updated successfully.' });
    } catch (err) {
        console.error('Update policies error:', err);
        res.status(500).json({ success: false, message: 'Server error updating policies.' });
    }
}

async function updateHostelSettings(req, res) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const hostelId = req.user?.hostel_id || 1;
        const {
            name, institutionName, hostelType, contactPhone, officialEmail,
            address, city, state, pincode, latitude, longitude, geofenceRadiusMeters,
            gateClosingTime, graceMinutes
        } = req.body;

        // 1. Update hostels table
        const updateHostelSql = `
            UPDATE hostels SET
                name = COALESCE($1, name),
                institution_name = COALESCE($2, institution_name),
                hostel_type = COALESCE($3, hostel_type),
                contact_phone = COALESCE($4, contact_phone),
                official_email = COALESCE($5, official_email),
                address = COALESCE($6, address),
                city = COALESCE($7, city),
                state = COALESCE($8, state),
                pincode = COALESCE($9, pincode),
                latitude = COALESCE($10, latitude),
                longitude = COALESCE($11, longitude),
                geofence_radius_meters = COALESCE($12, geofence_radius_meters),
                updated_at = NOW()
            WHERE id = $13
            RETURNING *;
        `;
        const hRes = await client.query(updateHostelSql, [
            name ? name.trim() : null,
            institutionName ? institutionName.trim() : null,
            hostelType || null,
            contactPhone ? contactPhone.trim() : null,
            officialEmail ? officialEmail.trim() : null,
            address ? address.trim() : null,
            city ? city.trim() : null,
            state ? state.trim() : null,
            pincode ? pincode.trim() : null,
            latitude !== undefined && latitude !== '' ? parseFloat(latitude) : null,
            longitude !== undefined && longitude !== '' ? parseFloat(longitude) : null,
            geofenceRadiusMeters !== undefined && geofenceRadiusMeters !== '' ? parseInt(geofenceRadiusMeters) : null,
            hostelId
        ]);

        if (hRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Hostel not found.' });
        }

        // 2. Update movement and gate rules if provided
        const effectiveClosing = gateClosingTime || '21:30';
        const effectiveBoysClosing = req.body.boysGateClosing || effectiveClosing || '21:30';
        const effectiveGirlsClosing = req.body.girlsGateClosing || '20:30';
        const effectiveGrace = graceMinutes !== undefined && graceMinutes !== '' ? parseInt(graceMinutes) : 15;

        await client.query(`
            INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value)
            VALUES ($1, 'Hostel Gate Closing & Grace Timings', 'CURFEW_RULES', $2)
            ON CONFLICT (hostel_id, policy_code) DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = NOW()
        `, [
            hostelId,
            JSON.stringify({
                boysGateClosing: effectiveBoysClosing,
                girlsGateClosing: effectiveGirlsClosing,
                curfewTime: effectiveClosing,
                graceMinutes: effectiveGrace,
                finePerLateHour: 0
            })
        ]);

        await client.query(`
            INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value)
            VALUES ($1, 'Allowed Outpass Windows & Academic Protection', 'OUTPASS_HOURS', $2)
            ON CONFLICT (hostel_id, policy_code) DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = NOW()
        `, [
            hostelId,
            JSON.stringify({
                collegeHours: { start: "09:00", end: "16:30" },
                weekdayPassWindow: { start: "16:30", end: "18:30" },
                holidayMorningWindow: { start: "07:00", end: "11:00" },
                holidayEveningWindow: { start: "16:00", end: "19:00" },
                maxDurationHours: 6
            })
        ]);

        await client.query(`
            INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value)
            VALUES ($1, 'Home Pass & Vacation Leave Policy', 'HOMEPASS_DURATION', $2)
            ON CONFLICT (hostel_id, policy_code) DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = NOW()
        `, [
            hostelId,
            JSON.stringify({ flexibleDuration: true, requiresParentApproval: true })
        ]);

        if (geofenceRadiusMeters !== undefined && geofenceRadiusMeters !== '') {
            await client.query(`
                INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value)
                VALUES ($1, 'Geofence Verification Policy', 'GEOFENCE_RULES', $2)
                ON CONFLICT (hostel_id, policy_code) DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = NOW()
            `, [
                hostelId,
                JSON.stringify({ maxRadiusMeters: parseInt(geofenceRadiusMeters), enforceAtRequest: true, enforceAtGate: false })
            ]);
        }

        await client.query('COMMIT');

        await logAudit({
            hostelId,
            actorId: req.user?.id || req.user?.userId || 1,
            actorEmail: req.user?.email || 'admin@nexa-guard.internal',
            actorRole: req.user?.role || 'HOSTEL_ADMIN',
            action: 'HOSTEL_SETTINGS_UPDATED',
            targetType: 'HOSTEL',
            targetId: hostelId,
            result: 'SUCCESS',
            context: { name: hRes.rows[0].name, hostelCode: hRes.rows[0].hostel_code }
        });

        res.json({
            success: true,
            message: 'Hostel profile and operating settings updated successfully.',
            hostel: hRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Update hostel settings error:', err);
        res.status(500).json({ success: false, message: 'Server error updating hostel settings: ' + err.message });
    } finally {
        client.release();
    }
}

async function setupWizard(req, res) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const {
            hostelName, institutionName, hostelType, address, city, state, pincode,
            contactPhone, officialEmail, latitude, longitude, geofenceRadiusMeters,
            adminFullName, adminEmail, adminPassword, adminPhone,
            blocks, gates, zones, students, curfewTime, graceMinutes
        } = req.body;

        if (!hostelName || !institutionName || !hostelType || !address || !city || !state || !pincode ||
            !contactPhone || !officialEmail || latitude === undefined || longitude === undefined || !geofenceRadiusMeters ||
            !adminFullName || !adminEmail || !adminPassword || !curfewTime || graceMinutes === undefined) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'All institutional details, coordinates, administrator credentials, and curfew policies are required.'
            });
        }

        if (!Array.isArray(blocks) || blocks.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'At least one residential block/wing must be configured.'
            });
        }

        if (!Array.isArray(gates) || gates.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'At least one campus access gate must be configured.'
            });
        }

        const effectiveZones = (Array.isArray(zones) && zones.length > 0) ? zones : [
            { name: 'Hostel Residential Perimeter', code: 'ZN-RES', riskLevel: 'LOW' },
            { name: 'Academic & Library Complex', code: 'ZN-ACAD', riskLevel: 'LOW' },
            { name: 'Commercial & Dining Market', code: 'ZN-COMM', riskLevel: 'MEDIUM' }
        ];

        // 1. Create Hostel
        const countRes = await client.query(`SELECT COUNT(*) FROM hostels`);
        const nextId = parseInt(countRes.rows[0].count) + 1;
        const cityPrefix = city ? city.substring(0, 3).toUpperCase() : 'HST';
        const hostelCode = `HST-${cityPrefix}-${String(nextId).padStart(3, '0')}`;

        const hostelInsert = `
            INSERT INTO hostels (
                hostel_code, name, institution_name, hostel_type, address,
                city, state, pincode, contact_phone, official_email,
                latitude, longitude, geofence_radius_meters
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;
        const hostelRes = await client.query(hostelInsert, [
            hostelCode, hostelName.trim(), institutionName.trim(), hostelType, address.trim(),
            city.trim(), state.trim(), pincode.trim(), contactPhone.trim(),
            officialEmail.trim(), parseFloat(latitude), parseFloat(longitude), parseInt(geofenceRadiusMeters)
        ]);
        const newHostel = hostelRes.rows[0];

        // 2. Create Blocks & Rooms
        for (const b of blocks) {
            const bRes = await client.query(`
                INSERT INTO blocks (hostel_id, block_name, block_code, description)
                VALUES ($1, $2, $3, $4)
                RETURNING id;
            `, [newHostel.id, b.name.trim(), b.code.trim(), b.description ? b.description.trim() : 'Residential Wing']);
            const bId = bRes.rows[0].id;

            const floorCount = parseInt(b.floors) || 1;
            // Create physical floors (rooms added manually by admin)
            for (let f = 1; f <= floorCount; f++) {
                await client.query(`
                    INSERT INTO floors (block_id, floor_number, floor_name)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING;
                `, [bId, f, `Floor ${f}`]);
            }
        }

        // 3. Create Access Gates
        for (const g of gates) {
            await client.query(`
                INSERT INTO gates (hostel_id, gate_name, gate_code, gate_type, status)
                VALUES ($1, $2, $3, $4, 'OPERATIONAL')
                ON CONFLICT DO NOTHING;
            `, [newHostel.id, g.name.trim(), g.code.trim(), g.type || 'MAIN']);
        }

        // 3b. Create Security Zones
        for (const z of effectiveZones) {
            await client.query(`
                INSERT INTO zones (hostel_id, zone_name, zone_code, risk_level)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING;
            `, [newHostel.id, z.name.trim(), z.code.trim(), z.riskLevel || 'LOW']);
        }

        // 4. Create Policies
        const effectiveCurfew = curfewTime;
        const effectiveGrace = parseInt(graceMinutes);
        const effectiveHomepassDays = parseInt(req.body.homepassDays) || 7;
        const effectiveFineRate = parseFloat(req.body.fineRate) || 0;
        const effectiveRadius = parseInt(geofenceRadiusMeters);

        const boysClosing = req.body.boysGateClosing || effectiveCurfew || '21:30';
        const girlsClosing = req.body.girlsGateClosing || '20:30';

        await client.query(`
            INSERT INTO policies (hostel_id, policy_name, policy_code, policy_value) VALUES
            ($1, 'Allowed Outpass Windows & Academic Protection', 'OUTPASS_HOURS', $2),
            ($1, 'Home Pass & Vacation Leave Policy', 'HOMEPASS_DURATION', $3),
            ($1, 'Hostel Gate Closing & Grace Timings', 'CURFEW_RULES', $4),
            ($1, 'Geofence Verification Policy', 'GEOFENCE_RULES', $5)
            ON CONFLICT DO NOTHING;
        `, [
            newHostel.id,
            JSON.stringify({ collegeHours: { start: "09:00", end: "16:30" }, weekdayPassWindow: { start: "16:30", end: "18:30" }, holidayMorningWindow: { start: "07:00", end: "11:00" }, holidayEveningWindow: { start: "16:00", end: "19:00" }, maxDurationHours: 6 }),
            JSON.stringify({ flexibleDuration: true, requiresParentApproval: true }),
            JSON.stringify({ boysGateClosing: boysClosing, girlsGateClosing: girlsClosing, curfewTime: effectiveCurfew, graceMinutes: effectiveGrace, finePerLateHour: effectiveFineRate }),
            JSON.stringify({ maxRadiusMeters: effectiveRadius, enforceAtRequest: true, enforceAtGate: false })
        ]);

        // 5. Create Chief Administrator Account
        const bcrypt = require('bcryptjs');
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');

        const passHash = await bcrypt.hash(adminPassword, 10);
        const adminRes = await client.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, 'HOSTEL_ADMIN', 'ACTIVE')
            ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, hostel_id = EXCLUDED.hostel_id
            RETURNING id, email, full_name, role;
        `, [newHostel.id, adminEmail.trim().toLowerCase(), passHash, adminFullName, adminPhone || '']);
        const newAdmin = adminRes.rows[0];

        // Ensure user_roles mapping
        await client.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = 'HOSTEL_ADMIN'))
            ON CONFLICT DO NOTHING;
        `, [newAdmin.id]);

        // Generate email verification token for institutional record
        const verificationToken = await emailService.generateUserToken(newAdmin.id, 'EMAIL_VERIFICATION', 24, client);

        // 6. Optional Students during setup
        if (Array.isArray(req.body.students) && req.body.students.length > 0) {
            const defaultStuHash = await bcrypt.hash('Student@123', 10);
            const currentYear = new Date().getFullYear();
            for (const s of req.body.students) {
                if (s.fullName && s.rollNumber && s.email) {
                    const sEmail = s.email.trim();
                    const uRes = await client.query(`
                        INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role)
                        VALUES ($1, $2, $3, $4, $5, 'STUDENT')
                        ON CONFLICT DO NOTHING RETURNING id;
                    `, [newHostel.id, sEmail.toLowerCase(), defaultStuHash, s.fullName, s.phone || '']);
                    if (uRes.rows.length > 0) {
                        const sUid = `STU-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;
                        await client.query(`
                            INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, emergency_contact)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            ON CONFLICT DO NOTHING;
                        `, [uRes.rows[0].id, newHostel.id, sUid, s.rollNumber, s.course || 'B.Tech', s.branch || 'CS', parseInt(s.year) || 1, s.phone || '']);
                    }
                }
            }
        }

        await client.query('COMMIT');

        emailService.sendHostelAdminWelcome({
            adminUser: newAdmin,
            hostel: newHostel,
            verificationToken
        }).catch(e => console.error('Error sending setup wizard welcome email:', e.message));

        await logAudit({
            hostelId: newHostel.id,
            actorId: newAdmin.id,
            actorEmail: newAdmin.email,
            actorRole: 'HOSTEL_ADMIN',
            action: 'HOSTEL_ONBOARDED_WIZARD',
            targetType: 'HOSTEL',
            targetId: newHostel.id,
            result: 'SUCCESS',
            context: { hostelCode: newHostel.hostel_code, adminEmail: newAdmin.email }
        });

        // Generate JWT token
        const token = jwt.sign(
            { userId: newAdmin.id, role: newAdmin.role, email: newAdmin.email, hostelId: newHostel.id },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Institutional hostel and administrator onboarded successfully. Verification email dispatched.',
            hostelId: newHostel.hostel_code,
            token,
            verificationToken,
            redirectUrl: '/admin.html',
            hostel: newHostel,
            user: newAdmin
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Hostel setup wizard error:', err);
        res.status(500).json({ success: false, message: 'Setup wizard failed: ' + err.message });
    } finally {
        client.release();
    }
}

async function getHostelProfile(req, res) {
    try {
        const hostelId = req.user?.hostel_id || req.params.id || 1;
        const hostelRes = await db.query(`SELECT * FROM hostels WHERE id = $1`, [hostelId]);

        if (hostelRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Hostel profile not found.' });
        }

        const hostel = hostelRes.rows[0];

        // Fetch counts
        const [bCount, rCount, gCount, sCount, overdueCount, anomalyCount] = await Promise.all([
            db.query(`SELECT COUNT(*) FROM blocks WHERE hostel_id = $1`, [hostelId]),
            db.query(`SELECT COUNT(*) FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN blocks b ON b.id=f.block_id WHERE b.hostel_id = $1`, [hostelId]),
            db.query(`SELECT COUNT(*) FROM gates WHERE hostel_id = $1`, [hostelId]),
            db.query(`SELECT COUNT(*) FROM students WHERE hostel_id = $1`, [hostelId]),
            db.query(`SELECT COUNT(*) FROM passes WHERE hostel_id = $1 AND status = 'OVERDUE'`, [hostelId]),
            db.query(`SELECT COUNT(*) FROM anomalies WHERE hostel_id = $1 AND is_resolved = FALSE`, [hostelId])
        ]);

        const totalStudents = parseInt(sCount.rows[0].count);
        const totalOverdue = parseInt(overdueCount.rows[0].count);
        const totalAnomalies = parseInt(anomalyCount.rows[0].count);

        // Compute Operational Intelligence Score (0 to 100)
        let operationalScore = 100;
        if (totalStudents > 0) {
            const overdueDeduction = Math.min(25, (totalOverdue / totalStudents) * 100 * 2);
            const anomalyDeduction = Math.min(25, totalAnomalies * 5);
            operationalScore = Math.max(0, Math.round(100 - overdueDeduction - anomalyDeduction));
        }

        res.json({
            success: true,
            hostel,
            metrics: {
                totalBlocks: parseInt(bCount.rows[0].count),
                totalRooms: parseInt(rCount.rows[0].count),
                totalGates: parseInt(gCount.rows[0].count),
                totalStudents,
                activeOverdue: totalOverdue,
                unresolvedAnomalies: totalAnomalies,
                operationalScore,
                scoreLabel: 'Operational Intelligence Score',
                status: hostel.geofence_radius_meters ? 'LOCATION_VERIFIED' : 'PENDING_LOCATION'
            }
        });

    } catch (err) {
        console.error('Error fetching hostel profile:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving hostel profile.' });
    }
}

async function getBlocks(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const bRes = await db.query(`
            SELECT b.*, 
                   COUNT(DISTINCT f.id) as floor_count, 
                   COUNT(DISTINCT r.id) as room_count
            FROM blocks b
            LEFT JOIN floors f ON f.block_id = b.id
            LEFT JOIN rooms r ON r.floor_id = f.id
            WHERE b.hostel_id = $1
            GROUP BY b.id
            ORDER BY b.id ASC;
        `, [hostelId]);
        res.json({ success: true, blocks: bRes.rows });
    } catch (err) {
        console.error('Error fetching blocks:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving blocks.' });
    }
}

async function addBlock(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { blockName, blockCode, description, floorsCount = 3 } = req.body;

        if (!blockName || !blockCode) {
            return res.status(400).json({ success: false, message: 'Block name and code are required.' });
        }

        const bRes = await db.query(`
            INSERT INTO blocks (hostel_id, block_name, block_code, description)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `, [hostelId, blockName.trim(), blockCode.trim().toUpperCase(), description || '']);
        const newBlock = bRes.rows[0];

        // Create floors without auto-generating dummy rooms
        for (let f = 1; f <= parseInt(floorsCount); f++) {
            await db.query(`
                INSERT INTO floors (block_id, floor_number, floor_name)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING;
            `, [newBlock.id, f, `Floor ${f}`]);
        }

        res.status(201).json({ success: true, message: 'Block added successfully.', block: newBlock });
    } catch (err) {
        console.error('Add block error:', err);
        res.status(500).json({ success: false, message: 'Server error adding block.' });
    }
}

async function addGate(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { gateName, gateCode, gateType = 'MAIN' } = req.body;

        if (!gateName || !gateCode) {
            return res.status(400).json({ success: false, message: 'Gate name and code are required.' });
        }

        const gRes = await db.query(`
            INSERT INTO gates (hostel_id, gate_name, gate_code, gate_type, status)
            VALUES ($1, $2, $3, $4, 'OPERATIONAL')
            RETURNING *;
        `, [hostelId, gateName.trim(), gateCode.trim().toUpperCase(), gateType]);

        res.status(201).json({ success: true, message: 'Gate added successfully.', gate: gRes.rows[0] });
    } catch (err) {
        console.error('Add gate error:', err);
        res.status(500).json({ success: false, message: 'Server error adding gate.' });
    }
}

async function addZone(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { zoneName, zoneCode, riskLevel = 'LOW' } = req.body;

        if (!zoneName || !zoneCode) {
            return res.status(400).json({ success: false, message: 'Zone name and code are required.' });
        }

        const zRes = await db.query(`
            INSERT INTO zones (hostel_id, zone_name, zone_code, risk_level)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `, [hostelId, zoneName.trim(), zoneCode.trim().toUpperCase(), riskLevel]);

        res.status(201).json({ success: true, message: 'Security zone added successfully.', zone: zRes.rows[0] });
    } catch (err) {
        console.error('Add zone error:', err);
        res.status(500).json({ success: false, message: 'Server error adding security zone.' });
    }
}

async function addStaff(req, res) {
    const bcrypt = require('bcryptjs');
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { fullName, email, password = 'Staff@123', phone, role } = req.body;

        if (!fullName || !email || !role) {
            return res.status(400).json({ success: false, message: 'Full name, email, and staff role are required.' });
        }

        if (!['WARDEN', 'SECURITY_GUARD'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Staff role must be either WARDEN or SECURITY_GUARD.' });
        }

        // Check if user already exists
        const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userRes = await db.query(`
            INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
            RETURNING id, full_name, email, phone, role, status, created_at;
        `, [hostelId, email.trim().toLowerCase(), passwordHash, fullName.trim(), phone || '', role]);
        const newStaff = userRes.rows[0];

        await db.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, (SELECT id FROM roles WHERE name = $2))
            ON CONFLICT DO NOTHING;
        `, [newStaff.id, role]);

        await logAudit({
            hostelId,
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: req.user.role,
            action: 'STAFF_MEMBER_CREATED',
            targetType: role,
            targetId: newStaff.id,
            result: 'SUCCESS',
            context: { email: newStaff.email, role }
        });

        res.status(201).json({
            success: true,
            message: `${role === 'WARDEN' ? 'Hostel Warden' : 'Security Guard'} registered successfully.`,
            staff: newStaff
        });
    } catch (err) {
        console.error('Error adding staff member:', err);
        res.status(500).json({ success: false, message: 'Server error adding staff member.' });
    }
}

async function getStaff(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const staffRes = await db.query(`
            SELECT id, full_name, email, phone, role, status, created_at, last_login
            FROM users
            WHERE hostel_id = $1 AND role IN ('WARDEN', 'SECURITY_GUARD', 'HOSTEL_ADMIN')
            ORDER BY role ASC, id ASC;
        `, [hostelId]);

        res.json({
            success: true,
            count: staffRes.rows.length,
            staff: staffRes.rows
        });
    } catch (err) {
        console.error('Error fetching staff list:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving staff.' });
    }
}

async function getParents(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const parentRes = await db.query(`
            SELECT p.id as parent_id, p.relationship,
                   u.id as user_id, u.full_name as parent_name, u.email as parent_email, u.phone as parent_phone,
                   s.id as student_id, s.roll_number, su.full_name as student_name,
                   rm.room_number, b.block_name
            FROM parents p
            JOIN users u ON u.id = p.user_id
            JOIN students s ON s.id = p.student_id
            JOIN users su ON su.id = s.user_id
            LEFT JOIN rooms rm ON rm.id = s.room_id
            LEFT JOIN floors f ON f.id = rm.floor_id
            LEFT JOIN blocks b ON b.id = f.block_id
            WHERE u.hostel_id = $1
            ORDER BY s.roll_number ASC;
        `, [hostelId]);

        res.json({
            success: true,
            count: parentRes.rows.length,
            parents: parentRes.rows
        });
    } catch (err) {
        console.error('Error fetching parents:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving parents.' });
    }
}

async function getRooms(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const roomsRes = await db.query(`
            SELECT r.id, r.room_number, r.capacity, r.current_occupancy,
                   f.floor_name, f.floor_number,
                   b.id as block_id, b.block_name, b.block_code
            FROM rooms r
            JOIN floors f ON f.id = r.floor_id
            JOIN blocks b ON b.id = f.block_id
            WHERE b.hostel_id = $1
            ORDER BY b.block_name ASC, f.floor_number ASC, r.room_number ASC;
        `, [hostelId]);

        res.json({
            success: true,
            count: roomsRes.rows.length,
            rooms: roomsRes.rows
        });
    } catch (err) {
        console.error('Error fetching rooms:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving rooms.' });
    }
}

async function getFloors(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const floorsRes = await db.query(`
            SELECT f.id, f.floor_number, f.floor_name,
                   b.id as block_id, b.block_name, b.block_code,
                   COUNT(r.id) as room_count
            FROM floors f
            JOIN blocks b ON b.id = f.block_id
            LEFT JOIN rooms r ON r.floor_id = f.id
            WHERE b.hostel_id = $1
            GROUP BY f.id, b.id
            ORDER BY b.block_name ASC, f.floor_number ASC;
        `, [hostelId]);

        res.json({
            success: true,
            count: floorsRes.rows.length,
            floors: floorsRes.rows
        });
    } catch (err) {
        console.error('Error fetching floors:', err);
        res.status(500).json({ success: false, message: 'Server error retrieving floors.' });
    }
}

async function addFloor(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { blockId, floorNumber, floorName } = req.body;

        if (!blockId || floorNumber === undefined || floorNumber === '') {
            return res.status(400).json({ success: false, message: 'Block ID and floor number are required.' });
        }

        const bRes = await db.query('SELECT id FROM blocks WHERE id = $1 AND hostel_id = $2', [blockId, hostelId]);
        if (bRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Residential block not found.' });
        }

        const fName = floorName ? floorName.trim() : `Floor ${floorNumber}`;
        const fRes = await db.query(`
            INSERT INTO floors (block_id, floor_number, floor_name)
            VALUES ($1, $2, $3)
            RETURNING *;
        `, [blockId, parseInt(floorNumber), fName]);

        res.status(201).json({ success: true, message: 'Floor added successfully.', floor: fRes.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: `Floor number ${req.body.floorNumber} already exists in this wing.` });
        }
        console.error('Error adding floor:', err);
        res.status(500).json({ success: false, message: 'Server error adding floor: ' + err.message });
    }
}

async function deleteFloor(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { id } = req.params;

        const fCheck = await db.query(`
            SELECT f.id, b.hostel_id, COUNT(r.id) as room_count
            FROM floors f
            JOIN blocks b ON b.id = f.block_id
            LEFT JOIN rooms r ON r.floor_id = f.id
            WHERE f.id = $1 AND b.hostel_id = $2
            GROUP BY f.id, b.hostel_id;
        `, [id, hostelId]);

        if (fCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Floor not found.' });
        }

        if (parseInt(fCheck.rows[0].room_count) > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete floor containing existing rooms. Please delete or reassign rooms first.' });
        }

        await db.query('DELETE FROM floors WHERE id = $1', [id]);
        res.json({ success: true, message: 'Floor deleted successfully.' });
    } catch (err) {
        console.error('Error deleting floor:', err);
        res.status(500).json({ success: false, message: 'Server error deleting floor.' });
    }
}

async function addRoom(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { floorId, roomNumber, capacity = 2 } = req.body;

        if (!floorId || !roomNumber) {
            return res.status(400).json({ success: false, message: 'Floor and room number are required.' });
        }

        const fCheck = await db.query(`
            SELECT f.id FROM floors f
            JOIN blocks b ON b.id = f.block_id
            WHERE f.id = $1 AND b.hostel_id = $2;
        `, [floorId, hostelId]);

        if (fCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Floor not found in this hostel.' });
        }

        const rCheck = await db.query('SELECT id FROM rooms WHERE floor_id = $1 AND LOWER(room_number) = LOWER($2)', [floorId, roomNumber.trim()]);
        if (rCheck.rows.length > 0) {
            return res.status(409).json({ success: false, message: `Room ${roomNumber} already exists on this floor.` });
        }

        const rRes = await db.query(`
            INSERT INTO rooms (floor_id, room_number, capacity, current_occupancy)
            VALUES ($1, $2, $3, 0)
            RETURNING *;
        `, [floorId, roomNumber.trim().toUpperCase(), parseInt(capacity) || 2]);

        res.status(201).json({ success: true, message: `Room ${roomNumber} added successfully.`, room: rRes.rows[0] });
    } catch (err) {
        console.error('Error adding room:', err);
        res.status(500).json({ success: false, message: 'Server error adding room.' });
    }
}

async function updateRoom(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { id } = req.params;
        const { roomNumber, capacity } = req.body;

        const rCheck = await db.query(`
            SELECT r.id, r.current_occupancy FROM rooms r
            JOIN floors f ON f.id = r.floor_id
            JOIN blocks b ON b.id = f.block_id
            WHERE r.id = $1 AND b.hostel_id = $2;
        `, [id, hostelId]);

        if (rCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found.' });
        }

        const room = rCheck.rows[0];
        if (capacity !== undefined && parseInt(capacity) < room.current_occupancy) {
            return res.status(400).json({ success: false, message: `Cannot set capacity below current occupancy (${room.current_occupancy} students assigned).` });
        }

        const rRes = await db.query(`
            UPDATE rooms SET
                room_number = COALESCE($1, room_number),
                capacity = COALESCE($2, capacity)
            WHERE id = $3
            RETURNING *;
        `, [roomNumber ? roomNumber.trim().toUpperCase() : null, capacity ? parseInt(capacity) : null, id]);

        res.json({ success: true, message: 'Room updated successfully.', room: rRes.rows[0] });
    } catch (err) {
        console.error('Error updating room:', err);
        res.status(500).json({ success: false, message: 'Server error updating room.' });
    }
}

async function deleteRoom(req, res) {
    try {
        const hostelId = req.user?.hostel_id || 1;
        const { id } = req.params;

        const rCheck = await db.query(`
            SELECT r.id, r.current_occupancy FROM rooms r
            JOIN floors f ON f.id = r.floor_id
            JOIN blocks b ON b.id = f.block_id
            WHERE r.id = $1 AND b.hostel_id = $2;
        `, [id, hostelId]);

        if (rCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found.' });
        }

        if (rCheck.rows[0].current_occupancy > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete room with active student residents. Reassign students first.' });
        }

        await db.query('DELETE FROM rooms WHERE id = $1', [id]);
        res.json({ success: true, message: 'Room deleted successfully.' });
    } catch (err) {
        console.error('Error deleting room:', err);
        res.status(500).json({ success: false, message: 'Server error deleting room.' });
    }
}

module.exports = {
    getHostel,
    registerHostel,
    updatePolicies,
    updateHostelSettings,
    setupWizard,
    getHostelProfile,
    getBlocks,
    addBlock,
    addGate,
    addZone,
    addStaff,
    getStaff,
    getParents,
    getRooms,
    getFloors,
    addFloor,
    deleteFloor,
    addRoom,
    updateRoom,
    deleteRoom
};
