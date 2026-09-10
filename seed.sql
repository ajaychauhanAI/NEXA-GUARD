-- ==============================================================================
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


-- ------------------------------------------------------------------------------
-- Student #1: Aarav Sharma (BBDU-2026-CS01)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_1 INT;
    par_user_id_1  INT;
    stu_id_1     INT;
    room_id_1        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_1 FROM rooms WHERE floor_id = 13 AND room_number = 'R-101';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'aarav.sharma@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Aarav Sharma', '9812345001', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_1;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_1, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_1, 33, 'STU-2026-001', 'BBDU-2026-CS01', 'B.Tech', 'Computer Science & Engineering', 3, room_id_1, '9912345001', 'IN_HOSTEL')
    RETURNING id INTO stu_id_1;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'ramesh.sharma.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Ramesh Sharma', '9912345001', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_1;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_1, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_1, stu_id_1, 'FATHER', 'B-14 Sector 62, Noida, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_1, stu_id_1, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_1, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Past Completed Movement Pass (Returned On-Time)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0001', stu_id_1, 33, 'OUTPASS', NOW() - INTERVAL '2 days' + INTERVAL '17 hours', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 30 mins', 'Library & Research Books', 'Central Library', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 days' + INTERVAL '16 hours 45 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_1, 10, 'LOW', 'AUTO_APPROVE', '["Safe routine evening study outpass"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, actual_return_time, exit_gate_id, return_gate_id, delay_minutes)
    VALUES ('PASS-2026-0001', v_req_id, stu_id_1, 33, 'OUTPASS', NOW() - INTERVAL '2 days' + INTERVAL '17 hours', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 30 mins', 'NXG-PAST-001', '109284', 'USED', NOW() - INTERVAL '2 days' + INTERVAL '17 hours 10 mins', NOW() - INTERVAL '2 days' + INTERVAL '20 hours 15 mins', v_gate_id, v_gate_id, 0)
    RETURNING id INTO v_pass_id;

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_1, 'EXIT_AUTHORIZED', 'VALID'),
           (33, v_gate_id, v_pass_id, stu_id_1, 'RETURN_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #2: Rohan Verma (BBDU-2026-EC02)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_2 INT;
    par_user_id_2  INT;
    stu_id_2     INT;
    room_id_2        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_2 FROM rooms WHERE floor_id = 13 AND room_number = 'R-101';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'rohan.verma@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Rohan Verma', '9812345002', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_2;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_2, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_2, 33, 'STU-2026-002', 'BBDU-2026-EC02', 'B.Tech', 'Electronics & Communication', 2, room_id_2, '9912345002', 'IN_HOSTEL')
    RETURNING id INTO stu_id_2;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'suresh.verma.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Suresh Verma', '9912345002', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_2;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_2, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_2, stu_id_2, 'FATHER', '12/4 Aliganj, Lucknow, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_2, stu_id_2, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_2, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #3: Aditya Tiwari (BBDU-2026-IT03)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_3 INT;
    par_user_id_3  INT;
    stu_id_3     INT;
    room_id_3        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_3 FROM rooms WHERE floor_id = 13 AND room_number = 'R-102';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'aditya.tiwari@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Aditya Tiwari', '9812345003', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_3;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_3, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_3, 33, 'STU-2026-003', 'BBDU-2026-IT03', 'B.Tech', 'Information Technology', 3, room_id_3, '9912345003', 'OUTSIDE')
    RETURNING id INTO stu_id_3;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'rajesh.tiwari.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Rajesh Tiwari', '9912345003', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_3;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_3, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_3, stu_id_3, 'FATHER', 'Plot 45, Civil Lines, Prayagraj, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_3, stu_id_3, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_3, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Active Outbound Day Pass (Student currently OUTSIDE, scannable at gate)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0003', stu_id_3, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'Coding Hackathon Participation', 'Hazratganj Computer Center', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 hours 15 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_3, 15, 'LOW', 'AUTO_APPROVE', '["AI Approved: Routine evening pass compliant with gate timings"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('PASS-2026-0003', v_req_id, stu_id_3, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'NXG-ACTIVE-PASS-2026-0003', '482910', 'ACTIVE', NOW() - INTERVAL '1 hour 45 mins', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
    VALUES (v_pass_id, 'EXIT', stu_user_id_3, 'Resident departed via Main Gate 01');

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_3, 'EXIT_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #4: Yash Patel (BBDU-2026-ME04)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_4 INT;
    par_user_id_4  INT;
    stu_id_4     INT;
    room_id_4        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_4 FROM rooms WHERE floor_id = 13 AND room_number = 'R-102';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'yash.patel@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Yash Patel', '9812345004', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_4;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_4, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_4, 33, 'STU-2026-004', 'BBDU-2026-ME04', 'B.Tech', 'Mechanical Engineering', 4, room_id_4, '9912345004', 'OUTSIDE')
    RETURNING id INTO stu_id_4;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'manoj.patel.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Manoj Patel', '9912345004', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_4;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_4, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_4, stu_id_4, 'FATHER', '77 Anand Vihar, Kanpur, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_4, stu_id_4, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_4, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Active Outbound Day Pass (Student currently OUTSIDE, scannable at gate)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0004', stu_id_4, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'Project Materials & Stationery', 'Phoenix Palassio Mall', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 hours 15 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_4, 15, 'LOW', 'AUTO_APPROVE', '["AI Approved: Routine evening pass compliant with gate timings"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('PASS-2026-0004', v_req_id, stu_id_4, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'NXG-ACTIVE-PASS-2026-0004', '619284', 'ACTIVE', NOW() - INTERVAL '1 hour 45 mins', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
    VALUES (v_pass_id, 'EXIT', stu_user_id_4, 'Resident departed via Main Gate 01');

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_4, 'EXIT_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #5: Shaurya Singh (BBDU-2026-BC05)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_5 INT;
    par_user_id_5  INT;
    stu_id_5     INT;
    room_id_5        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_5 FROM rooms WHERE floor_id = 13 AND room_number = 'R-103';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'shaurya.singh@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Shaurya Singh', '9812345005', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_5;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_5, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_5, 33, 'STU-2026-005', 'BBDU-2026-BC05', 'BCA', 'Computer Applications', 2, room_id_5, '9912345005', 'OUTSIDE')
    RETURNING id INTO stu_id_5;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'vijay.singh.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Vijay Singh', '9912345005', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_5;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_5, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_5, stu_id_5, 'FATHER', 'D-89 Shastri Nagar, Meerut, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_5, stu_id_5, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_5, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Active Outbound Day Pass (Student currently OUTSIDE, scannable at gate)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0005', stu_id_5, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'Doctor Consultation', 'Medical Diagnostics & Clinic', 'APPROVED', TRUE, 25, NOW() - INTERVAL '2 hours 15 mins')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_5, 15, 'LOW', 'AUTO_APPROVE', '["AI Approved: Routine evening pass compliant with gate timings"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('PASS-2026-0005', v_req_id, stu_id_5, 33, 'OUTPASS', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'NXG-ACTIVE-PASS-2026-0005', '730192', 'ACTIVE', NOW() - INTERVAL '1 hour 45 mins', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO pass_events (pass_id, event_type, actor_id, notes)
    VALUES (v_pass_id, 'EXIT', stu_user_id_5, 'Resident departed via Main Gate 01');

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_5, 'EXIT_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #6: Kartik Pandey (BBDU-2026-CE06)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_6 INT;
    par_user_id_6  INT;
    stu_id_6     INT;
    room_id_6        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_6 FROM rooms WHERE floor_id = 13 AND room_number = 'R-103';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'kartik.pandey@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Kartik Pandey', '9812345006', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_6;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_6, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_6, 33, 'STU-2026-006', 'BBDU-2026-CE06', 'B.Tech', 'Civil Engineering', 3, room_id_6, '9912345006', 'IN_HOSTEL')
    RETURNING id INTO stu_id_6;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'alok.pandey.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Alok Pandey', '9912345006', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_6;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_6, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_6, stu_id_6, 'FATHER', '5/102 Indira Nagar, Lucknow, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_6, stu_id_6, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_6, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Pending Movement Request (Low Risk, Eligible for Quick Warden Authorization)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified)
    VALUES ('REQ-2026-0006', stu_id_6, 33, 'OUTPASS', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '4 hours', 'Visiting Book Fair & Library', 'Gomti Nagar Book Expo', 'PENDING', TRUE)
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_6, 10, 'LOW', 'AUTO_APPROVE', '["Routine educational outing within authorized evening window"]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);
END $$;

