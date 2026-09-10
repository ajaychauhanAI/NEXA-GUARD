/**
 * NEXA-GUARD Institutional Admin Command Center Logic
 * Real-time telemetry, People Hub (Students, Staff, Parents, Rooms), AI Optimizer, and Modals.
 */

let hourlyChartInstance = null;
let passTypesChartInstance = null;

let allStudentsCache = [];
let allStaffCache = [];
let allParentsCache = [];
let allRoomsCache = [];
let allFloorsCache = [];
let allBlocksCache = [];
let currentMessData = null;
let pendingPassesCache = [];
let currentDirectoryTab = 'students';

async function loadAdminDashboard() {
    try {
        // 1. Overview Metrics
        const overview = await API.getAnalyticsOverview();
        if (overview && overview.metrics) {
            const m = overview.metrics;
            document.getElementById('m-total').textContent = m.totalStudents;
            document.getElementById('m-inside').textContent = m.insideHostel;
            document.getElementById('m-outside').textContent = m.outsideHostel;
            document.getElementById('m-active-passes').textContent = m.activePasses;
            document.getElementById('m-pending').textContent = m.pendingRequests;
            document.getElementById('m-overdue').textContent = m.overduePasses;
            document.getElementById('m-high-risk').textContent = m.highRiskRequests;
            document.getElementById('m-today').textContent = m.todayMovements;
        }

        // 2. People Directory Hub, Pending Approvals & Food Mess Headcount
        await Promise.all([
            loadStudentsDirectory(),
            loadStaffDirectory(),
            loadParentsDirectory(),
            loadRoomsOccupancy(),
            loadPendingPassesQueue(),
            loadMessHeadcount()
        ]);

        // 3. Charts & Analytics
        await renderAnalyticsCharts();

        // 4. AI Resource Optimization & Operational Insights
        await renderAiInsights();

        // 5. Behavioral Anomalies Radar
        await renderAnomalies();

        // 6. System Audit Trail
        await renderAuditLogs();

    } catch (err) {
        console.error('Admin dashboard loading error:', err);
        API.toast('Failed to load complete admin metrics.', 'error');
    }
}

// =========================================================================
// DIRECTORY HUB LOADERS & RENDERERS
// =========================================================================

async function loadStudentsDirectory() {
    try {
        const res = await API.getStudents();
        allStudentsCache = res.students || [];
        document.getElementById('count-badge-students').textContent = allStudentsCache.length;
        renderStudentsTable(allStudentsCache);
    } catch (err) {
        console.error('Error loading students directory:', err);
    }
}

