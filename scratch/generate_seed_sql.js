const fs = require('fs');
const path = require('path');
const db = require('../backend/src/config/db');

// Exact verified bcrypt hashes
const STUDENT_PASSWORD_HASH = '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS'; // Student@123
const PARENT_PASSWORD_HASH  = '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula'; // Parent@123

const studentsData = [
    {
        name: 'Aarav Sharma',
        email: 'aarav.sharma@bbdu.ac.in',
        phone: '9812345001',
        roll: 'BBDU-2026-CS01',
        uid: 'STU-2026-001',
        course: 'B.Tech',
        branch: 'Computer Science & Engineering',
        year: 3,
        roomNumber: 'R-101',
        floorId: 13,
        status: 'IN_HOSTEL',
        parentName: 'Ramesh Sharma',
        parentEmail: 'ramesh.sharma.parent@gmail.com',
        parentPhone: '9912345001',
        relationship: 'FATHER',
        address: 'B-14 Sector 62, Noida, UP'
    },
    {
        name: 'Rohan Verma',
        email: 'rohan.verma@bbdu.ac.in',
        phone: '9812345002',
        roll: 'BBDU-2026-EC02',
        uid: 'STU-2026-002',
        course: 'B.Tech',
        branch: 'Electronics & Communication',
        year: 2,
        roomNumber: 'R-101',
        floorId: 13,
        status: 'IN_HOSTEL',
        parentName: 'Suresh Verma',
        parentEmail: 'suresh.verma.parent@gmail.com',
        parentPhone: '9912345002',
        relationship: 'FATHER',
        address: '12/4 Aliganj, Lucknow, UP'
    },
    {
        name: 'Aditya Tiwari',
        email: 'aditya.tiwari@bbdu.ac.in',
        phone: '9812345003',
        roll: 'BBDU-2026-IT03',
        uid: 'STU-2026-003',
        course: 'B.Tech',
        branch: 'Information Technology',
        year: 3,
        roomNumber: 'R-102',
        floorId: 13,
        status: 'OUTSIDE', // Out on casual pass
        parentName: 'Rajesh Tiwari',
        parentEmail: 'rajesh.tiwari.parent@gmail.com',
        parentPhone: '9912345003',
        relationship: 'FATHER',
        address: 'Plot 45, Civil Lines, Prayagraj, UP'
    },
    {
        name: 'Yash Patel',
        email: 'yash.patel@bbdu.ac.in',
        phone: '9812345004',
        roll: 'BBDU-2026-ME04',
        uid: 'STU-2026-004',
        course: 'B.Tech',
        branch: 'Mechanical Engineering',
        year: 4,
        roomNumber: 'R-102',
        floorId: 13,
        status: 'OUTSIDE', // Out on casual pass
        parentName: 'Manoj Patel',
        parentEmail: 'manoj.patel.parent@gmail.com',
        parentPhone: '9912345004',
        relationship: 'FATHER',
        address: '77 Anand Vihar, Kanpur, UP'
    },
    {
        name: 'Shaurya Singh',
        email: 'shaurya.singh@bbdu.ac.in',
        phone: '9812345005',
        roll: 'BBDU-2026-BC05',
        uid: 'STU-2026-005',
        course: 'BCA',
        branch: 'Computer Applications',
        year: 2,
        roomNumber: 'R-103',
        floorId: 13,
        status: 'OUTSIDE', // Out on casual pass
        parentName: 'Vijay Singh',
        parentEmail: 'vijay.singh.parent@gmail.com',
        parentPhone: '9912345005',
        relationship: 'FATHER',
        address: 'D-89 Shastri Nagar, Meerut, UP'
    },
    {
        name: 'Kartik Pandey',
        email: 'kartik.pandey@bbdu.ac.in',
        phone: '9812345006',
        roll: 'BBDU-2026-CE06',
        uid: 'STU-2026-006',
        course: 'B.Tech',
        branch: 'Civil Engineering',
        year: 3,
        roomNumber: 'R-103',
        floorId: 13,
        status: 'IN_HOSTEL',
        hasPendingLowRiskPass: true,
        parentName: 'Alok Pandey',
        parentEmail: 'alok.pandey.parent@gmail.com',
        parentPhone: '9912345006',
        relationship: 'FATHER',
        address: '5/102 Indira Nagar, Lucknow, UP'
    },
    {
        name: 'Ayush Gupta',
        email: 'ayush.gupta@bbdu.ac.in',
        phone: '9812345007',
        roll: 'BBDU-2026-CS07',
        uid: 'STU-2026-007',
        course: 'B.Tech',
        branch: 'Computer Science & Engineering',
        year: 2,
        roomNumber: 'R-201',
        floorId: 14,
        status: 'IN_HOSTEL',
        hasPendingHighRiskPass: true,
        parentName: 'Sunil Gupta',
        parentEmail: 'sunil.gupta.parent@gmail.com',
        parentPhone: '9912345007',
        relationship: 'FATHER',
        address: '88 Rajendra Nagar, Bareilly, UP'
    },
    {
        name: 'Devendra Mishra',
        email: 'devendra.mishra@bbdu.ac.in',
        phone: '9812345008',
        roll: 'BBDU-2026-EE08',
        uid: 'STU-2026-008',
        course: 'B.Tech',
        branch: 'Electrical Engineering',
        year: 4,
        roomNumber: 'R-201',
        floorId: 14,
        status: 'OUTSIDE', // On multi-day Home Pass
        isHomePass: true,
        parentName: 'Harish Mishra',
        parentEmail: 'harish.mishra.parent@gmail.com',
        parentPhone: '9912345008',
        relationship: 'FATHER',
        address: 'K-22 Sigra, Varanasi, UP'
    },
    {
        name: 'Varun Dubey',
        email: 'varun.dubey@bbdu.ac.in',
        phone: '9812345009',
        roll: 'BBDU-2026-MC09',
        uid: 'STU-2026-009',
        course: 'MCA',
        branch: 'Computer Applications',
        year: 1,
        roomNumber: 'R-202',
        floorId: 14,
        status: 'OUTSIDE', // On multi-day Home Pass
        isHomePass: true,
        parentName: 'Santosh Dubey',
        parentEmail: 'santosh.dubey.parent@gmail.com',
        parentPhone: '9912345009',
        relationship: 'FATHER',
        address: '14 Mohaddipur, Gorakhpur, UP'
    },
    {
        name: 'Nikhil Srivastava',
        email: 'nikhil.srivastava@bbdu.ac.in',
        phone: '9812345010',
        roll: 'BBDU-2026-AI10',
        uid: 'STU-2026-010',
        course: 'B.Tech',
        branch: 'Artificial Intelligence & ML',
        year: 3,
        roomNumber: 'R-202',
        floorId: 14,
        status: 'IN_HOSTEL',
        parentName: 'Dinesh Srivastava',
        parentEmail: 'dinesh.srivastava.parent@gmail.com',
        parentPhone: '9912345010',
        relationship: 'FATHER',
        address: 'Flat 302, Gomti Heights, Lucknow, UP'
    },
    {
        name: 'Aman Tripathi',
        email: 'aman.tripathi@bbdu.ac.in',
        phone: '9812345011',
        roll: 'BBDU-2026-CS11',
        uid: 'STU-2026-011',
        course: 'B.Tech',
        branch: 'Computer Science & Engineering',
        year: 1,
        roomNumber: 'R-203',
        floorId: 14,
        status: 'IN_HOSTEL',
        parentName: 'Mahesh Tripathi',
        parentEmail: 'mahesh.tripathi.parent@gmail.com',
        parentPhone: '9912345011',
        relationship: 'FATHER',
        address: '44 Cantt Road, Jhansi, UP'
    },
    {
        name: 'Harsh Choudhary',
        email: 'harsh.choudhary@bbdu.ac.in',
        phone: '9812345012',
        roll: 'BBDU-2026-DS12',
        uid: 'STU-2026-012',
        course: 'B.Tech',
        branch: 'Data Science',
        year: 2,
        roomNumber: 'R-203',
        floorId: 14,
        status: 'IN_HOSTEL',
        parentName: 'Anand Choudhary',
        parentEmail: 'anand.choudhary.parent@gmail.com',
        parentPhone: '9912345012',
        relationship: 'FATHER',
        address: 'House 19, Sanjay Place, Agra, UP'
    },
    {
        name: 'Prateek Shukla',
        email: 'prateek.shukla@bbdu.ac.in',
        phone: '9812345013',
        roll: 'BBDU-2026-BA13',
        uid: 'STU-2026-013',
        course: 'BBA',
        branch: 'Business Administration',
        year: 3,
        roomNumber: 'R-301',
        floorId: 15,
        status: 'IN_HOSTEL',
        parentName: 'Vinod Shukla',
        parentEmail: 'vinod.shukla.parent@gmail.com',
        parentPhone: '9912345013',
        relationship: 'FATHER',
        address: '22 George Town, Prayagraj, UP'
    },
    {
        name: 'Utkarsh Yadav',
        email: 'utkarsh.yadav@bbdu.ac.in',
        phone: '9812345014',
        roll: 'BBDU-2026-CS14',
        uid: 'STU-2026-014',
        course: 'B.Tech',
        branch: 'Computer Science & Engineering',
        year: 4,
        roomNumber: 'R-301',
        floorId: 15,
        status: 'IN_HOSTEL',
        parentName: 'Ravindra Yadav',
        parentEmail: 'ravindra.yadav.parent@gmail.com',
        parentPhone: '9912345014',
        relationship: 'FATHER',
        address: 'Sector C, Mahanagar, Lucknow, UP'
    },
    {
        name: 'Shivam Awasthi',
        email: 'shivam.awasthi@bbdu.ac.in',
        phone: '9812345015',
        roll: 'BBDU-2026-EC15',
        uid: 'STU-2026-015',
        course: 'B.Tech',
        branch: 'Electronics & Communication',
        year: 3,
        roomNumber: 'R-302',
        floorId: 15,
        status: 'IN_HOSTEL',
        parentName: 'Pradeep Awasthi',
        parentEmail: 'pradeep.awasthi.parent@gmail.com',
        parentPhone: '9912345015',
        relationship: 'FATHER',
        address: 'G-12 Model Town, Kanpur, UP'
    }
];