-- ------------------------------------------------------------------------------
-- Student #7: Ayush Gupta (BBDU-2026-CS07)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_7 INT;
    par_user_id_7  INT;
    stu_id_7     INT;
    room_id_7        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_7 FROM rooms WHERE floor_id = 14 AND room_number = 'R-201';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'ayush.gupta@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Ayush Gupta', '9812345007', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_7;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_7, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_7, 33, 'STU-2026-007', 'BBDU-2026-CS07', 'B.Tech', 'Computer Science & Engineering', 2, room_id_7, '9912345007', 'IN_HOSTEL')
    RETURNING id INTO stu_id_7;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'sunil.gupta.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Sunil Gupta', '9912345007', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_7;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_7, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_7, stu_id_7, 'FATHER', '88 Rajendra Nagar, Bareilly, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_7, stu_id_7, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_7, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Pending High-Risk Request (Late Gate Return 23:30 - Flagged for Warden Review & Parent Confirmation)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified)
    VALUES ('REQ-2026-0007', stu_id_7, 33, 'OUTPASS', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '6 hours', 'Late Night Family Gathering', 'Downtown Hotel Banquet', 'PENDING', TRUE)
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_7, 55, 'MEDIUM', 'MANDATORY_WARDEN_OVERRIDE', '["Gate closing deadline exceeded: Expected return is past Boys Hostel gate closing (21:30). Mandatory Warden telephone verification required with parent."]'::jsonb, '{"timingRisk":45,"locationRisk":10}'::jsonb);

    INSERT INTO alerts (hostel_id, student_id, alert_type, severity, message)
    VALUES (33, stu_id_7, 'HIGH_RISK_REQUEST', 'WARNING', 'Student Ayush Gupta requested pass with return time exceeding gate closing deadline. Parent verification required.');
