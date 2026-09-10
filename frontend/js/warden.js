/**
 * NEXA-GUARD Warden Command Dashboard Logic
 */

let pendingRequestsData = [];
window.aiApprovedListCache = [];

async function loadWardenDashboard() {
    try {
        // 1. Fetch Analytics & Overview
        const overview = await API.getAnalyticsOverview();
        if (overview && overview.metrics) {
            const m = overview.metrics;
            document.getElementById('stat-total').textContent = m.totalStudents;
            document.getElementById('stat-inside').textContent = m.insideHostel;
            document.getElementById('stat-outside').textContent = m.outsideHostel;
            document.getElementById('stat-pending').textContent = m.pendingRequests;
            document.getElementById('stat-overdue').textContent = m.overduePasses;
            document.getElementById('stat-high-risk').textContent = m.highRiskRequests;
        }

        // 1b. Fetch AI Auto-Approved Routine Passes
        try {
            const pRes = await API.getPasses({ status: 'APPROVED' });
            const allAppr = pRes.passes || [];
            const aiApproved = allAppr.filter(p => p.override_notes && p.override_notes.includes('AI Autonomous'));
            window.aiApprovedListCache = aiApproved;
            const statAi = document.getElementById('stat-ai-approved');
            if (statAi) statAi.textContent = aiApproved.length;
            const btnAi = document.getElementById('btn-ai-count');
            if (btnAi) btnAi.textContent = aiApproved.length;
        } catch (e) {
            console.warn('AI passes cache fetch warning:', e.message);
        }

        // 2. Fetch Pending Requests (Triage Queue)
        await loadPendingRequests();

        // 3. Fetch Overdue Passes
        await loadOverdueList();

    } catch (err) {
        console.error('Error loading warden dashboard:', err);
        API.toast('Failed to load dashboard metrics.', 'error');
    }
}

