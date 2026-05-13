/* ===== DATA & SUPABASE ===== */
const supabaseUrl = 'https://udqmlctpcprzoknkqowb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkcW1sY3RwY3Byem9rbmtxb3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzAxMjgsImV4cCI6MjA5NDEwNjEyOH0.AaRohmkuAysf6uhOZ0doCxmsIC5U7br1VQW3DNPcTQY';
let supabase;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
} catch (e) { console.error('Supabase init failed', e); }

const SK = { contracts: 'dash_contracts', tasks: 'dash_tasks', events: 'dash_events' };
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, d) => localStorage.setItem(k, JSON.stringify(d));

let contracts = load(SK.contracts);
let tasks = load(SK.tasks);
let events = load(SK.events);

async function dbUpsert(table, item) {
    if (!supabase) return;
    try { await supabase.from(table).upsert(item); } catch (e) { console.error('Supabase error:', e); }
}

async function dbDelete(table, id) {
    if (!supabase) return;
    try { await supabase.from(table).delete().eq('id', id); } catch (e) { console.error('Supabase error:', e); }
}

async function syncSupabase() {
    if (!supabase) return;
    try {
        const [resC, resT, resE] = await Promise.all([
            supabase.from('contracts').select('*'),
            supabase.from('tasks').select('*'),
            supabase.from('events').select('*')
        ]);
        
        if (resC.data && resC.data.length > 0) { contracts = resC.data; save(SK.contracts, contracts); }
        if (resT.data && resT.data.length > 0) { tasks = resT.data; save(SK.tasks, tasks); }
        if (resE.data && resE.data.length > 0) { events = resE.data; save(SK.events, events); }
        
        // Push local to Supabase if Supabase is empty (Migration)
        if ((!resC.data || resC.data.length === 0) && contracts.length > 0) { contracts.forEach(c => dbUpsert('contracts', c)); }
        if ((!resT.data || resT.data.length === 0) && tasks.length > 0) { tasks.forEach(t => dbUpsert('tasks', t)); }
        if ((!resE.data || resE.data.length === 0) && events.length > 0) { events.forEach(e => dbUpsert('events', e)); }

        if (currentView === 'overview') renderOverview();
        if (currentView === 'contracts') renderContracts();
        if (currentView === 'tasks') renderTasks();
        if (currentView === 'calendar') renderCalendar();
    } catch (e) { console.error('Supabase sync error:', e); }
}

/* ===== STATE ===== */
let currentView = 'overview';
let currentMonth = new Date();
let contractFilter = 'all';
let companyFilter = 'all';
let cFilterCompany = 'all';
let editingContractId = null;
let editingTaskId = null;
let editingEventId = null;
let formStatus = 'cashed';
let formCompany = 'nira';
let taskFormCompany = 'nira';
let eventFormCompany = 'nira';

