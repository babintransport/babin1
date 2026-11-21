/* Interfață angajat – Pasul 3 (partea 1): Task-uri și Tankbuch (jurnal alimentări) */
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d = 0) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtDate = (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const T_STATUS = { open: 'De făcut', in_progress: 'În lucru', done: 'Finalizat' };
  const T_DOT = { open: 'bg-slate-400', in_progress: 'bg-signal-yellow', done: 'bg-signal-green' };

  // Micșorează poza înainte de încărcare (bonurile de pe telefon au câțiva MB)
  async function compress(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      return blob || file;
    } catch (_) {
      return file;
    }
  }

  function mount({ sb, profile, root, onLogout }) {
    let view = 'tasks';
    let tasks = [], vehicles = [], logs = [], defects = [];
    let loading = true, loadError = '', notice = '', lastVehicle = '';

    root.innerHTML = `
      <style>.tab-btn[aria-current="page"] { color: #0B2545; font-weight: 600; box-shadow: inset 0 2px 0 #0B2545; }</style>
      <div class="min-h-full bg-slate-50">
        <header class="bg-navy-900 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold">Flotă</div>
            <div class="text-xs text-slate-300 truncate">${esc(profile.email)}</div>
          </div>
          <button data-logout class="text-sm bg-white/10 rounded-lg px-3 py-1.5 shrink-0">Deconectare</button>
        </header>
        <main id="empView" class="p-4 pb-24 max-w-xl mx-auto"></main>
        <nav class="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 grid grid-cols-3"
             style="padding-bottom:env(safe-area-inset-bottom,0px)">
          <button data-nav="tasks" class="tab-btn py-3 text-slate-500">Task-uri</button>
          <button data-nav="fuel" class="tab-btn py-3 text-slate-500">Alimentări</button>
          <button data-nav="defects" class="tab-btn py-3 text-slate-500">Defecțiuni</button>
        </nav>
      </div>`;

    const $view = root.querySelector('#empView');
    root.querySelector('[data-logout]').addEventListener('click', onLogout);
    root.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => { view = b.dataset.nav; notice = ''; paint(); window.scrollTo(0, 0); }));

    async function load(spinner = true) {
      if (spinner) { loading = true; paint(); }
      const [t, v, l, d] = await Promise.all([
        sb.from('tasks').select('*').eq('assigned_to', profile.id).order('created_at', { ascending: false }),
        sb.from('vehicles').select('id, plate_number, model, current_km').order('plate_number'),
        sb.from('fuel_logs').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20),
        sb.from('defects').select('*').eq('reported_by', profile.id).order('created_at', { ascending: false }).limit(20)
      ]);
      loading = false;
      const err = t.error || v.error || l.error || d.error;
      loadError = err ? 'Nu am putut încărca datele: ' + err.message : '';
      tasks = t.data || []; vehicles = v.data || []; logs = l.data || []; defects = d.data || [];
      paint();
    }

    function paint() {
      root.querySelectorAll('[data-nav]').forEach((b) =>
        b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
      if (loading) { $view.innerHTML = '<p class="text-slate-500">Se încarcă…</p>'; return; }
      if (loadError) { $view.innerHTML = `<p class="rounded-lg bg-red-50 text-signal-red px-3 py-2">${esc(loadError)}</p>`; return; }
      if (view === 'tasks') paintTasks();
      else if (view === 'fuel') paintFuel();
      else paintDefects();
    }

    // ---------- Task-urile mele ----------
    function paintTasks() {
      const actions = (t) => ({
        open: [['in_progress', 'Începe'], ['done', 'Finalizează']],
        in_progress: [['done', 'Finalizează']],
        done: [['open', 'Redeschide']]
      }[t.status] || []);

      const card = (t) => `
        <article class="bg-white rounded-xl border border-slate-200 p-4">
          <div class="flex items-start gap-2">
            <span class="mt-2 w-2.5 h-2.5 rounded-full shrink-0 ${T_DOT[t.status]}"></span>
            <div class="min-w-0">
              <p class="font-medium text-slate-800 break-words ${t.status === 'done' ? 'line-through text-slate-400' : ''}">${esc(t.title)}</p>
              <p class="text-sm text-slate-500">${T_STATUS[t.status]}</p>
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            ${actions(t).map(([st, label]) => `
              <button data-set="${t.id}|${st}" class="flex-1 text-sm py-2 rounded-lg ${st === 'done' ? 'bg-navy-900 text-white hover:bg-navy-800' : 'border border-slate-300 hover:bg-slate-50'}">${label}</button>`).join('')}
          </div>
        </article>`;

      const active = tasks.filter((t) => t.status !== 'done');
      const done = tasks.filter((t) => t.status === 'done');

      $view.innerHTML = `
        <h1 class="text-2xl font-semibold text-navy-900">Task-urile mele</h1>
        <div class="mt-4 space-y-3">
          ${active.length ? active.map(card).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Nu ai task-uri active.</p>'}
        </div>
        ${done.length ? `<h2 class="mt-8 mb-3 font-semibold text-slate-600">Finalizate (${done.length})</h2><div class="space-y-3">${done.map(card).join('')}</div>` : ''}`;

      $view.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', async () => {
        const [id, status] = b.dataset.set.split('|');
        b.disabled = true;
        const { error } = await sb.from('tasks').update({ status }).eq('id', id);
        if (error) alert('Nu am putut schimba starea: ' + error.message);
        else { const t = tasks.find((x) => x.id === id); if (t) t.status = status; }
        paint();
      }));
    }

    // ---------- Tankbuch ----------
    function paintFuel() {
      const plate = (id) => (vehicles.find((v) => v.id === id) || {}).plate_number || '–';

      $view.innerHTML = `
        <h1 class="text-2xl font-semibold text-navy-900">Alimentare nouă</h1>
        ${notice ? `<p class="mt-3 text-sm rounded-lg bg-green-50 text-signal-green px-3 py-2">${esc(notice)}</p>` : ''}
        ${vehicles.length ? `
        <form id="fuelForm" class="mt-4 bg-white rounded-xl border border-slate-200 p-4 space-y-4" novalidate>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Vehicul</span>
            <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              <option value="">Alege vehiculul</option>
              ${vehicles.map((v) => `<option value="${v.id}" ${v.id === lastVehicle ? 'selected' : ''}>${esc(v.plate_number)}${v.model ? ' – ' + esc(v.model) : ''}</option>`).join('')}
            </select>
            <span id="kmHint" class="block mt-1 text-sm text-slate-500"></span>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block col-span-2">
              <span class="block text-sm font-medium mb-1">Kilometraj la alimentare</span>
              <input name="km" type="number" min="0" inputmode="numeric" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">
            </label>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Litri</span>
              <input name="liters" type="number" min="0" step="0.01" inputmode="decimal" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">
            </label>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Total (€)</span>
              <input name="price" type="number" min="0" step="0.01" inputmode="decimal" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">
            </label>
          </div>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Poza bonului</span>
            <input name="photo" type="file" accept="image/*" capture="environment"
                   class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700">
          </label>
          <p id="fuelErr" class="hidden text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <button type="submit" class="w-full rounded-lg bg-navy-900 hover:bg-navy-800 text-white font-medium py-3 disabled:opacity-60">Salvează alimentarea</button>
        </form>` : '<p class="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Nu există vehicule. Cere administratorului să le adauge.</p>'}

        <h2 class="mt-8 mb-3 font-semibold text-slate-600">Ultimele mele alimentări</h2>
        <div class="space-y-2">
          ${logs.length ? logs.map((l) => `
            <div class="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <div class="flex justify-between gap-2">
                <span class="font-medium text-navy-900">${esc(plate(l.vehicle_id))}</span>
                <span class="text-slate-500">${fmtDate(l.created_at)}</span>
              </div>
              <div class="mt-1 text-slate-600">${nf(l.liters, 2)} L · ${nf(l.total_price, 2)} € · ${nf(l.kilometers)} km${l.receipt_photo_url ? ' · bon atașat' : ''}</div>
            </div>`).join('') : '<p class="text-sm text-slate-400">Nicio alimentare înregistrată încă.</p>'}
        </div>`;

      const form = $view.querySelector('#fuelForm');
      if (!form) return;
      const err = $view.querySelector('#fuelErr');
      const hint = $view.querySelector('#kmHint');
      const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };

      const showHint = () => {
        const v = vehicles.find((x) => x.id === form.vehicle.value);
        hint.textContent = v && v.current_km != null ? `Ultimul kilometraj cunoscut: ${nf(v.current_km)} km` : '';
      };
      form.vehicle.addEventListener('change', () => { lastVehicle = form.vehicle.value; showHint(); });
      showHint();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const v = vehicles.find((x) => x.id === form.vehicle.value);
        if (!v) return fail('Alege vehiculul.');
        if (form.km.value === '' || form.liters.value === '' || form.price.value === '') return fail('Completează kilometrajul, litrii și totalul.');
        const km = Math.round(Number(form.km.value));
        const liters = Number(form.liters.value);
        const price = Number(form.price.value);
        if (!(liters > 0)) return fail('Numărul de litri trebuie să fie mai mare decât 0.');
        if (!(price >= 0) || !(km >= 0)) return fail('Verifică valorile introduse.');
        if (v.current_km != null && km < v.current_km &&
            !confirm(`Kilometrajul (${nf(km)}) este mai mic decât ultimul cunoscut (${nf(v.current_km)}). Salvezi oricum?`)) return;

        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true; btn.textContent = 'Se salvează…';

        let path = null;
        const file = form.photo.files[0];
        if (file) {
          const blob = await compress(file);
          const ext = blob.type === 'image/jpeg' ? 'jpg' : ((file.name.split('.').pop() || 'bin').toLowerCase());
          path = `${profile.id}/${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage.from('receipts').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
          if (upErr) { btn.disabled = false; btn.textContent = 'Salvează alimentarea'; return fail('Poza nu s-a încărcat: ' + upErr.message); }
        }

        const { error } = await sb.from('fuel_logs').insert({
          vehicle_id: v.id, kilometers: km, liters, total_price: price, receipt_photo_url: path
        });
        if (error) { btn.disabled = false; btn.textContent = 'Salvează alimentarea'; return fail('Nu am putut salva: ' + error.message); }

        lastVehicle = v.id;
        notice = 'Alimentarea a fost salvată.';
        await load(false);
      });
    }

    // ---------- Mängelmelder (raportare defecțiuni) ----------
    const D_STATUS = { new: 'Nou', in_progress: 'În lucru', resolved: 'Rezolvat' };
    const D_DOT = { new: 'bg-signal-red', in_progress: 'bg-signal-yellow', resolved: 'bg-signal-green' };
    const CATS = ['Frâne', 'Motor', 'Anvelope', 'Lumini', 'Caroserie', 'Interior', 'Sistem electric', 'Altele'];

    function paintDefects() {
      const plate = (id) => (vehicles.find((v) => v.id === id) || {}).plate_number || '–';

      $view.innerHTML = `
        <h1 class="text-2xl font-semibold text-navy-900">Raportează o defecțiune</h1>
        ${notice ? `<p class="mt-3 text-sm rounded-lg bg-green-50 text-signal-green px-3 py-2">${esc(notice)}</p>` : ''}
        ${vehicles.length ? `
        <form id="defForm" class="mt-4 bg-white rounded-xl border border-slate-200 p-4 space-y-4" novalidate>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Vehicul</span>
            <select name="vehicle" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              <option value="">Alege vehiculul</option>
              ${vehicles.map((v) => `<option value="${v.id}" ${v.id === lastVehicle ? 'selected' : ''}>${esc(v.plate_number)}${v.model ? ' – ' + esc(v.model) : ''}</option>`).join('')}
            </select>
          </label>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Categorie</span>
            <select name="category" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
              ${CATS.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </label>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Ce nu funcționează?</span>
            <textarea name="description" rows="4" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"
                      placeholder="Descrie problema: ce se întâmplă, când apare, cât de grav e"></textarea>
          </label>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Poză (opțional)</span>
            <input name="photo" type="file" accept="image/*" capture="environment"
                   class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700">
          </label>
          <p id="defErr" class="hidden text-sm rounded-lg bg-red-50 text-signal-red px-3 py-2" role="alert"></p>
          <button type="submit" class="w-full rounded-lg bg-navy-900 hover:bg-navy-800 text-white font-medium py-3 disabled:opacity-60">Trimite raportul</button>
        </form>` : '<p class="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Nu există vehicule. Cere administratorului să le adauge.</p>'}

        <h2 class="mt-8 mb-3 font-semibold text-slate-600">Rapoartele mele</h2>
        <div class="space-y-2">
          ${defects.length ? defects.map((d) => `
            <div class="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-navy-900">${esc(plate(d.vehicle_id))} · ${esc(d.category || '')}</span>
                <span class="flex items-center gap-1.5 text-slate-600 shrink-0"><i class="w-2.5 h-2.5 rounded-full ${D_DOT[d.status]}"></i>${D_STATUS[d.status]}</span>
              </div>
              <p class="mt-1 text-slate-600 break-words">${esc(d.description)}</p>
              <p class="mt-1 text-slate-400">${fmtDate(d.created_at)}${d.photo_url ? ' · poză atașată' : ''}</p>
            </div>`).join('') : '<p class="text-sm text-slate-400">Nu ai raportat nicio defecțiune.</p>'}
        </div>`;

      const form = $view.querySelector('#defForm');
      if (!form) return;
      const err = $view.querySelector('#defErr');
      const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
      form.vehicle.addEventListener('change', () => { lastVehicle = form.vehicle.value; });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const v = vehicles.find((x) => x.id === form.vehicle.value);
        const description = form.description.value.trim();
        if (!v) return fail('Alege vehiculul.');
        if (description.length < 5) return fail('Descrie pe scurt problema (minimum 5 caractere).');

        const btn = form.querySelector('[type="submit"]');
        const reset = () => { btn.disabled = false; btn.textContent = 'Trimite raportul'; };
        btn.disabled = true; btn.textContent = 'Se trimite…';

        let path = null;
        const file = form.photo.files[0];
        if (file) {
          const blob = await compress(file);
          const ext = blob.type === 'image/jpeg' ? 'jpg' : ((file.name.split('.').pop() || 'bin').toLowerCase());
          path = `${profile.id}/${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage.from('defect-photos').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
          if (upErr) { reset(); return fail('Poza nu s-a încărcat: ' + upErr.message); }
        }

        const { error } = await sb.from('defects').insert({
          vehicle_id: v.id, category: form.category.value, description, photo_url: path
        });
        if (error) { reset(); return fail('Nu am putut trimite raportul: ' + error.message); }

        lastVehicle = v.id;
        notice = 'Defecțiunea a fost raportată. Mulțumim!';
        await load(false);
      });
    }

    load();
  }

  window.EmployeePanel = { mount };
})();
