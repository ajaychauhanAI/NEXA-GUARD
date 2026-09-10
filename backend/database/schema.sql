-- NEXA-GUARD: AI-Powered Smart Hostel Entry, Exit & Safety Intelligence Platform
-- PostgreSQL Schema Definitions

-- Enable UUID extension if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS ai_feedback CASCADE;
DROP TABLE IF EXISTS dining_metrics CASCADE;
DROP TABLE IF EXISTS parent_student CASCADE;
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS user_tokens CASCADE;
DROP TABLE IF EXISTS resource_insights CASCADE;
DROP TABLE IF EXISTS movement_baselines CASCADE;
DROP TABLE IF EXISTS ai_interactions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS fines CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS risk_scores CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS gate_events CASCADE;
DROP TABLE IF EXISTS pass_events CASCADE;
DROP TABLE IF EXISTS passes CASCADE;
DROP TABLE IF EXISTS pass_requests CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS parents CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS gates CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS floors CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;
DROP TABLE IF EXISTS hostels CASCADE;

-- 1. HOSTELS TABLE
CREATE TABLE hostels (
    id SERIAL PRIMARY KEY,
    hostel_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. HST-LKO-001
    name VARCHAR(255) NOT NULL,
    institution_name VARCHAR(255) NOT NULL,
    hostel_type VARCHAR(50) DEFAULT 'CO-ED' CHECK (hostel_type IN ('BOYS', 'GIRLS', 'CO-ED')),
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    official_email VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) DEFAULT 26.84670000,
    longitude DECIMAL(11, 8) DEFAULT 80.94620000,
    geofence_radius_meters INT DEFAULT 150,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. BLOCKS TABLE
CREATE TABLE blocks (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    block_name VARCHAR(100) NOT NULL,
    block_code VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, block_code)
);

-- 3. FLOORS TABLE
CREATE TABLE floors (
    id SERIAL PRIMARY KEY,
    block_id INT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    floor_number INT NOT NULL,
    floor_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(block_id, floor_number)
);

-- 4. ROOMS TABLE
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    floor_id INT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    room_number VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 2,
    current_occupancy INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(floor_id, room_number)
);

-- 5. GATES TABLE
CREATE TABLE gates (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    gate_name VARCHAR(100) NOT NULL,
    gate_code VARCHAR(50) NOT NULL,
    gate_type VARCHAR(50) DEFAULT 'MAIN' CHECK (gate_type IN ('MAIN', 'PEDESTRIAN', 'VEHICULAR', 'EMERGENCY', 'REAR')),
    status VARCHAR(50) DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'MAINTENANCE', 'CLOSED')),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, gate_code)
);

-- 6. SECURITY ZONES TABLE
CREATE TABLE zones (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    zone_name VARCHAR(100) NOT NULL,
    zone_code VARCHAR(50) NOT NULL,
    risk_level VARCHAR(50) DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'RESTRICTED')),
    curfew_start TIME,
    curfew_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, zone_code)
);