/* ===== UTILS ===== */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const monthKey = d => { const dd = d instanceof Date ? d : new Date(d); return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}`; };
const monthLabel = d => { const dd = d instanceof Date ? d : new Date(d + '-01'); return dd.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

/* ===== NAV ===== */
document.querySelectorAll('.nav-btn').forEach(b => {
    const handleNav = (e) => {
        e.preventDefault();
        switchView(b.dataset.view);
    };
    b.addEventListener('click', handleNav);
    b.addEventListener('touchstart', (e) => {
        // Only trigger if it's a clean tap
        if (e.touches.length === 1) {
            // handleNav(e); // Removing to avoid double triggers if click also fires
        }
    }, { passive: true });
});

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        if (v.id === `view-${view}`) { v.classList.add('active'); v.style.animation = 'none'; v.offsetHeight; v.style.animation = ''; }
    });
    if (view === 'overview') renderOverview();
    if (view === 'contracts') renderContracts();
    if (view === 'tasks') renderTasks();
    if (view === 'calendar') renderCalendar();
}

/* ===== COMPANY SWITCHER (overview) ===== */
document.querySelectorAll('#company-switcher .company-chip').forEach(c => {
    c.addEventListener('click', () => {
        companyFilter = c.dataset.company;
        document.querySelectorAll('#company-switcher .company-chip').forEach(x => x.classList.toggle('active', x === c));
        // Update sidebar dot
        const dot = document.getElementById('sidebar-dot');
        if (companyFilter === 'nira') dot.style.background = 'var(--nira)';
        else if (companyFilter === 'magenty') dot.style.background = 'var(--magenty)';
        else dot.style.background = 'var(--accent)';
        renderOverview();
    });
});

/* ===== MONTH NAV ===== */
document.getElementById('prev-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderOverview(); });
document.getElementById('next-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderOverview(); });

/* ===== OVERVIEW ===== */
function renderOverview() {
    const mk = monthKey(currentMonth);
    document.getElementById('month-display').textContent = monthLabel(mk);

    let mc = contracts.filter(c => c.month === mk);
    if (companyFilter !== 'all') mc = mc.filter(c => c.company === companyFilter);
    const earned = mc.reduce((s, c) => s + c.amount, 0);
    animVal('hero-amount', earned);

    // Breakdown
    const allMonth = contracts.filter(c => c.month === mk);
    const niraTotal = allMonth.filter(c => c.company === 'nira').reduce((s, c) => s + c.amount, 0);
    const magentyTotal = allMonth.filter(c => c.company === 'magenty').reduce((s, c) => s + c.amount, 0);
    const maxB = Math.max(niraTotal, magentyTotal, 1);

    document.getElementById('breakdown-nira-amount').textContent = fmt(niraTotal);
    document.getElementById('breakdown-magenty-amount').textContent = fmt(magentyTotal);

    requestAnimationFrame(() => {
        document.getElementById('nira-fill').style.width = (niraTotal / maxB * 100) + '%';
        document.getElementById('magenty-fill').style.width = (magentyTotal / maxB * 100) + '%';
    });

    renderChart();
    renderRecent();
}

function animVal(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent.replace(/[^\d-]/g, '')) || 0;
    const dur = 600;
    const t0 = performance.now();
    const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(start + (target - start) * e));
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/* ===== CHART ===== */
function renderChart() {
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const pad = { top: 16, right: 12, bottom: 32, left: 48 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    const months = [];
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 5);
    for (let i = 0; i < 6; i++) {
        const mk = monthKey(d);
        let mc = contracts.filter(c => c.month === mk);
        if (companyFilter !== 'all') mc = mc.filter(c => c.company === companyFilter);
        months.push({
            label: d.toLocaleDateString('fr-FR', { month: 'short' }),
            earned: mc.reduce((s, c) => s + c.amount, 0),
        });
        d.setMonth(d.getMonth() + 1);
    }

    const maxVal = Math.max(...months.map(m => m.earned), 500);
    const barW = Math.min(cW / 6 * 0.45, 36);

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Y labels
    ctx.fillStyle = '#9d9db0';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH / 4) * i;
        const val = maxVal - (maxVal / 4) * i;
        ctx.fillText(val >= 1000 ? (val / 1000).toFixed(val >= 10000 ? 0 : 1) + 'k' : val.toFixed(0), pad.left - 8, y + 3);
    }

    // Bars
    months.forEach((m, i) => {
        const x = pad.left + (cW / 6) * i + (cW / 6 - barW) / 2;


        if (earnedH > 0) {
            ctx.beginPath();
            roundRect(ctx, x, pad.top + cH - earnedH, barW, earnedH, r);
            const g = ctx.createLinearGradient(0, pad.top + cH - earnedH, 0, pad.top + cH);
            g.addColorStop(0, '#22c55e');
            g.addColorStop(1, '#16a34a');
            ctx.fillStyle = g;
            ctx.fill();
        }

        ctx.fillStyle = '#9d9db0';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(m.label, x + barW / 2, H - pad.bottom + 16);
    });
}

function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h);
    ctx.lineTo(x, y+h);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
}

/* ===== RECENT ===== */
function renderRecent() {
    const list = document.getElementById('recent-contracts-list');
    let recent = [...contracts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    if (companyFilter !== 'all') recent = recent.filter(c => c.company === companyFilter);

    if (!recent.length) { list.innerHTML = '<div class="empty-state"><p>Aucun contrat</p></div>'; return; }

    list.innerHTML = recent.map(c => `
        <div class="recent-item">
            <div class="ri-left">
                <span class="ri-name">${esc(c.name)}</span>
                <span class="ri-company ${c.company}">${c.company}</span>
            </div>
            <span class="ri-amount">${fmt(c.amount)}</span>
        </div>
    `).join('');
}

document.getElementById('go-to-contracts').addEventListener('click', () => switchView('contracts'));

/* ===== CONTRACTS VIEW ===== */
// Company filters
document.querySelectorAll('.filter-chip[data-cfilter]').forEach(c => {
    c.addEventListener('click', () => {
        cFilterCompany = c.dataset.cfilter;
        document.querySelectorAll('.filter-chip[data-cfilter]').forEach(x => x.classList.toggle('active', x === c));
        renderContracts();
    });
});

function renderContracts() {
    let filtered = [...contracts];
    if (cFilterCompany !== 'all') filtered = filtered.filter(c => c.company === cFilterCompany);
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    const list = document.getElementById('contracts-list');
    const empty = document.getElementById('contracts-empty');

    if (!filtered.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        list.innerHTML = filtered.map((c, i) => `
            <div class="contract-item" style="animation-delay:${i*0.03}s">
                <div class="ci-left">
                    <span class="ci-name">${esc(c.name)}</span>
                    <span class="ci-company ${c.company}">${c.company}</span>
                    <span class="ci-meta">${monthLabel(c.month)}</span>
                </div>
                <span class="ci-amount">${fmt(c.amount)}</span>
                <div class="ci-actions">
                    <button class="ci-action" data-id="${c.id}" data-action="edit" title="Modifier">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="ci-action delete" data-id="${c.id}" data-action="delete" title="Supprimer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    list.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openEditContract(b.dataset.id)));
    list.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', () => {
        contracts = contracts.filter(x => x.id !== b.dataset.id);
        dbDelete('contracts', b.dataset.id);
        save(SK.contracts, contracts); renderContracts(); renderOverview(); toast('Supprimé');
    }));
}

