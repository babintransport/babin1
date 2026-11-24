/* Mesaje: conversații private (șofer ↔ personal), anunțuri generale, atașamente, notificări dedicate */
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (email) => (email ? String(email).split('@')[0] : 'necunoscut');
  const ROLE = { super_admin: 'Super Administrator', admin: 'Administrator', manager: 'Manager', accountant: 'Contabil', mechanic: 'Mecanic', employee: 'Șofer' };
  const POSTERS = ['super_admin', 'admin', 'manager'];
  const hm = (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const when = (d) => {
    const x = new Date(d);
    return x.toDateString() === new Date().toDateString() ? hm(d) : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + hm(d);
  };
  const needsSql = (detail) => `<p class="rounded-lg bg-amber-50 text-slate-700 px-4 py-3 text-sm">Mesajele nu sunt activate încă. Administratorul trebuie să ruleze scriptul <strong>007_messages.sql</strong> în Supabase.<br><span class="text-slate-400">${esc(detail)}</span></p>`;

  async function compress(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))) || file;
    } catch (_) { return file; }
  }

  async function openChatFile(sb, path) {
    const isImg = /\.(jpe?g|png|webp|gif)$/i.test(path || '');
    const w = isImg ? null : window.open('', '_blank');
    const { data, error } = await sb.storage.from('chat-files').createSignedUrl(path, 300);
    if (error || !data) { if (w) w.close(); return alert('Nu am putut deschide fișierul.'); }
    if (!isImg) { if (w) w.location = data.signedUrl; else window.location = data.signedUrl; return; }
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4';
    m.innerHTML = `<img src="${data.signedUrl}" alt="Poză" class="max-h-[85vh] max-w-full rounded-lg">`;
    m.addEventListener('click', () => m.remove());
    document.body.appendChild(m);
  }

  /* ================= Notificări (insignă „Mesaje", banner, sunet, notificare de sistem) ================= */
  const Notifier = (() => {
    let ctx = null, channels = [], timer = null, vis = null, unreadDM = 0, unseenAnn = 0, audio = null;
    const names = {};
    const key = () => 'ann_seen_' + ctx.profile.id;
    const getSeen = () => { try { return localStorage.getItem(key()); } catch (_) { return null; } };
    const setSeen = (iso) => { try { localStorage.setItem(key(), iso); } catch (_) { /* ignorăm */ } };

    function render() {
      if (!ctx) return;
      const n = unreadDM + unseenAnn;
      ctx.root.querySelectorAll('[data-nav="messages"]').forEach((b) => {
        let badge = b.querySelector('[data-mbadge]');
        if (!n) { if (badge) badge.remove(); return; }
        if (!badge) {
          badge = document.createElement('span');
          badge.setAttribute('data-mbadge', '');
          badge.className = 'ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-signal-red text-white text-xs font-semibold align-middle';
          b.appendChild(badge);
        }
        badge.textContent = n > 99 ? '99+' : String(n);
      });
    }

    async function recount() {
      if (!ctx) return;
      let seen = getSeen();
      if (!seen) { seen = new Date().toISOString(); setSeen(seen); }
      const me = ctx.profile.id;
      const [d, a] = await Promise.all([
        ctx.sb.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', me).is('read_at', null),
        ctx.sb.from('announcements').select('id', { count: 'exact', head: true }).gt('created_at', seen).neq('author_id', me)
      ]);
      if (!ctx) return;
      unreadDM = d.error ? 0 : (d.count || 0);       // dacă modulul nu e activat, nu afișăm nimic
      unseenAnn = a.error ? 0 : (a.count || 0);
      render();
    }

    async function nameFor(uid) {
      if (!names[uid]) {
        const { data } = await ctx.sb.from('users').select('id, email');
        (data || []).forEach((u) => { names[u.id] = u.email; });
      }
      return nameOf(names[uid]);
    }

    function beep() {
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const o = audio.createOscillator(), g = audio.createGain();
        o.connect(g); g.connect(audio.destination);
        o.type = 'sine'; o.frequency.value = 660;
        g.gain.setValueAtTime(0.0001, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
        o.start(); o.stop(audio.currentTime + 0.26);
      } catch (_) { /* fără sunet */ }
    }

    function toast(head, title, text) {
      document.querySelectorAll('[data-msg-toast]').forEach((n) => n.remove());
      const el = document.createElement('button');
      el.setAttribute('data-msg-toast', '');
      el.className = 'fixed left-3 right-3 top-3 z-[60] max-w-md mx-auto text-left bg-navy-900 text-white rounded-xl px-4 py-3 shadow-lg';
      el.style.marginTop = 'env(safe-area-inset-top, 0px)';
      el.innerHTML = `<div class="text-xs text-slate-300">${esc(head)}</div><div class="font-semibold">${esc(title)}</div><div class="text-sm break-words">${esc(text)}</div>`;
      el.addEventListener('click', () => { el.remove(); if (ctx && ctx.openMessages) ctx.openMessages(); });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }

    async function systemNotify(title, body) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'messages', renotify: true };
        if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
      } catch (_) { /* ignorăm */ }
    }

    const watching = () => ctx && ctx.isViewingMessages() && !document.hidden;

    async function onDM(m) {
      if (!ctx) return;
      if (watching()) { setTimeout(recount, 800); return; }       // pagina Mesaje marchează singură mesajul ca citit
      unreadDM += 1; render();
      const name = await nameFor(m.sender_id);
      const text = m.message ? (m.message.length > 140 ? m.message.slice(0, 137) + '…' : m.message) : 'Atașament';
      if (document.hidden) systemNotify(name, text); else { beep(); toast('Mesaj nou', name, text); }
    }

    async function onAnn(a) {
      if (!ctx || a.author_id === ctx.profile.id) return;
      unseenAnn += 1; render();
      if (document.hidden) systemNotify('Anunț nou', a.title); else { beep(); toast('Anunț nou', a.title, a.body || ''); }
    }

    function stop() {
      channels.forEach((c) => ctx && ctx.sb.removeChannel(c));
      clearInterval(timer);
      if (vis) document.removeEventListener('visibilitychange', vis);
      ctx = null; channels = []; timer = null; vis = null; unreadDM = 0; unseenAnn = 0;
    }

    // opts: { sb, profile, root, isViewingMessages: () => bool, openMessages: () => void }
    function start(opts) {
      stop();
      ctx = opts;
      recount();
      const rand = Math.random().toString(36).slice(2);
      channels = [
        ctx.sb.channel('dm-notify-' + rand)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${ctx.profile.id}` }, (p) => onDM(p.new))
          .subscribe(),
        ctx.sb.channel('ann-notify-' + rand)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (p) => onAnn(p.new))
          .subscribe()
      ];
      timer = setInterval(() => { if (!document.hidden) recount(); }, 60000);
      vis = () => { if (!document.hidden) recount(); };
      document.addEventListener('visibilitychange', vis);
    }

    function markAnnouncementsSeen(iso) { if (!ctx) return; setSeen(iso || new Date().toISOString()); unseenAnn = 0; render(); }

    return { start, stop, refresh: recount, markAnnouncementsSeen };
  })();

  /* ================= Pagina Mesaje ================= */
  function mount(el, { sb, profile }) {
    const me = profile.id;
    const isStaff = profile.role !== 'employee';
    const canPost = POSTERS.includes(profile.role);
    let tab = 'chats', active = null, people = [], all = [], thread = [], anns = [];
    let loadError = '', channel = null, timer = null, destroyed = false;
    const users = {};

    el.innerHTML = `
      <h1 class="text-2xl font-semibold text-navy-900">Mesaje</h1>
      <div class="mt-3 flex gap-2 text-sm">
        <button data-tab="chats" class="px-4 py-2 rounded-full">Conversații</button>
        <button data-tab="ann" class="px-4 py-2 rounded-full">Anunțuri</button>
      </div>
      <div id="msgBody" class="mt-4"></div>`;
    const body = el.querySelector('#msgBody');

    const setTabs = () => el.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.className = 'px-4 py-2 rounded-full ' + (on ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50');
    });
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; active = null; paint(); }));

    async function loadBase() {
      const u = await sb.from('users').select('*');
      (u.data || []).forEach((x) => { users[x.id] = x; });
      people = (u.data || []).filter((p) => p.id !== me && (isStaff || p.role !== 'employee'))
        .sort((a, b) => a.email.localeCompare(b.email));
      const m = await sb.from('direct_messages').select('*')
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at', { ascending: false }).limit(300);
      loadError = m.error ? m.error.message : '';
      all = m.data || [];
    }

    function summary() {
      const map = {};
      people.forEach((p) => { map[p.id] = { p, last: null, unread: 0 }; });
      all.forEach((m) => {
        const other = m.sender_id === me ? m.recipient_id : m.sender_id;
        const s = map[other];
        if (!s) return;
        if (!s.last) s.last = m;
        if (m.recipient_id === me && !m.read_at) s.unread += 1;
      });
      return Object.values(map).sort((a, b) =>
        (b.last ? new Date(b.last.created_at) : 0) - (a.last ? new Date(a.last.created_at) : 0) || a.p.email.localeCompare(b.p.email));
    }

    function paint() {
      setTabs();
      if (destroyed) return;
      if (tab === 'ann') return paintAnn();
      if (loadError) { body.innerHTML = needsSql(loadError); return; }
      return active ? paintThread() : paintList();
    }

    function paintList() {
      const rows = summary();
      body.innerHTML = rows.length ? `<div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        ${rows.map(({ p, last, unread }) => `
          <button data-open="${p.id}" class="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 first:border-0 hover:bg-slate-50">
            <span class="w-10 h-10 rounded-full bg-navy-900 text-white font-semibold flex items-center justify-center shrink-0">${esc(p.email.charAt(0).toUpperCase())}</span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2"><span class="font-medium text-ink truncate">${esc(nameOf(p.email))}</span><span class="text-xs text-slate-400">${ROLE[p.role] || ''}</span></span>
              <span class="block text-sm text-slate-500 truncate">${last ? (last.sender_id === me ? 'Tu: ' : '') + esc(last.message || 'Atașament') : 'Nicio conversație încă'}</span>
            </span>
            <span class="shrink-0 flex flex-col items-end gap-1">
              ${last ? `<span class="text-xs text-slate-400">${when(last.created_at)}</span>` : ''}
              ${unread ? `<span class="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-signal-red text-white text-xs font-semibold flex items-center justify-center">${unread}</span>` : ''}
            </span>
          </button>`).join('')}
      </div>` : '<p class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Nu există persoane cu care poți vorbi.</p>';
      body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openThread(b.dataset.open)));
    }

    async function openThread(id) {
      active = id;
      const t = await sb.from('direct_messages').select('*')
        .or(`and(sender_id.eq.${me},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${me})`)
        .order('created_at', { ascending: false }).limit(200);
      if (destroyed || active !== id) return;
      thread = (t.data || []).reverse();
      paintThread();
      markRead();
    }

    async function markRead() {
      if (!active) return;
      const unread = all.some((m) => m.sender_id === active && m.recipient_id === me && !m.read_at);
      if (!unread) { Notifier.refresh(); return; }
      const now = new Date().toISOString();
      await sb.from('direct_messages').update({ read_at: now }).eq('recipient_id', me).eq('sender_id', active).is('read_at', null);
      all.forEach((m) => { if (m.sender_id === active && m.recipient_id === me && !m.read_at) m.read_at = now; });
      Notifier.refresh();
    }

    function renderThreadList(force) {
      const list = body.querySelector('#thList');
      if (!list) return;
      const near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      list.innerHTML = thread.length ? thread.map((m) => {
        const mine = m.sender_id === me;
        return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}">
            ${m.message ? `<div class="whitespace-pre-wrap break-words">${esc(m.message)}</div>` : ''}
            ${m.file_path ? `<button data-file="${esc(m.file_path)}" class="mt-1 text-sm underline">Deschide atașamentul</button>` : ''}
            <div class="mt-0.5 text-[11px] text-right ${mine ? 'text-slate-300' : 'text-slate-400'}">${hm(m.created_at)}${mine && m.read_at ? ' · citit' : ''}</div>
          </div></div>`;
      }).join('') : '<p class="text-center text-sm text-slate-400 py-6">Niciun mesaj încă. Scrie primul mesaj.</p>';
      if (force || near) list.scrollTop = list.scrollHeight;
      list.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', () => openChatFile(sb, b.dataset.file)));
    }

    function paintThread() {
      const p = users[active] || {};
      body.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
          <button data-back class="text-sm text-signal-green font-medium">← Înapoi</button>
          <div class="font-semibold text-navy-900 truncate">${esc(nameOf(p.email))} <span class="text-xs text-slate-400 font-normal">${ROLE[p.role] || ''}</span></div>
        </div>
        <div class="flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden" style="height: calc(100dvh - 19rem); min-height: 300px;">
          <div id="thList" class="flex-1 overflow-y-auto p-3 space-y-2"></div>
          <form id="thForm" class="border-t border-slate-200 p-2 flex items-end gap-2">
            <label class="shrink-0 cursor-pointer px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm">Atașează<input id="thFile" type="file" accept="image/*,application/pdf" class="hidden"></label>
            <textarea id="thInput" rows="1" maxlength="2000" placeholder="Scrie un mesaj…" class="field flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 max-h-32"></textarea>
            <button id="thSend" type="submit" class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 disabled:opacity-60">Trimite</button>
          </form>
        </div>
        <p id="thInfo" class="mt-2 text-sm text-slate-500"></p>`;
      renderThreadList(true);

      const input = body.querySelector('#thInput'), fileIn = body.querySelector('#thFile'), info = body.querySelector('#thInfo');
      body.querySelector('[data-back]').addEventListener('click', () => { active = null; paint(); });
      fileIn.addEventListener('change', () => { info.className = 'mt-2 text-sm text-slate-500'; info.textContent = fileIn.files[0] ? 'Atașament: ' + fileIn.files[0].name : ''; });
      input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 128) + 'px'; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); body.querySelector('#thForm').requestSubmit(); }
      });

      body.querySelector('#thForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim(), file = fileIn.files[0];
        const fail = (m) => { info.className = 'mt-2 text-sm text-signal-red'; info.textContent = m; };
        if (!text && !file) return;
        if (file && file.size > 10 * 1024 * 1024) return fail('Fișierul depășește 10 MB.');
        const btn = body.querySelector('#thSend');
        btn.disabled = true;
        let path = null;
        if (file) {
          const isImg = (file.type || '').startsWith('image/');
          const blob = isImg ? await compress(file) : file;
          const ext = isImg && blob.type === 'image/jpeg' ? 'jpg' : ((file.name.split('.').pop() || 'bin').toLowerCase());
          path = `${me}/${active}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { error: upErr } = await sb.storage.from('chat-files').upload(path, blob, { contentType: blob.type || file.type || 'application/octet-stream' });
          if (upErr) { btn.disabled = false; return fail('Fișierul nu s-a încărcat: ' + upErr.message); }
        }
        const { data, error } = await sb.from('direct_messages').insert({ recipient_id: active, message: text, file_path: path }).select().single();
        btn.disabled = false;
        if (error) return fail('Nu am putut trimite: ' + error.message);
        info.textContent = ''; input.value = ''; fileIn.value = ''; input.style.height = 'auto';
        thread.push(data); all.unshift(data);
        renderThreadList(true);
        input.focus();
      });
    }

    // ----- Anunțuri -----
    async function paintAnn() {
      body.innerHTML = '<p class="text-slate-500">Se încarcă…</p>';
      const r = await sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(50);
      if (destroyed || tab !== 'ann') return;
      if (r.error) { body.innerHTML = needsSql(r.error.message); return; }
      anns = r.data || [];
      Notifier.markAnnouncementsSeen(anns[0] && anns[0].created_at);

      body.innerHTML = `
        ${canPost ? `
        <form id="annForm" class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3" novalidate>
          <h2 class="font-semibold text-navy-900">Anunț nou pentru toți</h2>
          <input name="title" maxlength="120" placeholder="Titlu" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5">
          <textarea name="body" rows="3" maxlength="2000" placeholder="Mesaj (opțional)" class="field w-full rounded-lg border border-slate-300 px-3 py-2.5"></textarea>
          <p id="annErr" class="hidden text-sm text-signal-red"></p>
          <button class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 disabled:opacity-60">Publică</button>
        </form>` : ''}
        <div class="${canPost ? 'mt-4' : ''} space-y-3">
          ${anns.length ? anns.map((a) => `
            <article class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="font-semibold text-navy-900 break-words">${esc(a.title)}</h3>
                  <p class="text-xs text-slate-400">${esc(nameOf((users[a.author_id] || {}).email))} · ${when(a.created_at)}</p>
                </div>
                ${canPost ? `<button data-adel="${a.id}" class="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-signal-red hover:bg-red-50">Șterge</button>` : ''}
              </div>
              ${a.body ? `<p class="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">${esc(a.body)}</p>` : ''}
            </article>`).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">Niciun anunț.</p>'}
        </div>`;

      const form = body.querySelector('#annForm');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = body.querySelector('#annErr');
        err.classList.add('hidden');
        const title = form.title.value.trim();
        if (!title) { err.textContent = 'Scrie un titlu.'; err.classList.remove('hidden'); return; }
        const btn = form.querySelector('button'); btn.disabled = true;
        const { error } = await sb.from('announcements').insert({ title, body: form.body.value.trim() || null });
        btn.disabled = false;
        if (error) { err.textContent = 'Nu am putut publica: ' + error.message; err.classList.remove('hidden'); return; }
        paintAnn();
      });
      body.querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ștergi acest anunț?')) return;
        const { error } = await sb.from('announcements').delete().eq('id', b.dataset.adel);
        if (error) return alert('Nu am putut șterge: ' + error.message);
        paintAnn();
      }));
    }

    // ----- pornire -----
    (async () => {
      body.innerHTML = '<p class="text-slate-500">Se încarcă…</p>';
      await loadBase();
      if (destroyed) return;
      paint();

      channel = sb.channel('dm-view-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${me}` }, async (p) => {
          const m = p.new;
          if (destroyed || all.some((x) => x.id === m.id)) return;
          if (!users[m.sender_id]) await loadBase();
          all.unshift(m);
          if (tab === 'chats' && active === m.sender_id) { thread.push(m); renderThreadList(false); markRead(); }
          else if (tab === 'chats' && !active) paintList();
        })
        .subscribe();

      // rezervă: reîmprospătare la 30 de secunde dacă timpul real nu funcționează
      timer = setInterval(async () => {
        if (document.hidden || destroyed || tab !== 'chats') return;
        await loadBase();
        if (destroyed) return;
        if (!active) paintList();
      }, 30000);
    })();

    return () => {
      destroyed = true;
      clearInterval(timer);
      if (channel) sb.removeChannel(channel);
      Notifier.refresh();
    };
  }

  window.MessagesNotifier = Notifier;
  window.Messages = { mount };
})();
