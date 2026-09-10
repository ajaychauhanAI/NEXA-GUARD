/**
 * NEXA-GUARD Authentication & Role Guard Helper
 */

const Auth = {
    checkAuth(requiredRoles = []) {
        const token = API.getToken();
        const user = API.getUser();

        if (!token || !user) {
            window.location.href = '/login.html';
            return false;
        }

        if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
            API.toast(`Access Denied. Role '${user.role}' cannot access this portal.`, 'error');
            setTimeout(() => {
                const map = {
                    'HOSTEL_ADMIN': '/admin.html',
                    'WARDEN': '/warden.html',
                    'SECURITY_GUARD': '/gate.html',
                    'STUDENT': '/student.html',
                    'PARENT': '/parent.html'
                };
                window.location.href = map[user.role] || '/login.html';
            }, 1000);
            return false;
        }

        return true;
    },

    async handleLogin(email, password) {
        try {
            const res = await API.login(email, password);
            if (res && res.token) {
                API.setToken(res.token);
                API.setUser(res.user);
                API.toast('Welcome back! Redirecting to institutional portal...', 'success');
                setTimeout(() => {
                    window.location.href = res.redirectUrl || '/index.html';
                }, 600);
            }
        } catch (err) {
            API.toast(err.message || 'Authentication failed. Please check credentials.', 'error');
        }
    },



    logout() {
        API.clearSession();
        window.location.href = '/login.html';
    },

    renderUserHeader() {
        const user = API.getUser();
        if (!user) return;

        const nameEl = document.getElementById('header-user-name');
        const roleEl = document.getElementById('header-user-role');
        const avatarEl = document.getElementById('header-user-avatar');

        if (nameEl) nameEl.textContent = user.fullName;
        if (roleEl) roleEl.textContent = user.role.replace('_', ' ');
        if (avatarEl && user.photoUrl) avatarEl.src = user.photoUrl;
    }
};

window.Auth = Auth;
