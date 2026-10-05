// One-off generator: splits config.html into the five Master Data pages.
// Run from the repo root:  node <path>/split-config.mjs [--check]
// Reads config.html (read-only) and writes master-*.html next to it.
import { readFileSync, writeFileSync } from 'node:fs';

const RAW = readFileSync('config.html', 'utf8');
const EOL = RAW.includes('\r\n') ? '\r\n' : '\n';
const SRC = RAW.split(/\r?\n/);
const find = (re, from = 0) => {
  for (let i = from; i < SRC.length; i++) if (re.test(SRC[i])) return i;
  throw new Error('marker not found: ' + re);
};
const slice = (a, b) => SRC.slice(a, b + 1); // inclusive, 0-based

// ── Sub-menu (same markup on every page) ─────────────────────────────────────
const SUBNAV = [
  ['clients',    '/master-clients.html',       'Clients'],
  ['groups',     '/master-client-groups.html', 'Client Groups'],
  ['pipelines',  '/master-pipelines.html',     'Pipelines &amp; POTs'],
  ['roles',      '/master-roles.html',         'Roles &amp; rates'],
  ['currencies', '/master-currencies.html',    'Currencies'],
];
const subnavHtml = active => [
  '<nav class="md-subnav" aria-label="Master Data">',
  ...SUBNAV.map(([id, href, label]) =>
    `  <a href="${href}"${id === active ? ' class="active" aria-current="page"' : ''}>${label}</a>`),
  '</nav>',
];

// ── Per-page definitions ─────────────────────────────────────────────────────
// panel: tab id in config.html; data: data() lines kept; computed/methods: member names kept.
const PAGES = [
  { id: 'clients', file: 'master-clients.html', h1: 'Clients',
    desc: 'Manage the clients used across the app.', panel: 'clients',
    data: ['clients', 'roles', 'cf'], computed: ['sortedClients'],
    methods: ['openClientForm', 'saveClient', 'deleteClient', 'openClientRatecard', 'saveClientRatecard'],
    modals: ['clientRc'], loads: ['clients'] },
  { id: 'groups', file: 'master-client-groups.html', h1: 'Client Groups',
    desc: 'Manage client groups and assign clients to them.', panel: 'groups',
    data: ['clients', 'groups', 'gf'], computed: ['sortedClients', 'sortedGroups'],
    methods: ['openGroupForm', 'saveGroup', 'deleteGroup', 'ungroupedClientsFor', 'assignClientToGroup', 'removeClientFromGroup'],
    modals: [], loads: ['clients', 'groups'] },
  { id: 'pipelines', file: 'master-pipelines.html', h1: 'Pipelines &amp; POTs',
    desc: 'Manage pipeline years, POT targets and phasing.', panel: 'pots',
    data: ['clients', 'groups', 'pipeline', 'currencyBase'],
    computed: ['sortedClients', 'sortedGroups', 'potYearOptions', 'phasingTableHtml', 'projectPhasingTableHtml'],
    methods: ['loadPots', 'openPyForm', 'createPipelineYear', 'togglePipelineYear', 'deletePipelineYear', 'selectPipeline',
      'backToPipelines', 'openPotForm', 'savePot', 'deletePot', 'openPhasingView', 'openProjectPhasingView',
      'loadPipelineSummary', 'openPotDetails', 'stageColor', 'stageBg', 'fmtRate', 'fmtDate'],
    modals: ['potDetails'], loads: ['clients', 'groups', 'pipelineYears', 'yearTotals'], money: true },
  { id: 'roles', file: 'master-roles.html', h1: 'Roles &amp; rates',
    desc: 'Manage roles and their hourly rates per currency.', panel: 'roles',
    data: ['roles', 'rf', 'currenciesList'], computed: ['groupedRoles'],
    methods: ['openRoleForm', 'saveRole', 'deleteRole', 'extractTeam', 'fmtRate'],
    modals: [], loads: ['roles', 'currencies'] },
  { id: 'currencies', file: 'master-currencies.html', h1: 'Currencies',
    desc: 'Activate currencies and manage their exchange rates.', panel: 'currencies',
    data: ['currencyBase', 'currenciesList', 'currencyForms'], computed: [],
    methods: ['loadCurrencies', 'activateCurrency', 'confirmUpdateCurrencyRate', 'updateCurrencyRate', 'openCurrencyHistory'],
    modals: [], loads: ['currencies'], money: true },
];