-- 7. ROLES TABLE
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL CHECK (name IN ('SUPER_ADMIN', 'HOSTEL_ADMIN', 'WARDEN', 'SECURITY_GUARD', 'STUDENT', 'PARENT')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    hostel_id INT REFERENCES hostels(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role VARCHAR(50) NOT NULL REFERENCES roles(name),
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. USER_ROLES TABLE (Mapping for enterprise compliance)
CREATE TABLE user_roles (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, role_id)
);

-- 10. STUDENTS TABLE
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    student_uid VARCHAR(50) UNIQUE NOT NULL, -- e.g. STU-2026-001
    roll_number VARCHAR(100) UNIQUE NOT NULL,
    course VARCHAR(100) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    year INT NOT NULL CHECK (year BETWEEN 1 AND 5),
    room_id INT REFERENCES rooms(id) ON DELETE SET NULL,
    photo_url TEXT,
    emergency_contact VARCHAR(20) NOT NULL,
    movement_status VARCHAR(50) DEFAULT 'IN_HOSTEL' CHECK (movement_status IN ('IN_HOSTEL', 'OUTSIDE', 'SUSPENDED', 'BLOCKED', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. PARENTS TABLE
CREATE TABLE parents (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) DEFAULT 'FATHER' CHECK (relationship IN ('FATHER', 'MOTHER', 'GUARDIAN')),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. POLICIES TABLE (Configurable institutional rules)
CREATE TABLE policies (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    policy_name VARCHAR(100) NOT NULL,
    policy_code VARCHAR(50) NOT NULL,
    policy_value JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, policy_code)
);

-- 13. PASS_REQUESTS TABLE
CREATE TABLE pass_requests (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. REQ-2026-0001
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    pass_type VARCHAR(50) NOT NULL CHECK (pass_type IN ('OUTPASS', 'HOME_PASS', 'EMERGENCY_EXIT')),
    from_time TIMESTAMP WITH TIME ZONE NOT NULL,
    to_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT NOT NULL,
    destination TEXT NOT NULL,
    guardian_acknowledgement BOOLEAN DEFAULT FALSE,
    request_location_lat DECIMAL(10, 8),
    request_location_lng DECIMAL(11, 8),
    location_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    rejection_reason TEXT,
    warden_override_notes TEXT,
    reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. PASSES TABLE (Active/Completed movement passes)
CREATE TABLE passes (
    id SERIAL PRIMARY KEY,
    pass_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. PASS-2026-0001
    request_id INT UNIQUE NOT NULL REFERENCES pass_requests(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    pass_type VARCHAR(50) NOT NULL,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    qr_token VARCHAR(255) UNIQUE NOT NULL,
    return_code VARCHAR(10) NOT NULL,
    status VARCHAR(50) DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'ACTIVE', 'USED', 'EXPIRED', 'CANCELLED', 'OVERDUE')),
    actual_exit_time TIMESTAMP WITH TIME ZONE,
    actual_return_time TIMESTAMP WITH TIME ZONE,
    exit_gate_id INT REFERENCES gates(id) ON DELETE SET NULL,
    return_gate_id INT REFERENCES gates(id) ON DELETE SET NULL,
    exit_guard_id INT REFERENCES users(id) ON DELETE SET NULL,
    return_guard_id INT REFERENCES users(id) ON DELETE SET NULL,
    delay_minutes INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. PASS_EVENTS TABLE (Full pass lifecycle state history)
CREATE TABLE pass_events (
    id SERIAL PRIMARY KEY,
    pass_id INT NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'EXIT', 'RETURN', 'OVERDUE', 'CANCELLED', 'EXPIRED')),
    actor_id INT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. GATE_EVENTS TABLE (Immutable gate scan log)
CREATE TABLE gate_events (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    gate_id INT NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    guard_id INT REFERENCES users(id) ON DELETE SET NULL,
    pass_id INT REFERENCES passes(id) ON DELETE SET NULL,
    student_id INT REFERENCES students(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('SCAN_VERIFIED', 'SCAN_DENIED', 'EXIT_AUTHORIZED', 'RETURN_AUTHORIZED', 'MANUAL_OVERRIDE')),
    verification_status VARCHAR(50) NOT NULL CHECK (verification_status IN ('VALID', 'INVALID_TOKEN', 'EXPIRED', 'ALREADY_USED', 'CANCELLED', 'MANUAL_REVIEW')),
    denial_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. LOCATIONS TABLE (Event-based geofence checks)
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    pass_id INT REFERENCES passes(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('REQUEST_CREATED', 'EXIT_VERIFICATION', 'RETURN_VERIFICATION')),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy_meters DECIMAL(8, 2),
    distance_from_hostel_meters DECIMAL(10, 2),
    is_geofence_verified BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. RISK_SCORES TABLE (AI Explainable Risk Output)
CREATE TABLE risk_scores (
    id SERIAL PRIMARY KEY,
    request_id INT UNIQUE NOT NULL REFERENCES pass_requests(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    risk_score INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    recommendation VARCHAR(50) NOT NULL CHECK (recommendation IN ('FAST_TRACK', 'WARDEN_REVIEW', 'BLOCK_OR_ESCALATE')),
    reasons JSONB NOT NULL, -- Array of string explanations
    signals JSONB, -- Breakdown of individual risk components
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19. ANOMALIES TABLE (Algorithmic behavioral anomalies)
CREATE TABLE anomalies (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(100) NOT NULL CHECK (anomaly_type IN (
        'REPEATED_REQUESTS_SHORT_INTERVAL',
        'UNUSUAL_TIMING_PATTERN',
        'CHRONIC_LATE_RETURNS',
        'REPEATED_FAILED_GATE_SCANS',
        'LOCATION_DISCREPANCY',
        'REPEATED_CANCELLATIONS',
        'UNUSUAL_MOVEMENT_FREQUENCY',
        'POLICY_DEVIATION'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    evidence JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE')),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- 20. ALERTS TABLE (System-wide alerts)
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    student_id INT REFERENCES students(id) ON DELETE SET NULL,
    pass_id INT REFERENCES passes(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'LATE_RETURN',
        'HIGH_RISK_REQUEST',
        'INVALID_QR',
        'EXPIRED_PASS',
        'REPEATED_FAILED_SCAN',
        'LOCATION_MISMATCH',
        'UNAUTHORIZED_MOVEMENT',
        'EMERGENCY'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 21. NOTIFICATIONS TABLE (Targeted role notifications)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    related_id INT, -- pass_id, fine_id, etc.
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 22. FINES TABLE (Disciplinary late-return & violation fines)
CREATE TABLE fines (
    id SERIAL PRIMARY KEY,
    fine_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. FIN-2026-001
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    pass_id INT REFERENCES passes(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
    status VARCHAR(50) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'WAIVED')),
    issued_by INT REFERENCES users(id) ON DELETE SET NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- 23. AUDIT_LOGS TABLE (Immutable audit trail)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    hostel_id INT REFERENCES hostels(id) ON DELETE SET NULL,
    actor_id INT REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(100),
    result VARCHAR(50) DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED', 'WARNING')),
    ip_address VARCHAR(50),
    user_agent TEXT,
    context JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 24. AI_INTERACTIONS TABLE (NEXA AI chat query logs)
CREATE TABLE ai_interactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostel_id INT REFERENCES hostels(id) ON DELETE CASCADE,
    user_role VARCHAR(50) NOT NULL,
    query_text TEXT NOT NULL,
    intent_detected VARCHAR(100),
    tool_calls JSONB,
    response_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 25. MOVEMENT_BASELINES TABLE (Student personal historical movement behavior baseline)
CREATE TABLE movement_baselines (
    id SERIAL PRIMARY KEY,
    student_id INT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    typical_exit_hour NUMERIC(4, 2) DEFAULT 17.50,
    typical_return_hour NUMERIC(4, 2) DEFAULT 20.50,
    avg_duration_minutes INT DEFAULT 180,
    avg_weekly_passes NUMERIC(4, 2) DEFAULT 1.50,
    punctuality_rate NUMERIC(5, 2) DEFAULT 100.00,
    total_recorded_movements INT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 26. RESOURCE_INSIGHTS TABLE (Operational staffing, gate balancing & mess demand insights)
CREATE TABLE resource_insights (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- SECURITY_STAFFING, TRAFFIC_OPTIMIZATION, DINING_MESS, ENERGY_LOAD, POLICY_TUNING
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title VARCHAR(255) NOT NULL,
    insight TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    evidence JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 27. USER_TOKENS TABLE (Cryptographic single-use activation, verification & password reset tokens)
CREATE TABLE user_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('EMAIL_VERIFICATION', 'ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'INVITATION')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 28. EMAIL_LOGS TABLE (Transactional audit trail of all dispatched emails)
CREATE TABLE email_logs (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    email_type VARCHAR(100) NOT NULL,
    related_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    hostel_id INT REFERENCES hostels(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    status VARCHAR(50) DEFAULT 'SENT' CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'DEV_LOGGED')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 29. PARENT_STUDENT TABLE (Explicit relational mapping for student-guardian tracking)
CREATE TABLE parent_student (
    parent_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) DEFAULT 'GUARDIAN' CHECK (relationship IN ('FATHER', 'MOTHER', 'GUARDIAN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(parent_user_id, student_id)
);

-- 30. DINING_METRICS TABLE (Mess food preparation, consumption & waste reduction telemetry)
CREATE TABLE dining_metrics (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal_type VARCHAR(50) NOT NULL CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')),
    meals_prepared INT NOT NULL DEFAULT 0,
    meals_consumed INT NOT NULL DEFAULT 0,
    waste_quantity_kg NUMERIC(6, 2) DEFAULT 0.00,
    students_outside_count INT DEFAULT 0,
    cost_saved_inr NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, date, meal_type)
);

-- 31. AI_FEEDBACK TABLE (Human-in-the-loop decisions on AI risk & anomaly recommendations)
CREATE TABLE ai_feedback (
    id SERIAL PRIMARY KEY,
    hostel_id INT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    pass_id INT REFERENCES passes(id) ON DELETE CASCADE,
    request_id INT REFERENCES pass_requests(id) ON DELETE CASCADE,
    ai_recommendation VARCHAR(50),
    human_decision VARCHAR(50),
    actual_outcome VARCHAR(50),
    decision_notes TEXT,
    actor_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR HIGH-THROUGHPUT REAL-TIME QUERIES
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_students_roll ON students(roll_number);
CREATE INDEX idx_students_movement_status ON students(movement_status);
CREATE INDEX idx_students_hostel ON students(hostel_id);
CREATE INDEX idx_pass_requests_student ON pass_requests(student_id);
CREATE INDEX idx_pass_requests_status ON pass_requests(status);
CREATE INDEX idx_pass_requests_created ON pass_requests(created_at);
CREATE INDEX idx_passes_qr_token ON passes(qr_token);
CREATE INDEX idx_passes_return_code ON passes(return_code);
CREATE INDEX idx_passes_status ON passes(status);
CREATE INDEX idx_passes_student ON passes(student_id);
CREATE INDEX idx_gate_events_gate ON gate_events(gate_id);
CREATE INDEX idx_gate_events_created ON gate_events(created_at);
CREATE INDEX idx_risk_scores_request ON risk_scores(request_id);
CREATE INDEX idx_anomalies_hostel ON anomalies(hostel_id);
CREATE INDEX idx_anomalies_student ON anomalies(student_id);
CREATE INDEX idx_alerts_hostel ON alerts(hostel_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_baselines_student ON movement_baselines(student_id);
CREATE INDEX idx_insights_hostel ON resource_insights(hostel_id, status);
CREATE INDEX idx_user_tokens_token ON user_tokens(token);
CREATE INDEX idx_email_logs_user ON email_logs(related_user_id);
CREATE INDEX idx_email_logs_hostel ON email_logs(hostel_id);
CREATE INDEX idx_parent_student_parent ON parent_student(parent_user_id);
CREATE INDEX idx_dining_metrics_hostel_date ON dining_metrics(hostel_id, date);
CREATE INDEX idx_ai_feedback_hostel ON ai_feedback(hostel_id);