function renderStudentsTable(students) {
    const tbody = document.getElementById('students-table-body');
    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-500">No resident students found in this hostel. Click <strong>+ Onboard Student</strong> to register residents.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const isInside = s.movement_status === 'IN_HOSTEL';
        const statusBadge = isInside 
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> IN HOSTEL</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> OUTSIDE</span>`;

        return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                            ${s.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <span class="font-bold text-white block">${s.full_name}</span>
                            <span class="text-[11px] text-slate-400">${s.email}</span>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 font-mono font-bold text-blue-400">${s.roll_number}</td>
                <td class="py-3 px-4 text-slate-300">${s.course || 'B.Tech'} (${s.branch || 'CSE'}, Yr ${s.year || 1})</td>
                <td class="py-3 px-4">
                    ${s.room_number ? `
                        <div class="flex items-center gap-2">
                            <div>
                                <span class="font-bold text-white">Room ${s.room_number}</span>
                                <span class="block text-[10px] text-slate-400">${s.block_name || ''}${s.floor_name ? ` • ${s.floor_name}` : ''}</span>
                            </div>
                            <button onclick="openAllocateRoomModal(${s.id})" title="Change Room" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 text-[10px] transition">
                                ✏️
                            </button>
                        </div>
                    ` : `
                        <button onclick="openAllocateRoomModal(${s.id})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1 shadow-sm">
                            <span>➕</span> Allocate Room
                        </button>
                    `}
                </td>
                <td class="py-3 px-4">${statusBadge}</td>
                <td class="py-3 px-4">
                    <div class="font-bold text-white">${s.guardian_name || 'Guardian'}</div>
                    <div class="text-[11px] text-emerald-400 font-mono">${s.guardian_email || s.emergency_contact || '—'}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${s.guardian_phone || s.phone || '—'}</div>
                </td>
                <td class="py-3 px-4 text-right">
                    <button onclick="viewStudentDetails(${s.id})" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition">
                        Inspect
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadStaffDirectory() {
    try {
        const res = await API.getStaff();
        allStaffCache = res.staff || [];
        document.getElementById('count-badge-staff').textContent = allStaffCache.length;
        renderStaffTable(allStaffCache);
    } catch (err) {
        console.error('Error loading staff directory:', err);
    }
}

function renderStaffTable(staff) {
    const tbody = document.getElementById('staff-table-body');
    if (staff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-500">No staff members registered. Click <strong>+ Add Staff</strong> to register wardens and guards.</td></tr>`;
        return;
    }

    const roleBadges = {
        'HOSTEL_ADMIN': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">Chief Admin</span>',
        'WARDEN': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">Hostel Warden</span>',
        'SECURITY_GUARD': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">Gate Security</span>'
    };

    tbody.innerHTML = staff.map(s => {
        const time = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                <td class="py-3 px-4 font-bold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>${s.full_name}</span>
                </td>
                <td class="py-3 px-4">${roleBadges[s.role] || s.role}</td>
                <td class="py-3 px-4 text-slate-300 font-mono">${s.email}</td>
                <td class="py-3 px-4 text-slate-400">${s.phone || '—'}</td>
                <td class="py-3 px-4"><span class="text-emerald-400 font-semibold">${s.status}</span></td>
                <td class="py-3 px-4 text-slate-500 font-mono">${time}</td>
            </tr>
        `;
    }).join('');
}

async function loadParentsDirectory() {
    try {
        const res = await API.getParents();
        allParentsCache = res.parents || [];
        document.getElementById('count-badge-parents').textContent = allParentsCache.length;
        renderParentsTable(allParentsCache);
    } catch (err) {
        console.error('Error loading parents directory:', err);
    }
}

function renderParentsTable(parents) {
    const tbody = document.getElementById('parents-table-body');
    if (parents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-500">No parent accounts registered. Parent accounts are auto-created when resident students are registered.</td></tr>`;
        return;
    }

    tbody.innerHTML = parents.map(p => {
        return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                <td class="py-3 px-4 font-bold text-white">${p.parent_name}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">${p.relationship || 'Guardian'}</span></td>
                <td class="py-3 px-4 font-mono text-emerald-400">${p.parent_phone}</td>
                <td class="py-3 px-4 text-slate-400 font-mono">${p.parent_email}</td>
                <td class="py-3 px-4">
                    <span class="font-bold text-blue-400">${p.student_name}</span>
                    <span class="block text-[10px] text-slate-500 font-mono">${p.roll_number}</span>
                </td>
                <td class="py-3 px-4 text-slate-300">${p.room_number ? `Room ${p.room_number}` : '—'}</td>
            </tr>
        `;
    }).join('');
}

async function loadRoomsOccupancy() {
    try {
        const [roomsRes, floorsRes] = await Promise.all([
            API.getRooms(),
            API.getFloors()
        ]);
        allRoomsCache = roomsRes.rooms || [];
        allFloorsCache = floorsRes.floors || [];

        const countBadge = document.getElementById('count-badge-rooms');
        if (countBadge) countBadge.textContent = allRoomsCache.length;

        const summaryText = document.getElementById('rooms-summary-text');
        if (summaryText) {
            const totalCapacity = allRoomsCache.reduce((acc, r) => acc + (parseInt(r.capacity) || 0), 0);
            const totalOccupied = allRoomsCache.reduce((acc, r) => acc + (parseInt(r.current_occupancy) || 0), 0);
            summaryText.textContent = `${allRoomsCache.length} Rooms • ${totalOccupied}/${totalCapacity} Beds Filled (${Math.max(0, totalCapacity - totalOccupied)} Free)`;
        }

        renderFloorsList(allFloorsCache);
        renderRoomsGrid(allRoomsCache);
        populateRoomSelect(allRoomsCache);
    } catch (err) {
        console.error('Error loading rooms and floors occupancy:', err);
    }
}

function renderFloorsList(floors) {
    const container = document.getElementById('floors-list-container');
    const badge = document.getElementById('floors-summary-badge');
    if (badge) badge.textContent = `${floors.length} Physical Floor(s)`;
    if (!container) return;

    if (floors.length === 0) {
        container.innerHTML = `
            <div class="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center col-span-full">
                <p class="text-xs text-slate-400">No floors created yet. Click <strong class="text-teal-400">+ Add Floor</strong> above to configure your hostel levels.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = floors.map(f => {
        const roomCount = parseInt(f.room_count) || 0;
        return `
            <div class="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition">
                <div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs font-bold text-white">${f.floor_name || 'Floor ' + f.floor_number}</span>
                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-bold">Lvl ${f.floor_number}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 block mt-0.5">${f.block_name || 'Main Block'} • ${roomCount} Room(s)</span>
                </div>
                <div>
                    ${roomCount === 0 ? `
                        <button onclick="handleDeleteFloor(${f.id}, '${f.floor_name || 'Floor ' + f.floor_number}')" title="Delete Empty Floor" class="p-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white border border-red-800/60 text-xs transition">
                            🗑️
                        </button>
                    ` : `
                        <span class="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80 font-semibold">Active</span>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function renderRoomsGrid(rooms) {
    const container = document.getElementById('rooms-grid-container');
    if (!container) return;
    if (rooms.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-8 bg-slate-900/40 rounded-xl border border-slate-800">
            <p class="text-xs text-slate-400">No rooms configured yet. Click <strong class="text-blue-400">+ Add Room</strong> above to manually create rooms.</p>
        </div>`;
        return;
    }

    container.innerHTML = rooms.map(r => {
        const isFull = r.current_occupancy >= r.capacity;
        const available = r.capacity - r.current_occupancy;
        const colorClass = isFull 
            ? 'border-red-900/60 bg-red-950/20 text-red-400' 
            : 'border-emerald-900/60 bg-emerald-950/20 text-emerald-400';

        return `
            <div class="p-3 rounded-xl border ${colorClass} text-center space-y-1 relative group hover:shadow-lg transition">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] text-slate-400 truncate max-w-[80px]">${r.block_name || ''}</span>
                    ${r.current_occupancy === 0 ? `
                        <button onclick="handleDeleteRoom(${r.id}, '${r.room_number}')" title="Delete Room" class="text-[10px] text-slate-500 hover:text-red-400 p-0.5 transition">
                            🗑️
                        </button>
                    ` : `<span title="Occupied (${r.current_occupancy} students)" class="text-[10px] text-slate-500">🔒</span>`}
                </div>
                <span class="block text-sm font-black text-white">${r.room_number}</span>
                <span class="block text-[10px] text-slate-400">${r.floor_name || ('Floor ' + r.floor_number)}</span>
                <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${isFull ? 'bg-red-950 text-red-300' : 'bg-emerald-950 text-emerald-300'}">
                    ${r.current_occupancy} / ${r.capacity} Beds
                </div>
                <div class="text-[9px] text-slate-400">
                    ${available > 0 ? `<span class="text-emerald-400 font-semibold">${available} Vacant</span>` : '<span class="text-red-400 font-semibold">Full</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function populateRoomSelect(rooms) {
    const sel = document.getElementById('m-stu-room');
    if (!sel) return;
    const availableRooms = rooms.filter(r => r.current_occupancy < r.capacity);
    sel.innerHTML = `<option value="">-- Select Available Room (${availableRooms.length} available) --</option>` +
        availableRooms.map(r => `
            <option value="${r.id}">${r.room_number} (${r.block_name || 'Block'} - ${r.capacity - r.current_occupancy} bed(s) free)</option>
        `).join('');
}

// Dynamic filter configurations per tab
const directoryTabConfigs = {
    students: {
        placeholder: 'Search name, roll no, room, block...',
        options: [
            { value: '', label: 'All Status' },
            { value: 'IN_HOSTEL', label: 'In Hostel' },
            { value: 'OUTSIDE', label: 'Outside' }
        ]
    },
    staff: {
        placeholder: 'Search staff name, email, phone...',
        options: [
            { value: '', label: 'All Staff Roles' },
            { value: 'WARDEN', label: 'Hostel Wardens' },
            { value: 'SECURITY_GUARD', label: 'Security Guards' }
        ]
    },
    parents: {
        placeholder: 'Search parent or student name, phone...',
        options: [
            { value: '', label: 'All Guardians' },
            { value: 'FATHER', label: 'Father' },
            { value: 'MOTHER', label: 'Mother' },
            { value: 'LEGAL_GUARDIAN', label: 'Legal Guardian' }
        ]
    },
    rooms: {
        placeholder: 'Search room (e.g. 01-101), block...',
        options: [
            { value: '', label: 'All Rooms' },
            { value: 'AVAILABLE', label: 'Available Beds Only' },
            { value: 'FULL', label: 'Fully Occupied' }
        ]
    }
};

// Directory Tabs Switcher
function switchDirectoryTab(tab) {
    currentDirectoryTab = tab;
    const tabs = ['students', 'staff', 'parents', 'rooms'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const panel = document.getElementById(`dir-panel-${t}`);
        if (t === tab) {
            btn.className = 'px-4 py-2.5 rounded-t-xl text-xs font-bold text-blue-400 border-b-2 border-blue-500 bg-slate-800/60 flex items-center gap-2';
            panel.classList.remove('hidden');
        } else {
            btn.className = 'px-4 py-2.5 rounded-t-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-2';
            panel.classList.add('hidden');
        }
    });

    // Dynamically update search placeholder and status dropdown options
    const cfg = directoryTabConfigs[tab] || directoryTabConfigs.students;
    const searchInput = document.getElementById('dir-search');
    const filterSelect = document.getElementById('dir-status-filter');
    if (searchInput) searchInput.placeholder = cfg.placeholder;
    if (filterSelect) {
        filterSelect.innerHTML = cfg.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    }

    // Immediately trigger filtering for the selected tab
    filterDirectory();
}

// Live Filter Directory across all 4 tabs
function filterDirectory() {
    const q = (document.getElementById('dir-search').value || '').trim().toLowerCase();
    const st = document.getElementById('dir-status-filter').value;

    if (currentDirectoryTab === 'students') {
        const filtered = allStudentsCache.filter(s => {
            const matchQ = !q || 
                (s.full_name && s.full_name.toLowerCase().includes(q)) || 
                (s.roll_number && s.roll_number.toLowerCase().includes(q)) || 
                (s.room_number && s.room_number.toLowerCase().includes(q)) ||
                (s.email && s.email.toLowerCase().includes(q)) ||
                (s.block_name && s.block_name.toLowerCase().includes(q));
            const matchSt = !st || s.movement_status === st;
            return matchQ && matchSt;
        });
        renderStudentsTable(filtered);
    } else if (currentDirectoryTab === 'staff') {
        const filtered = allStaffCache.filter(s => {
            const matchQ = !q || 
                (s.full_name && s.full_name.toLowerCase().includes(q)) || 
                (s.email && s.email.toLowerCase().includes(q)) ||
                (s.phone && s.phone.toLowerCase().includes(q));
            const matchSt = !st || s.role === st;
            return matchQ && matchSt;
        });
        renderStaffTable(filtered);
    } else if (currentDirectoryTab === 'parents') {
        const filtered = allParentsCache.filter(p => {
            const matchQ = !q || 
                (p.parent_name && p.parent_name.toLowerCase().includes(q)) || 
                (p.student_name && p.student_name.toLowerCase().includes(q)) || 
                (p.roll_number && p.roll_number.toLowerCase().includes(q)) || 
                (p.parent_phone && p.parent_phone.toLowerCase().includes(q));
            const matchSt = !st || (p.relationship && p.relationship.toUpperCase() === st);
            return matchQ && matchSt;
        });
        renderParentsTable(filtered);
    } else if (currentDirectoryTab === 'rooms') {
        const filtered = allRoomsCache.filter(r => {
            const matchQ = !q || 
                (r.room_number && r.room_number.toLowerCase().includes(q)) || 
                (r.block_name && r.block_name.toLowerCase().includes(q));
            let matchSt = true;
            if (st === 'AVAILABLE') {
                matchSt = (r.capacity - r.current_occupancy) > 0;
            } else if (st === 'FULL') {
                matchSt = r.current_occupancy >= r.capacity;
            }
            return matchQ && matchSt;
        });
        renderRoomsGrid(filtered);
    }
}

// =========================================================================
// PENDING PASS APPROVAL QUEUE & ACTIONS
// =========================================================================

async function loadPendingPassesQueue() {
    const tbody = document.getElementById('admin-pending-passes-body');
    const badge = document.getElementById('badge-pending-count');
    try {
        const res = await API.getPassRequests({ status: 'PENDING' });
        pendingPassesCache = res.requests || [];
        if (badge) {
            badge.textContent = `${pendingPassesCache.length} Pending`;
            badge.className = pendingPassesCache.length > 0 
                ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800';
        }
        renderPendingPassesTable(pendingPassesCache);
    } catch (err) {
        console.error('Error loading pending passes:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-xs text-red-400">Failed to load pending requests.</td></tr>`;
    }
}

function renderPendingPassesTable(requests) {
    const tbody = document.getElementById('admin-pending-passes-body');
    if (!tbody) return;

    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-xs text-slate-500">
                    <span class="text-emerald-400 font-bold block mb-1">✓ Zero Pending Requests</span>
                    All movement passes have been reviewed. No student is waiting for approval.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = requests.map(r => {
        const passTypeBadge = r.pass_type === 'OUTPASS' 
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">STANDARD OUTPASS</span>`
            : r.pass_type === 'HOME_PASS'
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">HOME PASS</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800">EMERGENCY EXIT</span>`;

        const riskColor = r.risk_level === 'HIGH' 
            ? 'bg-red-950 text-red-400 border-red-800'
            : r.risk_level === 'MEDIUM'
                ? 'bg-amber-950 text-amber-400 border-amber-800'
                : 'bg-emerald-950 text-emerald-400 border-emerald-800';

        const fromStr = new Date(r.from_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const toStr = new Date(r.to_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                            ${(r.student_name || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <span class="font-bold text-white block">${r.student_name || 'Student'}</span>
                            <span class="text-[10px] font-mono text-slate-400">${r.roll_number || ''} • Room ${r.room_number || 'N/A'}</span>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4">${passTypeBadge}</td>
                <td class="py-3 px-4">
                    <span class="font-semibold text-slate-200 block">${r.destination}</span>
                    <span class="text-[11px] text-slate-400 truncate max-w-xs block">${r.reason}</span>
                </td>
                <td class="py-3 px-4 font-mono text-slate-300 whitespace-nowrap text-[11px]">
                    <div>${fromStr}</div>
                    <div class="text-slate-500">to ${toStr}</div>
                </td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${riskColor}">
                        Score: ${r.risk_score || 20}/100 (${r.risk_level || 'LOW'})
                    </span>
                </td>
                <td class="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    <button onclick="adminApprovePass(${r.id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition">
                        ✓ Approve
                    </button>
                    <button onclick="adminRejectPass(${r.id})" class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold rounded-xl border border-red-500/30 transition">
                        ✕ Reject
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function adminApprovePass(id) {
    try {
        const pass = pendingPassesCache.find(p => p.id === id);
        let overrideNotes = '';
        if (pass && pass.risk_level === 'HIGH') {
            overrideNotes = prompt(`This pass request is flagged as HIGH RISK (Score: ${pass.risk_score}/100).\nPlease enter administrator override justification:`, 'Approved by Chief Hostel Administrator.');
            if (overrideNotes === null) return;
        }

        const res = await API.approvePassRequest(id, overrideNotes);
        API.toast(`✓ Pass approved! Cryptographic QR code and return transit code issued to student.`, 'success');
        await Promise.all([
            loadPendingPassesQueue(),
            loadAdminDashboard()
        ]);
    } catch (err) {
        API.toast(err.message || 'Failed to approve pass.', 'error');
    }
}

async function adminRejectPass(id) {
    const reason = prompt('Please enter the reason for pass rejection:');
    if (!reason || !reason.trim()) return;

    try {
        await API.rejectPassRequest(id, reason.trim());
        API.toast('Pass request rejected.', 'info');
        await Promise.all([
            loadPendingPassesQueue(),
            loadAdminDashboard()
        ]);
    } catch (err) {
        API.toast(err.message || 'Failed to reject pass.', 'error');
    }
}

function scrollToApprovals() {
    const el = document.getElementById('section-approvals');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-indigo-500');
        setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
    }
}

// =========================================================================
// MODAL CONTROLLERS & FORM HANDLERS
// =========================================================================

function openAddStudentModal() {
    const modal = document.getElementById('modal-add-student');
    modal.querySelector('form')?.reset();
    loadRoomsOccupancy();
    modal.classList.remove('hidden');
}

function openAddStaffModal(defaultRole = 'WARDEN') {
    const modal = document.getElementById('modal-add-staff');
    modal.querySelector('form')?.reset();
    const radios = document.getElementsByName('staffRole');
    for (const r of radios) {
        r.checked = (r.value === defaultRole);
    }
    modal.classList.remove('hidden');
}

function openCsvModal() {
    const modal = document.getElementById('modal-import-csv');
    document.getElementById('csv-import-textarea').value = '';
    document.getElementById('csv-preview-badge').textContent = 'Ready to import.';
    modal.classList.remove('hidden');
}

function openHostelSettingsModal() {
    const modal = document.getElementById('modal-hostel-settings');
    if (!modal) return;
    modal.classList.remove('hidden');

    API.getHostel().then(res => {
        if (res && res.hostel) {
            const h = res.hostel;
            if (document.getElementById('edit-hostel-name')) document.getElementById('edit-hostel-name').value = h.name || '';
            if (document.getElementById('edit-institution-name')) document.getElementById('edit-institution-name').value = h.institution_name || '';
            if (document.getElementById('edit-hostel-type')) document.getElementById('edit-hostel-type').value = h.hostel_type || 'CO-ED';
            if (document.getElementById('edit-hostel-phone')) document.getElementById('edit-hostel-phone').value = h.contact_phone || '';
            if (document.getElementById('edit-hostel-email')) document.getElementById('edit-hostel-email').value = h.official_email || '';
            if (document.getElementById('edit-hostel-address')) document.getElementById('edit-hostel-address').value = h.address || '';
            if (document.getElementById('edit-hostel-city')) document.getElementById('edit-hostel-city').value = h.city || '';
            if (document.getElementById('edit-hostel-state')) document.getElementById('edit-hostel-state').value = h.state || '';
            if (document.getElementById('edit-hostel-pincode')) document.getElementById('edit-hostel-pincode').value = h.pincode || '';
            if (document.getElementById('edit-hostel-lat')) document.getElementById('edit-hostel-lat').value = h.latitude || 26.882690;
            if (document.getElementById('edit-hostel-lng')) document.getElementById('edit-hostel-lng').value = h.longitude || 81.058360;
            if (document.getElementById('edit-hostel-radius')) document.getElementById('edit-hostel-radius').value = h.geofence_radius_meters || 100;
        }
        if (res && Array.isArray(res.policies)) {
            const curfewP = res.policies.find(p => p.policy_code === 'CURFEW_RULES' || p.policy_code === 'GATE_RULES');
            if (curfewP && curfewP.policy_value) {
                const val = typeof curfewP.policy_value === 'string' ? JSON.parse(curfewP.policy_value) : curfewP.policy_value;
                if (val.boysGateClosing && document.getElementById('edit-boys-gate-closing')) {
                    document.getElementById('edit-boys-gate-closing').value = val.boysGateClosing;
                }
                if (val.girlsGateClosing && document.getElementById('edit-girls-gate-closing')) {
                    document.getElementById('edit-girls-gate-closing').value = val.girlsGateClosing;
                }
                if (val.curfewTime && document.getElementById('edit-gate-closing-time')) {
                    document.getElementById('edit-gate-closing-time').value = val.curfewTime;
                }
                if (val.graceMinutes !== undefined && document.getElementById('edit-grace-minutes')) {
                    document.getElementById('edit-grace-minutes').value = val.graceMinutes;
                }
            }
        }
    }).catch(err => {
        console.error('Error fetching hostel settings:', err);
    });
}

async function handleSaveHostelSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-hostel-settings');
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1">↻</span> Saving Changes...';

    const boysClosing = document.getElementById('edit-boys-gate-closing')?.value || '21:30';
    const girlsClosing = document.getElementById('edit-girls-gate-closing')?.value || '20:30';

    const payload = {
        name: document.getElementById('edit-hostel-name').value.trim(),
        institutionName: document.getElementById('edit-institution-name').value.trim(),
        hostelType: document.getElementById('edit-hostel-type').value,
        contactPhone: document.getElementById('edit-hostel-phone').value.trim(),
        officialEmail: document.getElementById('edit-hostel-email').value.trim(),
        address: document.getElementById('edit-hostel-address').value.trim(),
        city: document.getElementById('edit-hostel-city').value.trim(),
        state: document.getElementById('edit-hostel-state').value.trim(),
        pincode: document.getElementById('edit-hostel-pincode').value.trim(),
        latitude: parseFloat(document.getElementById('edit-hostel-lat').value) || 26.882690,
        longitude: parseFloat(document.getElementById('edit-hostel-lng').value) || 81.058360,
        geofenceRadiusMeters: parseInt(document.getElementById('edit-hostel-radius').value) || 100,
        boysGateClosing: boysClosing,
        girlsGateClosing: girlsClosing,
        gateClosingTime: boysClosing,
        graceMinutes: parseInt(document.getElementById('edit-grace-minutes').value) || 15
    };

    try {
        const res = await API.updateHostelSettings(payload);
        API.toast(res.message || 'Hostel settings updated successfully!', 'success');
        closeModals();
        await loadAdminDashboard();
    } catch (err) {
        API.toast(err.message || 'Failed to update hostel settings.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Configuration Changes';
    }
}

async function openAllocateRoomModal(studentId) {
    // Ensure student data is available
    const student = allStudentsCache.find(s => s.id === studentId);
    if (!student) {
        API.toast('Student record not found.', 'error');
        return;
    }

    const modal = document.getElementById('modal-allocate-room');
    if (!modal) return;

    document.getElementById('alloc-student-id').value = student.id;
    document.getElementById('alloc-student-info').textContent = `Allocating room for: ${student.full_name} (${student.roll_number})`;

    // Refresh rooms if cache is empty
    if (!allRoomsCache || allRoomsCache.length === 0) {
        await loadRoomsOccupancy();
    }

    const sel = document.getElementById('alloc-room-select');
    sel.innerHTML = '<option value="">-- Choose Available Room --</option>';

    const currentRoomId = student.room_id ? parseInt(student.room_id) : null;
    const availableRooms = allRoomsCache.filter(r => (parseInt(r.current_occupancy) < parseInt(r.capacity)) || (currentRoomId && r.id === currentRoomId));

    if (availableRooms.length === 0) {
        sel.innerHTML += '<option value="" disabled>No vacant rooms available in this hostel</option>';
    } else {
        availableRooms.forEach(r => {
            const isCurrent = (currentRoomId && r.id === currentRoomId);
            const freeBeds = Math.max(0, parseInt(r.capacity) - parseInt(r.current_occupancy) + (isCurrent ? 1 : 0));
            sel.innerHTML += `<option value="${r.id}" ${isCurrent ? 'selected' : ''}>Room ${r.room_number} (${r.block_name || 'Block'} • ${r.floor_name || 'Floor'} - ${freeBeds} bed(s) available)${isCurrent ? ' [CURRENT]' : ''}</option>`;
        });
    }

    modal.classList.remove('hidden');
}

async function handleAllocateRoomSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-alloc-room');
    btn.disabled = true;
    btn.textContent = 'Allocating Room...';

    const studentId = document.getElementById('alloc-student-id').value;
    const roomId = document.getElementById('alloc-room-select').value;

    try {
        const res = await API.allocateStudentRoom(studentId, roomId);
        API.toast(`✓ ${res.message || 'Room allocated successfully!'}`, 'success');
        closeModals();
        await loadRoomsOccupancy();
        await loadStudentsDirectory();
    } catch (err) {
        API.toast(err.message || 'Failed to allocate room.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Room Allocation →';
    }
}

function closeModals() {
    const ids = ['modal-allocate-room', 'modal-add-student', 'modal-add-staff', 'modal-import-csv', 'modal-hostel-settings', 'modal-add-floor', 'modal-add-room', 'modal-mess-slip'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}


// Floor and Room Manual Management Helpers
async function openAddFloorModal() {
    try {
        const res = await API.getBlocks();
        const blocks = res.blocks || [];
        allBlocksCache = blocks;
        const sel = document.getElementById('m-floor-block');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select Block --</option>' +
                blocks.map(b => `<option value="${b.id}">${b.block_name} (${b.block_code})</option>`).join('');
        }
        document.getElementById('m-floor-num').value = '';
        document.getElementById('m-floor-name').value = '';
        document.getElementById('modal-add-floor').classList.remove('hidden');
    } catch (err) {
        API.toast('Could not load hostel blocks: ' + err.message, 'error');
    }
}

async function handleCreateFloor(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-floor');
    btn.disabled = true;
    btn.textContent = 'Creating Floor...';

    const blockId = document.getElementById('m-floor-block').value;
    const floorNumber = document.getElementById('m-floor-num').value;
    const floorName = document.getElementById('m-floor-name').value;

    try {
        await API.addFloor({ blockId, floorNumber, floorName });
        API.toast(`✓ Floor level ${floorNumber} created successfully!`, 'success');
        closeModals();
        await loadRoomsOccupancy();
    } catch (err) {
        API.toast(err.message || 'Failed to create floor.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Floor Level →';
    }
}

async function openAddRoomModal() {
    try {
        const res = await API.getFloors();
        const floors = res.floors || [];
        allFloorsCache = floors;
        const sel = document.getElementById('m-room-floor');
        if (sel) {
            if (floors.length === 0) {
                API.toast('Please create at least one floor first before adding rooms.', 'info');
                openAddFloorModal();
                return;
            }
            sel.innerHTML = '<option value="">-- Select Floor --</option>' +
                floors.map(f => `<option value="${f.id}">${f.floor_name || 'Floor ' + f.floor_number} (${f.block_name || 'Block'})</option>`).join('');
        }
        document.getElementById('m-room-number').value = '';
        document.getElementById('m-room-capacity').value = '2';
        document.getElementById('modal-add-room').classList.remove('hidden');
    } catch (err) {
        API.toast('Could not load floors: ' + err.message, 'error');
    }
}

async function handleCreateRoom(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-room');
    btn.disabled = true;
    btn.textContent = 'Adding Room...';

    const floorId = document.getElementById('m-room-floor').value;
    const roomNumber = document.getElementById('m-room-number').value;
    const capacity = document.getElementById('m-room-capacity').value;

    try {
        await API.addRoom({ floorId, roomNumber, capacity });
        API.toast(`✓ Room ${roomNumber} added with capacity ${capacity}!`, 'success');
        closeModals();
        await loadRoomsOccupancy();
    } catch (err) {
        API.toast(err.message || 'Failed to add room.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Room to Floor →';
    }
}

async function handleDeleteRoom(id, roomNumber) {
    const confirmed = confirm(`Are you sure you want to delete Room ${roomNumber}?`);
    if (!confirmed) return;

    try {
        await API.deleteRoom(id);
        API.toast(`Room ${roomNumber} deleted successfully.`, 'success');
        await loadRoomsOccupancy();
    } catch (err) {
        API.toast(err.message || 'Could not delete room.', 'error');
    }
}

async function handleDeleteFloor(id, floorName) {
    const confirmed = confirm(`Are you sure you want to delete ${floorName}?`);
    if (!confirmed) return;

    try {
        await API.deleteFloor(id);
        API.toast(`Floor deleted successfully.`, 'success');
        await loadRoomsOccupancy();
    } catch (err) {
        API.toast(err.message || 'Could not delete floor.', 'error');
    }
}

// Food & Mess Management
async function loadMessHeadcount() {
    try {
        const res = await API.getMessHeadcount();
        if (!res) return;
        const summary = res.summary || res.data || {};
        const meals = summary.meals || summary.forecast || {};
        
        currentMessData = {
            totalStudents: summary.totalResidents ?? summary.totalStudents ?? 0,
            insideHostel: summary.inHostel ?? summary.insideHostel ?? 0,
            onHomePass: summary.onHomePass ?? 0,
            onDayPass: summary.onDayPass ?? 0,
            forecast: {
                breakfastPlates: meals.breakfast ?? meals.breakfastPlates ?? 0,
                lunchPlates: meals.lunch ?? meals.lunchPlates ?? 0,
                dinnerPlates: meals.dinner ?? meals.dinnerPlates ?? 0
            },
            estimatedSavings: {
                foodWeightSavedKg: meals.foodWeightSavedKg ?? ((summary.onHomePass || 0) * 1.2),
                financialSavedInr: meals.costSavedToday ?? meals.financialSavedInr ?? ((summary.onHomePass || 0) * 120)
            }
        };
        const data = currentMessData;

        const bf = document.getElementById('mess-bf-plates');
        const lunch = document.getElementById('mess-lunch-plates');
        const din = document.getElementById('mess-din-plates');
        const absent = document.getElementById('mess-absent-count');
        const saved = document.getElementById('mess-food-saved');
        const cost = document.getElementById('mess-cost-saved');
        const advice = document.getElementById('mess-advice-text');

        if (bf) bf.textContent = data.forecast.breakfastPlates;
        if (lunch) lunch.textContent = data.forecast.lunchPlates;
        if (din) din.textContent = data.forecast.dinnerPlates;
        if (absent) absent.textContent = data.onHomePass;
        if (saved) saved.textContent = data.estimatedSavings.foodWeightSavedKg.toFixed(1) + ' kg';
        if (cost) cost.textContent = '₹' + data.estimatedSavings.financialSavedInr;

        if (advice) {
            advice.textContent = `Today: ${data.insideHostel} resident(s) eating in hostel mess. ${data.onHomePass} student(s) away on home leave (meals deducted for zero food waste).`;
        }
    } catch (err) {
        console.error('Error loading mess headcount:', err);
    }
}

async function openMessSlipModal() {
    try {
        if (!currentMessData) {
            await loadMessHeadcount();
        }
        const mess = currentMessData || {
            totalStudents: 0,
            insideHostel: 0,
            onHomePass: 0,
            forecast: { breakfastPlates: 0, lunchPlates: 0, dinnerPlates: 0 }
        };

        // Fetch hostel details
        let hostelName = 'CAMPUS HOSTEL';
        let institutionName = 'INSTITUTION';
        try {
            const hRes = await API.getHostelProfile();
            if (hRes && hRes.hostel) {
                hostelName = hRes.hostel.hostel_name || hostelName;
                institutionName = hRes.hostel.institution_name || institutionName;
            }
        } catch (e) {}

        const now = new Date();
        const elH = document.getElementById('slip-hostel-name');
        const elI = document.getElementById('slip-institution-name');
        const elD = document.getElementById('slip-date');
        const elT = document.getElementById('slip-time');
        const elTot = document.getElementById('slip-total-residents');
        const elEat = document.getElementById('slip-present-eating');
        const elAbs = document.getElementById('slip-absent-home');

        if (elH) elH.textContent = hostelName;
        if (elI) elI.textContent = institutionName;
        if (elD) elD.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
        if (elT) elT.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (elTot) elTot.textContent = mess.totalStudents || 0;
        if (elEat) elEat.textContent = mess.insideHostel || 0;
        if (elAbs) elAbs.textContent = mess.onHomePass || 0;

        const deducted = mess.onHomePass || 0;
        const elBfD = document.getElementById('slip-bf-deduct');
        const elBfP = document.getElementById('slip-bf-plates');
        const elLuD = document.getElementById('slip-lunch-deduct');
        const elLuP = document.getElementById('slip-lunch-plates');
        const elDiD = document.getElementById('slip-din-deduct');
        const elDiP = document.getElementById('slip-din-plates');

        if (elBfD) elBfD.textContent = `-${deducted}`;
        if (elBfP) elBfP.textContent = mess.forecast?.breakfastPlates ?? 0;
        if (elLuD) elLuD.textContent = `-${deducted}`;
        if (elLuP) elLuP.textContent = mess.forecast?.lunchPlates ?? 0;
        if (elDiD) elDiD.textContent = `-${deducted}`;
        if (elDiP) elDiP.textContent = mess.forecast?.dinnerPlates ?? 0;

        document.getElementById('modal-mess-slip').classList.remove('hidden');
    } catch (err) {
        API.toast('Could not generate mess slip: ' + err.message, 'error');
    }
}

function printMessSlip() {
    window.print();
}

// Handle Student & Parent Registration
async function handleCreateStudent(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-stu');
    btn.disabled = true;
    btn.textContent = 'Registering Student & Creating Parent Account...';

    const payload = {
        fullName: document.getElementById('m-stu-name').value.trim(),
        rollNumber: document.getElementById('m-stu-roll').value.trim().toUpperCase(),
        email: document.getElementById('m-stu-email').value.trim(),
        password: document.getElementById('m-stu-pass').value,
        phone: document.getElementById('m-stu-phone').value.trim(),
        course: document.getElementById('m-stu-course').value.trim(),
        year: parseInt(document.getElementById('m-stu-year').value) || 1,
        roomId: document.getElementById('m-stu-room').value || null,
        guardianName: document.getElementById('m-guard-name').value.trim(),
        guardianPhone: document.getElementById('m-guard-phone').value.trim(),
        guardianEmail: document.getElementById('m-guard-email').value.trim(),
        relationship: document.getElementById('m-guard-rel').value
    };

    try {
        const res = await API.createStudent(payload);
        API.toast(`✓ Student ${payload.fullName} and Parent account registered successfully!`, 'success');
        closeModals();
        await loadAdminDashboard();
    } catch (err) {
        API.toast(err.message || 'Failed to register student.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Register Student & Create Parent Account →';
    }
}

// Handle Staff Registration
async function handleCreateStaff(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-staff');
    btn.disabled = true;
    btn.textContent = 'Creating Staff Account...';

    const selectedRole = Array.from(document.getElementsByName('staffRole')).find(r => r.checked)?.value || 'WARDEN';

    const payload = {
        fullName: document.getElementById('m-staff-name').value.trim(),
        email: document.getElementById('m-staff-email').value.trim(),
        password: document.getElementById('m-staff-pass').value,
        phone: document.getElementById('m-staff-phone').value.trim(),
        role: selectedRole
    };

    try {
        const res = await API.addStaff(payload);
        API.toast(`✓ ${res.message || 'Staff registered successfully!'}`, 'success');
        closeModals();
        await loadStaffDirectory();
    } catch (err) {
        API.toast(err.message || 'Failed to register staff.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Staff Account';
    }
}

// Handle CSV Bulk Import
function loadSampleCsvText() {
    document.getElementById('csv-import-textarea').value =
`full_name, roll_number, email, phone, course, branch, year`;
    document.getElementById('csv-preview-badge').textContent = 'Column headers inserted. Paste your institution data below the header row.';
}

async function submitCsvImport() {
    const text = document.getElementById('csv-import-textarea').value.trim();
    if (!text) return API.toast('Please enter or paste CSV records.', 'warning');

    const btn = document.getElementById('btn-submit-csv');
    btn.disabled = true;
    btn.textContent = 'Importing records...';

    try {
        const res = await API.importStudents({ csvData: text });
        API.toast(`✓ ${res.message || 'Students imported successfully!'}`, 'success');
        closeModals();
        await loadAdminDashboard();
    } catch (err) {
        API.toast(err.message || 'Failed to import CSV.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Parse & Import Roster →';
    }
}

async function viewStudentDetails(studentId) {
    try {
        const res = await API.getStudentById(studentId);
        const s = res.student;
        alert(`Resident Student Profile:\n\nName: ${s.full_name}\nRoll: ${s.roll_number}\nStatus: ${s.movement_status}\nRoom: ${s.room_number || 'None'}\nGuardian: ${s.guardian_name || 'N/A'} (${s.guardian_phone || 'N/A'})\nTotal Passes: ${res.passes?.length || 0}`);
    } catch (err) {
        API.toast('Could not fetch student details.', 'error');
    }
}

// =========================================================================
// CHARTS, ANOMALIES & AUDIT LOGS
// =========================================================================

async function renderAnalyticsCharts() {
    try {
        const res = await API.getMovementsAnalytics();
        const hourly = res.hourly || [];
        const passTypes = res.passTypes || [];

        const hours = Array.from({ length: 24 }, (_, i) => i);
        const exitData = new Array(24).fill(0);
        const entryData = new Array(24).fill(0);

        for (const h of hourly) {
            const hourIndex = parseInt(h.hour);
            if (hourIndex >= 0 && hourIndex < 24) {
                exitData[hourIndex] = parseInt(h.exits) || 0;
                entryData[hourIndex] = parseInt(h.entries) || 0;
            }
        }

        const labels = hours.map(h => {
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12} ${ampm}`;
        });

        const hourlyCtx = document.getElementById('hourly-movement-chart').getContext('2d');
        if (hourlyChartInstance) hourlyChartInstance.destroy();

        hourlyChartInstance = new Chart(hourlyCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Exits (Outbound)',
                        data: exitData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Entries (Inbound)',
                        data: entryData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
                }
            }
        });

        const passTypesCtx = document.getElementById('pass-types-chart').getContext('2d');
        if (passTypesChartInstance) passTypesChartInstance.destroy();

        const ptLabels = passTypes.map(p => p.pass_type.replace('_', ' '));
        const ptCounts = passTypes.map(p => parseInt(p.count));
        const hasData = ptCounts.length > 0 && ptCounts.some(c => c > 0);

        passTypesChartInstance = new Chart(passTypesCtx, {
            type: 'doughnut',
            data: {
                labels: hasData ? ptLabels : ['No Movement Passes Recorded'],
                datasets: [{
                    data: hasData ? ptCounts : [1],
                    backgroundColor: hasData ? ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6'] : ['#1e293b'],
                    borderColor: '#0f172a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } }
                }
            }
        });

    } catch (err) {
        console.error('Failed to render analytics charts:', err);
    }
}

async function renderAiInsights() {
    await Promise.all([
        renderOperationalScore(),
        renderPredictionsAndMess(),
        renderStaffingRecommendations(),
        renderGatesMatrix()
    ]);
}

async function renderOperationalScore() {
    try {
        const res = await API.getOperationalScore();
        if (!res || !res.success) return;

        const scoreEl = document.getElementById('op-score-num');
        const badgeEl = document.getElementById('op-grade-badge');
        if (scoreEl) scoreEl.textContent = res.operationalScore;

        if (badgeEl) {
            badgeEl.textContent = res.statusGrade.replace(/_/g, ' ');
            const gradeColors = {
                'OPTIMAL': 'bg-emerald-950 text-emerald-400 border-emerald-800',
                'ADEQUATE': 'bg-blue-950 text-blue-400 border-blue-800',
                'NEEDS_ATTENTION': 'bg-amber-950 text-amber-400 border-amber-800',
                'CRITICAL_ATTENTION': 'bg-red-950 text-red-400 border-red-800'
            };
            badgeEl.className = `px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${gradeColors[res.statusGrade] || 'bg-slate-800 text-slate-300'}`;
        }

        const c = res.components;
        if (c) {
            // Compliance
            const compScore = document.getElementById('op-comp-score');
            const compBar = document.getElementById('op-comp-bar');
            const compLabel = document.getElementById('op-comp-label');
            if (compScore) compScore.textContent = `${c.movementCompliance.score} / ${c.movementCompliance.max}`;
            if (compBar) compBar.style.width = `${(c.movementCompliance.score / c.movementCompliance.max) * 100}%`;
            if (compLabel) compLabel.textContent = `${c.movementCompliance.metricLabel} (${c.movementCompliance.overdueCount} overdue)`;

            // Gate Efficiency
            const gateScore = document.getElementById('op-gate-score');
            const gateBar = document.getElementById('op-gate-bar');
            const gateLabel = document.getElementById('op-gate-label');
            if (gateScore) gateScore.textContent = `${c.gateEfficiency.score} / ${c.gateEfficiency.max}`;
            if (gateBar) gateBar.style.width = `${(c.gateEfficiency.score / c.gateEfficiency.max) * 100}%`;
            if (gateLabel) gateLabel.textContent = `${c.gateEfficiency.metricLabel} (${c.gateEfficiency.failedAttempts} failed)`;

            // Anomaly Resolution
            const anomScore = document.getElementById('op-anom-score');
            const anomBar = document.getElementById('op-anom-bar');
            const anomLabel = document.getElementById('op-anom-label');
            if (anomScore) anomScore.textContent = `${c.anomalyResolution.score} / ${c.anomalyResolution.max}`;
            if (anomBar) anomBar.style.width = `${(c.anomalyResolution.score / c.anomalyResolution.max) * 100}%`;
            if (anomLabel) anomLabel.textContent = `${c.anomalyResolution.activeCount} Unresolved Patterns`;

            // Policy & Geofence
            const geoScore = document.getElementById('op-geo-score');
            const geoBar = document.getElementById('op-geo-bar');
            const geoLabel = document.getElementById('op-geo-label');
            if (geoScore) geoScore.textContent = `${c.policyAdherence.score} / ${c.policyAdherence.max}`;
            if (geoBar) geoBar.style.width = `${(c.policyAdherence.score / c.policyAdherence.max) * 100}%`;
            if (geoLabel) geoLabel.textContent = c.policyAdherence.metricLabel;
        }
    } catch (err) {
        console.warn('Error loading operational score:', err.message);
    }
}

async function renderPredictionsAndMess() {
    try {
        const res = await API.getPredictions();
        if (!res || !res.success) return;

        // Predictive Surge Forecaster
        const sf = res.surgeForecast;
        if (sf) {
            const exitEl = document.getElementById('pred-peak-exit');
            const returnEl = document.getElementById('pred-peak-return');
            const totalEl = document.getElementById('pred-transits-today');
            const gateEl = document.getElementById('pred-busiest-gate');

            if (exitEl) exitEl.textContent = sf.peakExitWindow;
            if (returnEl) returnEl.textContent = sf.peakReturnWindow;
            if (totalEl) totalEl.textContent = `${sf.predictedTodayTotalTransits} transits`;
            if (gateEl) gateEl.textContent = sf.busiestGate;
        }

        // Mess Food Resource Optimizer
        const mf = res.messForecasting;
        if (mf) {
            const adviceEl = document.getElementById('mess-advice-text');
            const absentEl = document.getElementById('mess-absent-count');
            const foodEl = document.getElementById('mess-food-saved');
            const costEl = document.getElementById('mess-cost-saved');

            if (adviceEl) adviceEl.textContent = mf.actionableAdvice;
            if (absentEl) absentEl.textContent = `${mf.expectedAbsentResidents} students`;
            if (foodEl) foodEl.textContent = mf.estimatedFoodWastePreventedKg;
            if (costEl) costEl.textContent = mf.estimatedFinancialSavingsInr;
        }
    } catch (err) {
        console.warn('Error loading predictive intelligence:', err.message);
    }
}

async function renderStaffingRecommendations() {
    const container = document.getElementById('ai-insights-container');
    if (!container) return;
    try {
        const res = await API.getResourceInsights();
        const recs = res.recommendations || [];

        if (recs.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500">Resource optimization models analyzing continuous movement...</p>`;
            return;
        }

        container.innerHTML = recs.map(r => {
            const badgeColors = {
                'HIGH': 'bg-red-950 text-red-400 border-red-800',
                'MEDIUM': 'bg-amber-950 text-amber-400 border-amber-800',
                'LOW': 'bg-blue-950 text-blue-400 border-blue-800'
            };

            return `
                <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 hover:border-emerald-500/40 transition">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-white flex items-center gap-1.5">
                            <span class="text-emerald-400 font-extrabold">⚡</span>
                            <span>${r.title}</span>
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColors[r.priority] || 'bg-slate-800 text-slate-300'}">
                            ${r.priority} PRIORITY
                        </span>
                    </div>
                    <p class="text-xs text-slate-300"><strong class="text-slate-400">Telemetry Insight:</strong> ${r.insight}</p>
                    <div class="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-xs text-emerald-300 font-medium">
                        <strong>Actionable Deployment:</strong> ${r.recommendation}
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-red-400">Failed to generate AI insights: ${err.message}</p>`;
    }
}

async function renderGatesMatrix() {
    const container = document.getElementById('gates-matrix-container');
    if (!container) return;
    try {
        const res = await API.getGatesAnalytics();
        const gates = res.gates || [];

        if (gates.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 col-span-full py-4 text-center">No gates configured.</p>`;
            return;
        }

        container.innerHTML = gates.map(g => {
            const total = parseInt(g.total_scans) || 0;
            const valid = parseInt(g.valid_scans) || 0;
            const successRate = total > 0 ? Math.round((valid / total) * 100) : 100;
            const isBusy = total >= 15;

            return `
                <div class="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 hover:border-blue-500/40 transition">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-white block truncate">${g.gate_name}</span>
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${isBusy ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-800 text-slate-400'}">
                            ${g.gate_code}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span class="text-[10px] text-slate-400 block">7-Day Transits</span>
                            <span class="font-bold font-mono text-white">${total} scans</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 block">Verification Rate</span>
                            <span class="font-bold font-mono ${successRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}">${successRate}%</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>Lane: <strong class="text-slate-300">${g.gate_type}</strong></span>
                        <span class="text-emerald-400 font-semibold">● ${g.status}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-red-400 col-span-full text-center">Failed to load gate load matrix.</p>`;
    }
}

async function renderAnomalies() {
    const tbody = document.getElementById('anomalies-table-body');
    try {
        const res = await API.getAnomalies();
        const anomalies = res.anomalies || [];

        if (anomalies.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-xs text-slate-500">Zero active behavioral anomalies detected.</td></tr>`;
            return;
        }

        tbody.innerHTML = anomalies.map(a => {
            const time = new Date(a.detected_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const sevColors = {
                'CRITICAL': 'bg-red-950 text-red-400 border-red-800 font-bold',
                'HIGH': 'bg-red-950/80 text-red-400 border-red-800/80',
                'MEDIUM': 'bg-amber-950 text-amber-400 border-amber-800',
                'LOW': 'bg-blue-950 text-blue-400 border-blue-800'
            };

            return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/30 transition text-xs">
                    <td class="py-3 px-4 font-mono text-slate-400">${time}</td>
                    <td class="py-3 px-4 font-semibold text-white">${a.anomaly_type.replace(/_/g, ' ')}</td>
                    <td class="py-3 px-4 text-slate-300">${a.student_name ? `${a.student_name} (${a.roll_number})` : 'Gate Level Event'}</td>
                    <td class="py-3 px-4 text-slate-300 max-w-xs">${a.description}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${sevColors[a.severity] || 'bg-slate-800 text-slate-400'}">
                            ${a.severity}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-xs text-red-400">Failed to load anomalies.</td></tr>`;
    }
}

async function renderAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    try {
        const res = await API.getAuditLogs({ limit: 15 });
        const logs = res.auditLogs || [];

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-xs text-slate-500">No audit records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const time = new Date(l.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
            return `
                <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                    <td class="py-2.5 px-3 font-mono text-slate-400">${time}</td>
                    <td class="py-2.5 px-3 font-semibold text-white">${l.actor_email}</td>
                    <td class="py-2.5 px-3 text-slate-400 text-[11px]">${l.actor_role}</td>
                    <td class="py-2.5 px-3 font-mono text-blue-400 font-bold">${l.action}</td>
                    <td class="py-2.5 px-3 text-slate-300">${l.target_type || '—'} (${l.target_id || '—'})</td>
                    <td class="py-2.5 px-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${l.result === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}">
                            ${l.result}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-xs text-red-400">Failed to load audit logs.</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.checkAuth(['HOSTEL_ADMIN'])) {
        Auth.renderUserHeader();
        switchDirectoryTab('students');
        loadAdminDashboard();
        // Polling interval
        setInterval(loadAdminDashboard, 6000);
    }
});
