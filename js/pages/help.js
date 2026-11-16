
  import { parseTestCases, formatCell } from '/js/lib/test-cases-parse.js?v=3';

  const LOAD_ERROR = 'Could not load this document. Reload the page; if you are signed out, sign in first.';
  const STATE_KEY = 'pdash_test_state_v1';
  const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: 'sha384-rbtjAdnIQE/aQJGEgXrVUlMibdfTSa4PQju4HDhN3sR2PmaKFzhEafuePsl9H/9I' };
  let mermaidPromise = null;

  // The UMD build, not the ES module: a <script> can carry integrity, an import() cannot.
  // A failed load is not cached, so the next document tries again.
  function loadMermaid() {
    mermaidPromise = mermaidPromise || new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MERMAID.src;
      s.integrity = MERMAID.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid loaded without window.mermaid')));
      s.onerror = () => reject(new Error('Mermaid could not be loaded from ' + MERMAID.src));
      document.head.appendChild(s);
    }).catch((e) => { mermaidPromise = null; throw e; });
    return mermaidPromise;
  }

  function readState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return s && typeof s === 'object' ? s : {};
    } catch (e) { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable: the ticks last for this page view only */ }
  }

  // The server answers a signed-out fetch with the login page (200, HTML), so a
  // response is judged by its payload as well as by its status.
  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  async function renderMermaid(root, isCurrent) {
    const codes = [...root.querySelectorAll('code.language-mermaid')];
    if (!codes.length) return;
    const mermaid = await loadMermaid();
    if (!isCurrent()) return;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false }, er: { useMaxWidth: false } });
    const nodes = codes.map((code) => {
      const pre = document.createElement('pre');
      pre.className = 'mermaid';
      pre.textContent = code.textContent;
      (code.closest('pre') || code).replaceWith(pre);
      return pre;
    });
    await mermaid.run({ nodes });
  }

  Vue.createApp({
    data() {
      return {
        ready: false, role: '', manifest: null, manifestError: '',
        current: null, notice: '', loading: false, docError: '', loadToken: 0,
        html: '',
        sections: [], warnings: [], updatedLabel: null,
        testState: readState(), sectionFilter: 'all', statusFilter: 'all',
        statusFilters: [
          { key: 'all', label: 'All' }, { key: 'pass', label: 'Passed' },
          { key: 'fail', label: 'Failed' }, { key: 'untested', label: 'Untested' },
        ],
      };
    },
    computed: {
      docs() { return visibleDocs(this.manifest, this.role); },
      guides() { return this.docs.filter((d) => d.audience === 'public'); },
      adminDocs() { return this.docs.filter((d) => d.audience === 'restricted'); },
      allCases() { return this.sections.flatMap((s) => s.cases); },
      stats() { return testStats(this.allCases, this.testState); },
      visibleSections() {
        return this.sectionFilter === 'all' ? this.sections : this.sections.filter((s) => s.id === this.sectionFilter);
      },
    },
    methods: {
      fc: formatCell,
      stateOf(id) { return this.testState[id] || 'untested'; },
      togIcon(s) { return s === 'pass' ? '✓' : s === 'fail' ? '✗' : '○'; },
      secStats(sec) { return testStats(sec.cases, this.testState); },
      pct(st) { return st.total > 0 ? Math.round(st.p / st.total * 100) : 0; },
      dotClass(sec) {
        const st = this.secStats(sec);
        return st.p === st.total ? 'ok' : st.f > 0 ? 'bad' : '';
      },
      toggle(id) {
        this.testState = { ...this.testState, [id]: nextTestState(this.stateOf(id)) };
        writeState(this.testState);
      },
      resetAll() {
        showConfirm('Reset all test results? This cannot be undone.', () => {
          this.testState = {};
          writeState(this.testState);
        });
      },
      selectDoc(id) {
        const { doc, notice } = resolveDoc(this.manifest, id, this.role);
        this.notice = notice;
        this.openDoc(doc, true);
      },
      async openDoc(doc, pushUrl) {
        const token = ++this.loadToken;
        this.current = doc;
        this.docError = '';
        this.html = '';
        this.sections = []; this.warnings = []; this.updatedLabel = null;
        this.sectionFilter = 'all'; this.statusFilter = 'all';
        if (!doc) { this.loading = false; return; }
        if (pushUrl) {
          try { history.replaceState(null, '', '?doc=' + encodeURIComponent(doc.id)); } catch (e) { /* the link just stays as it was */ }
        }
        this.loading = true;
        let text = '';
        try {
          text = (await fetchText('handbook/' + doc.file)); // a leading BOM is tolerated by isHandbookPayload; strip it below
          text = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
          if (!isHandbookPayload(text, doc)) throw new Error('unexpected payload');
        } catch (e) {
          if (token !== this.loadToken) return;
          this.loading = false;
          this.docError = LOAD_ERROR;
          return;
        }
        if (token !== this.loadToken) return;
        if (doc.renderer === 'test-cases') {
          const parsed = parseTestCases(text);
          this.sections = parsed.sections;
          this.updatedLabel = parsed.updated;
          this.warnings = parsed.warnings;
          this.loading = false;
          return;
        }
        this.html = marked.parse(text);
        this.loading = false;
        await this.$nextTick();
        if (token !== this.loadToken || !this.$refs.body || !hasMermaid(text)) return;
        try { await renderMermaid(this.$refs.body, () => token === this.loadToken); } catch (e) { console.error('Mermaid could not render a diagram', e); }
      },
    },
    async created() {
      const user = await initNav('help', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Help' },
      ]});
      if (!user) return;
      this.role = user.role;
      this.ready = true;
      try {
        const text = await fetchText('handbook/manifest.json');
        if (text.trimStart().startsWith('<')) throw new Error('unexpected payload');
        const manifest = JSON.parse(text);
        if (!manifest || !Array.isArray(manifest.documents)) throw new Error('unexpected payload');
        this.manifest = manifest;
      } catch (e) {
        this.manifestError = LOAD_ERROR;
        return;
      }
      const wanted = new URLSearchParams(location.search).get('doc');
      const { doc, notice } = resolveDoc(this.manifest, wanted, this.role);
      this.notice = notice;
      this.openDoc(doc, !!wanted || !!notice);
    },
  }).mount('#app');
