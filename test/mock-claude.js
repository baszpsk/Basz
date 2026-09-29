// In-page stand-in for the Claude Artifact runtime used by the tests:
// a small Firestore-like `db`, a canned `sample`, `downloads` and `assets`.
(() => {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => {
    const o = { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : v;
    return o;
  };
  const docs = new Map(Object.entries(window.__SEED__ || {}));
  const listeners = new Set();
  const notify = () => setTimeout(() => listeners.forEach((l) => l()), 0);
  const segs = (p) => p.split('/').filter(Boolean);
  const checkDoc = (p) => { if (segs(p).length % 2 !== 0) throw new TypeError('doc path needs even segments: ' + p); };
  const checkCol = (p) => { if (segs(p).length % 2 !== 1) throw new TypeError('collection path needs odd segments: ' + p); };
  const snap = (path) => {
    const d = docs.get(path);
    return { id: segs(path).pop(), exists: d !== undefined, data: () => clone(d), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  function query(path, filters = [], order = null, lim = null) {
    const run = () => {
      const n = segs(path).length + 1;
      let list = [...docs.keys()].filter((k) => k.startsWith(path + '/') && segs(k).length === n).map(snap);
      for (const [f, op, v] of filters) list = list.filter((s) => { const x = s.data()[f]; return op === '==' ? x === v : op === '>=' ? x >= v : op === '<=' ? x <= v : op === '>' ? x > v : op === '<' ? x < v : true; });
      if (order) list.sort((a, b) => { const x = a.data()[order[0]], y = b.data()[order[0]]; const r = x < y ? -1 : x > y ? 1 : 0; return order[1] === 'desc' ? -r : r; });
      else list.sort((a, b) => (a.id < b.id ? -1 : 1));
      if (lim) list = list.slice(0, lim);
      return list;
    };
    return {
      where: (f, op, v) => query(path, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => query(path, filters, [f, dir], lim),
      limit: (n) => query(path, filters, order, n),
      get: async () => { const d = run(); return { docs: d, size: d.length, empty: !d.length, docChanges: () => d.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: {} }; },
      onSnapshot(next) {
        let prev = new Map();
        const fire = () => {
          const d = run();
          const ids = new Map(d.map((x) => [x.id, x]));
          const changes = [];
          d.forEach((doc, i) => changes.push({ type: prev.has(doc.id) ? 'modified' : 'added', doc, oldIndex: -1, newIndex: i }));
          prev.forEach((doc, id) => !ids.has(id) && changes.push({ type: 'removed', doc, oldIndex: 0, newIndex: -1 }));
          prev = ids;
          next({ docs: d, size: d.length, empty: !d.length, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } });
        };
        listeners.add(fire);
        setTimeout(fire, 30);
        return () => listeners.delete(fire);
      },
    };
  }
  function doc(path) {
    checkDoc(path);
    return {
      id: segs(path).pop(),
      path,
      get: async () => snap(path),
      set: async (data) => { window.__writes.push(['set', path]); docs.set(path, clone(data)); notify(); },
      update: async (data) => {
        window.__writes.push(['update', path]);
        if (!docs.has(path)) throw { code: 'invalid_argument', message: 'missing' };
        docs.set(path, merge(docs.get(path), clone(data)));
        notify();
      },
      delete: async () => { window.__writes.push(['delete', path]); docs.delete(path); notify(); },
      onSnapshot(next) {
        const fire = () => next(snap(path));
        listeners.add(fire);
        setTimeout(fire, 20);
        return () => listeners.delete(fire);
      },
      collection: (p) => collection(path + '/' + p),
    };
  }
  function collection(path) {
    checkCol(path);
    return { ...query(path), path, doc: (id) => doc(path + '/' + (id || Math.random().toString(36).slice(2))), add: async (d) => { const r = doc(path + '/' + Math.random().toString(36).slice(2)); await r.set(d); return r; } };
  }
  const db = { doc, collection };
  window.__docs = docs;
  window.__writes = [];
  window.__downloads = [];
  window.__samples = [];

  const tomorrow = (() => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); })();
  const sample = async (input, opts = {}) => {
    window.__samples.push(String(input).slice(0, 200));
    const text = 'คำตอบทดสอบจาก Claude: ทำตามแผนเดิม';
    opts.onText && opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  sample.json = async (input) => {
    const s = String(input);
    window.__samples.push(s.slice(0, 200));
    await new Promise((r) => setTimeout(r, 60));
    if (s.includes('ONE task')) {
      const answered = s.includes('already answered');
      return { title: 'โทรถามซัพพลายเออร์กิมจิเรื่องราคาใหม่', area: 'seoulful', impact: 3, due: answered ? tomorrow : null, estimateMin: 15, notes: '', waitingOn: null, followUpDays: null, subtasks: [], questions: answered ? [] : [{ id: 'due', q: 'ต้องได้คำตอบภายในวันไหน?', options: ['วันนี้', 'พรุ่งนี้', 'สัปดาห์นี้'] }] };
    }
    if (s.includes('Break it into')) return { steps: [{ title: 'ทดลองสูตรซุปกิมจิชีส 2 แบบ', estimateMin: 60, impact: 3 }, { title: 'ให้พนักงานชิมและให้คะแนน', estimateMin: 30, impact: 2 }], firstStep: 'ทดลองสูตร', questions: [] };
    if (s.includes('Order his open tasks')) { const ids = [...s.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]); return { order: ids.reverse(), notes: {}, summary: 'เริ่มจากงานที่กระทบยอดขายก่อน', questions: [] }; }
    return {};
  };
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  const caps = {
    db,
    sample,
    downloads: { save: async ({ filename }) => { window.__downloads.push(filename); return { status: 'saved' }; } },
    assets: { upload: async (b) => ({ id: 'a' + Date.now(), url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="#888"/></svg>'), sizeBytes: b.size, contentType: 'image/svg+xml' }) },
  };
  // __NO_DB__ mimics viewers without artifact storage, like the Claude iPhone app.
  window.claude = { use: (name) => Promise.resolve(name === 'db' && window.__NO_DB__ ? null : caps[name] || null) };
})();