END $$;

-- ------------------------------------------------------------------------------
-- Student #8: Devendra Mishra (BBDU-2026-EE08)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_8 INT;
    par_user_id_8  INT;
    stu_id_8     INT;
    room_id_8        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_8 FROM rooms WHERE floor_id = 14 AND room_number = 'R-201';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'devendra.mishra@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Devendra Mishra', '9812345008', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_8;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_8, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_8, 33, 'STU-2026-008', 'BBDU-2026-EE08', 'B.Tech', 'Electrical Engineering', 4, room_id_8, '9912345008', 'OUTSIDE')
    RETURNING id INTO stu_id_8;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'harish.mishra.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Harish Mishra', '9912345008', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_8;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_8, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_8, stu_id_8, 'FATHER', 'K-22 Sigra, Varanasi, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_8, stu_id_8, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_8, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Active Multi-Day Home Leave Pass (Mess headcount deducted)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0008', stu_id_8, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'Semester Break & Family Visit', 'Home Residence, Varanasi', 'APPROVED', TRUE, 25, NOW() - INTERVAL '1 day 2 hours')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_8, 20, 'LOW', 'WARDEN_PARENT_VERIFICATION', '["Home Pass: Multi-day family visit verified with parent by Warden."]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('PASS-2026-0008', v_req_id, stu_id_8, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'NXG-HOME-PASS-2026-0008', '552918', 'ACTIVE', NOW() - INTERVAL '23 hours', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_8, 'EXIT_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #9: Varun Dubey (BBDU-2026-MC09)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_9 INT;
    par_user_id_9  INT;
    stu_id_9     INT;
    room_id_9        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_9 FROM rooms WHERE floor_id = 14 AND room_number = 'R-202';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'varun.dubey@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Varun Dubey', '9812345009', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_9;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_9, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_9, 33, 'STU-2026-009', 'BBDU-2026-MC09', 'MCA', 'Computer Applications', 1, room_id_9, '9912345009', 'OUTSIDE')
    RETURNING id INTO stu_id_9;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'santosh.dubey.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Santosh Dubey', '9912345009', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_9;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_9, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_9, stu_id_9, 'FATHER', '14 Mohaddipur, Gorakhpur, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_9, stu_id_9, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_9, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;

    -- Active Multi-Day Home Leave Pass (Mess headcount deducted)
    INSERT INTO pass_requests (request_number, student_id, hostel_id, pass_type, from_time, to_time, reason, destination, status, location_verified, reviewed_by, reviewed_at)
    VALUES ('REQ-2026-0009', stu_id_9, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'Semester Break & Family Visit', 'Home Residence, Gorakhpur', 'APPROVED', TRUE, 25, NOW() - INTERVAL '1 day 2 hours')
    RETURNING id INTO v_req_id;

    INSERT INTO risk_scores (request_id, student_id, risk_score, risk_level, recommendation, reasons, signals)
    VALUES (v_req_id, stu_id_9, 20, 'LOW', 'WARDEN_PARENT_VERIFICATION', '["Home Pass: Multi-day family visit verified with parent by Warden."]'::jsonb, '{"timingRisk":0,"locationRisk":0}'::jsonb);

    INSERT INTO passes (pass_number, request_id, student_id, hostel_id, pass_type, valid_from, valid_until, qr_token, return_code, status, actual_exit_time, exit_gate_id)
    VALUES ('PASS-2026-0009', v_req_id, stu_id_9, 33, 'HOME_PASS', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 'NXG-HOME-PASS-2026-0009', '552918', 'ACTIVE', NOW() - INTERVAL '23 hours', v_gate_id)
    RETURNING id INTO v_pass_id;

    INSERT INTO gate_events (hostel_id, gate_id, pass_id, student_id, action_type, verification_status)
    VALUES (33, v_gate_id, v_pass_id, stu_id_9, 'EXIT_AUTHORIZED', 'VALID');
