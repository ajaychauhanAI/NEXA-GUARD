/**
 * JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'nexaguard_enterprise_jwt_secret_key_prod_sec_x89f';

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token is required.'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // Fetch user from DB with roles and student/parent IDs if applicable
        const userQuery = `
            SELECT u.id, u.email, u.full_name, u.role, u.hostel_id, u.status,
                   s.id as student_id, s.roll_number, s.movement_status,
                   p.id as parent_id, p.student_id as ward_student_id
            FROM users u
            LEFT JOIN students s ON s.user_id = u.id
            LEFT JOIN parents p ON p.user_id = u.id
            WHERE u.id = $1 AND u.status = 'ACTIVE'
        `;
        const result = await db.query(userQuery, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User session is invalid or has been deactivated.'
            });
        }

        req.user = result.rows[0];
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Session has expired. Please log in again.'
            });
        }
        return res.status(403).json({
            success: false,
            message: 'Invalid authorization token.'
        });
    }
}

module.exports = {
    authenticateToken,
    JWT_SECRET
};