// ── Locate source blocks ─────────────────────────────────────────────────────
const iAppMain   = find(/^<div id="app-main">$/);
const iPageDiv   = find(/<div class="page app-container" v-else>/);
const iGlobalErr = find(/<div v-if="globalError" class="alert/);
const PANEL_ORDER = ['clients', 'groups', 'pots', 'currencies', 'programs', 'roles'];
const panelStart = Object.fromEntries(PANEL_ORDER.map(p => [p, find(new RegExp(`v-show="activeTab === '${p}'"`))]));
const iPageEnd   = find(/<\/div><!-- \.page -->/);
const panelEnd = p => {
  const k = PANEL_ORDER.indexOf(p);
  const nextStart = k === PANEL_ORDER.length - 1 ? iPageEnd : panelStart[PANEL_ORDER[k + 1]] - 3; // 3 banner comment lines
  let e = nextStart - 1;
  while (SRC[e].trim() === '') e--;
  return e;
};
const iAppClose  = find(/^<\/div><!-- #app -->$/);
const iPotModal  = find(/<!-- POT Details Modal/);
const iRcModal   = find(/<!-- Client Rate Card Modal/);
const iAppMainEnd = find(/^<\/div><!-- \/#app-main -->$/);
const MODAL = {
  potDetails: slice(iPotModal, iRcModal - 2),
  clientRc:   slice(iRcModal, iAppMainEnd - 2),
};
const iScripts   = find(/<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3\.2\/dist\/js\/bootstrap\.bundle/);
const iModule    = find(/^<script type="module">$/, iScripts);

// ── data() pieces ────────────────────────────────────────────────────────────
const iData = find(/^  data\(\) \{$/);
const dl = re => find(re, iData);
const DATA = {
  clients:        [SRC[dl(/^      clients:  \[\],$/)]],
  groups:         [SRC[dl(/^      groups:   \[\],$/)]],
  roles:          [SRC[dl(/^      roles:    \[\],$/)]],
  cf:             slice(dl(/Client form state/), dl(/Client form state/) + 1),
  gf:             slice(dl(/Group form state/), dl(/Group form state/) + 1),
  rf:             slice(dl(/Role form state/), dl(/Role form state/) + 1),
  pipeline:       slice(dl(/Pipelines & POT state/), dl(/yearTotals:/)),
  // currency state, split in the part every currency-aware page needs and the currencies-tab-only part
  currencyBase:   [SRC[dl(/^      activeCurrencies: \[\],$/)], SRC[dl(/^      formatMoney: window\.formatMoney,$/)]],
  currenciesList: [SRC[dl(/^      currencies:    \[\],$/)]],
  currencyForms:  slice(dl(/^      crf: /), dl(/^      crRateConfirm: /)),
};

// ── member blocks (computed + methods) ───────────────────────────────────────
const iComputed = find(/^  computed: \{$/);
const iCreated  = find(/^  async created\(\) \{$/);
const iMethods  = find(/^  methods: \{$/);
const iMount    = find(/^\}\)\.mount\('#app'\);$/);
function members(from, to) { // top-level members of an object literal, 4-space indent
  const starts = [];
  for (let i = from + 1; i < to; i++) {
    const m = /^    (?:async )?([A-Za-z_]\w*)\(.*\) *\{ *$/.exec(SRC[i]);
    if (m) starts.push([i, m[1]]);
  }
  const out = {};
  starts.forEach(([s, name], k) => {
    let e = k + 1 < starts.length ? starts[k + 1][0] - 1 : to - 1;
    // pull the trailing section-comment banner lines (and blanks) off this member
    while (e > s && (SRC[e].trim() === '' || /^\s*\/\/ ──/.test(SRC[e]))) e--;
    out[name] = slice(s, e);
  });
  return out;
}
const COMPUTED = members(iComputed, iCreated - 2); // iCreated-2 = the "  }," that closes computed
const METHODS  = members(iMethods, iMount - 1);    // iMount-1 = the "  }," that closes methods

// ── per-page script ──────────────────────────────────────────────────────────
function loadAllBody(p) {
  const api = {
    clients: 'Api.clients.list()', groups: 'Api.clientGroups.list()', roles: 'Api.roles.list()',
    pipelineYears: 'Api.pipelineYears.list()', yearTotals: 'Api.pots.yearTotals()', currencies: 'Api.currencies.list()',
  };
  const names = p.loads;
  const asg = {
    clients: '        this.clients  = clients;',
    groups: "        this.groups   = groups.map(g => ({ ...g, _assignPick: '', _assignLoading: false }));",
    roles: '        this.roles    = roles.map(r => ({ id: r.id, label: r.label, code: r.code, rate: r.hourly_rate || 0, rateOverrides: r.rate_overrides || {} }));',
    pipelineYears: "        this.pipelineYears = pipelineYears.map(py => ({ ...py, _toggling: false, _loading: false }));",
    yearTotals: '        this.yearTotals    = yearTotals;',
    currencies: '        this.currencies    = currencies;',
  };
  const crEditLine = '        this.crEdit        = Object.fromEntries(currencies.map(c => [c.code, { rate: String(c.current_rate), saving: false, error: null }]));';
  const dest = n => n; // variable names equal the load names
  return [
    '    async loadAll() {',
    '      this.globalError = null;',
    '      try {',
    `        const [${names.map(dest).join(', ')}] = await Promise.all([`,
    ...names.map(n => `          ${api[n]},`),
    '        ]);',
    ...names.map(n => asg[n]),
    ...(p.id === 'currencies' ? [crEditLine] : []),
    '      } catch (e) {',
    "        this.globalError = e.message || 'Failed to load data.';",
    '      }',
    '    },',
    '',
  ];
}
// roles page only needs the currency list for rate fields (no crEdit)
function scriptFor(p) {
  const L = [];
  L.push('<script type="module">', 'window.__cfgApp = Vue.createApp({', '  data() {', '    return {');
  L.push('      ready:        false,', '      accessDenied: false,', '      globalError:  null,', '');
  for (const k of p.data) { L.push(...DATA[k]); L.push(''); }
  L.push('    };', '  },', '');
  if (p.computed.length) {
    L.push('  computed: {');
    for (const c of p.computed) L.push(...COMPUTED[c]);
    L.push('  },', '');
  }
  L.push('  async created() {',
    "    const user = await initNav('config', { breadcrumbs: [",
    "      { label: 'Home', href: '/pipeline.html' },",
    "      { label: 'Master Data' },",
    '    ]});',
    '    if (!user) return;',
    "    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }");
  if (p.money) L.push('    try { window.__currencies = await Api.currencies.active(); } catch {}',
    '    this.activeCurrencies = window.__currencies || [];');
  L.push('    await this.loadAll();', '    this.ready = true;', '  },', '');
  L.push(...slice(find(/^  watch: \{$/), find(/^  watch: \{$/) + 4), '');
  L.push('  methods: {');
  L.push(...loadAllBody(p));
  for (const m of p.methods) L.push(...METHODS[m], '');
  while (L[L.length - 1] === '') L.pop();
  L.push('  },', "}).mount('#app');", '</script>', '</body>', '</html>', '');
  return L;
}

// ── assemble ─────────────────────────────────────────────────────────────────
function build(p) {
  const out = [];
  out.push(...slice(0, iAppMain));                       // head … <div id="app-main">
  out.push('', '<div class="md-layout">', ...subnavHtml(p.id), '<div class="md-content">', '');
  out.push(...slice(iAppMain + 2, iPageDiv));            // <div id="app" v-cloak> … page container
  out.push('',
    '    <div class="page-header">', '      <div>', `        <h1>${p.h1}</h1>`,
    `        <p class="text-muted mb-0 mt-1" style="font-size:.83rem">${p.desc}</p>`, '      </div>', '    </div>', '');
  out.push(SRC[iGlobalErr], '');
  const panel = slice(panelStart[p.panel], panelEnd(p.panel));
  panel[0] = '    <div>';
  out.push(...panel, '');
  out.push(...slice(iPageEnd, iAppClose), '</div><!-- /.md-content -->', '</div><!-- /.md-layout -->', '');
  for (const m of p.modals) out.push(...MODAL[m], '');
  out.push(...slice(iAppMainEnd, iModule - 1));          // /#app-main, /#app-shell, scripts up to module
  out.push(...scriptFor(p));
  return out.join(EOL);
}

for (const p of PAGES) writeFileSync(p.file, build(p), 'utf8');
console.log('written:', PAGES.map(p => p.file).join(', '));