END $$;

-- ------------------------------------------------------------------------------
-- Student #10: Nikhil Srivastava (BBDU-2026-AI10)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_10 INT;
    par_user_id_10  INT;
    stu_id_10     INT;
    room_id_10        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_10 FROM rooms WHERE floor_id = 14 AND room_number = 'R-202';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'nikhil.srivastava@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Nikhil Srivastava', '9812345010', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_10;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_10, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_10, 33, 'STU-2026-010', 'BBDU-2026-AI10', 'B.Tech', 'Artificial Intelligence & ML', 3, room_id_10, '9912345010', 'IN_HOSTEL')
    RETURNING id INTO stu_id_10;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'dinesh.srivastava.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Dinesh Srivastava', '9912345010', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_10;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_10, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_10, stu_id_10, 'FATHER', 'Flat 302, Gomti Heights, Lucknow, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_10, stu_id_10, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_10, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #11: Aman Tripathi (BBDU-2026-CS11)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_11 INT;
    par_user_id_11  INT;
    stu_id_11     INT;
    room_id_11        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_11 FROM rooms WHERE floor_id = 14 AND room_number = 'R-203';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'aman.tripathi@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Aman Tripathi', '9812345011', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_11;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_11, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_11, 33, 'STU-2026-011', 'BBDU-2026-CS11', 'B.Tech', 'Computer Science & Engineering', 1, room_id_11, '9912345011', 'IN_HOSTEL')
    RETURNING id INTO stu_id_11;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'mahesh.tripathi.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Mahesh Tripathi', '9912345011', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_11;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_11, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_11, stu_id_11, 'FATHER', '44 Cantt Road, Jhansi, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_11, stu_id_11, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_11, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #12: Harsh Choudhary (BBDU-2026-DS12)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_12 INT;
    par_user_id_12  INT;
    stu_id_12     INT;
    room_id_12        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_12 FROM rooms WHERE floor_id = 14 AND room_number = 'R-203';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'harsh.choudhary@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Harsh Choudhary', '9812345012', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_12;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_12, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_12, 33, 'STU-2026-012', 'BBDU-2026-DS12', 'B.Tech', 'Data Science', 2, room_id_12, '9912345012', 'IN_HOSTEL')
    RETURNING id INTO stu_id_12;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'anand.choudhary.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Anand Choudhary', '9912345012', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_12;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_12, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_12, stu_id_12, 'FATHER', 'House 19, Sanjay Place, Agra, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_12, stu_id_12, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_12, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #13: Prateek Shukla (BBDU-2026-BA13)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_13 INT;
    par_user_id_13  INT;
    stu_id_13     INT;
    room_id_13        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_13 FROM rooms WHERE floor_id = 15 AND room_number = 'R-301';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'prateek.shukla@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Prateek Shukla', '9812345013', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_13;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_13, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_13, 33, 'STU-2026-013', 'BBDU-2026-BA13', 'BBA', 'Business Administration', 3, room_id_13, '9912345013', 'IN_HOSTEL')
    RETURNING id INTO stu_id_13;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'vinod.shukla.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Vinod Shukla', '9912345013', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_13;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_13, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_13, stu_id_13, 'FATHER', '22 George Town, Prayagraj, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_13, stu_id_13, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_13, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #14: Utkarsh Yadav (BBDU-2026-CS14)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_14 INT;
    par_user_id_14  INT;
    stu_id_14     INT;
    room_id_14        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_14 FROM rooms WHERE floor_id = 15 AND room_number = 'R-301';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'utkarsh.yadav@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Utkarsh Yadav', '9812345014', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_14;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_14, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_14, 33, 'STU-2026-014', 'BBDU-2026-CS14', 'B.Tech', 'Computer Science & Engineering', 4, room_id_14, '9912345014', 'IN_HOSTEL')
    RETURNING id INTO stu_id_14;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'ravindra.yadav.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Ravindra Yadav', '9912345014', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_14;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_14, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_14, stu_id_14, 'FATHER', 'Sector C, Mahanagar, Lucknow, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_14, stu_id_14, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_14, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------------
