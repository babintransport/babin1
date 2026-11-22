/* Panou administrator – Pasul 2 (părțile 1 și 2): structură, Vehicule, Centru de alerte */
(() => {
  // ---------- Regulile semaforului (le poți modifica aici) ----------
  const RULES = {
    tuvRedDays: 14,          // TÜV: roșu dacă expiră în maximum 14 zile (sau a expirat)
    tuvYellowDays: 60,       // galben dacă expiră în maximum 60 de zile
    oilIntervalKm: 10000,    // interval între schimburile de ulei
    oilYellowKm: 1500,       // galben când mai sunt sub 1.500 km
    treadRedMm: 1.6,         // limita legală în Germania
    treadYellowSummerMm: 3,  // recomandare vară / all-season
    treadYellowWinterMm: 4   // recomandare iarnă
  };

  // Harta PAJ rămâne ascunsă până setezi ENABLE_MAP: true în config.js
  const MAP_ON = !!(window.APP_CONFIG && window.APP_CONFIG.ENABLE_MAP);

  const LEVEL = { red: 0, yellow: 1, green: 2, none: 3 };
  const DOT = { red: 'bg-signal-red', yellow: 'bg-signal-yellow', green: 'bg-signal-green', none: 'bg-slate-300' };
  const TIRE = { vara: 'Vară', iarna: 'Iarnă', 'all-season': 'All-season' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => Number(n).toLocaleString('de-DE');
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE');
  const daysUntil = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);

  // ---------- Calculul stării (semafor) ----------
  function tuvStatus(v) {
    if (!v.tuv_expiry_date) return { level: 'none', text: 'Dată necompletată' };
    const d = daysUntil(v.tuv_expiry_date);
    if (d < 0) return { level: 'red', text: `Expirat de ${-d} zile` };
    if (d <= RULES.tuvRedDays) return { level: 'red', text: `Expiră în ${d} zile` };
    if (d <= RULES.tuvYellowDays) return { level: 'yellow', text: `Expiră în ${d} zile (${fmtDate(v.tuv_expiry_date)})` };
    return { level: 'green', text: `Valabil până la ${fmtDate(v.tuv_expiry_date)}` };
  }

  function oilStatus(v) {
    if (v.last_oil_change_km == null || v.current_km == null) return { level: 'none', text: 'Km necompletați' };
    const left = RULES.oilIntervalKm - (v.current_km - v.last_oil_change_km);
    if (left <= 0) return { level: 'red', text: `Depășit cu ${nf(-left)} km` };
    if (left <= RULES.oilYellowKm) return { level: 'yellow', text: `Mai sunt ${nf(left)} km` };
    return { level: 'green', text: `Mai sunt ${nf(left)} km` };
  }

  function tireStatus(v) {
    if (v.tire_tread_depth == null) return { level: 'none', text: 'Profil necompletat' };
    const t = Number(v.tire_tread_depth);
    const yellow = v.tire_type === 'iarna' ? RULES.treadYellowWinterMm : RULES.treadYellowSummerMm;
    if (t <= RULES.treadRedMm) return { level: 'red', text: `${t} mm, la limita legală` };
    if (t < yellow) return { level: 'yellow', text: `${t} mm, de schimbat curând` };
    return { level: 'green', text: `${t} mm` };
  }

  function docStatus(v) {
    const all = v.docs || [];
    const list = all.filter((d) => d.expiry_date);
    if (!list.length) return { level: 'none', text: all.length ? 'Fără date de expirare' : 'Niciun document' };
    let w = null;
    list.forEach((d) => {
      const days = daysUntil(d.expiry_date);
      const level = days <= RULES.tuvRedDays ? 'red' : days <= RULES.tuvYellowDays ? 'yellow' : 'green';
      if (!w || LEVEL[level] < LEVEL[w.level] || (level === w.level && days < w.days)) w = { level, days, d };
    });
    const text = w.level === 'green'
      ? `${w.d.doc_type}: valabil până la ${fmtDate(w.d.expiry_date)}`
      : (w.days < 0 ? `${w.d.doc_type}: expirat de ${-w.days} zile` : `${w.d.doc_type}: expiră în ${w.days} zile`);
    return { level: w.level, text };
  }

  function svcStatus(v) {
    const list = (v.jobs || []).filter((j) => j.status === 'planned' && j.scheduled_date);
    if (!list.length) return { level: 'none', text: 'Nicio lucrare programată' };
    const j = list.slice().sort((x, y) => (x.scheduled_date < y.scheduled_date ? -1 : 1))[0];
    const days = daysUntil(j.scheduled_date);
    const level = days < 0 ? 'red' : days <= 14 ? 'yellow' : 'green';
    const text = days < 0 ? `${j.kind}: întârziat cu ${-days} zile` : `${j.kind}: în ${days} zile (${fmtDate(j.scheduled_date)})`;
    return { level, text };
  }

  function statusOf(v) {
    const tuv = tuvStatus(v), oil = oilStatus(v), tire = tireStatus(v), doc = docStatus(v), svc = svcStatus(v);
    const worst = [tuv, oil, tire, doc, svc].map((s) => s.level).sort((x, y) => LEVEL[x] - LEVEL[y])[0];
    return { tuv, oil, tire, doc, svc, worst };
  }

  const statusItem = (label, s) => `
    <div class="flex items-start gap-2 text-sm">
      <span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[s.level]}"></span>
      <div><div class="font-medium text-slate-800">${label}</div><div class="text-slate-500">${esc(s.text)}</div></div>
    </div>`;

  // ---------- Structura panoului ----------
  const ICONS = {
    dashboard: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    vehicles: '<path d="M1 6h13v10H1z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    alerts: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>',
    tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h9"/>',
    defects: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    fuel: '<path d="M12 3s7 7 7 12a7 7 0 01-14 0c0-5 7-12 7-12z"/>',
    drivers: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    chat: '<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.4A8 8 0 1121 12z"/>',
    map: '<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    euro: '<path d="M18 6a7 7 0 100 12M4 10h9M4 14h9"/>',
    finance: '<path d="M18 6a7 7 0 100 12M4 10h9M4 14h9"/>',
    service: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.3-.7-.7-2.3z"/>',
    trips: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h5a4 4 0 000-8h-2a4 4 0 010-8h5"/>',
    documents: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'
  };
  const svgIcon = (id, cls = 'w-5 h-5') =>
    `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  const NAV = [
    ['dashboard', 'Prezentare generală', 'Start'],
    ['vehicles', 'Flotă', 'Flotă'],
    ['trips', 'Curse', 'Curse'],
    ['documents', 'Documente', 'Documente'],
    ['service', 'Service', 'Service'],
    ['finance', 'Finanțe', 'Finanțe'],
    ['alerts', 'Centru de alerte', 'Alerte'],
    ['tasks', 'Task-uri', 'Task-uri'],
    ['defects', 'Defecțiuni', 'Defecțiuni'],
    ['fuel', 'Combustibil', 'Combustibil'],
    ['drivers', 'Istoric șoferi', 'Șoferi'],
    ['chat', 'Chat', 'Chat'],
    ...(MAP_ON ? [['map', 'Hartă live', 'Hartă']] : [])
  ];

  const navBtn = (id, label) =>
    `<button data-nav="${id}" class="nav-btn flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-slate-200 hover:bg-white/10">${svgIcon(id)}<span>${label}</span></button>`;
  const tabBtn = (id, label) =>
    `<button data-nav="${id}" class="tab-btn py-2 px-3 shrink-0 text-xs text-slate-500 flex flex-col items-center gap-0.5">${svgIcon(id)}<span>${label}</span></button>`;

  const shell = (email) => `
    <style>
      .nav-btn[aria-current="page"] { background: #16834A; color: #fff; font-weight: 600; }
      .tab-btn[aria-current="page"] { color: #16834A; font-weight: 600; box-shadow: inset 0 2px 0 #16834A; }
      .bar { transition: opacity .15s; } .bar:hover { opacity: .75; }
      @media print { aside, header, nav, button, select, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } }
    </style>
    <div class="min-h-full md:flex bg-surface">
      <aside class="hidden md:flex md:flex-col md:w-64 md:sticky md:top-0 md:h-screen bg-navy-900 text-white p-4 gap-5">
        <div class="px-2 pt-2"><img src="icons/logo-white.png" alt="Babin Transport" class="w-40 h-auto"></div>
        <nav class="flex flex-col gap-1 overflow-y-auto">${NAV.map(([id, label]) => navBtn(id, label)).join('')}</nav>
        <div class="mt-auto px-2 text-sm">
          <p class="italic text-signal-green font-medium">Mereu în mișcare!</p>
          <button data-logout class="mt-3 w-full bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2">Deconectare</button>
          <p class="mt-3 text-xs text-slate-400">v2.0</p>
        </div>
      </aside>

      <div class="flex-1 min-w-0">
        <header class="flex items-center justify-between gap-3 px-4 md:px-8 py-3 bg-white border-b border-slate-100">
          <img src="icons/logo-navy.png" alt="Babin Transport" class="h-8 w-auto md:hidden">
          <p class="hidden md:block text-sm text-muted capitalize">${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <div class="flex items-center gap-3">
            <button data-nav="alerts" class="relative p-2 rounded-full hover:bg-slate-100 text-navy-800" aria-label="Alerte">
              ${svgIcon('alerts', 'w-6 h-6')}
              <span id="bellCount" class="hidden absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-signal-red text-white text-[11px] font-semibold items-center justify-center"></span>
            </button>
            <div class="hidden sm:flex items-center gap-2">
              <span class="w-9 h-9 rounded-full bg-signal-green text-white font-semibold flex items-center justify-center">${esc(email.charAt(0).toUpperCase())}</span>
              <div class="leading-tight">
                <div class="text-sm font-medium text-ink max-w-[11rem] truncate">${esc(email)}</div>
                <div class="text-xs text-muted">Administrator</div>
              </div>
            </div>
            <button data-logout class="md:hidden text-sm border border-slate-300 rounded-lg px-3 py-1.5">Ieșire</button>
          </div>
        </header>
        <main id="adminView" class="p-4 md:p-8 pb-24 md:pb-8 max-w-6xl"></main>
      </div>

      <nav class="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex overflow-x-auto"
           style="padding-bottom:env(safe-area-inset-bottom,0px)">
        ${NAV.map(([id, , short]) => tabBtn(id, short)).join('')}
      </nav>
    </div>`;

  // ---------- Panoul ----------
  function mount({ sb, profile, root, onLogout }) {
    let vehicles = [], tasks = [], people = [], defects = [], fuel = [], drives = [], docs = [], trips = [], expenses = [], jobs = [];
    let view = 'dashboard';
    let fuelRange = 'all';
    let chatCleanup = null;
    let histVehicle = '', histDriver = '', lookup = { vid: '', t: '' };
    let docVehicle = '', docsError = '', tripsError = '', tripFilter = '';
    let finRange = 'month', finVehicle = '', finError = '', svcFilter = 'planned';
    let loading = true;
    let loadError = '';

    root.innerHTML = shell(profile.email);
    const $view = root.querySelector('#adminView');

    root.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => { view = b.dataset.nav; paint(); window.scrollTo(0, 0); }));
    root.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', () => {
      window.ChatNotifier.stop();
      onLogout();
    }));
    window.ChatNotifier.start({
      sb, profile, root,
      isViewingChat: () => view === 'chat',
      openChat: () => { view = 'chat'; paint(); }
    });

    function updateBell() {
      const n = vehicles.filter((v) => statusOf(v).worst === 'red').length + defects.filter((d) => d.status === 'new').length;
      const el = root.querySelector('#bellCount');
      if (el) { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n); el.classList.toggle('flex', !!n); }
    }

    async function reload() {
      loading = true; paint();
      const [v, t, u, d, f, h, dc, tp, ex, sj] = await Promise.all([
        sb.from('vehicles').select('*').order('plate_number'),
        sb.from('tasks').select('*').order('created_at', { ascending: false }),
        sb.from('users').select('id, email, role').order('email'),
        sb.from('defects').select('*').order('created_at', { ascending: false }),
        sb.from('fuel_logs').select('*').order('created_at', { ascending: false }).limit(2000),
        sb.from('driver_history').select('*').order('start_time', { ascending: false }).limit(2000),
        sb.from('vehicle_documents').select('*').order('expiry_date', { ascending: true }),
        sb.from('trips').select('*').order('scheduled_at', { ascending: false }).limit(1000),
        sb.from('expenses').select('*').order('expense_date', { ascending: false }).limit(2000),
        sb.from('service_jobs').select('*').order('scheduled_date', { ascending: true }).limit(2000)
      ]);
      loading = false;
      const err = v.error || t.error || u.error || d.error || f.error || h.error;
      loadError = err ? 'Nu am putut încărca datele: ' + err.message : '';
      vehicles = v.data || []; tasks = t.data || []; people = u.data || []; defects = d.data || []; fuel = f.data || []; drives = h.data || [];
      docsError = dc.error ? dc.error.message : '';
      docs = dc.error ? [] : (dc.data || []);
      tripsError = tp.error ? tp.error.message : '';
      trips = tp.error ? [] : (tp.data || []);
      finError = ex.error ? ex.error.message : (sj.error ? sj.error.message : '');
      expenses = ex.error ? [] : (ex.data || []);
      jobs = sj.error ? [] : (sj.data || []);
      vehicles.forEach((x) => { x.docs = docs.filter((y) => y.vehicle_id === x.id); x.jobs = jobs.filter((y) => y.vehicle_id === x.id); });
      updateBell();
      paint();
    }

    function paint() {
      if (chatCleanup) { chatCleanup(); chatCleanup = null; }
      root.querySelectorAll('[data-nav]').forEach((b) =>
        b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
      if (loading) { $view.innerHTML = '<p class="text-slate-500">Se încarcă…</p>'; return; }
      if (loadError) { $view.innerHTML = `<p class="rounded-lg bg-red-50 text-signal-red px-3 py-2">${esc(loadError)}</p>`; return; }
      if (view === 'dashboard') paintDashboard();
      else if (view === 'alerts') paintAlerts();
      else if (view === 'vehicles') paintVehicles();
      else if (view === 'tasks') paintTasks();
      else if (view === 'defects') paintDefects();
      else if (view === 'fuel') paintFuel();
      else if (view === 'chat') chatCleanup = window.ChatView.mount($view, { sb, profile, isAdmin: true });
      else if (view === 'drivers') paintHistory();
      else if (view === 'documents') paintDocs();
      else if (view === 'trips') paintTrips();
      else if (view === 'finance') paintFinance();
      else if (view === 'service') paintService();
      else chatCleanup = paintMap();
    }

    const emptyState = () => `
      <div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p class="text-slate-600">Nu ai niciun vehicul încă.</p>
        <button data-add class="mt-3 rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă primul vehicul</button>
      </div>`;

    // ----- Prezentare generală -----
    let dashMonths = 6;

    function paintDashboard() {
      const rows = vehicles.map((v) => ({ v, st: statusOf(v) }));
      const count = (lvl) => rows.filter((r) => r.st.worst === lvl).length;
      const urgent = count('red'), attention = count('yellow'), fine = count('green');
      const openTasks = tasks.filter((t) => t.status !== 'done').length;
      const openDefects = defects.filter((d) => d.status !== 'resolved').length;

      // combustibil pe luni (din alimentările reale)
      const mKey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
      const agg = {};
      fuel.forEach((l) => {
        const k = mKey(l.created_at);
        const o = agg[k] || (agg[k] = { liters: 0, cost: 0 });
        o.liters += Number(l.liters); o.cost += Number(l.total_price);
      });
      const aggAll = {};
      const addAll = (key, cost, liters) => { const o = aggAll[key] || (aggAll[key] = { liters: 0, cost: 0 }); o.cost += cost; o.liters += liters; };
      fuel.forEach((l) => addAll(mKey(l.created_at), Number(l.total_price), Number(l.liters)));
      expenses.forEach((x) => addAll(mKey(x.expense_date + 'T00:00:00'), Number(x.amount), 0));
      jobs.filter((j) => j.status === 'done' && j.cost != null).forEach((j) => addAll(mKey((j.done_date || j.scheduled_date) + 'T00:00:00'), Number(j.cost), 0));
      const now = new Date();
      const cur = agg[mKey(now)] || { liters: 0, cost: 0 };
      const prev = agg[mKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))] || { liters: 0, cost: 0 };
      const trend = (c, p) => {
        if (!(p > 0)) return '';
        const d = Math.round(((c - p) / p) * 100);
        return `<span class="${d > 0 ? 'text-signal-red' : 'text-signal-green'}">${d > 0 ? '↑' : '↓'} ${Math.abs(d)}% față de luna trecută</span>`;
      };

      const kpi = (icon, tone, value, label, sub) => `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-4">
          <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${tone}">${svgIcon(icon, 'w-6 h-6')}</div>
          <div class="min-w-0">
            <div class="text-2xl font-semibold text-ink leading-tight">${value}</div>
            <div class="text-sm text-muted">${label}</div>
            ${sub ? `<div class="text-xs mt-0.5">${sub}</div>` : ''}
          </div>
        </div>`;

      // vehicule după gravitatea alertei
      const worstText = (st) => {
        const hit = [['TÜV', st.tuv], ['Ulei', st.oil], ['Anvelope', st.tire], ['Documente', st.doc], ['Service', st.svc]].find(([, x]) => x.level === st.worst);
        return hit ? `${hit[0]}: ${hit[1].text}` : 'Fără date pentru alerte';
      };
      const fleetRows = [...rows].sort((a, b) => LEVEL[a.st.worst] - LEVEL[b.st.worst]).slice(0, 6);

      // avertizări
      const alerts = [];
      rows.forEach(({ v, st }) => [['TÜV', st.tuv], ['Ulei', st.oil], ['Anvelope', st.tire], ['Documente', st.doc], ['Service', st.svc]].forEach(([label, s]) => {
        if (s.level === 'red' || s.level === 'yellow') alerts.push({ level: s.level, title: `${label} · ${v.plate_number}`, text: s.text });
      }));
      defects.filter((d) => d.status === 'new').forEach((d) =>
        alerts.push({ level: 'red', title: `Defecțiune · ${plateOf(d.vehicle_id)}`, text: d.description }));
      alerts.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);

      // activitate recentă
      const ev = [];
      fuel.slice(0, 10).forEach((l) => ev.push({ t: l.created_at, text: `Alimentare ${plateOf(l.vehicle_id)}: ${n1(l.liters, 0)} L, ${eur(l.total_price)}` }));
      defects.slice(0, 10).forEach((d) => ev.push({ t: d.created_at, text: `Defecțiune raportată: ${plateOf(d.vehicle_id)}${d.category ? ' (' + d.category + ')' : ''}` }));
      tasks.slice(0, 10).forEach((t) => ev.push({ t: t.created_at, text: `Task nou: ${t.title}` }));
      trips.slice(0, 10).forEach((x) => ev.push({ t: x.created_at, text: `Cursă nouă: ${x.title}` }));
      drives.slice(0, 10).forEach((h) => ev.push({ t: h.start_time, text: `${emailOf(h.user_id)} a preluat ${plateOf(h.vehicle_id)}` }));
      ev.sort((x, y) => new Date(y.t) - new Date(x.t));
      const when = (d) => {
        const x = new Date(d);
        return x.toDateString() === now.toDateString()
          ? x.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      };

      // grafic: cost combustibil pe luni
      const months = [];
      for (let i = dashMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const o = aggAll[mKey(d)] || { liters: 0, cost: 0 };
        months.push({ label: d.toLocaleDateString('ro-RO', { month: 'short' }).replace('.', ''), cost: o.cost, liters: o.liters });
      }
      const chart = () => {
        const W = 560, H = 230, L = 52, R = 8, T = 12, B = 28;
        const max = Math.max(...months.map((m) => m.cost), 0);
        if (!max) return '<p class="text-sm text-muted py-10 text-center">Nu există alimentări în această perioadă.</p>';
        const mag = Math.pow(10, Math.floor(Math.log10(max / 4)));
        const step = Math.ceil(max / 4 / mag) * mag, top = step * 4;
        const iw = (W - L - R) / months.length, bw = Math.min(40, iw * 0.55);
        const y = (v) => T + (H - T - B) * (1 - v / top);
        let grid = '';
        for (let i = 0; i <= 4; i++) {
          const v = step * i;
          grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E5E9EF"/>` +
                  `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#718096">${nf(Math.round(v))} €</text>`;
        }
        const bars = months.map((m, i) => {
          const x = L + iw * i + (iw - bw) / 2;
          return `<g><rect class="bar" x="${x}" y="${y(m.cost)}" width="${bw}" height="${(H - T - B) * (m.cost / top)}" rx="4" fill="#16834A">` +
                 `<title>${esc(m.label)}: ${eur(m.cost)} · ${n1(m.liters, 0)} L combustibil</title></rect>` +
                 `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#718096">${esc(m.label)}</text></g>`;
        }).join('');
        return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Cheltuieli pe luni">${grid}${bars}</svg>`;
      };

      const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-5';
      const linkBtn = (go, label) => `<button data-go="${go}" class="text-sm text-signal-green font-medium hover:underline">${label} →</button>`;
      const pill = (lvl) => lvl === 'red'
        ? '<span class="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-signal-red">Urgent</span>'
        : '<span class="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-signal-yellow">Atenție</span>';

      $view.innerHTML = `
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 class="text-2xl md:text-3xl font-semibold text-navy-900">Bună ziua!</h1>
            <p class="text-muted">Iată situația flotei tale astăzi.</p>
          </div>
        </div>

        <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          ${kpi('vehicles', 'bg-blue-50 text-navy-800', rows.length, 'Vehicule în flotă', `<span class="text-muted">${fine} fără probleme</span>`)}
          ${kpi('alerts', 'bg-red-50 text-signal-red', urgent, 'Alerte urgente', `<span class="text-muted">${attention} de urmărit</span>`)}
          ${kpi('tasks', 'bg-green-50 text-signal-green', openTasks, 'Task-uri deschise', '')}
          ${kpi('defects', 'bg-amber-50 text-signal-yellow', openDefects, 'Defecțiuni nerezolvate', '')}
          ${kpi('fuel', 'bg-blue-50 text-navy-800', n1(cur.liters, 0) + ' L', 'Combustibil luna aceasta', trend(cur.liters, prev.liters))}
          ${kpi('euro', 'bg-green-50 text-signal-green', eur(cur.cost), 'Cost combustibil luna aceasta', trend(cur.cost, prev.cost))}
          ${kpi('trips', 'bg-green-50 text-signal-green', trips.filter((x) => x.status === 'in_progress').length, 'Curse în desfășurare', '')}
          ${kpi('trips', 'bg-blue-50 text-navy-800', trips.filter((x) => x.status === 'planned' || x.status === 'accepted').length, 'Curse planificate', '')}
        </div>

        <div class="mt-6 grid gap-4 lg:grid-cols-2">
          <section class="${card}">
            <div class="flex items-center justify-between mb-3"><h2 class="font-semibold text-navy-900">Flota mea</h2>${linkBtn('vehicles', 'Toate vehiculele')}</div>
            ${fleetRows.length ? fleetRows.map(({ v, st }) => `
              <div class="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-0">
                <span class="w-3 h-3 rounded-full shrink-0 ${DOT[st.worst]}"></span>
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-ink">${esc(v.plate_number)} <span class="text-muted font-normal">${esc(v.model || '')}</span></div>
                  <div class="text-sm text-muted truncate">${esc(worstText(st))}</div>
                </div>
                <div class="text-sm text-muted shrink-0">${v.current_km != null ? nf(v.current_km) + ' km' : ''}</div>
              </div>`).join('') : '<p class="text-sm text-muted py-6 text-center">Nu ai vehicule încă. Adaugă-le din pagina Flotă.</p>'}
          </section>

          <section class="${card}">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-semibold text-navy-900">Avertizări <span class="ml-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-signal-red">${alerts.length}</span></h2>
              ${linkBtn('alerts', 'Vezi toate')}
            </div>
            ${alerts.length ? alerts.slice(0, 6).map((x) => `
              <div class="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-0">
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-ink">${esc(x.title)}</div>
                  <div class="text-sm text-muted truncate">${esc(x.text)}</div>
                </div>
                ${pill(x.level)}
              </div>`).join('') : '<p class="text-sm text-muted py-6 text-center">Nicio avertizare. Totul este în regulă.</p>'}
          </section>

          <section class="${card}">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-semibold text-navy-900">Cheltuieli lunare</h2>
              <div class="flex gap-1 text-sm">
                ${[6, 12].map((n) => `<button data-months="${n}" class="px-3 py-1 rounded-full ${dashMonths === n ? 'bg-navy-900 text-white' : 'text-muted hover:bg-slate-100'}">${n} luni</button>`).join('')}
              </div>
            </div>
            ${chart()}
            <p class="mt-2 text-xs text-muted">Include combustibil, service efectuat și alte cheltuieli înregistrate. Detalii în pagina Finanțe.</p>
          </section>

          <section class="${card}">
            <div class="flex items-center justify-between mb-3"><h2 class="font-semibold text-navy-900">Ultimele activități</h2>${linkBtn('fuel', 'Combustibil')}</div>
            ${ev.length ? ev.slice(0, 8).map((x) => `
              <div class="flex items-start gap-3 py-2 text-sm">
                <span class="mt-1.5 w-2 h-2 rounded-full bg-signal-green shrink-0"></span>
                <span class="text-muted w-12 shrink-0">${when(x.t)}</span>
                <span class="text-ink break-words min-w-0">${esc(x.text)}</span>
              </div>`).join('') : '<p class="text-sm text-muted py-6 text-center">Nicio activitate încă.</p>'}
          </section>
        </div>`;

      $view.querySelectorAll('[data-go]').forEach((b) =>
        b.addEventListener('click', () => { view = b.dataset.go; paint(); window.scrollTo(0, 0); }));
      $view.querySelectorAll('[data-months]').forEach((b) =>
        b.addEventListener('click', () => { dashMonths = Number(b.dataset.months); paint(); }));
    }

    // ----- Centru de alerte -----
    function paintAlerts() {
      const rows = vehicles.map((v) => ({ v, st: statusOf(v) })).sort((a, b) => LEVEL[a.st.worst] - LEVEL[b.st.worst]);
      const count = (lvl) => rows.filter((r) => r.st.worst === lvl).length;
      const tile = (label, n, cls) => `
        <div class="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <span class="w-3.5 h-3.5 rounded-full ${cls}"></span>
          <div><div class="text-2xl font-semibold text-navy-900">${n}</div><div class="text-sm text-slate-500">${label}</div></div>
        </div>`;

      $view.innerHTML = `
        <h1 class="text-2xl font-semibold text-navy-900">Centru de alerte</h1>
        <p class="text-slate-500 mt-1">TÜV, schimb de ulei și anvelope, pentru fiecare vehicul.</p>
        <div class="mt-5 grid grid-cols-3 gap-3">
          ${tile('Urgent', count('red'), DOT.red)}${tile('Atenție', count('yellow'), DOT.yellow)}${tile('În regulă', count('green'), DOT.green)}
        </div>
        <div class="mt-5 space-y-3">
          ${rows.length ? rows.map(({ v, st }) => `
            <article class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-center gap-3">
                <span class="w-3 h-3 rounded-full ${DOT[st.worst]}"></span>
                <h2 class="font-semibold text-navy-900">${esc(v.plate_number)}</h2>
                <span class="text-slate-500 truncate">${esc(v.model || '')}</span>
              </div>
              <div class="mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">${statusItem('TÜV', st.tuv)}${statusItem('Ulei', st.oil)}${statusItem('Anvelope', st.tire)}${statusItem('Documente', st.doc)}${statusItem('Service', st.svc)}</div>
            </article>`).join('') : emptyState()}
        </div>`;
      bindAdd();
    }

    // ----- Vehicule -----
    function paintVehicles() {
      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-navy-900">Vehicule</h1>
          <button data-add class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă vehicul</button>
        </div>
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          ${vehicles.length ? vehicles.map((v) => {
            const st = statusOf(v);
            return `
            <article class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="font-semibold text-navy-900 text-lg">${esc(v.plate_number)}</h2>
                  <p class="text-slate-500 truncate">${esc(v.model || 'Model necompletat')}</p>
                </div>
                <div class="flex flex-wrap justify-end gap-2 shrink-0">
                  <button data-vdocs="${v.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Documente (${(v.docs || []).length})</button>
                  <button data-edit="${v.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                  <button data-del="${v.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
                </div>
              </div>
              <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
                <dt>Kilometraj</dt><dd>${v.current_km != null ? nf(v.current_km) + ' km' : '–'}</dd>
                <dt>Anvelope</dt><dd>${esc(TIRE[v.tire_type] || '–')}</dd>
                <dt>Dispozitiv PAJ</dt><dd class="truncate">${esc(v.paj_device_id || '–')}</dd>
              </dl>
              <div class="mt-3 pt-3 border-t border-slate-100 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                ${statusItem('TÜV', st.tuv)}${statusItem('Ulei', st.oil)}${statusItem('Anvelope', st.tire)}${statusItem('Documente', st.doc)}${statusItem('Service', st.svc)}
              </div>
            </article>`;
          }).join('') : emptyState()}
        </div>`;
      bindAdd();
      $view.querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => openForm(vehicles.find((v) => v.id === b.dataset.edit))));
      $view.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', () => removeVehicle(vehicles.find((v) => v.id === b.dataset.del))));
      $view.querySelectorAll('[data-vdocs]').forEach((b) =>
        b.addEventListener('click', () => { docVehicle = b.dataset.vdocs; view = 'documents'; paint(); window.scrollTo(0, 0); }));
    }

    function bindAdd() {
      $view.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openForm(null)));
    }

    async function removeVehicle(v) {
      if (!v) return;
      const ok = confirm(`Ștergi vehiculul ${v.plate_number}?\nSe șterg și alimentările, defecțiunile și istoricul lui. Acțiunea nu poate fi anulată.`);
      if (!ok) return;
      const { error } = await sb.from('vehicles').delete().eq('id', v.id);
      if (error) return alert('Nu am putut șterge: ' + error.message);
      reload();
    }

    // ----- Formular adăugare / editare -----
    function openForm(v) {
      const val = (k) => (v && v[k] != null ? esc(v[k]) : '');
      const input = (name, label, type = 'text', extra = '') => `
        <label class="block">
          <span class="block text-sm font-medium mb-1">${label}</span>
          <input name="${name}" type="${type}" value="${val(name)}" ${extra}
                 class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">
        </label>`;

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${v ? 'Editează vehiculul' : 'Vehicul nou'}</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            ${input('plate_number', 'Număr de înmatriculare', 'text', 'required autocapitalize="characters"')}
            ${input('model', 'Model')}
            ${input('tuv_expiry_date', 'TÜV valabil până la', 'date')}
            ${input('paj_device_id', 'ID dispozitiv PAJ')}
            ${input('current_km', 'Kilometraj actual', 'number', 'min="0" inputmode="numeric"')}
            ${input('last_oil_change_km', 'Km la ultima schimbare de ulei', 'number', 'min="0" inputmode="numeric"')}
            <label class="block">
              <span class="block text-sm font-medium mb-1">Tip anvelope</span>
              <select name="tire_type" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                <option value="">–</option>
                ${Object.entries(TIRE).map(([k, t]) => `<option value="${k}" ${v && v.tire_type === k ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            ${input('tire_tread_depth', 'Adâncime profil (mm)', 'number', 'min="0" max="20" step="0.1" inputmode="decimal"')}
            ${input('tire_change_date', 'Data montării anvelopelor', 'date')}
          </div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);

      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      form.plate_number.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const f = new FormData(form);
        const text = (k) => (f.get(k) || '').toString().trim() || null;
        const num = (k) => (f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)));

        const payload = {
          plate_number: (text('plate_number') || '').toUpperCase(),
          model: text('model'),
          tuv_expiry_date: text('tuv_expiry_date'),
          paj_device_id: text('paj_device_id'),
          current_km: num('current_km'),
          last_oil_change_km: num('last_oil_change_km'),
          tire_type: text('tire_type'),
          tire_tread_depth: num('tire_tread_depth'),
          tire_change_date: text('tire_change_date')
        };

        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
        if (!payload.plate_number) return fail('Completează numărul de înmatriculare.');
        if (payload.current_km != null && payload.last_oil_change_km != null && payload.last_oil_change_km > payload.current_km)
          return fail('Kilometrajul de la schimbul de ulei nu poate fi mai mare decât kilometrajul actual.');

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const { error } = v
          ? await sb.from('vehicles').update(payload).eq('id', v.id)
          : await sb.from('vehicles').insert(payload);
        btn.disabled = false;

        if (error) return fail(error.code === '23505' ? 'Există deja un vehicul cu acest număr.' : 'Nu am putut salva: ' + error.message);
        close();
        reload();
      });
    }

    // ----- Task-uri -----
    const T_STATUS = { open: 'De făcut', in_progress: 'În lucru', done: 'Finalizat' };
    const T_DOT = { open: 'bg-slate-400', in_progress: DOT.yellow, done: DOT.green };
    const who = (id) => (people.find((p) => p.id === id) || {}).email || 'Neatribuit';
    const statusOptions = (cur) => Object.entries(T_STATUS)
      .map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');

    function paintTasks() {
      const col = (st) => {
        const items = tasks.filter((t) => t.status === st);
        return `
          <section>
            <h2 class="flex items-center gap-2 font-semibold text-navy-900 mb-3">
              <span class="w-3 h-3 rounded-full ${T_DOT[st]}"></span>${T_STATUS[st]}
              <span class="text-slate-400 font-normal">${items.length}</span>
            </h2>
            <div class="space-y-3">
              ${items.map((t) => `
                <article class="bg-white rounded-xl border border-slate-200 p-3">
                  <p class="font-medium text-slate-800 break-words">${esc(t.title)}</p>
                  <p class="text-sm text-slate-500 mt-0.5 truncate">${esc(who(t.assigned_to))}</p>
                  <div class="mt-3 flex items-center gap-2">
                    <select data-tstatus="${t.id}" class="field flex-1 min-w-0 text-sm rounded-lg border border-slate-300 px-2 py-1.5 bg-white">${statusOptions(t.status)}</select>
                    <button data-tedit="${t.id}" class="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                    <button data-tdel="${t.id}" class="text-sm px-2.5 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
                  </div>
                </article>`).join('') || '<p class="text-sm text-slate-400">Niciun task.</p>'}
            </div>
          </section>`;
      };

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-navy-900">Task-uri</h1>
          <button data-tadd class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă task</button>
        </div>
        <div class="mt-5 grid gap-6 md:grid-cols-3">${col('open')}${col('in_progress')}${col('done')}</div>`;

      $view.querySelector('[data-tadd]').addEventListener('click', () => openTaskForm(null));
      $view.querySelectorAll('[data-tedit]').forEach((b) =>
        b.addEventListener('click', () => openTaskForm(tasks.find((t) => t.id === b.dataset.tedit))));
      $view.querySelectorAll('[data-tdel]').forEach((b) =>
        b.addEventListener('click', async () => {
          const t = tasks.find((x) => x.id === b.dataset.tdel);
          if (!t || !confirm(`Ștergi task-ul „${t.title}"?`)) return;
          const { error } = await sb.from('tasks').delete().eq('id', t.id);
          if (error) return alert('Nu am putut șterge: ' + error.message);
          reload();
        }));
      $view.querySelectorAll('[data-tstatus]').forEach((sel) =>
        sel.addEventListener('change', async () => {
          const t = tasks.find((x) => x.id === sel.dataset.tstatus);
          const { error } = await sb.from('tasks').update({ status: sel.value }).eq('id', sel.dataset.tstatus);
          if (error) alert('Nu am putut schimba starea: ' + error.message);
          else if (t) t.status = sel.value;
          paint();
        }));
    }

    function openTaskForm(t) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${t ? 'Editează task-ul' : 'Task nou'}</h2>
          <div class="mt-4 space-y-4">
            <label class="block">
              <span class="block text-sm font-medium mb-1">Ce trebuie făcut</span>
              <textarea name="title" rows="3" required class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">${t ? esc(t.title) : ''}</textarea>
            </label>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Atribuit lui</span>
              <select name="assigned_to" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                <option value="">Neatribuit</option>
                ${people.map((p) => `<option value="${p.id}" ${t && t.assigned_to === p.id ? 'selected' : ''}>${esc(p.email)}${p.role === 'admin' ? ' (admin)' : ''}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Stare</span>
              <select name="status" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${statusOptions(t ? t.status : 'open')}</select>
            </label>
          </div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);

      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      form.title.focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const payload = {
          title: form.title.value.trim(),
          assigned_to: form.assigned_to.value || null,
          status: form.status.value
        };
        if (!payload.title) { err.textContent = 'Scrie ce trebuie făcut.'; err.classList.remove('hidden'); return; }

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const { error } = t
          ? await sb.from('tasks').update(payload).eq('id', t.id)
          : await sb.from('tasks').insert(payload);
        btn.disabled = false;
        if (error) { err.textContent = 'Nu am putut salva: ' + error.message; err.classList.remove('hidden'); return; }
        close();
        reload();
      });
    }

    // ----- Defecțiuni (Mängelmelder) -----
    const D_STATUS = { new: 'Nou', in_progress: 'În lucru', resolved: 'Rezolvat' };
    const D_DOT = { new: DOT.red, in_progress: DOT.yellow, resolved: DOT.green };
    const D_ORDER = { new: 0, in_progress: 1, resolved: 2 };
    const plateOf = (id) => (vehicles.find((x) => x.id === id) || {}).plate_number || '–';
    const emailOf = (id) => (people.find((p) => p.id === id) || {}).email || 'necunoscut';
    const fmtTs = (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Afișează o poză privată din Storage, într-o fereastră peste pagină
    function showPhoto(bucket, path) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="relative max-w-3xl w-full">
          <button data-close class="absolute -top-11 right-0 text-white text-sm bg-white/15 rounded-lg px-3 py-1.5">Închide</button>
          <p class="text-white text-center">Se încarcă poza…</p>
        </div>`;
      root.appendChild(modal);
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-close]').addEventListener('click', close);
      sb.storage.from(bucket).createSignedUrl(path, 300).then(({ data, error }) => {
        const p = modal.querySelector('p');
        if (!p) return;
        if (error || !data) { p.textContent = 'Nu am putut încărca poza.'; return; }
        const img = new Image();
        img.src = data.signedUrl; img.alt = 'Poză';
        img.className = 'max-h-[80vh] mx-auto rounded-lg';
        p.replaceWith(img);
      });
    }

    function paintDefects() {
      const rows = [...defects].sort((a, b) =>
        D_ORDER[a.status] - D_ORDER[b.status] || new Date(b.created_at) - new Date(a.created_at));
      const open = defects.filter((d) => d.status !== 'resolved').length;
      const options = (cur) => Object.entries(D_STATUS)
        .map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');

      $view.innerHTML = `
        <h1 class="text-2xl font-semibold text-navy-900">Defecțiuni</h1>
        <p class="text-slate-500 mt-1">${open ? open + ' nerezolvate' : 'Nicio defecțiune nerezolvată.'}</p>
        <div class="mt-5 space-y-3">
          ${rows.length ? rows.map((d) => `
            <article class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-start gap-3">
                <span class="mt-2 w-3 h-3 rounded-full shrink-0 ${D_DOT[d.status]}"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <h2 class="font-semibold text-navy-900">${esc(plateOf(d.vehicle_id))}</h2>
                    <span class="text-slate-500">${esc(d.category || 'Fără categorie')}</span>
                  </div>
                  <p class="mt-1 text-slate-700 break-words">${esc(d.description)}</p>
                  <p class="mt-1 text-sm text-slate-400">${esc(emailOf(d.reported_by))} · ${fmtTs(d.created_at)}</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <select data-dstatus="${d.id}" class="field text-sm rounded-lg border border-slate-300 px-2 py-1.5 bg-white">${options(d.status)}</select>
                ${d.photo_url ? `<button data-dphoto="${esc(d.photo_url)}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Vezi poza</button>` : ''}
                <button data-ddel="${d.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nu a fost raportată nicio defecțiune.</p>'}
        </div>`;

      $view.querySelectorAll('[data-dstatus]').forEach((sel) => sel.addEventListener('change', async () => {
        const d = defects.find((x) => x.id === sel.dataset.dstatus);
        const { error } = await sb.from('defects').update({ status: sel.value }).eq('id', sel.dataset.dstatus);
        if (error) alert('Nu am putut schimba starea: ' + error.message);
        else if (d) d.status = sel.value;
        paint();
      }));
      $view.querySelectorAll('[data-dphoto]').forEach((b) =>
        b.addEventListener('click', () => showPhoto('defect-photos', b.dataset.dphoto)));
      $view.querySelectorAll('[data-ddel]').forEach((b) => b.addEventListener('click', async () => {
        const d = defects.find((x) => x.id === b.dataset.ddel);
        if (!d || !confirm('Ștergi această defecțiune? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('defects').delete().eq('id', d.id);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        reload();
      }));
    }

    // ----- Combustibil -----
    const eur = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const n1 = (n, d = 1) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    const CONS_MIN = 3, CONS_MAX = 40;   // L/100 km: în afara acestui interval, datele par greșite

    function paintFuel() {
      // 1) Consumul pe fiecare interval dintre două alimentări (metoda "plin la plin")
      const byVeh = {};
      fuel.forEach((l) => { (byVeh[l.vehicle_id] = byVeh[l.vehicle_id] || []).push({ ...l }); });
      Object.values(byVeh).forEach((arr) => {
        arr.sort((a, b) => a.kilometers - b.kilometers || new Date(a.created_at) - new Date(b.created_at));
        arr.forEach((l, i) => {
          const dist = i ? l.kilometers - arr[i - 1].kilometers : 0;
          l.dist = dist > 0 ? dist : 0;
          l.cons = dist > 0 ? (Number(l.liters) / dist) * 100 : null;
        });
      });
      const since = fuelRange === 'all' ? 0 : Date.now() - Number(fuelRange) * 86400000;
      const inRange = (l) => new Date(l.created_at).getTime() >= since;

      // 2) Sinteză pe vehicul
      const sum = (arr, k) => arr.reduce((s, l) => s + Number(l[k]), 0);
      const summary = Object.entries(byVeh).map(([vid, arr]) => {
        const rows = arr.filter(inRange);
        const wc = rows.filter((l) => l.cons != null);
        const dist = sum(wc, 'dist'), litCons = sum(wc, 'liters');
        const avg = dist > 0 ? (litCons / dist) * 100 : null;
        const last = wc.length ? wc[wc.length - 1].cons : null;
        let level = 'none';
        if (avg != null) level = wc.length >= 3 && last > avg * 1.25 ? 'yellow' : 'green';
        return { vid, fills: rows.length, cost: sum(rows, 'total_price'), liters: sum(rows, 'liters'), dist, litCons, avg, last, level };
      }).filter((r) => r.fills > 0).sort((a, b) => plateOf(a.vid).localeCompare(plateOf(b.vid)));

      const totCost = summary.reduce((s, r) => s + r.cost, 0);
      const totLit = summary.reduce((s, r) => s + r.liters, 0);
      const totDist = summary.reduce((s, r) => s + r.dist, 0);
      const totLitCons = summary.reduce((s, r) => s + r.litCons, 0);
      const fleetAvg = totDist > 0 ? (totLitCons / totDist) * 100 : null;

      const logs = Object.values(byVeh).flat().filter(inRange)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);

      const tile = (label, value) => `
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <div class="text-xl font-semibold text-navy-900">${value}</div>
          <div class="text-sm text-slate-500">${label}</div>
        </div>`;

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-navy-900">Combustibil</h1>
          <select id="fuelRange" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">
            <option value="all" ${fuelRange === 'all' ? 'selected' : ''}>Toată perioada</option>
            <option value="30" ${fuelRange === '30' ? 'selected' : ''}>Ultimele 30 de zile</option>
            <option value="90" ${fuelRange === '90' ? 'selected' : ''}>Ultimele 90 de zile</option>
          </select>
        </div>
        ${fuel.length ? `
        <div class="mt-5 grid grid-cols-3 gap-3">
          ${tile('Cheltuit', eur(totCost))}${tile('Litri', n1(totLit, 1) + ' L')}${tile('Consum mediu', fleetAvg != null ? n1(fleetAvg) + ' L/100 km' : '–')}
        </div>

        <h2 class="mt-8 mb-3 font-semibold text-slate-600">Pe vehicul</h2>
        <div class="grid gap-3 md:grid-cols-2">
          ${summary.length ? summary.map((r) => {
            const v = vehicles.find((x) => x.id === r.vid) || {};
            return `
            <article class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-center gap-3">
                <span class="w-3 h-3 rounded-full ${DOT[r.level]}"></span>
                <h3 class="font-semibold text-navy-900">${esc(v.plate_number || '–')}</h3>
                <span class="text-slate-500 truncate">${esc(v.model || '')}</span>
              </div>
              <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt class="text-slate-500">Consum mediu</dt><dd class="font-medium">${r.avg != null ? n1(r.avg) + ' L/100 km' : '–'}</dd></div>
                <div><dt class="text-slate-500">Ultimul consum</dt><dd class="font-medium">${r.last != null ? n1(r.last) + ' L/100 km' : '–'}</dd></div>
                <div><dt class="text-slate-500">Litri (${r.fills} alim.)</dt><dd class="font-medium">${n1(r.liters, 1)} L</dd></div>
                <div><dt class="text-slate-500">Cheltuit</dt><dd class="font-medium">${eur(r.cost)}</dd></div>
              </dl>
              ${r.level === 'yellow' ? '<p class="mt-2 text-sm text-slate-500">Ultimul consum este cu peste 25% peste medie. Merită verificat.</p>' : ''}
              ${r.avg == null ? '<p class="mt-2 text-sm text-slate-400">Consumul se calculează după a doua alimentare.</p>' : ''}
            </article>`;
          }).join('') : '<p class="text-sm text-slate-400">Nicio alimentare în perioada aleasă.</p>'}
        </div>

        <h2 class="mt-8 mb-3 font-semibold text-slate-600">Ultimele alimentări</h2>
        <div class="space-y-2">
          ${logs.map((l) => {
            const odd = l.cons != null && (l.cons < CONS_MIN || l.cons > CONS_MAX);
            return `
            <div class="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <div class="flex justify-between gap-2">
                <span class="font-medium text-navy-900">${esc(plateOf(l.vehicle_id))}</span>
                <span class="text-slate-500">${fmtTs(l.created_at)}</span>
              </div>
              <div class="mt-1 text-slate-600">${nf(l.kilometers)} km · ${n1(l.liters, 2)} L · ${eur(l.total_price)} · ${eur(l.total_price / l.liters)}/L</div>
              <div class="mt-1 text-slate-500">${esc(emailOf(l.user_id))}${l.cons != null ? ' · ' + n1(l.cons) + ' L/100 km' : ''}${odd ? ' <span class="text-signal-red">valoare neobișnuită, verifică km și litri</span>' : ''}</div>
              <div class="mt-2 flex gap-2">
                ${l.receipt_photo_url ? `<button data-fphoto="${esc(l.receipt_photo_url)}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Vezi bonul</button>` : '<span class="text-sm text-slate-400 py-1.5">Fără bon</span>'}
                <button data-fdel="${l.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </div>`;
          }).join('') || '<p class="text-sm text-slate-400">Nicio alimentare în perioada aleasă.</p>'}
        </div>` : '<p class="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nu există alimentări încă. Apar aici după ce angajații le adaugă din Tankbuch.</p>'}`;

      const range = $view.querySelector('#fuelRange');
      if (range) range.addEventListener('change', () => { fuelRange = range.value; paint(); });
      $view.querySelectorAll('[data-fphoto]').forEach((b) =>
        b.addEventListener('click', () => showPhoto('receipts', b.dataset.fphoto)));
      $view.querySelectorAll('[data-fdel]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ștergi această alimentare? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('fuel_logs').delete().eq('id', b.dataset.fdel);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        reload();
      }));
    }

    // ----- Istoric șoferi -----
    const fmtDT = (d) => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const ms = (d) => new Date(d).getTime();
    const range = (h) => `${fmtDT(h.start_time)} → ${h.end_time ? fmtDT(h.end_time) : 'în curs'}`;
    const toLocalInput = (iso) => {
      if (!iso) return '';
      const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const vehicleOptions = (sel, all) => (all ? '<option value="">Toate vehiculele</option>' : '<option value="">Alege vehiculul</option>') +
      vehicles.map((v) => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.plate_number)}${v.model ? ' – ' + esc(v.model) : ''}</option>`).join('');

    function lookupHtml() {
      if (!lookup.vid || !lookup.t) return '';
      const t = ms(lookup.t);
      const hits = drives.filter((h) => h.vehicle_id === lookup.vid && ms(h.start_time) <= t && (!h.end_time || ms(h.end_time) >= t));
      if (!hits.length) {
        return `<p class="mt-3 text-sm rounded-lg bg-yellow-50 text-slate-700 px-3 py-2">Nicio înregistrare pentru ${esc(plateOf(lookup.vid))} la ${fmtDT(lookup.t)}. Verifică dacă istoricul este completat.</p>`;
      }
      return hits.map((h) => `
        <div class="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
          <div class="font-semibold text-navy-900">${esc(emailOf(h.user_id))}</div>
          <div class="text-slate-600">${range(h)}</div>
          ${h.notes ? `<div class="text-slate-500 mt-1">${esc(h.notes)}</div>` : ''}
        </div>`).join('') +
        (hits.length > 1 ? '<p class="mt-2 text-sm text-signal-red">Atenție: mai multe înregistrări se suprapun în acel moment.</p>' : '');
    }

    function paintHistory() {
      const rows = drives
        .filter((h) => (!histVehicle || h.vehicle_id === histVehicle) && (!histDriver || h.user_id === histDriver))
        .slice(0, 100);

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-navy-900">Istoric șoferi</h1>
          <button data-hadd class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă</button>
        </div>

        <section class="mt-5 bg-white rounded-xl border border-slate-200 p-4">
          <h2 class="font-semibold text-navy-900">Cine conducea?</h2>
          <p class="text-sm text-slate-500">Pentru radare și amenzi: alege vehiculul și momentul din document.</p>
          <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <select id="lkVeh" class="field rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(lookup.vid, false)}</select>
            <input id="lkTime" type="datetime-local" value="${esc(lookup.t)}" class="field rounded-lg border border-slate-300 px-3 py-2.5">
            <button id="lkGo" class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2.5">Caută</button>
          </div>
          <div id="lkResult">${lookupHtml()}</div>
        </section>

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <select id="fVeh" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">${vehicleOptions(histVehicle, true)}</select>
          <select id="fDrv" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">
            <option value="">Toți șoferii</option>
            ${people.map((p) => `<option value="${p.id}" ${p.id === histDriver ? 'selected' : ''}>${esc(p.email)}</option>`).join('')}
          </select>
        </div>

        <div class="mt-4 space-y-3">
          ${rows.length ? rows.map((h) => `
            <article class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-start gap-3">
                <span class="mt-2 w-3 h-3 rounded-full shrink-0 ${h.end_time ? 'bg-slate-300' : DOT.green}"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <h3 class="font-semibold text-navy-900">${esc(plateOf(h.vehicle_id))}</h3>
                    <span class="text-slate-600 truncate">${esc(emailOf(h.user_id))}</span>
                  </div>
                  <p class="text-sm text-slate-500">${range(h)}</p>
                  ${h.notes ? `<p class="mt-1 text-sm text-slate-700 break-words">${esc(h.notes)}</p>` : ''}
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                ${h.end_time ? '' : `<button data-hend="${h.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Încheie acum</button>`}
                <button data-hedit="${h.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                <button data-hdel="${h.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nicio înregistrare. Adaugă prima preluare de vehicul.</p>'}
        </div>`;

      $view.querySelector('[data-hadd]').addEventListener('click', () => openDriveForm(null));
      $view.querySelector('#fVeh').addEventListener('change', (e) => { histVehicle = e.target.value; paint(); });
      $view.querySelector('#fDrv').addEventListener('change', (e) => { histDriver = e.target.value; paint(); });
      $view.querySelector('#lkGo').addEventListener('click', () => {
        lookup = { vid: $view.querySelector('#lkVeh').value, t: $view.querySelector('#lkTime').value };
        $view.querySelector('#lkResult').innerHTML = lookup.vid && lookup.t
          ? lookupHtml()
          : '<p class="mt-3 text-sm text-signal-red">Alege vehiculul și momentul.</p>';
      });
      $view.querySelectorAll('[data-hedit]').forEach((b) =>
        b.addEventListener('click', () => openDriveForm(drives.find((x) => x.id === b.dataset.hedit))));
      $view.querySelectorAll('[data-hdel]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ștergi această înregistrare? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('driver_history').delete().eq('id', b.dataset.hdel);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        reload();
      }));
      $view.querySelectorAll('[data-hend]').forEach((b) => b.addEventListener('click', async () => {
        const h = drives.find((x) => x.id === b.dataset.hend);
        if (!h) return;
        if (ms(h.start_time) > Date.now()) return alert('Preluarea începe în viitor. Editeaz-o pentru a seta sfârșitul.');
        const { error } = await sb.from('driver_history').update({ end_time: new Date().toISOString() }).eq('id', h.id);
        if (error) return alert('Nu am putut încheia: ' + error.message);
        reload();
      }));
    }

    function openDriveForm(h) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${h ? 'Editează înregistrarea' : 'Preluare vehicul'}</h2>
          <div class="mt-4 space-y-4">
            <label class="block"><span class="block text-sm font-medium mb-1">Vehicul</span>
              <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(h ? h.vehicle_id : '', false)}</select></label>
            <label class="block"><span class="block text-sm font-medium mb-1">Șofer</span>
              <select name="driver" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                <option value="">Alege șoferul</option>
                ${people.map((p) => `<option value="${p.id}" ${h && h.user_id === p.id ? 'selected' : ''}>${esc(p.email)}</option>`).join('')}
              </select></label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block"><span class="block text-sm font-medium mb-1">Început</span>
                <input name="start" type="datetime-local" value="${toLocalInput(h ? h.start_time : new Date().toISOString())}" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>
              <label class="block"><span class="block text-sm font-medium mb-1">Sfârșit (gol = în curs)</span>
                <input name="end" type="datetime-local" value="${toLocalInput(h ? h.end_time : '')}" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>
            </div>
            <label class="block"><span class="block text-sm font-medium mb-1">Notițe</span>
              <textarea name="notes" rows="2" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">${h ? esc(h.notes || '') : ''}</textarea></label>
          </div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);

      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
        if (!form.vehicle.value) return fail('Alege vehiculul.');
        if (!form.driver.value) return fail('Alege șoferul.');
        if (!form.start.value) return fail('Completează începutul.');

        const payload = {
          vehicle_id: form.vehicle.value,
          user_id: form.driver.value,
          start_time: new Date(form.start.value).toISOString(),
          end_time: form.end.value ? new Date(form.end.value).toISOString() : null,
          notes: form.notes.value.trim() || null
        };
        if (payload.end_time && ms(payload.end_time) <= ms(payload.start_time)) return fail('Sfârșitul trebuie să fie după început.');

        const s0 = ms(payload.start_time), e0 = payload.end_time ? ms(payload.end_time) : Infinity;
        const clash = drives.find((x) => (!h || x.id !== h.id) && x.vehicle_id === payload.vehicle_id &&
          s0 < (x.end_time ? ms(x.end_time) : Infinity) && ms(x.start_time) < e0);
        if (clash && !confirm(`Se suprapune cu altă înregistrare (${emailOf(clash.user_id)}, ${range(clash)}). Salvezi oricum?`)) return;

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const { error } = h
          ? await sb.from('driver_history').update(payload).eq('id', h.id)
          : await sb.from('driver_history').insert(payload);
        btn.disabled = false;
        if (error) return fail('Nu am putut salva: ' + error.message);
        close();
        reload();
      });
    }

    // ----- Finanțe -----
    const EXP_CAT = { asigurare: 'Asigurare', taxa: 'Taxe', anvelope: 'Anvelope', reparatie: 'Reparații', altele: 'Altele' };
    const SVC_KINDS = ['Revizie', 'Schimb ulei', 'Filtre', 'Frâne', 'Anvelope', 'Reparație', 'Altele'];
    const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const todayStr = () => ymd(new Date());

    async function openFile(bucket, path) {
      if (/\.(jpe?g|png|webp|gif)$/i.test(path || '')) return showPhoto(bucket, path);
      const w = window.open('', '_blank');
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300);
      if (error || !data) { if (w) w.close(); return alert('Nu am putut deschide fișierul.'); }
      if (w) w.location = data.signedUrl; else window.location = data.signedUrl;
    }

    const finSince = () => {
      const n = new Date();
      if (finRange === 'month') return ymd(new Date(n.getFullYear(), n.getMonth(), 1));
      if (finRange === '3m') return ymd(new Date(n.getFullYear(), n.getMonth() - 2, 1));
      if (finRange === 'year') return n.getFullYear() + '-01-01';
      return '0000-01-01';
    };

    function finRows() {
      const since = finSince();
      const rows = [];
      fuel.forEach((l) => rows.push({ date: String(l.created_at).slice(0, 10), vehicle_id: l.vehicle_id, cat: 'Combustibil', amount: Number(l.total_price), desc: `${n1(l.liters, 2)} L`, km: l.kilometers, src: 'fuel' }));
      expenses.forEach((x) => rows.push({ date: x.expense_date, vehicle_id: x.vehicle_id, cat: EXP_CAT[x.category] || x.category, amount: Number(x.amount), desc: [x.description, x.supplier].filter(Boolean).join(' · '), src: 'expense', id: x.id, file: x.file_path }));
      jobs.filter((j) => j.status === 'done' && j.cost != null).forEach((j) => rows.push({ date: j.done_date || j.scheduled_date, vehicle_id: j.vehicle_id, cat: 'Service', amount: Number(j.cost), desc: `${j.kind}${j.workshop ? ' – ' + j.workshop : ''}`, src: 'job', file: j.file_path }));
      return rows.filter((r) => r.date && r.date >= since && (!finVehicle || r.vehicle_id === finVehicle))
        .sort((x, y) => (x.date < y.date ? 1 : -1));
    }

    function exportCsv() {
      const rows = finRows();
      const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
      const lines = ['Data;Vehicul;Categorie;Descriere;Suma (EUR)'].concat(rows.map((r) =>
        [q(fmtDate(r.date)), q(plateOf(r.vehicle_id)), q(r.cat), q(r.desc), r.amount.toFixed(2).replace('.', ',')].join(';')));
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `cheltuieli-${finRange}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    const needMigration = (title, script, detail) => `
      <h1 class="text-2xl font-semibold text-navy-900">${title}</h1>
      <p class="mt-4 rounded-lg bg-amber-50 text-slate-700 px-4 py-3 text-sm">Modulul nu este activat încă. Rulează în Supabase (SQL Editor) scriptul <strong>${script}</strong>, apoi reîncarcă pagina.<br><span class="text-muted">${esc(detail)}</span></p>`;

    function paintFinance() {
      if (finError) { $view.innerHTML = needMigration('Finanțe', '004_finance_service.sql', finError); return; }
      const rows = finRows();
      const sum = (f) => rows.filter(f).reduce((s, r) => s + r.amount, 0);
      const total = sum(() => true), fuelT = sum((r) => r.cat === 'Combustibil'), svcT = sum((r) => r.cat === 'Service'), otherT = total - fuelT - svcT;
      const cats = {};
      rows.forEach((r) => { cats[r.cat] = (cats[r.cat] || 0) + r.amount; });
      const catList = Object.entries(cats).sort((x, y) => y[1] - x[1]);
      const maxC = catList.length ? catList[0][1] : 1;

      const pv = {};
      rows.forEach((r) => {
        const o = pv[r.vehicle_id] || (pv[r.vehicle_id] = { fuel: 0, svc: 0, other: 0, kmMin: Infinity, kmMax: -Infinity });
        if (r.cat === 'Combustibil') { o.fuel += r.amount; if (r.km != null) { o.kmMin = Math.min(o.kmMin, r.km); o.kmMax = Math.max(o.kmMax, r.km); } }
        else if (r.cat === 'Service') o.svc += r.amount;
        else o.other += r.amount;
      });
      const pvRows = Object.entries(pv).map(([vid, o]) => {
        const tot = o.fuel + o.svc + o.other, km = o.kmMax > o.kmMin ? o.kmMax - o.kmMin : 0;
        return { vid, ...o, tot, km, perKm: km > 0 ? tot / km : null };
      }).sort((x, y) => y.tot - x.tot);

      const tile = (label, value) => `<div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4"><div class="text-xl font-semibold text-ink">${value}</div><div class="text-sm text-muted">${label}</div></div>`;
      const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-5';

      $view.innerHTML = `
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold text-navy-900">Finanțe</h1>
            <p class="text-muted">Combustibil, service și alte cheltuieli, pe vehicul.</p>
          </div>
          <div class="flex flex-wrap gap-2 no-print">
            <button data-fadd class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă cheltuială</button>
            <button data-fcsv class="rounded-lg border border-slate-300 hover:bg-slate-50 px-4 py-2">Export Excel (CSV)</button>
            <button data-fprint class="rounded-lg border border-slate-300 hover:bg-slate-50 px-4 py-2">Tipărește / PDF</button>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap gap-2 no-print">
          <select id="finRange" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">
            ${[['month', 'Luna aceasta'], ['3m', 'Ultimele 3 luni'], ['year', 'Anul acesta'], ['all', 'Toată perioada']].map(([k, l]) => `<option value="${k}" ${finRange === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select id="finVeh" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">${vehicleOptions(finVehicle, true)}</select>
        </div>

        <div class="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${tile('Total cheltuieli', eur(total))}${tile('Combustibil', eur(fuelT))}${tile('Service', eur(svcT))}${tile('Alte cheltuieli', eur(otherT))}
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <section class="${card}">
            <h2 class="font-semibold text-navy-900 mb-3">Pe categorii</h2>
            ${catList.length ? catList.map(([c, v]) => `
              <div class="mb-3">
                <div class="flex justify-between text-sm"><span>${esc(c)}</span><span class="font-medium">${eur(v)}</span></div>
                <div class="mt-1 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-signal-green" style="width:${Math.max(3, (v / maxC) * 100)}%"></div></div>
              </div>`).join('') : '<p class="text-sm text-muted py-4 text-center">Nicio cheltuială în perioada aleasă.</p>'}
          </section>

          <section class="${card}">
            <h2 class="font-semibold text-navy-900 mb-3">Pe vehicul</h2>
            ${pvRows.length ? pvRows.map((r) => `
              <div class="py-2.5 border-t border-slate-100 first:border-0 text-sm">
                <div class="flex justify-between"><span class="font-medium text-ink">${esc(plateOf(r.vid))}</span><span class="font-semibold">${eur(r.tot)}</span></div>
                <div class="text-muted">Combustibil ${eur(r.fuel)} · Service ${eur(r.svc)} · Altele ${eur(r.other)}</div>
                <div class="text-muted">${r.perKm != null ? `Cost pe km (estimat): ${n1(r.perKm, 2)} € · ${nf(r.km)} km` : 'Cost pe km: nu există suficiente alimentări'}</div>
              </div>`).join('') : '<p class="text-sm text-muted py-4 text-center">Nicio cheltuială în perioada aleasă.</p>'}
          </section>
        </div>

        <section class="mt-4 ${card}">
          <h2 class="font-semibold text-navy-900 mb-3">Ultimele cheltuieli</h2>
          ${rows.length ? rows.slice(0, 50).map((r) => `
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 border-t border-slate-100 first:border-0 text-sm">
              <span class="text-muted w-20 shrink-0">${fmtDate(r.date)}</span>
              <span class="font-medium text-ink">${esc(plateOf(r.vehicle_id))}</span>
              <span class="text-muted">${esc(r.cat)}</span>
              <span class="text-muted truncate min-w-0 flex-1">${esc(r.desc)}</span>
              <span class="font-semibold">${eur(r.amount)}</span>
              <span class="flex gap-2 no-print">
                ${r.file ? `<button data-ffile="${esc(r.file)}" class="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Factură</button>` : ''}
                ${r.src === 'expense' ? `<button data-fedit="${r.id}" class="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Editează</button><button data-fdel3="${r.id}" class="px-2 py-1 rounded border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>` : `<span class="text-xs text-slate-400 self-center">${r.src === 'fuel' ? 'din Combustibil' : 'din Service'}</span>`}
              </span>
            </div>`).join('') : '<p class="text-sm text-muted py-4 text-center">Nicio cheltuială în perioada aleasă.</p>'}
        </section>`;

      $view.querySelector('[data-fadd]').addEventListener('click', () => openExpenseForm(null));
      $view.querySelector('[data-fcsv]').addEventListener('click', exportCsv);
      $view.querySelector('[data-fprint]').addEventListener('click', () => window.print());
      $view.querySelector('#finRange').addEventListener('change', (e) => { finRange = e.target.value; paint(); });
      $view.querySelector('#finVeh').addEventListener('change', (e) => { finVehicle = e.target.value; paint(); });
      $view.querySelectorAll('[data-ffile]').forEach((b) => b.addEventListener('click', () => openFile('expense-docs', b.dataset.ffile)));
      $view.querySelectorAll('[data-fedit]').forEach((b) =>
        b.addEventListener('click', () => openExpenseForm(expenses.find((x) => x.id === b.dataset.fedit))));
      $view.querySelectorAll('[data-fdel3]').forEach((b) => b.addEventListener('click', async () => {
        const x = expenses.find((y) => y.id === b.dataset.fdel3);
        if (!x || !confirm('Ștergi această cheltuială? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('expenses').delete().eq('id', x.id);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        if (x.file_path) await sb.storage.from('expense-docs').remove([x.file_path]);
        reload();
      }));
    }

    // formular generic într-o fereastră: construiește, leagă închiderea și trimite la `onSubmit(form, fail, btn, close)`
    function modalForm(title, bodyHtml, onSubmit) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${title}</h2>
          <div class="mt-4 space-y-4">${bodyHtml}</div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);
      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const btn = form.querySelector('[type="submit"]');
        await onSubmit(form, fail, btn, close);
        btn.disabled = false;
      });
    }

    const fld = (name, label, val, type = 'text', extra = '') =>
      `<label class="block"><span class="block text-sm font-medium mb-1">${label}</span><input name="${name}" type="${type}" value="${esc(val == null ? '' : val)}" ${extra} class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>`;
    const fileFld = (label) =>
      `<label class="block"><span class="block text-sm font-medium mb-1">${label}</span><input name="file" type="file" accept="image/*,application/pdf" class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700"></label>`;

    async function uploadDoc(vehicleId, file, oldPath, fail) {
      if (!file) return { path: oldPath };
      if (file.size > 10 * 1024 * 1024) { fail('Fișierul depășește 10 MB.'); return null; }
      const np = `${vehicleId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await sb.storage.from('expense-docs').upload(np, file, { contentType: file.type || 'application/octet-stream' });
      if (error) { fail('Fișierul nu s-a încărcat: ' + error.message); return null; }
      if (oldPath) await sb.storage.from('expense-docs').remove([oldPath]);
      return { path: np };
    }

    function openExpenseForm(x) {
      modalForm(x ? 'Editează cheltuiala' : 'Cheltuială nouă', `
        <label class="block"><span class="block text-sm font-medium mb-1">Vehicul</span>
          <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(x ? x.vehicle_id : finVehicle, false)}</select></label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block"><span class="block text-sm font-medium mb-1">Categorie</span>
            <select name="category" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              ${Object.entries(EXP_CAT).map(([k, l]) => `<option value="${k}" ${x && x.category === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          ${fld('amount', 'Sumă (€)', x && x.amount, 'number', 'min="0" step="0.01" inputmode="decimal"')}
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${fld('date', 'Data', x ? x.expense_date : todayStr(), 'date')}
          ${fld('supplier', 'Furnizor', x && x.supplier)}
        </div>
        ${fld('description', 'Descriere', x && x.description)}
        ${fileFld('Factură (PDF sau poză, maximum 10 MB)' + (x && x.file_path ? ' – lasă gol ca să păstrezi fișierul actual' : ''))}`,
      async (form, fail, btn, close) => {
        if (!form.vehicle.value) return fail('Alege vehiculul.');
        if (form.amount.value === '' || Number(form.amount.value) < 0) return fail('Completează suma.');
        if (!form.date.value) return fail('Completează data.');
        btn.disabled = true;
        const up = await uploadDoc(form.vehicle.value, form.file.files[0], x ? x.file_path : null, fail);
        if (!up) return;
        const payload = {
          vehicle_id: form.vehicle.value, category: form.category.value, amount: Number(form.amount.value),
          expense_date: form.date.value, supplier: form.supplier.value.trim() || null,
          description: form.description.value.trim() || null, file_path: up.path
        };
        const { error } = x ? await sb.from('expenses').update(payload).eq('id', x.id) : await sb.from('expenses').insert(payload);
        if (error) return fail('Nu am putut salva: ' + error.message);
        finVehicle = payload.vehicle_id;
        close(); reload();
      });
    }

    // ----- Service -----
    const jobLevel = (j) => {
      if (j.status === 'done') return 'green';
      if (!j.scheduled_date) return 'none';
      const n = daysUntil(j.scheduled_date);
      return n < 0 ? 'red' : n <= 14 ? 'yellow' : 'none';
    };

    function paintService() {
      if (finError) { $view.innerHTML = needMigration('Service', '004_finance_service.sql', finError); return; }
      const list = jobs.filter((j) => svcFilter === 'all' || j.status === svcFilter)
        .sort((x, y) => {
          const dx = (x.status === 'done' ? x.done_date : x.scheduled_date) || '9999-12-31';
          const dy = (y.status === 'done' ? y.done_date : y.scheduled_date) || '9999-12-31';
          return x.status === 'done' ? (dx < dy ? 1 : -1) : (dx < dy ? -1 : 1);
        });
      const chips = [['planned', 'Programate'], ['done', 'Efectuate'], ['all', 'Toate']];

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold text-navy-900">Service</h1>
            <p class="text-muted">Revizii, schimb de ulei, reparații: programări, costuri și facturi.</p>
          </div>
          <button data-jadd class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 shrink-0">Lucrare nouă</button>
        </div>
        <div class="mt-5 flex flex-wrap gap-2 text-sm">
          ${chips.map(([k, l]) => `<button data-jf="${k}" class="px-3 py-1.5 rounded-full ${svcFilter === k ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-muted hover:bg-slate-50'}">${l}</button>`).join('')}
        </div>
        <div class="mt-4 space-y-3">
          ${list.length ? list.map((j) => `
            <article class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div class="flex items-start gap-3">
                <span class="mt-2 w-3 h-3 rounded-full shrink-0 ${DOT[jobLevel(j)]}"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <h2 class="font-semibold text-navy-900">${esc(plateOf(j.vehicle_id))}</h2>
                    <span class="text-ink">${esc(j.kind)}</span>
                  </div>
                  <p class="text-sm text-muted">${j.status === 'done'
                    ? 'Efectuat ' + (j.done_date ? fmtDate(j.done_date) : '')
                    : (j.scheduled_date ? 'Programat ' + fmtDate(j.scheduled_date) + (daysUntil(j.scheduled_date) < 0 ? ' (întârziat)' : '') : 'Fără dată')}${j.km != null ? ' · ' + nf(j.km) + ' km' : ''}${j.cost != null ? ' · ' + eur(j.cost) : ''}${j.workshop ? ' · ' + esc(j.workshop) : ''}</p>
                  ${j.notes ? `<p class="mt-1 text-sm text-slate-700 break-words">${esc(j.notes)}</p>` : ''}
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                ${j.status === 'planned' ? `<button data-jdone="${j.id}" class="text-sm px-3 py-1.5 rounded-lg bg-navy-900 text-white hover:bg-navy-800">Marchează efectuat</button>` : ''}
                ${j.file_path ? `<button data-jfile="${esc(j.file_path)}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Factură</button>` : ''}
                <button data-jedit="${j.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                <button data-jdel="${j.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nicio lucrare. Programează prima lucrare de service.</p>'}
        </div>`;

      $view.querySelector('[data-jadd]').addEventListener('click', () => openJobForm(null, false));
      $view.querySelectorAll('[data-jf]').forEach((b) => b.addEventListener('click', () => { svcFilter = b.dataset.jf; paint(); }));
      $view.querySelectorAll('[data-jfile]').forEach((b) => b.addEventListener('click', () => openFile('expense-docs', b.dataset.jfile)));
      $view.querySelectorAll('[data-jedit]').forEach((b) =>
        b.addEventListener('click', () => openJobForm(jobs.find((x) => x.id === b.dataset.jedit), false)));
      $view.querySelectorAll('[data-jdone]').forEach((b) =>
        b.addEventListener('click', () => openJobForm(jobs.find((x) => x.id === b.dataset.jdone), true)));
      $view.querySelectorAll('[data-jdel]').forEach((b) => b.addEventListener('click', async () => {
        const j = jobs.find((x) => x.id === b.dataset.jdel);
        if (!j || !confirm('Ștergi această lucrare? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('service_jobs').delete().eq('id', j.id);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        if (j.file_path) await sb.storage.from('expense-docs').remove([j.file_path]);
        reload();
      }));
    }

    function openJobForm(j, markDone) {
      const status = markDone ? 'done' : (j ? j.status : 'planned');
      modalForm(j ? (markDone ? 'Marchează efectuat' : 'Editează lucrarea') : 'Lucrare nouă', `
        <label class="block"><span class="block text-sm font-medium mb-1">Vehicul</span>
          <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(j ? j.vehicle_id : '', false)}</select></label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block"><span class="block text-sm font-medium mb-1">Tip lucrare</span>
            <select name="kind" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              ${SVC_KINDS.map((k) => `<option ${j && j.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select></label>
          <label class="block"><span class="block text-sm font-medium mb-1">Stare</span>
            <select name="status" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              <option value="planned" ${status === 'planned' ? 'selected' : ''}>Programată</option>
              <option value="done" ${status === 'done' ? 'selected' : ''}>Efectuată</option>
            </select></label>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${fld('scheduled', 'Data programată', j && j.scheduled_date, 'date')}
          ${fld('done', 'Data efectuării', j && j.done_date ? j.done_date : (markDone ? todayStr() : ''), 'date')}
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${fld('km', 'Kilometraj', j && j.km, 'number', 'min="0" inputmode="numeric"')}
          ${fld('cost', 'Cost (€)', j && j.cost, 'number', 'min="0" step="0.01" inputmode="decimal"')}
        </div>
        ${fld('workshop', 'Atelier', j && j.workshop)}
        <label class="block"><span class="block text-sm font-medium mb-1">Notițe</span>
          <textarea name="notes" rows="2" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">${j ? esc(j.notes || '') : ''}</textarea></label>
        ${fileFld('Factură (PDF sau poză, maximum 10 MB)' + (j && j.file_path ? ' – lasă gol ca să păstrezi fișierul actual' : ''))}
        <p class="text-xs text-muted">Pentru „Schimb ulei" efectuat, cu kilometraj completat, kilometrajul de la ultima schimbare de ulei al vehiculului se actualizează automat.</p>`,
      async (form, fail, btn, close) => {
        if (!form.vehicle.value) return fail('Alege vehiculul.');
        const st = form.status.value;
        if (st === 'planned' && !form.scheduled.value) return fail('Completează data programată.');
        if (st === 'done' && !form.done.value) return fail('Completează data efectuării.');
        btn.disabled = true;
        const up = await uploadDoc(form.vehicle.value, form.file.files[0], j ? j.file_path : null, fail);
        if (!up) return;
        const num = (v) => (v === '' ? null : Number(v));
        const payload = {
          vehicle_id: form.vehicle.value, kind: form.kind.value, status: st,
          scheduled_date: form.scheduled.value || null, done_date: st === 'done' ? form.done.value : null,
          km: form.km.value === '' ? null : Math.round(Number(form.km.value)), cost: num(form.cost.value),
          workshop: form.workshop.value.trim() || null, notes: form.notes.value.trim() || null, file_path: up.path
        };
        const { error } = j ? await sb.from('service_jobs').update(payload).eq('id', j.id) : await sb.from('service_jobs').insert(payload);
        if (error) return fail('Nu am putut salva: ' + error.message);
        if (st === 'done' && payload.kind === 'Schimb ulei' && payload.km != null) {
          const v = vehicles.find((x) => x.id === payload.vehicle_id);
          const patch = { last_oil_change_km: payload.km };
          if (v && (v.current_km == null || v.current_km < payload.km)) patch.current_km = payload.km;
          await sb.from('vehicles').update(patch).eq('id', payload.vehicle_id);
        }
        close(); reload();
      });
    }

    // ----- Curse -----
    const TRIP_STATUS = { planned: 'Planificată', accepted: 'Acceptată', in_progress: 'În desfășurare', done: 'Finalizată', cancelled: 'Anulată' };
    const TRIP_DOT = { planned: 'bg-slate-400', accepted: 'bg-navy-700', in_progress: 'bg-signal-green', done: 'bg-slate-300', cancelled: 'bg-signal-red' };

    function paintTrips() {
      if (tripsError) {
        $view.innerHTML = `
          <h1 class="text-2xl font-semibold text-navy-900">Curse</h1>
          <p class="mt-4 rounded-lg bg-amber-50 text-slate-700 px-4 py-3 text-sm">Modulul de curse nu este activat încă. Rulează în Supabase (SQL Editor) scriptul <strong>003_trips.sql</strong>, apoi reîncarcă pagina.<br><span class="text-muted">${esc(tripsError)}</span></p>`;
        return;
      }
      const match = (x) => !tripFilter || (tripFilter === 'planned' ? (x.status === 'planned' || x.status === 'accepted') : x.status === tripFilter);
      const list = trips.filter(match);
      const chips = [['', 'Toate'], ['planned', 'Planificate'], ['in_progress', 'În desfășurare'], ['done', 'Finalizate']];

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold text-navy-900">Curse</h1>
            <p class="text-muted">Repartizează șofer și vehicul, urmărește confirmarea și finalizarea.</p>
          </div>
          <button data-tadd2 class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 shrink-0">Cursă nouă</button>
        </div>
        <div class="mt-5 flex flex-wrap gap-2 text-sm">
          ${chips.map(([k, l]) => `<button data-tf="${k}" class="px-3 py-1.5 rounded-full ${tripFilter === k ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-muted hover:bg-slate-50'}">${l}</button>`).join('')}
        </div>
        <div class="mt-4 space-y-3">
          ${list.length ? list.map((x) => `
            <article class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div class="flex items-start gap-3">
                <span class="mt-2 w-3 h-3 rounded-full shrink-0 ${TRIP_DOT[x.status]}"></span>
                <div class="min-w-0 flex-1">
                  <h2 class="font-semibold text-navy-900 break-words">${esc(x.title)}</h2>
                  <p class="text-sm text-muted">${TRIP_STATUS[x.status]} · ${fmtDT(x.scheduled_at)}</p>
                  ${x.origin || x.destination ? `<p class="mt-1 text-sm text-ink">${esc(x.origin || '?')} → ${esc(x.destination || '?')}</p>` : ''}
                  <p class="text-sm text-muted">Șofer: ${x.driver_id ? esc(emailOf(x.driver_id)) : 'nerepartizat'} · Vehicul: ${x.vehicle_id ? esc(plateOf(x.vehicle_id)) : '–'}</p>
                  ${x.instructions ? `<p class="mt-1 text-sm text-slate-700 break-words">${esc(x.instructions)}</p>` : ''}
                  ${x.started_at ? `<p class="text-xs text-muted mt-1">Început: ${fmtDT(x.started_at)}${x.finished_at ? ' · Finalizat: ' + fmtDT(x.finished_at) : ''}</p>` : ''}
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button data-tedit2="${x.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                ${x.status === 'done' || x.status === 'cancelled' ? '' : `<button data-tcancel="${x.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>`}
                <button data-tdel2="${x.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nicio cursă. Creează prima cursă.</p>'}
        </div>`;

      $view.querySelector('[data-tadd2]').addEventListener('click', () => openTripForm(null));
      $view.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { tripFilter = b.dataset.tf; paint(); }));
      $view.querySelectorAll('[data-tedit2]').forEach((b) =>
        b.addEventListener('click', () => openTripForm(trips.find((x) => x.id === b.dataset.tedit2))));
      $view.querySelectorAll('[data-tcancel]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Anulezi această cursă?')) return;
        const { error } = await sb.from('trips').update({ status: 'cancelled' }).eq('id', b.dataset.tcancel);
        if (error) return alert('Nu am putut anula: ' + error.message);
        reload();
      }));
      $view.querySelectorAll('[data-tdel2]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ștergi această cursă? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('trips').delete().eq('id', b.dataset.tdel2);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        reload();
      }));
    }

    function openTripForm(x) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      const inp = (name, label, val, type = 'text') => `<label class="block"><span class="block text-sm font-medium mb-1">${label}</span><input name="${name}" type="${type}" value="${esc(val || '')}" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>`;
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${x ? 'Editează cursa' : 'Cursă nouă'}</h2>
          <div class="mt-4 space-y-4">
            ${inp('title', 'Titlu (ex. Berlin → Hamburg)', x && x.title)}
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block"><span class="block text-sm font-medium mb-1">Șofer</span>
                <select name="driver" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                  <option value="">Alege șoferul</option>
                  ${people.map((p) => `<option value="${p.id}" ${x && x.driver_id === p.id ? 'selected' : ''}>${esc(p.email)}</option>`).join('')}
                </select></label>
              <label class="block"><span class="block text-sm font-medium mb-1">Vehicul</span>
                <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(x ? x.vehicle_id : '', false)}</select></label>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              ${inp('origin', 'Adresă de plecare', x && x.origin)}
              ${inp('destination', 'Destinație', x && x.destination)}
            </div>
            ${inp('when', 'Data și ora', toLocalInput(x ? x.scheduled_at : new Date().toISOString()), 'datetime-local')}
            <label class="block"><span class="block text-sm font-medium mb-1">Instrucțiuni</span>
              <textarea name="instructions" rows="3" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">${x ? esc(x.instructions || '') : ''}</textarea></label>
            ${x ? `<label class="block"><span class="block text-sm font-medium mb-1">Stare</span>
              <select name="status" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                ${Object.entries(TRIP_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}
              </select></label>` : ''}
          </div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);

      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
        const title = form.title.value.trim();
        if (!title) return fail('Completează titlul cursei.');
        if (!form.driver.value) return fail('Alege șoferul.');
        if (!form.when.value) return fail('Completează data și ora.');

        const payload = {
          title,
          driver_id: form.driver.value,
          vehicle_id: form.vehicle.value || null,
          origin: form.origin.value.trim() || null,
          destination: form.destination.value.trim() || null,
          scheduled_at: new Date(form.when.value).toISOString(),
          instructions: form.instructions.value.trim() || null
        };
        if (x) payload.status = form.status.value;

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const { error } = x
          ? await sb.from('trips').update(payload).eq('id', x.id)
          : await sb.from('trips').insert(payload);
        btn.disabled = false;
        if (error) return fail('Nu am putut salva: ' + error.message);
        close();
        reload();
      });
    }

    // ----- Documente vehicule -----
    const DOC_TYPES = ['TÜV', 'RCA / Asigurare', 'ITP', 'Fahrzeugschein', 'Altele'];
    const isImg = (p) => /\.(jpe?g|png|webp|gif)$/i.test(p || '');
    const docLevel = (d) => {
      if (!d.expiry_date) return 'none';
      const n = daysUntil(d.expiry_date);
      return n <= RULES.tuvRedDays ? 'red' : n <= RULES.tuvYellowDays ? 'yellow' : 'green';
    };
    const docWhen = (d) => {
      if (!d.expiry_date) return 'Fără dată de expirare';
      const n = daysUntil(d.expiry_date);
      return n < 0 ? `Expirat de ${-n} zile (${fmtDate(d.expiry_date)})` : `Expiră ${fmtDate(d.expiry_date)} (în ${n} zile)`;
    };

    async function openDoc(path) {
      if (isImg(path)) return showPhoto('vehicle-docs', path);
      const w = window.open('', '_blank');
      const { data, error } = await sb.storage.from('vehicle-docs').createSignedUrl(path, 300);
      if (error || !data) { if (w) w.close(); return alert('Nu am putut deschide documentul.'); }
      if (w) w.location = data.signedUrl; else window.location = data.signedUrl;
    }

    function paintDocs() {
      if (docsError) {
        $view.innerHTML = `
          <h1 class="text-2xl font-semibold text-navy-900">Documente</h1>
          <p class="mt-4 rounded-lg bg-amber-50 text-slate-700 px-4 py-3 text-sm">Modulul de documente nu este activat încă. Rulează în Supabase (SQL Editor) scriptul <strong>002_vehicle_documents.sql</strong>, apoi reîncarcă pagina.<br><span class="text-muted">${esc(docsError)}</span></p>`;
        return;
      }
      const list = docs.filter((d) => !docVehicle || d.vehicle_id === docVehicle)
        .sort((x, y) => (x.expiry_date || '9999-12-31') < (y.expiry_date || '9999-12-31') ? -1 : 1);

      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold text-navy-900">Documente</h1>
            <p class="text-muted">RCA, ITP, TÜV, talon și alte documente, cu date de expirare.</p>
          </div>
          <button data-dadd class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 shrink-0">Adaugă</button>
        </div>
        <div class="mt-5">
          <select id="docFilter" class="field text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white">${vehicleOptions(docVehicle, true)}</select>
        </div>
        <div class="mt-4 space-y-3">
          ${list.length ? list.map((d) => `
            <article class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div class="flex items-start gap-3">
                <span class="mt-2 w-3 h-3 rounded-full shrink-0 ${DOT[docLevel(d)]}"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <h2 class="font-semibold text-navy-900">${esc(plateOf(d.vehicle_id))}</h2>
                    <span class="text-ink">${esc(d.doc_type)}${d.title ? ' · ' + esc(d.title) : ''}</span>
                  </div>
                  <p class="text-sm text-muted">${docWhen(d)}</p>
                  ${d.notes ? `<p class="mt-1 text-sm text-slate-700 break-words">${esc(d.notes)}</p>` : ''}
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                ${d.file_path ? `<button data-dopen="${esc(d.file_path)}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Deschide</button>` : '<span class="text-sm text-slate-400 py-1.5">Fără fișier</span>'}
                <button data-dedit="${d.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                <button data-ddel2="${d.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
              </div>
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Niciun document. Adaugă primul document al unui vehicul.</p>'}
        </div>`;

      $view.querySelector('[data-dadd]').addEventListener('click', () => openDocForm(null));
      $view.querySelector('#docFilter').addEventListener('change', (e) => { docVehicle = e.target.value; paint(); });
      $view.querySelectorAll('[data-dopen]').forEach((b) => b.addEventListener('click', () => openDoc(b.dataset.dopen)));
      $view.querySelectorAll('[data-dedit]').forEach((b) =>
        b.addEventListener('click', () => openDocForm(docs.find((x) => x.id === b.dataset.dedit))));
      $view.querySelectorAll('[data-ddel2]').forEach((b) => b.addEventListener('click', async () => {
        const d = docs.find((x) => x.id === b.dataset.ddel2);
        if (!d || !confirm('Ștergi acest document? Acțiunea nu poate fi anulată.')) return;
        const { error } = await sb.from('vehicle_documents').delete().eq('id', d.id);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        if (d.file_path) await sb.storage.from('vehicle-docs').remove([d.file_path]);
        reload();
      }));
    }

    function openDocForm(d) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-end md:items-center justify-center p-0 md:p-6';
      modal.innerHTML = `
        <form class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" novalidate>
          <h2 class="text-xl font-semibold text-navy-900">${d ? 'Editează documentul' : 'Document nou'}</h2>
          <div class="mt-4 space-y-4">
            <label class="block"><span class="block text-sm font-medium mb-1">Vehicul</span>
              <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">${vehicleOptions(d ? d.vehicle_id : docVehicle, false)}</select></label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block"><span class="block text-sm font-medium mb-1">Tip</span>
                <select name="type" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
                  ${DOC_TYPES.map((t) => `<option ${d && d.doc_type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select></label>
              <label class="block"><span class="block text-sm font-medium mb-1">Expiră la</span>
                <input name="expiry" type="date" value="${d && d.expiry_date ? esc(d.expiry_date) : ''}" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>
            </div>
            <label class="block"><span class="block text-sm font-medium mb-1">Titlu (opțional)</span>
              <input name="title" value="${d ? esc(d.title || '') : ''}" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></label>
            <label class="block"><span class="block text-sm font-medium mb-1">Fișier (PDF sau poză, maximum 10 MB)${d && d.file_path ? ' – lasă gol ca să păstrezi fișierul actual' : ''}</span>
              <input name="file" type="file" accept="image/*,application/pdf"
                     class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700"></label>
            <label class="block"><span class="block text-sm font-medium mb-1">Notițe</span>
              <textarea name="notes" rows="2" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">${d ? esc(d.notes || '') : ''}</textarea></label>
          </div>
          <p class="err hidden mt-4 text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-cancel class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Anulează</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60">Salvează</button>
          </div>
        </form>`;
      root.appendChild(modal);

      const form = modal.querySelector('form');
      const err = modal.querySelector('.err');
      const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
        if (!form.vehicle.value) return fail('Alege vehiculul.');
        const file = form.file.files[0];
        if (file && file.size > 10 * 1024 * 1024) return fail('Fișierul depășește 10 MB.');

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const payload = {
          vehicle_id: form.vehicle.value,
          doc_type: form.type.value,
          title: form.title.value.trim() || null,
          expiry_date: form.expiry.value || null,
          notes: form.notes.value.trim() || null,
          file_path: d ? d.file_path : null
        };

        if (file) {
          const np = `${payload.vehicle_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error: upErr } = await sb.storage.from('vehicle-docs').upload(np, file, { contentType: file.type || 'application/octet-stream' });
          if (upErr) { btn.disabled = false; return fail('Fișierul nu s-a încărcat: ' + upErr.message); }
          if (d && d.file_path) await sb.storage.from('vehicle-docs').remove([d.file_path]);
          payload.file_path = np;
        }

        const { error } = d
          ? await sb.from('vehicle_documents').update(payload).eq('id', d.id)
          : await sb.from('vehicle_documents').insert(payload);
        btn.disabled = false;
        if (error) return fail('Nu am putut salva: ' + error.message);
        docVehicle = payload.vehicle_id;
        close();
        reload();
      });
    }

    // ----- Hartă live (PAJ GPS) -----
    const LEAFLET_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
    const PIN = { red: '#D64545', yellow: '#E5B100', green: '#2E9E5B', none: '#13315C' };

    function loadLeaflet() {
      if (window.L) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = LEAFLET_CDN + 'leaflet.css';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = LEAFLET_CDN + 'leaflet.js';
        js.onload = resolve;
        js.onerror = () => reject(new Error('Nu am putut încărca biblioteca hărții.'));
        document.head.appendChild(js);
      });
    }

    function posTime(p) {
      const n = p.dateunix ?? p.date_unix ?? p.timestamp;
      if (typeof n === 'number') return new Date(n < 1e12 ? n * 1000 : n);
      const s = p.created_at ?? p.date ?? p.datetime;
      const d = s ? new Date(s) : null;
      return d && !isNaN(d) ? d : null;
    }

    function paintMap() {
      $view.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-navy-900">Hartă live</h1>
          <button id="mapRefresh" class="text-sm px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Reîmprospătează</button>
        </div>
        <p id="mapStatus" class="mt-1 text-sm text-slate-500">Se încarcă harta…</p>
        <div id="liveMap" class="mt-4 rounded-xl border border-slate-200 overflow-hidden bg-slate-100" style="height:55vh;min-height:320px"></div>
        <div id="mapList" class="mt-4 space-y-2"></div>
        <div id="mapDevices" class="mt-6"></div>`;

      const $status = $view.querySelector('#mapStatus');
      const $list = $view.querySelector('#mapList');
      const $devices = $view.querySelector('#mapDevices');
      let map = null, timer = null, dead = false, fitted = false;
      const markers = {};

      const icon = (color) => L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10]
      });

      const vehicleFor = (dev) => vehicles.find((v) => v.paj_device_id &&
        [String(dev.id), String(dev.imei || '')].includes(String(v.paj_device_id).trim()));

      function draw(body) {
        const devices = body.devices || [], positions = body.positions || [];
        const devById = {};
        devices.forEach((d) => { devById[String(d.id)] = d; });
        const bounds = [], rows = [], seen = new Set();

        positions.forEach((p) => {
          const lat = Number(p.lat), lng = Number(p.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const key = String(p.iddevice);
          const dev = devById[key] || { id: p.iddevice, name: 'Dispozitiv ' + p.iddevice };
          const v = vehicleFor(dev);
          const st = v ? statusOf(v) : null;
          const color = PIN[st ? st.worst : 'none'];
          const label = v ? v.plate_number : (dev.name || 'Dispozitiv ' + key);
          const speed = Math.round(Number(p.speed) || 0);
          const t = posTime(p);
          const popup = `<strong>${esc(label)}</strong>${v && v.model ? '<br>' + esc(v.model) : ''}<br>${speed} km/h` +
            (t ? '<br>' + esc(t.toLocaleString('de-DE')) : '') +
            (st ? `<br>TÜV: ${esc(st.tuv.text)}<br>Ulei: ${esc(st.oil.text)}<br>Anvelope: ${esc(st.tire.text)}` : '');

          seen.add(key);
          if (markers[key]) {
            markers[key].setLatLng([lat, lng]).setIcon(icon(color)).setPopupContent(popup);
          } else {
            markers[key] = L.marker([lat, lng], { icon: icon(color) }).addTo(map)
              .bindPopup(popup)
              .bindTooltip(esc(label), { permanent: true, direction: 'top', offset: [0, -12] });
          }
          bounds.push([lat, lng]);
          rows.push({ key, label, speed, t, lat, lng, color });
        });
        Object.keys(markers).forEach((k) => { if (!seen.has(k)) { map.removeLayer(markers[k]); delete markers[k]; } });
        if (bounds.length && !fitted) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); fitted = true; }

        const noId = vehicles.filter((v) => !v.paj_device_id).length;
        $status.textContent = `Actualizat la ${new Date().toLocaleTimeString('de-DE')} · ${rows.length} pe hartă` +
          (noId ? ` · ${noId} vehicule fără ID PAJ` : '');

        $list.innerHTML = rows.map((r) => `
          <button data-pin="${esc(r.key)}" class="w-full text-left bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm flex items-center gap-3 hover:bg-slate-50">
            <span class="w-3 h-3 rounded-full shrink-0" style="background:${r.color}"></span>
            <span class="font-medium text-navy-900">${esc(r.label)}</span>
            <span class="text-slate-500">${r.speed} km/h</span>
            <span class="ml-auto text-slate-400">${r.t ? esc(r.t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })) : ''}</span>
          </button>`).join('');
        $list.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', () => {
          const r = rows.find((x) => x.key === b.dataset.pin);
          if (!r || !markers[r.key]) return;
          map.setView([r.lat, r.lng], 16);
          markers[r.key].openPopup();
          window.scrollTo(0, 0);
        }));

        // dispozitivele PAJ și ID-urile lor (de copiat în Vehicule → ID dispozitiv PAJ)
        $devices.innerHTML = `
          <details class="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <summary class="cursor-pointer font-medium text-slate-700">Dispozitive PAJ (${devices.length})</summary>
            <div class="mt-3 space-y-1.5">
              ${devices.map((d) => { const v = vehicleFor(d); return `
                <div class="flex flex-wrap gap-x-3 text-slate-600">
                  <span class="font-medium">${esc(d.name || 'fără nume')}</span>
                  <span>ID: ${esc(d.id)}</span>
                  <span>IMEI: ${esc(d.imei || '–')}</span>
                  <span class="${v ? 'text-signal-green' : 'text-slate-400'}">${v ? 'legat de ' + esc(v.plate_number) : 'nelegat de vreun vehicul'}</span>
                </div>`; }).join('') || '<p class="text-slate-400">Niciun dispozitiv returnat.</p>'}
            </div>
            <p class="mt-3 text-slate-400">Pentru a lega un dispozitiv de un vehicul, copiază ID-ul în Vehicule → Editează → ID dispozitiv PAJ.</p>
            <details class="mt-3"><summary class="cursor-pointer text-slate-500">Detalii tehnice (pentru depanare)</summary>
              <pre class="mt-2 p-2 bg-slate-50 rounded text-xs overflow-x-auto">${esc(JSON.stringify(body.sample || {}, null, 2))}</pre>
            </details>
          </details>`;
      }

      async function refresh() {
        if (!map || dead) return;
        $status.textContent = 'Se actualizează…';
        try {
          const { data: { session } } = await sb.auth.getSession();
          const r = await fetch('/api/paj-positions', { headers: { Authorization: 'Bearer ' + (session ? session.access_token : '') } });
          if (r.status === 404) throw new Error('Harta funcționează doar pe adresa publicată pe Vercel, nu local.');
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body.error || 'Eroare ' + r.status) + (body.detail ? ' [' + body.detail + ']' : ''));
          if (!dead) draw(body);
        } catch (e) {
          if (!dead) $status.innerHTML = `<span class="text-signal-red break-words">${esc(e.message)}</span>`;
        }
      }

      $view.querySelector('#mapRefresh').addEventListener('click', refresh);

      loadLeaflet().then(() => {
        if (dead) return;
        map = L.map('liveMap').setView([51.1657, 10.4515], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
        refresh();
        timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
      }).catch((e) => { $status.innerHTML = `<span class="text-signal-red">${esc(e.message)}</span>`; });

      return () => { dead = true; clearInterval(timer); if (map) map.remove(); };
    }

    reload();
  }

  window.AdminPanel = { mount };
})();
