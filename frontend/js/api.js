/**
 * NEXA-GUARD Frontend API Client
 * Centralizes network requests, bearer token management, and error handling.
 */

const API_BASE = '/api';

const API = {
    getToken() {
        return localStorage.getItem('nexaguard_token');
    },

    setToken(token) {
        localStorage.setItem('nexaguard_token', token);
    },

    getUser() {
        try {
            return JSON.parse(localStorage.getItem('nexaguard_user')) || null;
        } catch (e) {
            return null;
        }
    },

    setUser(user) {
        localStorage.setItem('nexaguard_user', JSON.stringify(user));
    },

    clearSession() {
        localStorage.removeItem('nexaguard_token');
        localStorage.removeItem('nexaguard_user');
    },

    async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };

        const config = {
            ...options,
            headers
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, config);
            const data = await response.json();

            if (response.status === 401 && !endpoint.includes('/auth/login')) {
                this.clearSession();
                window.location.href = '/login.html?expired=1';
                return null;
            }

            if (!response.ok) {
                throw new Error(data.message || data.error || `HTTP Error ${response.status}`);
            }

            return data;
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err.message);
            throw err;
        }
    },

    login(email, password) {
        return this.request('/auth/login', { method: 'POST', body: { email, password } });
    },
    register(data) {
        return this.request('/auth/register', { method: 'POST', body: data });
    },
    forgotPassword(email) {
        return this.request('/auth/forgot-password', { method: 'POST', body: { email } });
    },
    resetPassword(token, newPassword) {
        return this.request('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
    },
    verifyEmail(token, newPassword) {
        return this.request('/auth/verify-email', { method: 'POST', body: { token, newPassword } });
    },
    activateAccount(token, password) {
        return this.request('/auth/activate', { method: 'POST', body: { token, password } });
    },
    logout() {
        return this.request('/auth/logout', { method: 'POST' });
    },
    getMe() {
        return this.request('/auth/me');
    },

    // Hostel & People
    getHostel() {
        return this.request('/hostels');
    },
    getHostelProfile() {
        return this.request('/hostels/profile');
    },
    getStaff() {
        return this.request('/hostels/staff');
    },
    addStaff(data) {
        return this.request('/hostels/staff', { method: 'POST', body: data });
    },
    getParents() {
        return this.request('/hostels/parents');
    },
    getRooms() {
        return this.request('/hostels/rooms');
    },
    getFloors() {
        return this.request('/hostels/floors');
    },
    addFloor(data) {
        return this.request('/hostels/floors', { method: 'POST', body: data });
    },
    deleteFloor(id) {
        return this.request(`/hostels/floors/${id}`, { method: 'DELETE' });
    },
    addRoom(data) {
        return this.request('/hostels/rooms', { method: 'POST', body: data });
    },
    updateRoom(id, data) {
        return this.request(`/hostels/rooms/${id}`, { method: 'PUT', body: data });
    },
    deleteRoom(id) {
        return this.request(`/hostels/rooms/${id}`, { method: 'DELETE' });
    },
    setupHostelWizard(data) {
        return this.request('/hostels/setup', { method: 'POST', body: data });
    },
    updateHostelSettings(data) {
        return this.request('/hostels/settings', { method: 'PUT', body: data });
    },
    getBlocks() {
        return this.request('/hostels/blocks');
    },
    addBlock(data) {
        return this.request('/hostels/blocks', { method: 'POST', body: data });
    },
    addGate(data) {
        return this.request('/hostels/gates', { method: 'POST', body: data });
    },
    addZone(data) {
        return this.request('/hostels/zones', { method: 'POST', body: data });
    },
    updatePolicies(policies) {
        return this.request('/hostels/policies', { method: 'PUT', body: { policies } });
    },

    // Students
    getStudents(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request(`/students?${qs}`);
    },
    getStudentById(id) {
        return this.request(`/students/${id}`);
    },
    createStudent(data) {
        return this.request('/students', { method: 'POST', body: data });
    },
    importStudents(data) {
        return this.request('/students/import-csv', { method: 'POST', body: data });
    },
    updateStudentStatus(id, status) {
        return this.request(`/students/${id}/status`, { method: 'PUT', body: { status } });
    },
    allocateStudentRoom(id, roomId) {
        return this.request(`/students/${id}/room`, { method: 'PUT', body: { roomId } });
    },

    // Passes
    createPassRequest(data) {
        return this.request('/passes/requests', { method: 'POST', body: data });
    },
    getPassRequests(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request(`/passes/requests?${qs}`);
    },
    getPassRequestById(id) {
        return this.request(`/passes/requests/${id}`);
    },
    approvePassRequest(id, overrideNotes = '') {
        return this.request(`/passes/requests/${id}/approve`, { method: 'POST', body: { overrideNotes } });
    },
    batchApprovePasses(requestIds, notes = '') {
        return this.request('/passes/batch-approve', { method: 'POST', body: { requestIds, notes } });
    },
    rejectPassRequest(id, rejectionReason) {
        return this.request(`/passes/requests/${id}/reject`, { method: 'POST', body: { rejectionReason } });
    },
    cancelPassRequest(id) {
        return this.request(`/passes/requests/${id}/cancel`, { method: 'POST' });
    },
    getActivePass() {
        return this.request('/passes/active');
    },

    // Gate
    scanGate(tokenOrCode, gateId = 1) {
        return this.request('/gate/scan', { method: 'POST', body: { token: tokenOrCode, gateId } });
    },
    authorizeExit(passId, gateId = 1) {
        return this.request('/gate/exit', { method: 'POST', body: { passId, gateId } });
    },
    verifyReturn(identifier, gateId = 1) {
        return this.request('/gate/return', { method: 'POST', body: { passId: identifier, returnCode: identifier, gateId } });
    },
    getRecentGateScans() {
        return this.request('/gate/recent');
    },
    getActiveGatePasses() {
        return this.request('/gate/active-passes');
    },

    // AI & Analytics
    getAnomalies() {
        return this.request('/ai/anomalies');
    },
    getResourceInsights() {
        return this.request('/ai/insights');
    },
    getPredictions() {
        return this.request('/ai/predictions');
    },
    getOperationalScore() {
        return this.request('/ai/operational-score');
    },
    getStudentBaseline(studentId) {
        return this.request(`/ai/baselines/${studentId}`);
    },
    calculateRisk(data) {
        return this.request('/ai/risk-score', { method: 'POST', body: data });
    },
    askAssistant(message) {
        return this.request('/ai/chat', { method: 'POST', body: { message } });
    },
    getAnalyticsOverview() {
        return this.request('/analytics/overview');
    },
    getMovementsAnalytics() {
        return this.request('/analytics/movements');
    },
    getLateReturns() {
        return this.request('/analytics/late-returns');
    },
    getGatesAnalytics() {
        return this.request('/analytics/gates');
    },
    getBlocksAnalytics() {
        return this.request('/analytics/blocks');
    },
    getMessHeadcount() {
        return this.request('/analytics/mess');
    },

    // Alerts & Fines
    getAlerts() {
        return this.request('/alerts');
    },
    resolveAlert(id) {
        return this.request(`/alerts/${id}/resolve`, { method: 'PUT' });
    },
    getFines(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request(`/fines?${qs}`);
    },
    getAuditLogs(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request(`/audit-logs?${qs}`);
    },

    // In-App Notifications
    getNotifications() {
        return this.request('/notifications');
    },
    markNotificationRead(id) {
        return this.request(`/notifications/${id}/read`, { method: 'POST' });
    },
    markAllNotificationsRead() {
        return this.request('/notifications/read-all', { method: 'POST' });
    },

    // UI Toast Notification helper
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container') || (() => {
            const c = document.createElement('div');
            c.id = 'toast-container';
            c.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm';
            document.body.appendChild(c);
            return c;
        })();

        const colors = {
            success: 'bg-emerald-600 border-emerald-500 text-white',
            error: 'bg-red-600 border-red-500 text-white',
            warning: 'bg-amber-600 border-amber-500 text-white',
            info: 'bg-slate-800 border-slate-700 text-white'
        };

        const toastEl = document.createElement('div');
        toastEl.className = `${colors[type] || colors.info} border px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center justify-between transition-all duration-300 transform translate-y-2 opacity-0`;
        toastEl.innerHTML = `
            <span>${message}</span>
            <button class="ml-3 text-white/80 hover:text-white" onclick="this.parentElement.remove()">&times;</button>
        `;
        container.appendChild(toastEl);

        setTimeout(() => {
            toastEl.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        setTimeout(() => {
            toastEl.classList.add('opacity-0');
            setTimeout(() => toastEl.remove(), 300);
        }, 4000);
    }
};

window.API = API;
