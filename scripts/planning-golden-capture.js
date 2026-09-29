// Paste into the browser console on /planning.html (logged in), or load via the browser tool.
// Exposes two entry points:
// - window.__planningGolden({ label, onProgress }): synchronous capture of exportRows, periodMeta
//   and an HTML hash of every view for a fixed set of combinations. Returns { label, capturedAt, combos }.
//   Run it with the OLD code (baseline) and again after the migration; compare with a text/JSON diff.
// - window.__planningGoldenStart({ label, onProgress }): starts the capture detached (returns immediately,
//   does not await). Stores progress in window.__golden = { label, startedAt, done, error, result, progress, total }.
//   Poll window.__golden.done to wait for completion; read .result, .error, .progress for status.
(function () {
  const sha256 = async (s) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const vmOf = () => {
    const app = document.querySelector('#planningApp').__vue_app__;
    const result = app._instance?.proxy || app._container?._vnode?.component?.proxy;
    if (!result) throw new Error('Vue root instance not found on #planningApp');
    return result;
  };
  const settle = async (vm) => {
    for (let i = 0; i < 400; i++) {
      await vm.$nextTick(); await new Promise(r => setTimeout(r, 40));
      if (!vm.modelPending) { await vm.$nextTick(); if (!vm.modelPending) return; }   // undefined on the OLD code
    }
    throw new Error('model still pending');
  };
  const monthsFromNow = (vm, a, b) => {
    const n = new Date();
    return [new Date(n.getFullYear(), n.getMonth() + a, 1), new Date(n.getFullYear(), n.getMonth() + b + 1, 0)];
  };

  window.__planningGolden = async function ({ label = 'capture', onProgress } = {}) {
    const vm = vmOf();
    const views = ['byrole', 'byproject', 'byowner'];
    const windows = { full: monthsFromNow(vm, -3, 7), narrow: monthsFromNow(vm, 0, 1), past: monthsFromNow(vm, -3, -1) };
    const teamSets = { all: new Set(), dev: new Set(['GOLDT1']), qa: new Set(['GOLDT2']), devqa: new Set(['GOLDT1', 'GOLDT2']) };
    const combos = [];
    for (const view of views) for (const [wName, [ws, we]] of Object.entries(windows))
      for (const [tName, teams] of Object.entries(teamSets))
        for (const pulse of [true, false]) for (const interval of ['monthly', 'weekly']) {
          combos.push({ id: `${view}|${wName}|${tName}|pulse=${pulse}|${interval}`, view, ws, we, teams, pulse, interval });
        }
    const out = [];
    for (const c of combos) {
      vm.view = c.view; vm.windowStart = c.ws; vm.windowEnd = c.we; vm.teamFilters = c.teams;
      vm.monthlyPulse = c.pulse; vm.interval = c.interval; vm.roundHours = false;
      await settle(vm);
      const key = { byrole: 'byRoleView', byproject: 'byProjectView', byowner: 'byOwnerView' }[c.view];
      const r = vm[key];
      out.push({ id: c.id, view: c.view, exportRows: r.exportRows, periodMeta: r.periodMeta, htmlHash: await sha256(r.html), htmlLength: r.html.length });
      if (onProgress) onProgress(out.length, combos.length);
    }
    return { label, capturedAt: new Date().toISOString(), combos: out };
  };

  window.__planningGoldenStart = function (opts = {}) {
    const startedAt = new Date().toISOString();
    const combos = [];
    for (const view of ['byrole', 'byproject', 'byowner'])
      for (const [wName] of Object.entries({ full: null, narrow: null, past: null }))
        for (const [tName] of Object.entries({ all: null, dev: null, qa: null, devqa: null }))
          for (const pulse of [true, false]) for (const interval of ['monthly', 'weekly'])
            combos.push(null);
    const total = combos.length;
    window.__golden = { label: opts.label || 'capture', startedAt, done: false, error: null, result: null, progress: 0, total };
    window.__planningGolden({
      ...opts,
      onProgress: (progress, total) => {
        window.__golden.progress = progress;
        window.__golden.total = total;
      }
    }).then(result => {
      window.__golden.result = result;
      window.__golden.done = true;
    }).catch(err => {
      window.__golden.error = String(err);
      window.__golden.done = true;
    });
  };
  console.log('window.__planningGolden and window.__planningGoldenStart ready');
})();
