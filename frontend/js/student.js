/**
 * NEXA-GUARD Student Portal Logic
 */

let currentLat = null;
let currentLng = null;

let currentStudentProfile = null;

async function loadStudentData() {
    try {
        let user = API.getUser();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        let studentId = user.studentId || user.student_id;
        if (!studentId && user.role === 'STUDENT') {
            const meRes = await API.request('/auth/me');
            if (meRes && meRes.user) {
                studentId = meRes.user.student_id || meRes.user.studentId;
                user.studentId = studentId;
                API.setUser(user);
            }
        }

        if (!studentId) {
            API.toast('No student profile found for this account.', 'error');
            return;
        }

        // 1. Fetch Profile & Status
        const profileRes = await API.getStudentById(studentId);
        if (profileRes && profileRes.student) {
            const s = profileRes.student;
            currentStudentProfile = s;

            document.getElementById('student-name').textContent = s.full_name;
            document.getElementById('student-roll').textContent = s.roll_number;
            document.getElementById('student-course').textContent = `${s.course} (${s.branch}) • Year ${s.year}`;

            // Dynamic avatar
            const avatarEl = document.getElementById('student-avatar');
            if (avatarEl && s.full_name) {
                avatarEl.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s.full_name)}`;
            }

            // Room number & block display
            const roomEl = document.getElementById('student-room');
            const blockBadge = document.getElementById('student-hostel-block');

            if (roomEl) {
                if (s.room_number) {
                    roomEl.textContent = s.room_number;
                    if (blockBadge) {
                        blockBadge.innerHTML = `<span>🏢</span> <span>${s.block_name || 'Hostel Block'}${s.floor_name ? ` • ${s.floor_name}` : ''}</span>`;
                    }
                } else {
                    roomEl.innerHTML = `<span class="text-amber-400 font-semibold text-[11px]">Pending</span>`;
                    if (blockBadge) {
                        blockBadge.innerHTML = `<span class="text-amber-400 text-[11px]">⚠️ Room Allocation Pending</span>`;
                    }
                }
            }

            const statusBadge = document.getElementById('student-status-badge');
            statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ';
            if (s.movement_status === 'IN_HOSTEL') {
                statusBadge.className += 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30';
                statusBadge.textContent = '● Inside Hostel';
            } else if (s.movement_status === 'OUTSIDE') {
                statusBadge.className += 'bg-amber-950/80 text-amber-400 border border-amber-500/30 animate-pulse';
                statusBadge.textContent = '▲ Outside Campus';
            } else {
                statusBadge.className += 'bg-red-950/80 text-red-400 border border-red-500/30';
                statusBadge.textContent = `● ${s.movement_status}`;
            }

            // Render Fines
            renderFines(profileRes.fines || []);
        }


        // 2. Fetch Active Pass
        await loadActivePass();

        // 3. Fetch Pass History
        await loadPassHistory();

    } catch (err) {
        console.error('Error loading student dashboard:', err);
        API.toast('Failed to load student data.', 'error');
    }
}

async function loadActivePass() {
    const container = document.getElementById('active-pass-container');
    try {
        const res = await API.getActivePass();
        if (res && res.activePass) {
            const p = res.activePass;
            const validUntil = new Date(p.valid_until).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
            });

            container.innerHTML = `
                <div class="bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div class="flex-1 space-y-3 text-left">
                            <div class="flex items-center gap-2">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${p.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-blue-950 text-blue-400 border border-blue-500/40'}">
                                    ${p.status}
                                </span>
                                <span class="text-xs font-mono text-slate-400">Pass #${p.pass_number}</span>
                            </div>

                            <h3 class="text-xl font-black text-white">${p.pass_type} — ${p.destination}</h3>
                            <p class="text-xs text-slate-300"><strong class="text-slate-400">Reason:</strong> ${p.reason}</p>
                            
                            <div class="flex items-center gap-4 text-xs pt-1">
                                <div>
                                    <span class="text-slate-500 block">Valid Until</span>
                                    <span class="font-semibold text-amber-400">${validUntil}</span>
                                </div>
                                <div class="border-l border-slate-800 pl-4">
                                    <span class="text-slate-500 block">Risk Evaluation</span>
                                    <span class="font-semibold ${p.risk_level === 'HIGH' ? 'text-red-400' : p.risk_level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}">${p.risk_score || 15}/100 (${p.risk_level || 'LOW'})</span>
                                </div>
                            </div>

                            <div class="pt-2">
                                <span class="text-slate-500 block text-[11px] mb-1">Gate Return Code (Backup)</span>
                                <span class="inline-block font-mono font-black text-2xl tracking-widest text-emerald-400 bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800 shadow-inner">
                                    ${p.return_code}
                                </span>
                            </div>
                        </div>

                        <!-- QR Code Display -->
                        <div class="flex flex-col items-center bg-white p-3 rounded-2xl shadow-xl flex-shrink-0">
                            <img src="${p.qrDataUrl}" alt="Gate QR Token" class="w-44 h-44 object-contain rounded-lg">
                            <span class="text-[10px] font-bold text-slate-900 tracking-wider uppercase mt-1">Scan at Gate Terminal</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center">
                    <div class="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3 text-xl">
                        🎫
                    </div>
                    <h4 class="text-sm font-bold text-slate-300">No Active Movement Pass</h4>
                    <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">You currently have no active or approved movement passes. Use the 'Apply for Pass' button to request exit permission.</p>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = '<p class="text-xs text-red-400">Failed to load active pass.</p>';
    }
}

async function loadPassHistory() {
    const tbody = document.getElementById('pass-history-body');
    try {
        const res = await API.getPassRequests();
        const requests = res.requests || [];

        if (requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-xs text-slate-500">No movement passes on record.</td></tr>`;
            return;
        }

        tbody.innerHTML = requests.map(r => {
            const fromDate = new Date(r.from_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const toDate = new Date(r.to_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            const statusColors = {
                'PENDING': 'bg-blue-950 text-blue-400 border border-blue-800',
                'APPROVED': 'bg-emerald-950 text-emerald-400 border border-emerald-800',
                'ACTIVE': 'bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse',
                'USED': 'bg-slate-800 text-slate-400 border border-slate-700',
                'REJECTED': 'bg-red-950 text-red-400 border border-red-800',
                'OVERDUE': 'bg-red-950 text-red-400 border border-red-800 font-bold',
                'CANCELLED': 'bg-slate-900 text-slate-500 border border-slate-800'
            };

            const riskColors = {
                'LOW': 'text-emerald-400',
                'MEDIUM': 'text-amber-400',
                'HIGH': 'text-red-400'
            };

            return `
                <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition text-xs">
                    <td class="py-3 px-4 font-mono font-medium text-slate-300">${r.request_number}</td>
                    <td class="py-3 px-4 font-semibold text-white">${r.pass_type}</td>
                    <td class="py-3 px-4 text-slate-300">${r.destination}</td>
                    <td class="py-3 px-4 text-slate-400">${fromDate} → ${toDate}</td>
                    <td class="py-3 px-4">
                        <span class="font-bold ${riskColors[r.risk_level] || 'text-slate-400'}">
                            ${r.risk_score ?? '—'}/100 (${r.risk_level || '—'})
                        </span>
                    </td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[r.status] || 'bg-slate-800 text-slate-400'}">
                            ${r.status}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-right">
                        ${r.status === 'PENDING' ? `
                            <button onclick="cancelPass(${r.id})" class="text-xs text-red-400 hover:text-red-300 font-medium">Cancel</button>
                        ` : '—'}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-xs text-red-400">Failed to load history.</td></tr>`;
    }
}

function renderFines(fines) {
    const finesList = document.getElementById('fines-list');
    if (!fines || fines.length === 0) {
        finesList.innerHTML = `<p class="text-xs text-slate-500">Zero active disciplinary fines. Clean compliance record!</p>`;
        return;
    }

    finesList.innerHTML = fines.map(f => `
        <div class="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex items-center justify-between text-xs">
            <div>
                <span class="font-bold text-white block">${f.reason}</span>
                <span class="text-slate-400 text-[11px]">Fine #${f.fine_number} • ${new Date(f.issued_at).toLocaleDateString()}</span>
            </div>
            <div class="text-right">
                <span class="font-bold text-amber-400 block">₹${parseFloat(f.amount).toFixed(2)}</span>
                <span class="text-[10px] font-bold uppercase ${f.status === 'PAID' ? 'text-emerald-400' : 'text-red-400'}">${f.status}</span>
            </div>
        </div>
    `).join('');
}

async function cancelPass(id) {
    if (!confirm('Are you sure you want to cancel this pending movement request?')) return;
    try {
        await API.cancelPassRequest(id);
        API.toast('Pass request cancelled.', 'info');
        await loadPassHistory();
        await loadActivePass();
    } catch (err) {
        API.toast(err.message || 'Could not cancel pass.', 'error');
    }
}

// Geolocation helper
function captureLocation() {
    const statusEl = document.getElementById('geo-status');
    if (!navigator.geolocation) {
        statusEl.textContent = 'Geolocation is not supported by your browser.';
        statusEl.className = 'text-[11px] text-amber-400';
        return;
    }

    statusEl.textContent = 'Capturing GPS coordinates...';
    statusEl.className = 'text-[11px] text-blue-400';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentLat = pos.coords.latitude;
            currentLng = pos.coords.longitude;
            statusEl.textContent = `GPS Verified (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`;
            statusEl.className = 'text-[11px] text-emerald-400 font-medium';
        },
        (err) => {
            // Default to campus entrance coordinates if GPS permission denied
            currentLat = 26.8467;
            currentLng = 80.9462;
            statusEl.textContent = 'Campus Coordinates Applied (GPS Fallback)';
            statusEl.className = 'text-[11px] text-slate-400 font-medium';
        },
        { timeout: 5000, enableHighAccuracy: true }
    );
}

// Modal handling
function setupPassModal() {
    const modal = document.getElementById('pass-modal');
    const openBtn = document.getElementById('open-pass-modal');
    const closeBtn = document.getElementById('close-pass-modal');
    const form = document.getElementById('pass-request-form');

    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        captureLocation();
        // Set default from/to time
        const now = new Date();
        now.setMinutes(now.getMinutes() + 15);
        document.getElementById('pass-from').value = now.toISOString().slice(0, 16);

        const returnTime = new Date(now.getTime() + 4 * 3600000); // 4 hours outpass
        document.getElementById('pass-to').value = returnTime.toISOString().slice(0, 16);
    });

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-pass-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Evaluating with AI...';

        try {
            const passType = document.getElementById('pass-type').value;
            const fromTime = new Date(document.getElementById('pass-from').value).toISOString();
            const toTime = new Date(document.getElementById('pass-to').value).toISOString();
            const destination = document.getElementById('pass-destination').value.trim();
            const reason = document.getElementById('pass-reason').value.trim();

            const res = await API.createPassRequest({
                passType,
                fromTime,
                toTime,
                destination,
                reason,
                requestLat: currentLat || 26.8467,
                requestLng: currentLng || 80.9462
            });

            API.toast(`Pass request submitted! AI Risk Score: ${res.riskAnalysis.riskScore}/100 (${res.riskAnalysis.riskLevel})`, 'success');
            modal.classList.add('hidden');
            form.reset();
            await loadStudentData();
        } catch (err) {
            API.toast(err.message || 'Failed to submit pass request.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Movement Request';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.checkAuth(['STUDENT'])) {
        Auth.renderUserHeader();
        loadStudentData();
        setupPassModal();

        // Live polling every 5 seconds for pass approval and transit updates
        setInterval(loadStudentData, 5000);
    }
});