/* ===== CONTRACT MODAL ===== */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('add-contract-btn').addEventListener('click', () => openNewContract());
document.getElementById('add-contract-empty-btn').addEventListener('click', () => openNewContract());

function openNewContract() {
    editingContractId = null;
    document.getElementById('contract-modal-title').textContent = 'Nouveau contrat';
    document.getElementById('contract-submit').textContent = 'Ajouter';
    document.getElementById('contract-form').reset();
    document.getElementById('contract-month').value = monthKey(currentMonth);
    setToggle('company-toggle', 'nira', 'company');
    formStatus = 'cashed';
    formCompany = 'nira';
    openModal('contract-modal');
}

function openEditContract(id) {
    const c = contracts.find(x => x.id === id);
    if (!c) return;
    editingContractId = id;
    document.getElementById('contract-modal-title').textContent = 'Modifier contrat';
    document.getElementById('contract-submit').textContent = 'Enregistrer';
    document.getElementById('contract-name').value = c.name;
    document.getElementById('contract-amount').value = c.amount;
    document.getElementById('contract-month').value = c.month;
    formStatus = c.status;
    formCompany = c.company || 'nira';
    setToggle('company-toggle', formCompany, 'company');
    openModal('contract-modal');
}

document.getElementById('contract-modal-close').addEventListener('click', () => closeModal('contract-modal'));
document.getElementById('contract-cancel').addEventListener('click', () => closeModal('contract-modal'));

// Toggle helpers
function setToggle(containerId, value, attr) {
    document.querySelectorAll(`#${containerId} .toggle-opt`).forEach(o => {
        o.classList.toggle('active', o.dataset[attr] === value);
    });
}


