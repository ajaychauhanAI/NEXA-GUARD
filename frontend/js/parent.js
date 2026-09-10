/**
 * NEXA-GUARD Parent Ward Monitoring Portal Logic
 */

async function loadParentDashboard() {
    try {
        const user = API.getUser();
        if (!user || !user.wardStudentId) {
            API.toast('No student ward linked to this parent account.', 'warning');
            return;
        }

        const wardId = user.wardStudentId;

        // Fetch Ward Profile & Passes
        const res = await API.getStudentById(wardId);
        if (!res || !res.student) {
            API.toast('Could not find ward details.', 'error');
            return;
        }

        const s = res.student;
        const passes = res.passes || [];

        // 1. Render Ward Profile Banner
        document.getElementById('ward-name').textContent = s.full_name;
        document.getElementById('ward-roll').textContent = s.roll_number;
        document.getElementById('ward-room').textContent = `${s.block_name || 'Block A'} • Room ${s.room_number || 'N/A'}`;
        document.getElementById('ward-course').textContent = `${s.course} (${s.branch}) - Year ${s.year}`;
        const avatarEl = document.getElementById('ward-avatar');
        if (avatarEl) {
            avatarEl.src = s.photo_url || ('https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(s.full_name || 'Ward'));
        }

        const statusBadge = document.getElementById('ward-status-badge');
        if (s.movement_status === 'IN_HOSTEL') {
            statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-500/30';
            statusBadge.textContent = '● Currently Inside Hostel Room';
        } else if (s.movement_status === 'OUTSIDE') {
            statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-950 text-amber-400 border border-amber-500/30 animate-pulse';
            statusBadge.textContent = '▲ Currently Outside Campus';
        } else {
            statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-950 text-red-400 border border-red-500/30';
            statusBadge.textContent = `● ${s.movement_status}`;
        }

        // 2. Active Pass Card
        const activePass = passes.find(p => p.status === 'ACTIVE' || p.status === 'APPROVED' || p.status === 'OVERDUE');
        const passContainer = document.getElementById('ward-active-pass');

        if (activePass) {
            const validUntil = new Date(activePass.valid_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            const exitTime = activePass.actual_exit_time ? new Date(activePass.actual_exit_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Pending departure';

            passContainer.innerHTML = `
                <div class="bg-gradient-to-br from-slate-900 to-blue-950 border border-blue-500/40 rounded-2xl p-6 shadow-xl space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">${activePass.pass_type} #${activePass.pass_number}</span>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${activePass.status === 'OVERDUE' ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'}">
                            ${activePass.status}
                        </span>
                    </div>
                    <h3 class="text-xl font-bold text-white">${activePass.destination}</h3>
                    <p class="text-xs text-slate-300"><strong class="text-slate-400">Declared Purpose:</strong> ${activePass.reason}</p>
                    
                    <div class="grid grid-cols-2 gap-4 pt-2 text-xs border-t border-slate-800/80">
                        <div>
                            <span class="text-slate-400 block text-[11px]">Gate Departure</span>
                            <span class="font-bold text-white">${exitTime}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[11px]">Expected Return Deadline</span>
                            <span class="font-bold text-amber-400">${validUntil}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            passContainer.innerHTML = `
                <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
                    <div class="text-2xl mb-1">🏠</div>
                    <p class="font-semibold text-slate-300">Your ward has no active movement pass.</p>
                    <p class="text-[11px] text-slate-500 mt-1">Safely inside the hostel residential wing.</p>
                </div>
            `;
        }

        // 3. Movement Timeline
        const timelineContainer = document.getElementById('ward-timeline');
        if (passes.length === 0) {
            timelineContainer.innerHTML = `<p class="text-xs text-slate-500 py-4">No historical movement logs recorded yet.</p>`;
            return;
        }

        timelineContainer.innerHTML = passes.map(p => {
            const dateStr = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const exitStr = p.actual_exit_time ? new Date(p.actual_exit_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;
            const returnStr = p.actual_return_time ? new Date(p.actual_return_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;

            return `
                <div class="relative pl-6 pb-6 border-l-2 border-slate-800 last:border-l-0">
                    <div class="absolute -left-1.5 top-0 w-3 h-3 rounded-full ${p.status === 'USED' ? 'bg-emerald-500' : p.status === 'OVERDUE' ? 'bg-red-500' : 'bg-blue-500'}"></div>
                    <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-white text-sm">${p.pass_type} — ${p.destination}</span>
                            <span class="text-slate-400 text-[11px] font-mono">${dateStr}</span>
                        </div>
                        <p class="text-slate-400">Reason: ${p.reason}</p>
                        <div class="flex items-center gap-4 text-[11px] pt-1">
                            ${exitStr ? `<span class="text-emerald-400">↗ Exited: <strong>${exitStr}</strong></span>` : ''}
                            ${returnStr ? `<span class="text-blue-400">↙ Returned: <strong>${returnStr}</strong></span>` : ''}
                            ${p.delay_minutes > 15 ? `<span class="text-red-400 font-bold">⚠️ Returned ${p.delay_minutes} mins late</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Parent dashboard error:', err);
        API.toast('Failed to load ward telemetry.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.checkAuth(['PARENT'])) {
        Auth.renderUserHeader();
        loadParentDashboard();
        setInterval(loadParentDashboard, 5000);
    }
});