function buildSql() {
    let sql = `-- ==============================================================================
-- NEXA-GUARD 2.0 ENTERPRISE SEED DATA
-- 15 Realistic Resident Students, Parents, Movement History, and Operational State
-- Hostel: NBH A BLOCK (ID: 33) | Institution: BBDU Lucknow
-- Default Passwords:
--   Students : Student@123
--   Parents  : Parent@123
--   Admin    : Password@123 (ajaycha1232a@bbdu.ac.in)
--   Warden   : Password@123 (ajaychaa17@gmail.com)
-- ==============================================================================

BEGIN;

-- 1. Ensure Standard Roles
INSERT INTO roles (name, description) VALUES
    ('SUPER_ADMIN', 'Platform Super Administrator'),
    ('HOSTEL_ADMIN', 'Hostel Facility Administrator'),
    ('WARDEN', 'Hostel Warden / Residential Authority'),
    ('SECURITY_GUARD', 'Campus Gate Security Guard'),
    ('STUDENT', 'Hostel Resident Student'),
    ('PARENT', 'Parent or Legal Guardian')
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure Physical Rooms for Hostel 33 (Block 7, Floors 13, 14, 15)
INSERT INTO rooms (floor_id, room_number, capacity, current_occupancy) VALUES
    (13, 'R-101', 2, 2),
    (13, 'R-102', 2, 2),
    (13, 'R-103', 2, 2),
    (14, 'R-201', 2, 2),
    (14, 'R-202', 2, 2),
    (14, 'R-203', 2, 2),
    (15, 'R-301', 2, 2),
    (15, 'R-302', 2, 1),
    (15, 'R-303', 2, 0)
ON CONFLICT (floor_id, room_number) DO UPDATE SET capacity = EXCLUDED.capacity;

-- 3. Ensure Main Gate for Hostel 33
INSERT INTO gates (hostel_id, gate_name, gate_code, gate_type, status) VALUES
    (33, 'Main Campus Gate', 'GATE-01', 'MAIN', 'OPERATIONAL')
ON CONFLICT (hostel_id, gate_code) DO NOTHING;

-- 4. Clean up any previous test student/parent records in Hostel 33 to prevent duplication
DELETE FROM pass_events WHERE pass_id IN (SELECT id FROM passes WHERE hostel_id = 33);
DELETE FROM gate_events WHERE hostel_id = 33;
DELETE FROM risk_scores WHERE student_id IN (SELECT id FROM students WHERE hostel_id = 33);
DELETE FROM alerts WHERE hostel_id = 33;
DELETE FROM passes WHERE hostel_id = 33;
DELETE FROM pass_requests WHERE hostel_id = 33;
DELETE FROM parent_student WHERE student_id IN (SELECT id FROM students WHERE hostel_id = 33);
DELETE FROM parents WHERE student_id IN (SELECT id FROM students WHERE hostel_id = 33);
DELETE FROM students WHERE hostel_id = 33;
DELETE FROM users WHERE hostel_id = 33 AND role IN ('STUDENT', 'PARENT');

-- Reset sequences safely
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('students_id_seq', (SELECT COALESCE(MAX(id), 1) FROM students));
SELECT setval('pass_requests_id_seq', (SELECT COALESCE(MAX(id), 1) FROM pass_requests));
SELECT setval('passes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM passes));

`;

    // Generate Inserts for Students and Parents
    studentsData.forEach((s, idx) => {
        const studentUserIdVar = `stu_user_id_${idx + 1}`;
        const parentUserIdVar  = `par_user_id_${idx + 1}`;
        const studentIdVar     = `stu_id_${idx + 1}`;
        const roomIdVar        = `room_id_${idx + 1}`;

        sql += `
-- ------------------------------------------------------------------------------
-- Student #${idx + 1}: ${s.name} (${s.roll})
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    ${studentUserIdVar} INT;
    ${parentUserIdVar}  INT;
    ${studentIdVar}     INT;
    ${roomIdVar}        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO ${roomIdVar} FROM rooms WHERE floor_id = ${s.floorId} AND room_number = '${s.roomNumber}';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, '${s.email}', '${STUDENT_PASSWORD_HASH}', '${s.name}', '${s.phone}', 'STUDENT', 'ACTIVE')
    RETURNING id INTO ${studentUserIdVar};

    INSERT INTO user_roles (user_id, role_id) VALUES (${studentUserIdVar}, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (${studentUserIdVar}, 33, '${s.uid}', '${s.roll}', '${s.course}', '${s.branch}', ${s.year}, ${roomIdVar}, '${s.parentPhone}', '${s.status}')
    RETURNING id INTO ${studentIdVar};

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, '${s.parentEmail}', '${PARENT_PASSWORD_HASH}', '${s.parentName}', '${s.parentPhone}', 'PARENT', 'ACTIVE')
    RETURNING id INTO ${parentUserIdVar};

    INSERT INTO user_roles (user_id, role_id) VALUES (${parentUserIdVar}, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (${parentUserIdVar}, ${studentIdVar}, '${s.relationship}', '${s.address}');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (${parentUserIdVar}, ${studentIdVar}, '${s.relationship}') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (${studentIdVar}, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
`;

        // Case A: Student 1 (Aarav Sharma) - Has completed previous pass
        if (idx === 0) {
            sql += `
    -- Past Completed Movement Pass (Returned On-Time)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0001', ${studentIdVar}, 33, 'OUTPASS', NOW() - INTERVAL '2 days' + INTERVAL '17 hours', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 30 mins', 'Library & Research Books', 'Central Library', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 days' + INTERVAL '16 hours 45 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, ${studentIdVar}, 10, 'LOW', 'AUTO_APPROVE', '["Safe routine evening study outpass"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, actual_return_time, exit_gate_id, return_gate_id, delay_minutes)
    VALUES ('PASS-2026-0001', v_req_id, ${studentIdVar}, 33, 'OUTPASS', NOW() - INTERVAL '2 days' + INTERVAL '17 hours', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 30 mins', 'NXG-PAST-001', '109284', 'USED', NOW() - INTERVAL '2 days' + INTERVAL '17 hours 10 mins', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 15 mins', v_gate_id, v_gate_id, 0)
    RETURNING id INTO v_pass_id;

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, ${studentIdVar}, 'EXIT_AUTHORIZED', 'VALID'),
           (33, v_gate_id, v_pass_id, ${studentIdVar}, 'RETURN_AUTHORIZED', 'VALID');
`;
        }

        // Case B: Students 3, 4, 5 (Aditya, Yash, Shaurya) - Currently OUTSIDE on ACTIVE Day Passes
        if (idx === 2 || idx === 3 || idx === 4) {
            const passNum = `PASS-2026-000${idx + 1}`;
            const reqNum  = `REQ-2026-000${idx + 1}`;
            const retCode = idx === 2 ? '482910' : (idx === 3 ? '619284' : '730192');
            const dest    = idx === 2 ? 'Hazratganj Computer Center' : (idx === 3 ? 'Phoenix Palassio Mall' : 'Medical Diagnostics & Clinic');
            const reason  = idx === 2 ? 'Coding Hackathon Participation' : (idx === 3 ? 'Project Materials & Stationery' : 'Doctor Consultation');

            sql += `
    -- Active Outbound Day Pass (Student currently OUTSIDE, scannable at gate)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('${reqNum}', ${studentIdVar}, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', '${reason}', '${dest}', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 hours 15 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, ${studentIdVar}, 15, 'LOW', 'AUTO_APPROVE', '["AI Approved: Routine evening pass compliant with gate timings"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('${passNum}', v_req_id, ${studentIdVar}, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'NXG-ACTIVE-${passNum}', '${retCode}', 'ACTIVE', NOW() - INTERVAL '1 hour 45 mins', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
    VALUES (v_pass_id, 'EXIT', ${studentUserIdVar}, 'Resident departed via Main Gate 01');

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, ${studentIdVar}, 'EXIT_AUTHORIZED', 'VALID');
`;
        }

        // Case C: Student 6 (Kartik Pandey) - PENDING Low-Risk Routine Pass
        if (s.hasPendingLowRiskPass) {
            sql += `
    -- Pending Movement Request (Low Risk, Eligible for Quick Warden Authorization)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified)
    VALUES ('REQ-2026-0006', ${studentIdVar}, 33, 'OUTPASS', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '4 hours', 'Visiting Book Fair & Library', 'Gomti Nagar Book Expo', 'PENDING', TRUE)
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, ${studentIdVar}, 10, 'LOW', 'AUTO_APPROVE', '["Routine educational outing within authorized evening window"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);
`;
        }

        // Case D: Student 7 (Ayush Gupta) - PENDING High-Risk Pass (Late Gate Return)
        if (s.hasPendingHighRiskPass) {
            sql += `
    -- Pending High-Risk Request (Late Gate Return 23:30 - Flagged for Warden Review & Parent Confirmation)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified)
    VALUES ('REQ-2026-0007', ${studentIdVar}, 33, 'OUTPASS', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '6 hours', 'Late Night Family Gathering', 'Downtown Hotel Banquet', 'PENDING', TRUE)
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, ${studentIdVar}, 55, 'MEDIUM', 'MANDATORY_WARDEN_OVERRIDE', '["Gate closing deadline exceeded: Expected return is past Boys Hostel gate closing (21:30). Mandatory Warden telephone verification required with parent."]'::jsonb, '{"timingRisk":45,"locationRisk":10}'::jsonb);

    INSERT INTO alerts (hostel_id, student_id, alert_type, severity, message)
    VALUES (33, ${studentIdVar}, 'HIGH_RISK_REQUEST', 'WARNING', 'Student Ayush Gupta requested pass with return time exceeding gate closing deadline. Parent verification required.');
`;
        }

        // Case E: Students 8 & 9 (Devendra Mishra, Varun Dubey) - Active HOME_PASS Leave
        if (s.isHomePass) {
            const passNum = `PASS-2026-000${idx + 1}`;
            const reqNum  = `REQ-2026-000${idx + 1}`;
            const dest    = idx === 7 ? 'Home Residence, Varanasi' : 'Home Residence, Gorakhpur';

            sql += `
    -- Active Multi-Day Home Leave Pass (Mess headcount deducted)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('${reqNum}', ${studentIdVar}, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'Semester Break & Family Visit', '${dest}', 'APPROVED', TRUE, 25, NOW() - INTERVAL '1 day 2 hours')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, ${studentIdVar}, 20, 'LOW', 'WARDEN_PARENT_VERIFICATION', '["Home Pass: Multi-day family visit verified with parent by Warden."]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('${passNum}', v_req_id, ${studentIdVar}, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'NXG-HOME-${passNum}', '552918', 'ACTIVE', NOW() - INTERVAL '23 hours', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, ${studentIdVar}, 'EXIT_AUTHORIZED', 'VALID');
`;
        }

        sql += `END $$;\n`;
    });

    sql += `
-- Update Room Current Occupancies based on active assignments
UPDATE rooms r
SET current_occupancy = (
    SELECT COUNT(*) FROM students s WHERE s.room_id = r.id AND s.movement_status != 'INACTIVE'
)
WHERE floor_id IN (13, 14, 15);

COMMIT;

-- ==============================================================================
-- SEED COMPLETE: 15 Resident Students, Linked Parents, Passes & Movement Synced.
-- ==============================================================================
`;

    return sql;
}

