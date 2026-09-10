/**
 * Database Migration Script: Applies table updates, constraints, and new entities
 */

const db = require('../src/config/db');

async function runMigration() {
    console.log('🔄 Applying NEXA-GUARD Database Migrations...');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Roles constraint update to include SUPER_ADMIN
        await client.query(`
            ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check;
            ALTER TABLE roles ADD CONSTRAINT roles_name_check 
                CHECK (name IN ('SUPER_ADMIN', 'HOSTEL_ADMIN', 'WARDEN', 'SECURITY_GUARD', 'STUDENT', 'PARENT'));
            
            INSERT INTO roles (name, description) 
            VALUES ('SUPER_ADMIN', 'Platform Level Administrator') 
            ON CONFLICT (name) DO NOTHING;
        `);

        // 2. Users status constraint update
        await client.query(`
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
            ALTER TABLE users ADD CONSTRAINT users_status_check 
                CHECK (status IN ('INVITED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE'));
        `);

        // 3. Hostels logo & description columns
        await client.query(`
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS logo_url TEXT;
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS description TEXT;
        `);

        // 4. User tokens table for email verification, account activation, password reset
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_tokens (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('EMAIL_VERIFICATION', 'ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'INVITATION')),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_user_tokens_token ON user_tokens(token);
            CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id);
        `);

        // 5. Email logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_logs (
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
            CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(related_user_id);
            CREATE INDEX IF NOT EXISTS idx_email_logs_hostel ON email_logs(hostel_id);
        `);

        // 6. Parent-Student mapping table
        await client.query(`
            CREATE TABLE IF NOT EXISTS parent_student (
                parent_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                relationship VARCHAR(50) DEFAULT 'GUARDIAN' CHECK (relationship IN ('FATHER', 'MOTHER', 'GUARDIAN')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(parent_user_id, student_id)
            );
            CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON parent_student(parent_user_id);
            CREATE INDEX IF NOT EXISTS idx_parent_student_student ON parent_student(student_id);
        `);

        // 7. Dining metrics table for mess food demand optimization
        await client.query(`
            CREATE TABLE IF NOT EXISTS dining_metrics (
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
            CREATE INDEX IF NOT EXISTS idx_dining_metrics_hostel_date ON dining_metrics(hostel_id, date);
        `);

        // 8. AI Human Feedback Loop table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_feedback (
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
            CREATE INDEX IF NOT EXISTS idx_ai_feedback_hostel ON ai_feedback(hostel_id);
        `);

        await client.query('COMMIT');
        console.log('✅ Migration applied successfully.');

        // Report final table count and list
        const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`);
        console.log(`📊 ACTUAL POSTGRESQL TABLE COUNT NOW: ${res.rows.length}`);
        console.log('Tables:', res.rows.map(r => r.table_name).join(', '));
        process.exit(0);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

runMigration();
