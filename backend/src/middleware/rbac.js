/**
 * Role-Based Access Control (RBAC) Middleware
 */

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized access. Authentication required.'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Role '${req.user.role}' is not authorized to access this institutional resource. Required: [${allowedRoles.join(', ')}]`
            });
        }

        next;
        return next();
    };
}

module.exports = {
    requireRole
};
