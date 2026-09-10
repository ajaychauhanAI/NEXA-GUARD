/**
 * NEXA-GUARD: Clean Database Reset Script
 * Drops all tables and re-creates a completely empty, fresh PostgreSQL schema.
 * Only inserts system roles — NO hostels, users, blocks, rooms, gates, or policies.
 * All real data is created through the institutional onboarding wizard (POST /api/hostels).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'nexaguard',
});

async function resetDatabase() {
    const client = await pool.connect();
    try {
        console.log('🧹 Resetting database: Dropping existing tables and rebuilding empty schema...');
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        
        // Execute schema.sql to recreate fresh tables
        await client.query(schemaSql);

        // Insert only system roles — the minimal data required for the app to function
        await client.query(`
            INSERT INTO roles (name, description) VALUES
            ('SUPER_ADMIN', 'Platform Level Super Administrator'),
            ('HOSTEL_ADMIN', 'Chief Hostel Warden & Institutional Administrator'),
            ('WARDEN', 'Hostel Block Warden with movement approval & disciplinary authority'),
            ('SECURITY_GUARD', 'Gate Security Staff for QR check-in/out verification'),
            ('STUDENT', 'Resident Hostel Student applying for passes'),
            ('PARENT', 'Verified Parent/Guardian with ward tracking access')
            ON CONFLICT (name) DO NOTHING;
        `);

        console.log('✅ Database reset complete.');
        console.log('✅ Clean schema initialized with system roles only.');
        console.log('----------------------------------------------------');
        console.log('Next Step: Register your institution via the Onboarding Wizard');
        console.log('  → Open http://localhost:5000 and click "Register Your Institution"');
        console.log('  → This will create your hostel, admin account, blocks, rooms, and gates.');
        console.log('----------------------------------------------------');
    } catch (err) {
        console.error('❌ Error resetting database:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    resetDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { resetDatabase };
