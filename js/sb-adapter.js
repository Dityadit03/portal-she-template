/* Portal SHE · adapter Supabase
   Menyediakan window.claude.use('db' | 'user' | 'mcp') dengan API yang sama seperti versi artifact,
   sehingga seluruh modul portal berjalan tanpa diubah. Data tersimpan di tabel public.docs (col, id, data),
   dilindungi Row Level Security sesuai peran di public.profiles. */
(function () {
  const CFG = window.SHE_CONFIG || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'she-portal-auth' }
  });
  window.SB = sb;

  let readyResolve; const READY = new Promise(r => (readyResolve = r));
  window.SB_SET_READY = () => readyResolve();
  window.SB_ME = { user: null, profile: null };

  const errOf = (e, fallback) => {
    const code = e && (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) ? 'not_allowed'
      : e && /JWT|token/i.test(e.message || '') ? 'revoked'
      : e && /fetch|network/i.test(e.message || '') ? 'unavailable' : (fallback || 'invalid_argument');
    return Object.assign(new Error((e && e.message) || code), { code });
  };
  const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- cache + realtime ---------- */
  const CACHE = {};      // col -> Map(id -> data)
  const LOADED = {};     // col -> Promise
  const LISTENERS = {};  // col -> Set(fn)
  const PENDING = {};
  function notify(col) {
    if (PENDING[col]) return;
    PENDING[col] = setTimeout(() => {
      PENDING[col] = null;
      const snap = snapshotOf(col);
      (LISTENERS[col] || []).forEach(fn => { try { fn(snap) } catch (x) { console.error(x) } });
    }, 60);
  }
  function snapshotOf(col, rows) {
    const m = CACHE[col] || new Map();
    const list = rows || [...m.entries()];
    return { docs: list.map(([id, data]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(data)) })), size: list.length };
  }
  async function load(col) {
    if (LOADED[col]) return LOADED[col];
    LOADED[col] = (async () => {
      const m = new Map(); let from = 0;
      for (;;) {
        const { data, error } = await sb.from('docs').select('id,data').eq('col', col).range(from, from + 999);
        if (error) { delete LOADED[col]; throw errOf(error, 'unavailable') }
        data.forEach(r => m.set(r.id, r.data || {}));
        if (data.length < 1000) break; from += 1000;
      }
      CACHE[col] = m;
    })();
    return LOADED[col];
  }
  let channel = null;
  function startRealtime() {
    if (channel) return;
    channel = sb.channel('docs-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
        const row = p.new && p.new.col ? p.new : p.old; if (!row || !row.col) return;
        const m = CACHE[row.col]; if (!m) return;
        if (p.eventType === 'DELETE') m.delete(p.old.id); else m.set(p.new.id, p.new.data || {});
        notify(row.col);
      })
      .subscribe();
    // cadangan bila realtime terputus: segarkan tiap 60 detik
    setInterval(() => { Object.keys(LISTENERS).forEach(c => { if ((LISTENERS[c] || new Set()).size) { delete LOADED[c]; load(c).then(() => notify(c)).catch(() => {}) } }) }, 60000);
  }

  function makeQuery(col, opts) {
    return {
      orderBy: (field, dir) => makeQuery(col, Object.assign({}, opts, { field, dir: dir || 'asc' })),
      limit: n => makeQuery(col, Object.assign({}, opts, { limit: n })),
      where: () => makeQuery(col, opts),
      onSnapshot(fn, onErr) {
        const wrap = snap => {
          if (!opts.field && !opts.limit) return fn(snap);
          let rows = [...(CACHE[col] || new Map()).entries()];
          if (opts.field) rows.sort((a, b) => { const x = a[1][opts.field], y = b[1][opts.field]; const c = x > y ? 1 : x < y ? -1 : 0; return opts.dir === 'desc' ? -c : c });
          if (opts.limit) rows = rows.slice(0, opts.limit);
          fn(snapshotOf(col, rows));
        };
        (LISTENERS[col] = LISTENERS[col] || new Set()).add(wrap);
        startRealtime();
        load(col).then(() => wrap(snapshotOf(col))).catch(e => onErr && onErr(e));
        return () => LISTENERS[col].delete(wrap);
      },
      async get() { await load(col); return snapshotOf(col) }
    };
  }
  function docRef(col, id) {
    id = id || newId();
    return {
      id,
      async get() { await load(col); const d = (CACHE[col] || new Map()).get(id); return { id, exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined } },
      async set(data) {
        const clean = JSON.parse(JSON.stringify(data || {}));
        const { error } = await sb.from('docs').upsert({ col, id, data: clean }, { onConflict: 'col,id' });
        if (error) throw errOf(error);
        if (CACHE[col]) { CACHE[col].set(id, clean); notify(col) }
      },
      async update(patch) {
        const clean = JSON.parse(JSON.stringify(patch || {}));
        Object.keys(clean).forEach(k => { if (clean[k] && clean[k].__delete__) delete clean[k] });
        const { data, error } = await sb.rpc('doc_merge', { p_col: col, p_id: id, p_patch: clean });
        if (error) throw errOf(error);
        if (data === false) throw Object.assign(new Error('Dokumen tidak ditemukan atau tidak boleh diubah'), { code: 'invalid_argument' });
        if (CACHE[col] && CACHE[col].has(id)) { CACHE[col].set(id, Object.assign({}, CACHE[col].get(id), clean)); notify(col) }
      },
      async delete() {
        const { error } = await sb.from('docs').delete().eq('col', col).eq('id', id);
        if (error) throw errOf(error);
        if (CACHE[col]) { CACHE[col].delete(id); notify(col) }
      },
      onSnapshot(fn, onErr) { return makeQuery(col, {}).onSnapshot(s => { const d = s.docs.find(x => x.id === id); fn(d ? d : { id, exists: false, data: () => undefined }) }, onErr) }
    };
  }
  const DBA = Object.freeze({
    collection(col) {
      const q = makeQuery(col, {});
      return Object.assign({}, q, {
        doc: id => docRef(col, id),
        async add(data) { const r = docRef(col); await r.set(data); return r }
      });
    }
  });

  const role = () => (window.SB_ME.profile || {}).role || 'pending';
  const USERA = Object.freeze({
    isOwner: async () => role() === 'admin',
    canEdit: async () => role() === 'admin',
    can: async name => name === 'data.write' ? (role() === 'admin' || role() === 'user') : false,
    id: async () => (window.SB_ME.user || {}).id || '',
    me: async () => ({ id: (window.SB_ME.user || {}).id || '', name: (window.SB_ME.profile || {}).nama || '' })
  });

  /* Upload file ke Google Drive lewat fungsi server /api/drive-upload */
  const MCPA = Object.freeze({
    listTools: async () => ({ fileArgs: false }),
    async callTool(server, tool, input) {
      const { data } = await sb.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) throw { code: 'needs_reauth' };
      const r = await fetch('/api/drive-upload', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(input) });
      let j = {}; try { j = await r.json() } catch (x) {}
      if (!r.ok) throw { code: j.code || (r.status === 413 ? 'too_big' : r.status === 403 ? 'blocked_by_policy' : 'upstream_error'), message: j.message || '' };
      return { payload: j };
    }
  });

  window.claude = Object.freeze({
    use: async name => { await READY; return name === 'db' ? DBA : name === 'user' ? USERA : name === 'mcp' ? MCPA : null }
  });
})();