-- Student #15: Shivam Awasthi (BBDU-2026-EC15)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    stu_user_id_15 INT;
    par_user_id_15  INT;
    stu_id_15     INT;
    room_id_15        INT;
    v_role_stu_id       INT;
    v_role_par_id       INT;
    v_gate_id           INT;
    v_req_id            INT;
    v_pass_id           INT;
BEGIN
    SELECT id INTO v_role_stu_id FROM roles WHERE name = 'STUDENT';
    SELECT id INTO v_role_par_id FROM roles WHERE name = 'PARENT';
    SELECT id INTO v_gate_id FROM gates WHERE hostel_id = 33 LIMIT 1;
    SELECT id INTO room_id_15 FROM rooms WHERE floor_id = 15 AND room_number = 'R-302';

    -- 1. Create Student User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'shivam.awasthi@bbdu.ac.in', '$2a$10$.5/AjqsYQGtNvNRNa4ZScO/VFgbqHvg2sRQ/0DzljUJ5vo2w/Z5hS', 'Shivam Awasthi', '9812345015', 'STUDENT', 'ACTIVE')
    RETURNING id INTO stu_user_id_15;

    INSERT INTO user_roles (user_id, role_id) VALUES (stu_user_id_15, v_role_stu_id) ON CONFLICT DO NOTHING;

    -- 2. Create Student Profile
    INSERT INTO students (user_id, hostel_id, student_uid, roll_number, course, branch, year, room_id, emergency_contact, movement_status)
    VALUES (stu_user_id_15, 33, 'STU-2026-015', 'BBDU-2026-EC15', 'B.Tech', 'Electronics & Communication', 3, room_id_15, '9912345015', 'IN_HOSTEL')
    RETURNING id INTO stu_id_15;

    -- 3. Create Parent User
    INSERT INTO users (hostel_id, email, password_hash, full_name, phone, role, status)
    VALUES (33, 'pradeep.awasthi.parent@gmail.com', '$2a$10$ow8aa3Yt7xCi9zHtLlbzY.fOxu64nuYBa8l3fYDek/KX3CU6B3Ula', 'Pradeep Awasthi', '9912345015', 'PARENT', 'ACTIVE')
    RETURNING id INTO par_user_id_15;

    INSERT INTO user_roles (user_id, role_id) VALUES (par_user_id_15, v_role_par_id) ON CONFLICT DO NOTHING;

    -- 4. Create Parent Profile
    INSERT INTO parents (user_id, student_id, relationship, address)
    VALUES (par_user_id_15, stu_id_15, 'FATHER', 'G-12 Model Town, Kanpur, UP');

    -- 5. Create Parent_Student Mapping
    INSERT INTO parent_student (parent_user_id, student_id, relationship)
    VALUES (par_user_id_15, stu_id_15, 'FATHER') ON CONFLICT DO NOTHING;

    -- 6. Baseline Movement Profile
    INSERT INTO movement_baselines (student_id, hostel_id, typical_exit_hour, typical_return_hour, avg_duration_minutes, punctuality_rate, total_recorded_movements)
    VALUES (stu_id_15, 33, 17.50, 20.50, 180, 98.50, 4)
    ON CONFLICT (student_id) DO NOTHING;
END $$;

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