async function loadPendingRequests() {
    const tbody = document.getElementById('pending-requests-body');
    try {
        const res = await API.getPassRequests({ status: 'PENDING' });
        pendingRequestsData = res.requests || [];

        if (pendingRequestsData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-500">🎉 No pending pass requests under review. All requests processed!</td></tr>`;
            return;
        }

        tbody.innerHTML = pendingRequestsData.map(r => {
            const fromDate = new Date(r.from_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const toDate = new Date(r.to_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            const isHighRisk = r.risk_level === 'HIGH' || r.pass_type === 'HOME_PASS' || r.pass_type === 'EMERGENCY_EXIT';
            const riskBg = isHighRisk ? 'bg-red-950/80 text-red-400 border-red-800/80' :
                           r.risk_level === 'MEDIUM' ? 'bg-amber-950/80 text-amber-400 border-amber-800/80' :
                           'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';

            const recColor = isHighRisk ? 'text-red-400' :
                             r.recommendation === 'WARDEN_REVIEW' ? 'text-amber-400' : 'text-emerald-400';

            const rowBorder = isHighRisk ? 'border-l-4 border-l-red-500 bg-red-950/10' : '';

            const reasonsHtml = Array.isArray(r.reasons) 
                ? r.reasons.map(reason => `<li class="text-[11px] text-slate-300">• ${reason}</li>`).join('')
                : `<li class="text-[11px] text-slate-300">• Standard compliance review.</li>`;

            return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/30 transition text-xs ${rowBorder}">
                    <td class="py-4 px-4">
                        <div class="font-bold text-white flex items-center gap-1.5">
                            <span>${r.student_name}</span>
                            ${isHighRisk ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-600 text-white uppercase">High Priority</span>' : ''}
                        </div>
                        <div class="text-[11px] text-slate-400 font-mono">${r.roll_number} • ${r.block_name || 'Block A'} (${r.room_number || '101'})</div>
                    </td>
                    <td class="py-4 px-4">
                        <span class="font-semibold text-white block">${r.pass_type}</span>
                        <span class="text-[11px] text-slate-400">${r.destination}</span>
                    </td>
                    <td class="py-4 px-4 text-slate-300">
                        <div>${fromDate}</div>
                        <div class="text-slate-500 text-[11px]">Return: ${toDate}</div>
                    </td>
                    <td class="py-4 px-4">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${riskBg}">
                            <span>Score: ${r.risk_score || 10}/100</span>
                        </div>
                        <div class="text-[10px] font-bold uppercase ${recColor} mt-1">${isHighRisk ? '🚨 REQUIRES WARDEN OVERRIDE' : (r.recommendation || 'WARDEN_REVIEW')}</div>
                    </td>
                    <td class="py-4 px-4 max-w-xs">
                        <ul class="space-y-0.5">${reasonsHtml}</ul>
                    </td>
                    <td class="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                        <button onclick="quickApprove(${r.id})" class="px-3 py-1.5 ${isHighRisk ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-bold rounded-lg transition shadow-sm">
                            ${isHighRisk ? '🛡️ Review & Override' : 'Approve'}
                        </button>
                        <button onclick="promptReject(${r.id})" class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-lg transition">
                            Reject
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-red-400">Failed to load pending requests.</td></tr>`;
    }
}

async function loadOverdueList() {
    const container = document.getElementById('overdue-list-container');
    try {
        const res = await API.getLateReturns();
        const lateReturns = res.lateReturns || [];

        if (lateReturns.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 py-3">Zero overdue students. All active passes on schedule!</p>`;
            return;
        }

        container.innerHTML = lateReturns.map(p => `
            <div class="p-3 bg-red-950/30 border border-red-800/40 rounded-xl flex items-center justify-between text-xs">
                <div>
                    <div class="font-bold text-white flex items-center gap-2">
                        <span>${p.student_name}</span>
                        <span class="text-red-400 font-mono text-[11px]">${p.roll_number}</span>
                    </div>
                    <div class="text-slate-400 text-[11px] mt-0.5">
                        ${p.block_name || 'Block A'} • Room ${p.room_number || 'N/A'} • Pass #${p.pass_number}
                    </div>
                    <div class="text-amber-400 text-[11px] font-semibold mt-1">
                        ⚠️ Overdue by ${p.delay_minutes || 30} minutes (Gate Entry Deadline Passed)
                    </div>
                </div>
                <div class="text-right">
                    <a href="tel:${p.student_phone}" class="inline-block px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium border border-slate-700">
                        📞 Call Student
                    </a>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-red-400">Failed to load overdue list.</p>`;
    }
}

async function quickApprove(id) {
    try {
        const pass = pendingRequestsData.find(p => p.id === id);
        let overrideNotes = '';
        const isHigh = pass && (pass.risk_level === 'HIGH' || pass.pass_type === 'HOME_PASS' || pass.pass_type === 'EMERGENCY_EXIT');
        if (isHigh) {
            overrideNotes = prompt(`🚨 HIGH-RISK / SPECIAL PASS VERIFICATION\n\nStudent: ${pass.student_name} (${pass.pass_type})\nRisk Score: ${pass.risk_score || 0}/100\n\nPlease confirm parent telephone verification & enter warden justification:`, 'Approved after telephone verification with guardian.');
            if (overrideNotes === null) return; // cancelled
        }

        await API.approvePassRequest(id, overrideNotes);
        API.toast('✓ Pass approved! Digital QR gate credentials dispatched to student.', 'success');
        await loadWardenDashboard();
    } catch (err) {
        API.toast(err.message || 'Could not approve pass request.', 'error');
    }
}

async function promptReject(id) {
    const reason = prompt('Please state the institutional reason for declining this request:', 'Gate closing deadline restrictions / Incomplete academic justification.');
    if (!reason) return;

    try {
        await API.rejectPassRequest(id, reason);
        API.toast('Pass request rejected.', 'info');
        await loadWardenDashboard();
    } catch (err) {
        API.toast(err.message || 'Could not reject pass request.', 'error');
    }
}

function renderAIFeedModal() {
    const container = document.getElementById('ai-feed-content');
    if (!container) return;
    const list = window.aiApprovedListCache || [];

    if (list.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center space-y-2">
                <span class="text-3xl">🤖</span>
                <p class="text-sm font-bold text-white">No AI Auto-Approved Passes Yet Today</p>
                <p class="text-xs text-slate-400 max-w-md mx-auto">When students submit routine low-risk day outpasses (score ≤ 30, clean record, gate compliant), the AI Engine auto-approves them instantly and records them here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(p => {
        const fromDate = new Date(p.valid_from).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const toDate = new Date(p.valid_until).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="p-3 bg-slate-950/80 border border-emerald-800/40 rounded-2xl flex items-center justify-between text-xs hover:border-emerald-500/50 transition">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white">${p.student_name}</span>
                        <span class="text-emerald-400 font-mono text-[11px]">${p.roll_number}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            🤖 AI Autonomous Approved
                        </span>
                    </div>
                    <div class="text-[11px] text-slate-400">
                        Pass #${p.pass_number} • ${p.pass_type} • Window: ${fromDate} - ${toDate}
                    </div>
                    <div class="text-[11px] text-slate-300 italic">
                        ${p.override_notes || 'Automated compliance check passed.'}
                    </div>
                </div>
                <div class="text-right">
                    <span class="px-2.5 py-1 bg-slate-800 text-slate-300 rounded font-mono text-[10px] font-bold border border-slate-700">
                        QR Token Generated
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// Student Directory Search
async function searchStudents() {
    const query = document.getElementById('search-query').value.trim();
    const resultsContainer = document.getElementById('search-results');

    if (!query) {
        resultsContainer.innerHTML = '';
        return;
    }

    try {
        const res = await API.getStudents({ search: query, limit: 10 });
        const students = res.students || [];

        if (students.length === 0) {
            resultsContainer.innerHTML = `<p class="text-xs text-slate-500 py-2">No students found matching '${query}'.</p>`;
            return;
        }

        resultsContainer.innerHTML = students.map(s => `
            <div class="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center justify-between text-xs">
                <div>
                    <span class="font-bold text-white block">${s.full_name} (${s.roll_number})</span>
                    <span class="text-slate-400 text-[11px]">${s.block_name || 'Block A'} Room ${s.room_number || 'N/A'} • ${s.course}</span>
                </div>
                <div class="text-right">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.movement_status === 'IN_HOSTEL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">
                        ${s.movement_status}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        resultsContainer.innerHTML = `<p class="text-xs text-red-400">Search error: ${err.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.checkAuth(['WARDEN', 'HOSTEL_ADMIN'])) {
        Auth.renderUserHeader();
        loadWardenDashboard();
        setInterval(loadWardenDashboard, 5000);

        document.getElementById('search-query').addEventListener('input', (e) => {
            clearTimeout(window.searchTimeout);
            window.searchTimeout = setTimeout(searchStudents, 300);
        });
    }
});
