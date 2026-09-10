const db = require('../backend/src/config/db');

async function updateConstraints() {
    try {
        console.log('🔄 Updating database constraints for AI approval and recommendations...');
        
        // 1. Drop existing risk_scores recommendation check
        await db.query('ALTER TABLE risk_scores DROP CONSTRAINT IF EXISTS risk_scores_recommendation_check;');
        
        // 2. Add expanded constraint
        await db.query(`
            ALTER TABLE risk_scores ADD CONSTRAINT risk_scores_recommendation_check 
            CHECK (recommendation IN (
                'AUTO_APPROVE', 
                'FAST_TRACK', 
                'WARDEN_REVIEW', 
                'MANDATORY_WARDEN_OVERRIDE', 
                'BLOCK_OR_ESCALATE', 
                'WARDEN_PARENT_VERIFICATION', 
                'EMERGENCY_WARDEN_DISPATCH'
            ));
        `);

        // Check if pass_requests has check constraints on status
        const statusRes = await db.query(`
            SELECT pg_get_constraintdef(oid) FROM pg_constraint 
            WHERE conname = 'pass_requests_status_check';
        `);
        console.log('Current pass_requests_status_check:', statusRes.rows[0]);

        console.log('✅ Risk scores recommendation check constraint updated successfully!');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error updating constraints:', e);
        process.exit(1);
    }
}

updateConstraints();
