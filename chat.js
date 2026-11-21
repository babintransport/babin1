/* Chat de grup – doar text, ultimele 30 de zile, actualizare în timp real (cu reîmprospătare de rezervă) */
(() => {
  const DAYS = 30;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (email) => (email ? String(email).split('@')[0] : 'necunoscut');

  // Montează chatul în elementul `el`. Returnează o funcție care oprește tot (apelată la schimbarea paginii).
  function mount(el, { sb, profile, isAdmin }) {
    let msgs = [];
    const names = {};
    let channel = null, timer = null, destroyed = false;

    const canAsk = 'Notification' in window && Notification.permission === 'default';

    el.innerHTML = `
      <h1 class="text-2xl font-semibold text-navy-900">Chat</h1>
      <p class="text-sm text-slate-500 mt-1">Doar text. Mesajele mai vechi de ${DAYS} de zile dispar.</p>
      ${canAsk ? `<div id="notifBar" class="mt-3 flex items-center justify-between gap-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-slate-700">
        <span>Vrei să fii anunțat când scrie cineva?</span>
        <button type="button" class="shrink-0 rounded-lg bg-navy-900 text-white px-3 py-1.5">Activează notificările</button>
      </div>` : ''}
      <div class="mt-4 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden"
           style="height: calc(100dvh - 16rem); min-height: 300px;">
        <div id="chatList" class="flex-1 overflow-y-auto p-3 space-y-2"></div>
        <form id="chatForm" class="border-t border-slate-200 p-2 flex items-end gap-2">
          <textarea id="chatInput" rows="1" maxlength="2000" placeholder="Scrie un mesaj…"
                    class="field flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 max-h-32"></textarea>
          <button id="chatSend" type="submit" class="rounded-lg bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 disabled:opacity-60">Trimite</button>
        </form>
      </div>
      <p id="chatErr" class="hidden mt-2 text-sm text-signal-red"></p>`;

    const list = el.querySelector('#chatList');
    const form = el.querySelector('#chatForm');
    const input = el.querySelector('#chatInput');
    const sendBtn = el.querySelector('#chatSend');
    const errEl = el.querySelector('#chatErr');

    const showErr = (m) => { errEl.textContent = m; errEl.classList.toggle('hidden', !m); };
    const markSeen = () => window.ChatNotifier && window.ChatNotifier.markRead(msgs.length ? msgs[msgs.length - 1].created_at : undefined);

    const bar = el.querySelector('#notifBar');
    if (bar) bar.querySelector('button').addEventListener('click', async () => {
      try { await Notification.requestPermission(); } catch (_) { /* ignorăm */ }
      bar.remove();
    });

    function render(forceBottom) {
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      let lastDay = '';
      list.innerHTML = msgs.length ? msgs.map((m) => {
        const d = new Date(m.created_at);
        const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const sep = day !== lastDay ? `<div class="text-center text-xs text-slate-400 py-1">${day}</div>` : '';
        lastDay = day;
        const mine = m.user_id === profile.id;
        return sep + `
          <div class="flex ${mine ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}">
              ${mine ? '' : `<div class="text-xs font-semibold text-navy-700 mb-0.5">${esc(nameOf(names[m.user_id]))}</div>`}
              <div class="whitespace-pre-wrap break-words">${esc(m.message)}</div>
              <div class="mt-0.5 text-[11px] flex items-center justify-end gap-2 ${mine ? 'text-slate-300' : 'text-slate-400'}">
                ${time}${isAdmin ? `<button data-del="${m.id}" class="underline">șterge</button>` : ''}
              </div>
            </div>
          </div>`;
      }).join('') : '<p class="text-center text-sm text-slate-400 py-6">Niciun mesaj încă. Scrie primul mesaj.</p>';

      if (forceBottom || nearBottom) list.scrollTop = list.scrollHeight;

      list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ștergi acest mesaj?')) return;
        const { error } = await sb.from('group_chat').delete().eq('id', b.dataset.del);
        if (error) return showErr('Nu am putut șterge: ' + error.message);
        msgs = msgs.filter((x) => x.id !== b.dataset.del);
        render(false);
      }));
    }

    async function fetchNames() {
      const { data } = await sb.from('users').select('id, email');
      (data || []).forEach((u) => { names[u.id] = u.email; });
    }

    async function fetchMsgs() {
      const since = new Date(Date.now() - DAYS * 86400000).toISOString();
      const { data, error } = await sb.from('group_chat').select('*')
        .gte('created_at', since).order('created_at', { ascending: false }).limit(300);
      if (destroyed) return;
      if (error) return showErr('Nu am putut încărca mesajele: ' + error.message);
      showErr('');
      msgs = (data || []).reverse();
      render(false);
      markSeen();
    }

    // trimitere
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      const { data, error } = await sb.from('group_chat').insert({ message: text }).select().single();
      sendBtn.disabled = false;
      if (error) return showErr('Nu am putut trimite mesajul: ' + error.message);
      showErr('');
      input.value = ''; input.style.height = 'auto';
      if (!msgs.some((x) => x.id === data.id)) msgs.push(data);
      render(true);
      input.focus();
    });

    // pe calculator, Enter trimite (Shift+Enter = rând nou); pe telefon, Enter = rând nou
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    });

    // pornire
    (async () => {
      await fetchNames();
      await fetchMsgs();
      if (destroyed) return;
      list.scrollTop = list.scrollHeight;

      // timp real
      channel = sb.channel('group-chat-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat' }, async (p) => {
          const m = p.new;
          if (destroyed || msgs.some((x) => x.id === m.id)) return;
          if (!names[m.user_id]) await fetchNames();
          msgs.push(m);
          render(false);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chat' }, (p) => {
          if (destroyed) return;
          msgs = msgs.filter((x) => x.id !== p.old.id);
          render(false);
        })
        .subscribe();

      // rezervă: dacă timpul real nu funcționează, reîmprospătăm la 30 de secunde
      timer = setInterval(() => { if (!document.hidden) fetchMsgs(); }, 30000);
    })();

    return () => {
      destroyed = true;
      markSeen();
      clearInterval(timer);
      if (channel) sb.removeChannel(channel);
    };
  }

  // ---------- Notificări pentru mesaje noi: insignă, banner, sunet, notificare de sistem ----------
  const Notifier = (() => {
    let ctx = null, channel = null, timer = null, vis = null;
    let unread = 0, baseTitle = '', audio = null;
    const names = {};

    const lsKey = () => 'chat_last_seen_' + ctx.profile.id;
    const getSeen = () => { try { return localStorage.getItem(lsKey()); } catch (_) { return null; } };
    const setSeen = (iso) => { try { localStorage.setItem(lsKey(), iso); } catch (_) { /* ignorăm */ } };

    function render() {
      if (!ctx) return;
      ctx.root.querySelectorAll('[data-nav="chat"]').forEach((b) => {
        let badge = b.querySelector('[data-badge]');
        if (!unread) { if (badge) badge.remove(); return; }
        if (!badge) {
          badge = document.createElement('span');
          badge.setAttribute('data-badge', '');
          badge.className = 'ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-signal-red text-white text-xs font-semibold align-middle';
          b.appendChild(badge);
        }
        badge.textContent = unread > 99 ? '99+' : String(unread);
      });
      document.title = unread ? `(${unread}) Flotă` : 'Flotă';
    }

    function markRead(iso) {
      if (!ctx) return;
      setSeen(iso || new Date().toISOString());
      unread = 0;
      render();
    }

    const watching = () => ctx && ctx.isViewingChat() && !document.hidden;

    async function recount() {
      if (!ctx) return;
      if (watching()) return markRead();
      let seen = getSeen();
      if (!seen) { seen = new Date().toISOString(); setSeen(seen); }     // prima pornire: nu tratăm mesajele vechi ca necitite
      const { count, error } = await ctx.sb.from('group_chat').select('id', { count: 'exact', head: true })
        .gt('created_at', seen).neq('user_id', ctx.profile.id);
      if (error || !ctx) return;
      unread = count || 0;
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
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
        o.start(); o.stop(audio.currentTime + 0.26);
      } catch (_) { /* fără sunet */ }
    }

    function toast(name, text) {
      document.querySelectorAll('[data-chat-toast]').forEach((n) => n.remove());
      const el = document.createElement('button');
      el.setAttribute('data-chat-toast', '');
      el.className = 'fixed left-3 right-3 top-3 z-[60] max-w-md mx-auto text-left bg-navy-900 text-white rounded-xl px-4 py-3 shadow-lg';
      el.style.marginTop = 'env(safe-area-inset-top, 0px)';
      el.innerHTML = `<div class="text-xs text-slate-300">Mesaj nou în chat</div>
        <div class="font-semibold">${esc(name)}</div>
        <div class="text-sm break-words">${esc(text)}</div>`;
      el.addEventListener('click', () => { el.remove(); if (ctx && ctx.openChat) ctx.openChat(); });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }

    async function systemNotify(title, body) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'chat', renotify: true };
        if (reg) await reg.showNotification(title, opts);
        else new Notification(title, opts);
      } catch (_) { /* ignorăm */ }
    }

    async function onInsert(m) {
      if (!ctx || m.user_id === ctx.profile.id) return;
      if (watching()) { setSeen(m.created_at); return; }
      unread += 1;
      render();
      const name = await nameFor(m.user_id);
      const text = m.message.length > 140 ? m.message.slice(0, 137) + '…' : m.message;
      if (document.hidden) systemNotify(name, text);
      else { beep(); toast(name, text); }
    }

    function stop() {
      if (channel && ctx) ctx.sb.removeChannel(channel);
      clearInterval(timer);
      if (vis) document.removeEventListener('visibilitychange', vis);
      if (ctx) document.title = baseTitle || 'Flotă';
      ctx = null; channel = null; timer = null; vis = null; unread = 0;
    }

    // opts: { sb, profile, root, isViewingChat: () => bool, openChat: () => void }
    function start(opts) {
      stop();
      ctx = opts;
      baseTitle = document.title;
      recount();
      channel = ctx.sb.channel('chat-notify-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat' }, (p) => onInsert(p.new))
        .subscribe();
      timer = setInterval(() => { if (!document.hidden) recount(); }, 60000);
      vis = () => { if (!document.hidden) recount(); };
      document.addEventListener('visibilitychange', vis);
    }

    return { start, stop, markRead };
  })();

  window.ChatNotifier = Notifier;
  window.ChatView = { mount };
})();