async function run() {
    console.log('Generating seed.sql...');
    const sql = buildSql();

    // 1. Write to backend/database/seed.sql
    const backendSeedPath = path.resolve(__dirname, '../backend/database/seed.sql');
    fs.writeFileSync(backendSeedPath, sql, 'utf8');
    console.log('✅ Wrote to:', backendSeedPath);

    // 2. Write to root seed.sql for convenient root access
    const rootSeedPath = path.resolve(__dirname, '../seed.sql');
    fs.writeFileSync(rootSeedPath, sql, 'utf8');
    console.log('✅ Wrote to:', rootSeedPath);

    // 3. Execute directly into PostgreSQL to populate live database
    console.log('Executing seed.sql in PostgreSQL database...');
    await db.query(sql);
    console.log('🎉 Database successfully seeded with 15 students!');

    // 4. Verify counts
    const stuCount = await db.query('SELECT COUNT(*) FROM students WHERE hostel_id = 33');
    const parCount = await db.query('SELECT COUNT(*) FROM parents p JOIN students s ON s.id = p.student_id WHERE s.hostel_id = 33');
    const outsideCount = await db.query("SELECT COUNT(*) FROM students WHERE hostel_id = 33 AND movement_status = 'OUTSIDE'");
    const inHostelCount = await db.query("SELECT COUNT(*) FROM students WHERE hostel_id = 33 AND movement_status = 'IN_HOSTEL'");
    const activePassCount = await db.query("SELECT COUNT(*) FROM passes WHERE hostel_id = 33 AND status = 'ACTIVE'");
    const pendingReqCount = await db.query("SELECT COUNT(*) FROM pass_requests WHERE hostel_id = 33 AND status = 'PENDING'");

    console.log('\n📊 SEED VERIFICATION SUMMARY:');
    console.log('----------------------------------------------------');
    console.log(`Total Students Enrolled  : ${stuCount.rows[0].count} / 15`);
    console.log(`Total Parents Linked     : ${parCount.rows[0].count} / 15`);
    console.log(`In-Hostel Residents      : ${inHostelCount.rows[0].count} (Breakfast/Lunch/Dinner)`);
    console.log(`Currently Outside        : ${outsideCount.rows[0].count} (3 Casual Day + 2 Home Leaves)`);
    console.log(`Active Passes at Gate    : ${activePassCount.rows[0].count} (Scannable with return code & QR)`);
    console.log(`Pending Warden Triage    : ${pendingReqCount.rows[0].count} (1 Low Risk + 1 High Risk Overdue)`);
    console.log('----------------------------------------------------\n');

    process.exit(0);
}

run().catch(err => {
    console.error('❌ Error executing seed:', err);
    process.exit(1);
});