document.querySelectorAll('#company-toggle .toggle-opt').forEach(o => {
    o.addEventListener('click', () => { formCompany = o.dataset.company; setToggle('company-toggle', formCompany, 'company'); });
});

document.getElementById('contract-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('contract-name').value.trim();
    const amount = parseFloat(document.getElementById('contract-amount').value);
    const month = document.getElementById('contract-month').value;
    if (!name || isNaN(amount)) return;

    if (editingContractId) {
        const c = contracts.find(x => x.id === editingContractId);
        if (c) { c.name = name; c.amount = amount; c.month = month; c.status = formStatus; c.company = formCompany; dbUpsert('contracts', c); }
        toast('Modifié ✓');
    } else {
        const c = { id: uid(), name, amount, month, status: formStatus, company: formCompany, createdAt: Date.now() };
        contracts.push(c); dbUpsert('contracts', c);
        toast('Ajouté ✓');
    }

    save(SK.contracts, contracts);
    closeModal('contract-modal');
    renderContracts();
    renderOverview();
});

/* ===== TASKS ===== */
function renderTasks() {
    ['todo', 'doing', 'done'].forEach(status => {
        const list = document.getElementById(`list-${status}`);
        const items = tasks.filter(t => t.status === status).sort((a, b) => {
            const p = { high: 0, medium: 1, low: 2 };
            return p[a.priority] - p[b.priority];
        });

        document.getElementById(`count-${status}`).textContent = items.length;

        list.innerHTML = items.map((t, i) => `
            <div class="task-card" draggable="true" data-id="${t.id}" style="animation-delay:${i*0.03}s">
                <div class="tc-top">
                    <span class="tc-title">${esc(t.title)}</span>
                    <div class="tc-actions">
                        <button class="tc-action" data-id="${t.id}" data-action="edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="tc-action delete" data-id="${t.id}" data-action="delete">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="tc-footer">
                    <span class="prio-tag ${t.priority}">${t.priority === 'high' ? 'Haute' : t.priority === 'medium' ? 'Moy' : 'Basse'}</span>
                    <span class="tc-company ${t.company || 'nira'}">${t.company || 'nira'}</span>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openEditTask(b.dataset.id); }));
        list.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            tasks = tasks.filter(x => x.id !== b.dataset.id);
            dbDelete('tasks', b.dataset.id);
            save(SK.tasks, tasks); renderTasks(); toast('Supprimée');
        }));

        initDrag(list);
    });
}

/* ===== DRAG & DROP ===== */
let dragId = null;

function initDrag(list) {
    list.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', e => { dragId = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragId = null; document.querySelectorAll('.task-list').forEach(l => l.classList.remove('drag-over')); });
    });
    list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drag-over'); });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', e => {
        e.preventDefault();
        list.classList.remove('drag-over');
        if (!dragId) return;
        const t = tasks.find(x => x.id === dragId);
        if (t && t.status !== list.dataset.status) {
            t.status = list.dataset.status;
            dbUpsert('tasks', t);
            save(SK.tasks, tasks);
            renderTasks();
            toast(list.dataset.status === 'done' ? 'Terminée ✓' : 'Déplacée');
        }
    });
}

/* ===== TASK MODAL ===== */
document.getElementById('add-task-btn').addEventListener('click', () => {
    editingTaskId = null;
    document.getElementById('task-modal-title').textContent = 'Nouvelle tâche';
    document.getElementById('task-submit').textContent = 'Ajouter';
    document.getElementById('task-form').reset();
    document.getElementById('task-duedate').value = calSelectedDate || '';
    taskFormCompany = 'nira';
    setToggle('task-company-toggle', 'nira', 'company');
    openModal('task-modal');
});

document.getElementById('task-modal-close').addEventListener('click', () => closeModal('task-modal'));
document.getElementById('task-cancel').addEventListener('click', () => closeModal('task-modal'));

document.querySelectorAll('#task-company-toggle .toggle-opt').forEach(o => {
    o.addEventListener('click', () => { taskFormCompany = o.dataset.company; setToggle('task-company-toggle', taskFormCompany, 'company'); });
});

function openEditTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    editingTaskId = id;
    document.getElementById('task-modal-title').textContent = 'Modifier tâche';
    document.getElementById('task-submit').textContent = 'Enregistrer';
    document.getElementById('task-title').value = t.title;
    document.getElementById('task-priority').value = t.priority;
    document.getElementById('task-status-select').value = t.status;
    setToggle('task-company-toggle', taskFormCompany, 'company');
    openModal('task-modal');
}

document.getElementById('task-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const priority = document.getElementById('task-priority').value;
    const status = document.getElementById('task-status-select').value;
    if (editingTaskId) {
        const t = tasks.find(x => x.id === editingTaskId);
        if (t) { t.title = title; t.priority = priority; t.status = status; t.company = taskFormCompany; dbUpsert('tasks', t); }
        toast('Modifiée ✓');
    } else {
        const t = { id: uid(), title, priority, status, company: taskFormCompany, createdAt: Date.now() };
        tasks.push(t); dbUpsert('tasks', t);
        toast('Ajoutée ✓');
    }

    save(SK.tasks, tasks);
    closeModal('task-modal');
    renderTasks();
});

/* ===== CALENDAR ===== */
let calMonth = new Date();
let calSelectedDate = null;

document.getElementById('cal-prev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth()-1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth()+1); renderCalendar(); });
document.getElementById('day-panel-close').addEventListener('click', () => { calSelectedDate = null; document.getElementById('day-panel').style.display = 'none'; renderCalendarGrid(); });
document.getElementById('cal-add-event-btn').addEventListener('click', () => openNewEvent());
document.getElementById('day-panel-add').addEventListener('click', () => openNewEvent(calSelectedDate));

function openNewEvent(date = null) {
    editingEventId = null;
    document.getElementById('event-modal-title').textContent = 'Nouvel évènement';
    document.getElementById('event-submit').textContent = 'Ajouter';
    document.getElementById('event-form').reset();
    document.getElementById('event-date').value = date || calSelectedDate || '';
    eventFormCompany = 'nira';
    setToggle('event-company-toggle', 'nira', 'company');
    openModal('event-modal');
}

function openEditEvent(id) {
    const e = events.find(x => x.id === id);
    if (!e) return;
    editingEventId = id;
    document.getElementById('event-modal-title').textContent = 'Modifier évènement';
    document.getElementById('event-submit').textContent = 'Enregistrer';
    document.getElementById('event-title').value = e.title;
    document.getElementById('event-date').value = e.date;
    document.getElementById('event-time').value = e.time;
    eventFormCompany = e.company || 'nira';
    setToggle('event-company-toggle', eventFormCompany, 'company');
    openModal('event-modal');
}

document.getElementById('event-modal-close').addEventListener('click', () => closeModal('event-modal'));
document.getElementById('event-cancel').addEventListener('click', () => closeModal('event-modal'));

document.querySelectorAll('#event-company-toggle .toggle-opt').forEach(o => {
    o.addEventListener('click', () => { eventFormCompany = o.dataset.company; setToggle('event-company-toggle', eventFormCompany, 'company'); });
});

document.getElementById('event-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    if (!title || !date || !time) return;

    if (editingEventId) {
        const ev = events.find(x => x.id === editingEventId);
        if (ev) { ev.title = title; ev.date = date; ev.time = time; ev.company = eventFormCompany; dbUpsert('events', ev); }
        toast('Modifié ✓');
    } else {
        const ev = { id: uid(), title, date, time, company: eventFormCompany, createdAt: Date.now() };
        events.push(ev); dbUpsert('events', ev);
        toast('Ajouté ✓');
    }

    save(SK.events, events);
    closeModal('event-modal');
    renderCalendar();
});

function renderCalendar() {
    const ml = calMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    document.getElementById('cal-month-display').textContent = ml;
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const grid = document.getElementById('cal-grid');
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    let html = '';

    const prevLast = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
        const d = prevLast - i;
        html += `<div class="cal-day other-month"><span class="cal-day-num">${d}</span></div>`;
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === calSelectedDate;
        const dayEvents = events.filter(e => e.date === dateStr)
            .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

        let evHtml = '';
        const maxShow = 3;
        dayEvents.slice(0, maxShow).forEach(e => {
            const timeStr = e.time ? `<span class="cal-event-time">${e.time}</span>` : '';
            evHtml += `<div class="cal-event ${e.company || 'nira'}" data-id="${e.id}">${timeStr}<span class="cal-event-name">${esc(e.title)}</span></div>`;
        });
        if (dayEvents.length > maxShow) evHtml += `<div class="cal-more">+${dayEvents.length - maxShow}</div>`;

        const classes = ['cal-day'];
        if (isToday) classes.push('today');
        if (isSelected) classes.push('selected');

        html += `<div class="${classes.join(' ')}" data-date="${dateStr}">
            <span class="cal-day-num">${d}</span>
            <div class="cal-events">${evHtml}</div>
        </div>`;
    }

    const totalCells = startDow + lastDay.getDate();
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
        html += `<div class="cal-day other-month"><span class="cal-day-num">${d}</span></div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day:not(.other-month)').forEach(el => {
        el.addEventListener('click', () => {
            calSelectedDate = el.dataset.date;
            renderCalendarGrid();
            renderDayPanel();
        });
    });

    if (calSelectedDate) renderDayPanel();
}

function renderDayPanel() {
    const panel = document.getElementById('day-panel');
    const list = document.getElementById('day-panel-events');

    if (!calSelectedDate) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    const d = new Date(calSelectedDate + 'T00:00:00');
    document.getElementById('day-panel-title').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    const dayEvents = events.filter(e => e.date === calSelectedDate)
        .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    if (!dayEvents.length) {
        list.innerHTML = '<div class="day-empty">Rien de prévu</div>';
        return;
    }

    list.innerHTML = dayEvents.map(e => `
        <div class="day-task-item" style="cursor:pointer" data-id="${e.id}">
            <span class="day-task-time">${e.time}</span>
            <span class="day-task-title">${esc(e.title)}</span>
            <span class="day-task-company ${e.company || 'nira'}">${e.company || 'nira'}</span>
            <button class="ci-action delete" data-id="${e.id}" style="opacity:1; margin-left:auto">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');

    list.querySelectorAll('.day-task-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.delete')) {
                events = events.filter(x => x.id !== item.dataset.id);
                dbDelete('events', item.dataset.id);
                save(SK.events, events);
                renderCalendar();
                toast('Supprimé ✓');
                return;
            }
            openEditEvent(item.dataset.id);
        });
    });
}

/* ===== MODAL OVERLAY CLICK ===== */
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

/* ===== KEYBOARD ===== */
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); });

/* ===== RESIZE ===== */
window.addEventListener('resize', () => { if (currentView === 'overview') renderChart(); });

/* ===== ONE-TIME MIGRATION TOOL ===== */
function checkMigration() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#data=')) {
        try {
            const raw = atob(hash.replace('#data=', ''));
            const data = JSON.parse(raw);
            Object.keys(data).forEach(k => {
                if (k.startsWith('dash_')) localStorage.setItem(k, data[k]);
            });
            window.location.hash = '';
            alert('Migration réussie ! Tes données locales sont maintenant sur Vercel.');
            location.reload();
        } catch (e) { console.error('Migration failed', e); }
    }
}

/* ===== INIT ===== */
renderOverview();
syncSupabase();

// Wake up Safari mobile touch interactions
document.addEventListener('touchstart', () => {}, { passive: true });

// Fix for Safari 100vh / address bar issues
const fixVH = () => {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
};
window.addEventListener('resize', fixVH);
window.addEventListener('orientationchange', fixVH);
fixVH();
