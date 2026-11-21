/* Panou administrator – Pasul 2 (părțile 1 și 2): structură, Vehicule, Centru de alerte */
(() => {
  // ---------- Regulile semaforului (le poți modifica aici) ----------
  const RULES = {
    tuvRedDays: 14,          // TÜV: roșu dacă expiră în maximum 14 zile (sau a expirat)
    tuvYellowDays: 60,       // galben dacă expiră în maximum 60 de zile
    oilIntervalKm: 15000,    // interval între schimburile de ulei
    oilYellowKm: 1500,       // galben când mai sunt sub 1.500 km
    treadRedMm: 1.6,         // limita legală în Germania
    treadYellowSummerMm: 3,  // recomandare vară / all-season
    treadYellowWinterMm: 4   // recomandare iarnă
  };

  const LEVEL = { red: 0, yellow: 1, green: 2, none: 3 };
  const DOT = { red: 'bg-signal-red', yellow: 'bg-signal-yellow', green: 'bg-signal-green', none: 'bg-slate-300' };
  const TIRE = { vara: 'Vară', iarna: 'Iarnă', 'all-season': 'All-season' };
  const SOON = ['Combustibil', 'Istoric șoferi', 'Hartă live'];

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

  function statusOf(v) {
    const tuv = tuvStatus(v), oil = oilStatus(v), tire = tireStatus(v);
    const worst = [tuv, oil, tire].map((s) => s.level).sort((a, b) => LEVEL[a] - LEVEL[b])[0];
    return { tuv, oil, tire, worst };
  }

  const statusItem = (label, s) => `
    <div class="flex items-start gap-2 text-sm">
      <span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[s.level]}"></span>
      <div><div class="font-medium text-slate-800">${label}</div><div class="text-slate-500">${esc(s.text)}</div></div>
    </div>`;

  // ---------- Structura panoului ----------
  const navBtn = (id, label) =>
    `<button data-nav="${id}" class="nav-btn text-left px-3 py-2 rounded-lg hover:bg-white/10">${label}</button>`;
  const tabBtn = (id, label) =>
    `<button data-nav="${id}" class="tab-btn py-3 text-slate-500">${label}</button>`;

  const shell = (email) => `
    <style>
      .nav-btn[aria-current="page"] { background: rgba(255,255,255,.14); font-weight: 600; }
      .tab-btn[aria-current="page"] { color: #0B2545; font-weight: 600; box-shadow: inset 0 2px 0 #0B2545; }
    </style>
    <div class="min-h-full md:flex bg-slate-50">
      <aside class="hidden md:flex md:flex-col md:w-64 md:sticky md:top-0 md:h-screen bg-navy-900 text-white p-5 gap-6">
        <div class="flex items-center gap-2">
          <span class="flex gap-1" aria-hidden="true"><i class="w-2.5 h-2.5 rounded-full bg-signal-red"></i><i class="w-2.5 h-2.5 rounded-full bg-signal-yellow"></i><i class="w-2.5 h-2.5 rounded-full bg-signal-green"></i></span>
          <span class="font-semibold">Managementul flotei</span>
        </div>
        <nav class="flex flex-col gap-1">
          ${navBtn('alerts', 'Centru de alerte')}
          ${navBtn('vehicles', 'Vehicule')}
          ${navBtn('tasks', 'Task-uri')}
          ${navBtn('defects', 'Defecțiuni')}
          <div class="mt-4 mb-1 px-3 text-sm text-slate-400">În curând</div>
          ${SOON.map((s) => `<div class="px-3 py-1.5 text-slate-400">${s}</div>`).join('')}
        </nav>
        <div class="mt-auto text-sm">
          <div class="text-slate-300 truncate">${esc(email)}</div>
          <button data-logout class="mt-2 w-full bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2">Deconectare</button>
        </div>
      </aside>

      <div class="flex-1 min-w-0">
        <header class="md:hidden bg-navy-900 text-white px-4 py-3 flex items-center justify-between">
          <span class="font-semibold">Managementul flotei</span>
          <button data-logout class="text-sm bg-white/10 rounded-lg px-3 py-1.5">Deconectare</button>
        </header>
        <main id="adminView" class="p-4 md:p-8 pb-24 md:pb-8 max-w-5xl"></main>
      </div>

      <nav class="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 grid grid-cols-4"
           style="padding-bottom:env(safe-area-inset-bottom,0px)">
        ${tabBtn('alerts', 'Alerte')}
        ${tabBtn('vehicles', 'Vehicule')}
        ${tabBtn('tasks', 'Task-uri')}
        ${tabBtn('defects', 'Defecțiuni')}
      </nav>
    </div>`;

  // ---------- Panoul ----------
  function mount({ sb, profile, root, onLogout }) {
    let vehicles = [], tasks = [], people = [], defects = [];
    let view = 'alerts';
    let loading = true;
    let loadError = '';

    root.innerHTML = shell(profile.email);
    const $view = root.querySelector('#adminView');

    root.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => { view = b.dataset.nav; paint(); window.scrollTo(0, 0); }));
    root.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', onLogout));

    async function reload() {
      loading = true; paint();
      const [v, t, u, d] = await Promise.all([
        sb.from('vehicles').select('*').order('plate_number'),
        sb.from('tasks').select('*').order('created_at', { ascending: false }),
        sb.from('users').select('id, email, role').order('email'),
        sb.from('defects').select('*').order('created_at', { ascending: false })
      ]);
      loading = false;
      const err = v.error || t.error || u.error || d.error;
      loadError = err ? 'Nu am putut încărca datele: ' + err.message : '';
      vehicles = v.data || []; tasks = t.data || []; people = u.data || []; defects = d.data || [];
      paint();
    }

    function paint() {
      root.querySelectorAll('[data-nav]').forEach((b) =>
        b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
      if (loading) { $view.innerHTML = '<p class="text-slate-500">Se încarcă…</p>'; return; }
      if (loadError) { $view.innerHTML = `<p class="rounded-lg bg-red-50 text-signal-red px-3 py-2">${esc(loadError)}</p>`; return; }
      if (view === 'alerts') paintAlerts();
      else if (view === 'vehicles') paintVehicles();
      else if (view === 'tasks') paintTasks();
      else paintDefects();
    }

    const emptyState = () => `
      <div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p class="text-slate-600">Nu ai niciun vehicul încă.</p>
        <button data-add class="mt-3 rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2">Adaugă primul vehicul</button>
      </div>`;

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
              <div class="mt-3 grid sm:grid-cols-3 gap-3">${statusItem('TÜV', st.tuv)}${statusItem('Ulei', st.oil)}${statusItem('Anvelope', st.tire)}</div>
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
                <div class="flex gap-2 shrink-0">
                  <button data-edit="${v.id}" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Editează</button>
                  <button data-del="${v.id}" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>
                </div>
              </div>
              <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
                <dt>Kilometraj</dt><dd>${v.current_km != null ? nf(v.current_km) + ' km' : '–'}</dd>
                <dt>Anvelope</dt><dd>${esc(TIRE[v.tire_type] || '–')}</dd>
                <dt>Dispozitiv PAJ</dt><dd class="truncate">${esc(v.paj_device_id || '–')}</dd>
              </dl>
              <div class="mt-3 pt-3 border-t border-slate-100 grid sm:grid-cols-3 gap-3">
                ${statusItem('TÜV', st.tuv)}${statusItem('Ulei', st.oil)}${statusItem('Anvelope', st.tire)}
              </div>
            </article>`;
          }).join('') : emptyState()}
        </div>`;
      bindAdd();
      $view.querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => openForm(vehicles.find((v) => v.id === b.dataset.edit))));
      $view.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', () => removeVehicle(vehicles.find((v) => v.id === b.dataset.del))));
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

    reload();
  }

  window.AdminPanel = { mount };
})();
