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

    el.innerHTML = `
      <h1 class="text-2xl font-semibold text-navy-900">Chat</h1>
      <p class="text-sm text-slate-500 mt-1">Doar text. Mesajele mai vechi de ${DAYS} de zile dispar.</p>
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
      clearInterval(timer);
      if (channel) sb.removeChannel(channel);
    };
  }

  window.ChatView = { mount };
})();
