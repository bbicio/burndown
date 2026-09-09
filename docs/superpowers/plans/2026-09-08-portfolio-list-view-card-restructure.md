# Portfolio List View Card Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `portfolio.html`'s list/overview view project cards to show only identifying data + totals (no monthly breakdown), a single always-enabled entry button into the project detail page, and a 2-column grid layout — matching the design spec exactly.

**Architecture:** All changes live in one file, `portfolio.html` (Vue 3 template + inline component methods, no build step). No new files, no new CSS classes — layout uses Bootstrap's existing `row`/`col-md-6`/`col-12` grid utilities (already used elsewhere on this page, e.g. the detail-view KPI row), and card content reuses existing tokens/classes exactly as documented in the spec.

**Tech Stack:** Vue 3 (CDN), Bootstrap 5, `css/tokens.css` design tokens — no new dependencies.

## Global Constraints

- English-only UI text.
- No hardcoded hex colors or new one-off CSS — every color/spacing value must be an existing token (`var(--color-success)`, `var(--color-danger)`, `var(--space-*)`, etc.) or an existing Bootstrap/utility class already used on this page.
- No new CSS classes in `css/style.css` or `css/tokens.css` — the 2-column layout uses Bootstrap's `row`/`col-*` grid, already used on this same page (detail-view KPI row, `portfolio.html:232`).
- Preserve the existing `v-for` + `v-if` separation pattern (wrap in `<template v-for>` rather than combining both directives on one element) — matches current file convention and avoids Vue 3's discouraged same-element `v-for`+`v-if` combination.
- This is UI-only template/method code with no `js/lib/` extraction and no existing automated test coverage for it (`vitest` covers `js/lib/*.js` pure functions only) — each task must be manually verified in the browser via `scripts/test-branch.sh up`, per project convention for frontend changes.

---

### Task 1: Restructure project card content (both grouped-child and ungrouped cards)

**Files:**
- Modify: `portfolio.html:114-144` (grouped-child card, inside `visibleProgramGroups` → `prog.children`)
- Modify: `portfolio.html:150-181` (ungrouped card, inside `ungroupedProjects`)

**Interfaces:**
- Consumes: `cardDataMap[cfg.id]` (existing computed, `portfolio.html:584-588`) — fields `hasData`, `hasPhasing`, `totalPhasing`, `totalSpent`, `totalVar`, `budgetBadgeHtml` (all already present, unchanged by this task). Also `cfg.startDate`/`cfg.endDate` (existing project fields) and the existing methods `fmtProjectTitle`, `pipelineBadge`, `getProjectPipeline`, `statusBadgeLarge`, `fmtMoney`, `fmtVar`, `varColor`, `monthLabel`, `showDashboard`.
- Produces: no new interfaces — this task only changes markup, not data shape.

- [ ] **Step 1: Replace the grouped-child card markup**

  Find this block in `portfolio.html` (currently lines 115-143, inside the `visibleProgramGroups` → `expandedPrograms` → `prog-project-list` → `<template v-for="cfg in prog.children" :key="cfg.id">`):

  ```html
            <div class="section-card mb-4" v-if="cardDataMap[cfg.id]">
              <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span>📁 {{ fmtProjectTitle(cfg) }}</span>
                  <span v-if="cfg.code" class="text-muted small">{{ cfg.code }}</span>
                  <span v-html="pipelineBadge(getProjectPipeline(cfg.id) || cfg.pipeline)"></span>
                  <span v-html="statusBadgeLarge(cfg.status)"></span>
                  <span v-if="!cardDataMap[cfg.id].hasData" class="badge bg-warning text-dark">no XLS data</span>
                  <span v-if="cardDataMap[cfg.id].budgetBadgeHtml" v-html="cardDataMap[cfg.id].budgetBadgeHtml"></span>
                </div>
                <div class="d-flex gap-2 flex-wrap">
                  <button v-if="cfg.my_permission !== 'viewer'" class="btn btn-sm btn-outline-secondary" @click="goConfigure(cfg.id)">⚙️ Configure</button>
                  <button class="btn btn-sm btn-outline-secondary" title="Share project" @click="openShareModal('project', cfg.id, cfg.name || cfg.id)">🔗 Share</button>
                  <button v-if="cfg.my_permission !== 'viewer'" class="btn btn-sm btn-outline-secondary" title="Upload XLS actuals for this project" @click="triggerLoadActuals(cfg.id)">📂 Load Actuals</button>
                  <button class="btn btn-sm btn-outline-secondary" @click="goPlanningForProject(cfg.id)">📅 Planning</button>
                  <button class="btn btn-sm" :class="cardDataMap[cfg.id].hasData ? 'btn-primary' : 'btn-outline-secondary'" :disabled="!cardDataMap[cfg.id].hasData" @click="showDashboard(cfg.id)">📊 View Report →</button>
                </div>
              </div>
              <div class="table-responsive p-2">
                <table class="table table-sm align-middle mb-0" style="font-size:var(--text-base)">
                  <thead style="background:var(--indigo-50)"><tr><th style="min-width:110px"></th><th v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end" style="min-width:90px;white-space:nowrap">{{ monthLabel(ym) }}</th><th class="text-end" style="min-width:90px;background:var(--surface-medium)">{{ cardDataMap[cfg.id].totalPtc > 0 ? 'Total Fee' : 'Total' }}</th><th v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end" style="min-width:90px;background:var(--color-warning-bg);white-space:nowrap">PTC</th></tr></thead>
                  <tbody>
                    <tr style="background:var(--surface-light)"><td class="fw-semibold ps-2">Budget Estimated</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cfg.phasing?.[ym]||0) : '—' }}</td><td class="text-end fw-bold" style="background:var(--portfolio-totals-bg)">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cardDataMap[cfg.id].totalPhasing) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end fw-bold" style="background:var(--color-warning-bg)">{{ fmtMoney(cardDataMap[cfg.id].totalPtc) }}</td></tr>
                    <tr><td class="fw-semibold ps-2">Budget Spent</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].monthSpend[ym]||0) : '—' }}</td><td class="text-end fw-bold" style="background:var(--portfolio-totals-bg)">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].totalSpent) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end text-muted" style="background:var(--color-warning-bg)">—</td></tr>
                    <tr><td class="fw-semibold ps-2">Variance</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end" :style="varCellStyle(cfg, ym, cardDataMap[cfg.id])">{{ varCellText(cfg, ym, cardDataMap[cfg.id]) }}</td><td class="text-end fw-bold" :style="{background:'var(--portfolio-totals-bg)', color: (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? varColor(cardDataMap[cfg.id].totalVar) : undefined}">{{ (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? fmtVar(cardDataMap[cfg.id].totalVar) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end text-muted" style="background:var(--color-warning-bg)">—</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
  ```

  Replace it with:

  ```html
            <div class="col-md-6" v-if="cardDataMap[cfg.id]">
            <div class="section-card mb-0 h-100">
              <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span>📁 {{ fmtProjectTitle(cfg) }}</span>
                  <span v-if="cfg.code" class="text-muted small">{{ cfg.code }}</span>
                  <span v-html="pipelineBadge(getProjectPipeline(cfg.id) || cfg.pipeline)"></span>
                  <span v-html="statusBadgeLarge(cfg.status)"></span>
                  <span v-if="!cardDataMap[cfg.id].hasData" class="badge bg-warning text-dark">No actuals available</span>
                  <span v-if="cardDataMap[cfg.id].budgetBadgeHtml" v-html="cardDataMap[cfg.id].budgetBadgeHtml"></span>
                </div>
                <button class="btn btn-sm btn-primary" @click="showDashboard(cfg.id)">Open project →</button>
              </div>
              <div class="d-flex gap-4 flex-wrap p-3">
                <div><div class="text-muted small mb-1">Duration</div><div class="fw-bold">{{ cfg.startDate && cfg.endDate ? (monthLabel(cfg.startDate) + ' – ' + monthLabel(cfg.endDate)) : '—' }}</div></div>
                <div><div class="text-muted small mb-1">Sold</div><div class="fw-bold">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cardDataMap[cfg.id].totalPhasing) : '—' }}</div></div>
                <div><div class="text-muted small mb-1">Spent</div><div class="fw-bold">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].totalSpent) : '—' }}</div></div>
                <div><div class="text-muted small mb-1">Variance</div><div class="fw-bold" :style="{color: (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? varColor(cardDataMap[cfg.id].totalVar) : undefined}">{{ (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? fmtVar(cardDataMap[cfg.id].totalVar) : '—' }}</div></div>
              </div>
            </div>
            </div>
  ```

  Note: `⚙️ Configure`, `🔗 Share`, `📂 Load Actuals`, `📅 Planning` are dropped entirely here (relocated to the detail page in Task 2, except Configure which the user confirmed should NOT be duplicated onto the card). The single remaining button is always enabled (no `:disabled`) and relabeled `Open project →`.

- [ ] **Step 2: Replace the ungrouped card markup**

  Find this block (currently lines 150-181):

  ```html
      <!-- Ungrouped projects -->
      <template v-for="cfg in ungroupedProjects" :key="cfg.id">
      <div class="section-card mb-4" v-if="cardDataMap[cfg.id]">
        <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span>📁 {{ fmtProjectTitle(cfg) }}</span>
            <span v-if="cfg.code" class="text-muted small">{{ cfg.code }}</span>
            <span v-html="pipelineBadge(getProjectPipeline(cfg.id) || cfg.pipeline)"></span>
            <span v-html="statusBadgeLarge(cfg.status)"></span>
            <span v-if="!cardDataMap[cfg.id].hasData" class="badge bg-warning text-dark">no XLS data</span>
            <span v-if="cardDataMap[cfg.id].budgetBadgeHtml" v-html="cardDataMap[cfg.id].budgetBadgeHtml"></span>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button v-if="cfg.my_permission !== 'viewer'" class="btn btn-sm btn-outline-secondary" @click="goConfigure(cfg.id)">⚙️ Configure</button>
            <button class="btn btn-sm btn-outline-secondary" title="Share project" @click="openShareModal('project', cfg.id, cfg.name || cfg.id)">🔗 Share</button>
            <button v-if="cfg.my_permission !== 'viewer'" class="btn btn-sm btn-outline-secondary" title="Upload XLS actuals for this project" @click="triggerLoadActuals(cfg.id)">📂 Load Actuals</button>
            <button class="btn btn-sm btn-outline-secondary" @click="goPlanningForProject(cfg.id)">📅 Planning</button>
            <button class="btn btn-sm" :class="cardDataMap[cfg.id].hasData ? 'btn-primary' : 'btn-outline-secondary'" :disabled="!cardDataMap[cfg.id].hasData" @click="showDashboard(cfg.id)">📊 View Report →</button>
            <button class="btn btn-sm" :class="isPinnedSummary(cfg.id) ? 'btn-success' : 'btn-outline-secondary'" @click="toggleSummary(cfg.id)">{{ isPinnedSummary(cfg.id) ? '✓ Summary' : '＋ Summary' }}</button>
          </div>
        </div>
        <div class="table-responsive p-2">
          <table class="table table-sm align-middle mb-0" style="font-size:var(--text-base)">
            <thead style="background:var(--indigo-50)"><tr><th style="min-width:110px"></th><th v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end" style="min-width:90px;white-space:nowrap">{{ monthLabel(ym) }}</th><th class="text-end" style="min-width:90px;background:var(--surface-medium)">{{ cardDataMap[cfg.id].totalPtc > 0 ? 'Total Fee' : 'Total' }}</th><th v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end" style="min-width:90px;background:var(--color-warning-bg);white-space:nowrap">PTC</th></tr></thead>
            <tbody>
              <tr style="background:var(--surface-light)"><td class="fw-semibold ps-2">Budget Estimated</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cfg.phasing?.[ym]||0) : '—' }}</td><td class="text-end fw-bold" style="background:var(--portfolio-totals-bg)">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cardDataMap[cfg.id].totalPhasing) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end fw-bold" style="background:var(--color-warning-bg)">{{ fmtMoney(cardDataMap[cfg.id].totalPtc) }}</td></tr>
              <tr><td class="fw-semibold ps-2">Budget Spent</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].monthSpend[ym]||0) : '—' }}</td><td class="text-end fw-bold" style="background:var(--portfolio-totals-bg)">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].totalSpent) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end text-muted" style="background:var(--color-warning-bg)">—</td></tr>
              <tr><td class="fw-semibold ps-2">Variance</td><td v-for="ym in cardDataMap[cfg.id].months" :key="ym" class="text-end" :style="varCellStyle(cfg, ym, cardDataMap[cfg.id])">{{ varCellText(cfg, ym, cardDataMap[cfg.id]) }}</td><td class="text-end fw-bold" :style="{background:'var(--portfolio-totals-bg)', color: (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? varColor(cardDataMap[cfg.id].totalVar) : undefined}">{{ (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? fmtVar(cardDataMap[cfg.id].totalVar) : '—' }}</td><td v-if="cardDataMap[cfg.id].totalPtc > 0" class="text-end text-muted" style="background:var(--color-warning-bg)">—</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      </template>
  ```

  Replace it with:

  ```html
      <!-- Ungrouped projects -->
      <template v-for="cfg in ungroupedProjects" :key="cfg.id">
      <div class="col-md-6" v-if="cardDataMap[cfg.id]">
      <div class="section-card mb-0 h-100">
        <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span>📁 {{ fmtProjectTitle(cfg) }}</span>
            <span v-if="cfg.code" class="text-muted small">{{ cfg.code }}</span>
            <span v-html="pipelineBadge(getProjectPipeline(cfg.id) || cfg.pipeline)"></span>
            <span v-html="statusBadgeLarge(cfg.status)"></span>
            <span v-if="!cardDataMap[cfg.id].hasData" class="badge bg-warning text-dark">No actuals available</span>
            <span v-if="cardDataMap[cfg.id].budgetBadgeHtml" v-html="cardDataMap[cfg.id].budgetBadgeHtml"></span>
          </div>
          <button class="btn btn-sm btn-primary" @click="showDashboard(cfg.id)">Open project →</button>
        </div>
        <div class="d-flex gap-4 flex-wrap p-3">
          <div><div class="text-muted small mb-1">Duration</div><div class="fw-bold">{{ cfg.startDate && cfg.endDate ? (monthLabel(cfg.startDate) + ' – ' + monthLabel(cfg.endDate)) : '—' }}</div></div>
          <div><div class="text-muted small mb-1">Sold</div><div class="fw-bold">{{ cardDataMap[cfg.id].hasPhasing ? fmtMoney(cardDataMap[cfg.id].totalPhasing) : '—' }}</div></div>
          <div><div class="text-muted small mb-1">Spent</div><div class="fw-bold">{{ cardDataMap[cfg.id].hasData ? fmtMoney(cardDataMap[cfg.id].totalSpent) : '—' }}</div></div>
          <div><div class="text-muted small mb-1">Variance</div><div class="fw-bold" :style="{color: (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? varColor(cardDataMap[cfg.id].totalVar) : undefined}">{{ (cardDataMap[cfg.id].hasData && cardDataMap[cfg.id].hasPhasing) ? fmtVar(cardDataMap[cfg.id].totalVar) : '—' }}</div></div>
        </div>
      </div>
      </div>
      </template>
  ```

  Note: `＋ Summary`/`✓ Summary` (`toggleSummary`/`isPinnedSummary`) is dropped here too — relocated to the detail page in Task 2.

- [ ] **Step 3: Manual verification**

  Run `scripts/test-branch.sh up` (or reuse an already-running branch environment), open `/portfolio.html`, and confirm: every card shows title/code/badges, duration, Sold, Spent, colored Variance, and a single "Open project →" button that is clickable even for a project with no actuals uploaded (no monthly table, no other buttons). Cards will still render one-per-row at this point — the 2-column grid comes in Task 3, this step only verifies content correctness.

- [ ] **Step 4: Commit**

  ```bash
  git add portfolio.html
  git commit -m "feat: reduce portfolio list-view cards to identity + totals, single entry button"
  ```

---

### Task 2: Relocate Load Actuals and Summary to the project detail page

**Files:**
- Modify: `portfolio.html:216-224` (detail-view header action row)

**Interfaces:**
- Consumes: existing methods `triggerLoadActuals(projectId)`, `toggleSummary(id)`, `isPinnedSummary(id)` (all already defined, used unchanged — only their call sites move). Also `dashboardProjectId`, `dashboardProject` (existing detail-view state).
- Produces: no new interfaces.

- [ ] **Step 1: Add the two buttons to the detail-view header action row**

  Find this block in `portfolio.html` (currently lines 216-224):

  ```html
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div><button class="btn btn-outline-secondary btn-sm" @click="showOverview">← Portfolio</button></div>
        <div class="d-flex gap-2">
          <button v-if="dashboardProject?.my_permission !== 'viewer'" class="btn btn-outline-secondary btn-sm" @click="goConfigure(dashboardProjectId)">⚙️ Configure</button>
          <button class="btn btn-outline-secondary btn-sm" @click="goPlanningForProject(dashboardProjectId)">📅 Planning</button>
          <button v-if="hasAiKey()" class="btn btn-outline-secondary btn-sm" @click="openAiAnalysis()">🤖 AI Analysis</button>
          <button class="btn btn-outline-secondary btn-sm" @click="openShareModal('project', dashboardProjectId, dashboardProject?.name || dashboardProjectId)">🔗 Share</button>
        </div>
      </div>
  ```

  Replace it with:

  ```html
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div><button class="btn btn-outline-secondary btn-sm" @click="showOverview">← Portfolio</button></div>
        <div class="d-flex gap-2">
          <button v-if="dashboardProject?.my_permission !== 'viewer'" class="btn btn-outline-secondary btn-sm" @click="goConfigure(dashboardProjectId)">⚙️ Configure</button>
          <button v-if="dashboardProject?.my_permission !== 'viewer'" class="btn btn-outline-secondary btn-sm" title="Upload XLS actuals for this project" @click="triggerLoadActuals(dashboardProjectId)">📂 Load Actuals</button>
          <button class="btn btn-outline-secondary btn-sm" @click="goPlanningForProject(dashboardProjectId)">📅 Planning</button>
          <button v-if="hasAiKey()" class="btn btn-outline-secondary btn-sm" @click="openAiAnalysis()">🤖 AI Analysis</button>
          <button class="btn btn-outline-secondary btn-sm" @click="openShareModal('project', dashboardProjectId, dashboardProject?.name || dashboardProjectId)">🔗 Share</button>
          <button class="btn btn-sm" :class="isPinnedSummary(dashboardProjectId) ? 'btn-success' : 'btn-outline-secondary'" @click="toggleSummary(dashboardProjectId)">{{ isPinnedSummary(dashboardProjectId) ? '✓ Summary' : '＋ Summary' }}</button>
        </div>
      </div>
  ```

- [ ] **Step 2: Manual verification**

  In the browser: open a project's detail page (📊 from the card in Task 1). Confirm `📂 Load Actuals` opens the file picker for that project (same behavior as the old card button) and `＋ Summary`/`✓ Summary` correctly pins/unpins the project into the Budget Summary panel visible from the overview — navigate back to `← Portfolio` to confirm the pinned summary panel reflects the toggle. Confirm both buttons work even for a project with no actuals yet (not gated by `hasData`).

- [ ] **Step 3: Commit**

  ```bash
  git add portfolio.html
  git commit -m "feat: relocate Load Actuals and Summary toggle to project detail page"
  ```

---

### Task 3: Two-column grid layout (ungrouped cards + program blocks + nested children)

**Files:**
- Modify: `portfolio.html:80-182` (wraps the program-groups `v-for` and the ungrouped-projects `v-for` in a shared Bootstrap row; wraps program children in their own nested row)

**Interfaces:**
- Consumes: no new data — purely wraps existing `v-for="prog in visibleProgramGroups"` and `v-for="cfg in ungroupedProjects"` (and the nested `v-for="cfg in prog.children"`) in Bootstrap grid containers.
- Produces: no new interfaces.

- [ ] **Step 1: Wrap program groups and ungrouped projects in one shared row**

  Find the opening of the program-groups block (currently line 80-81):

  ```html
      <!-- Program groups -->
      <div class="section-card mb-4" style="border:2px solid var(--violet-500)" v-for="prog in visibleProgramGroups" :key="prog.id">
  ```

  Replace with:

  ```html
      <div class="row g-3 mb-4">
      <!-- Program groups -->
      <div class="col-12" v-for="prog in visibleProgramGroups" :key="prog.id">
      <div class="section-card mb-0" style="border:2px solid var(--violet-500)">
  ```

  Find the closing of that same program-group block (currently line 147, the lone `</div>` that closes the per-program `section-card`):

  ```html
      </div>

      <!-- Ungrouped projects -->
      <template v-for="cfg in ungroupedProjects" :key="cfg.id">
  ```

  Replace with:

  ```html
      </div>
      </div>

      <!-- Ungrouped projects -->
      <template v-for="cfg in ungroupedProjects" :key="cfg.id">
  ```

  (This closes both the new inner `section-card` div and the new `col-12` wrapper div, before the existing `<template v-for="cfg in ungroupedProjects">` from Task 1 Step 2 begins — that template already now renders `<div class="col-md-6" v-if=...>` per Task 1.)

  Finally, find the very end of the ungrouped-projects block (the `</template>` that Task 1 Step 2 already left in place, immediately followed by the two closing `</template>` / `</template>` of the outer `v-else`/`v-if` structure — currently lines 181-183):

  ```html
      </template>
    </template>
  </template>
  ```

  Replace with:

  ```html
      </template>
      </div>
    </template>
  </template>
  ```

  (The added `</div>` closes the shared `row` opened in this step's first replacement.)

- [ ] **Step 2: Wrap program children in their own nested row**

  Find this block (inside the program group, currently around lines 112-114 — the container immediately wrapping the children's `<template v-for="cfg in prog.children">` from Task 1 Step 1):

  ```html
        <div v-if="expandedPrograms.has(prog.id)" class="prog-children">
          <div class="prog-project-list px-2 pb-2 pt-1">
            <template v-for="cfg in prog.children" :key="cfg.id">
  ```

  Replace with:

  ```html
        <div v-if="expandedPrograms.has(prog.id)" class="prog-children">
          <div class="prog-project-list px-2 pb-2 pt-1">
            <div class="row g-3">
            <template v-for="cfg in prog.children" :key="cfg.id">
  ```

  Then find the closing of that children loop (currently around lines 144-146, immediately after the `</template>` that Task 1 Step 1 left following the child card's closing `</div></div>`):

  ```html
            </template>
          </div>
        </div>
  ```

  Replace with:

  ```html
            </template>
            </div>
          </div>
        </div>
  ```

  (The added `</div>` closes the new nested `row` opened just above.)

- [ ] **Step 3: Manual verification**

  In the browser: confirm ungrouped projects now render two per row (stacking to one per row on narrow/mobile widths — standard Bootstrap `col-md-6` behavior), a program group spans the full row width, and — with a program expanded — its child projects render two per row inside the program block. Confirm an odd number of ungrouped projects leaves the last one alone in its row without visual breakage. Confirm the Program Summary table and the pinned Budget Summary panel above are visually unchanged.

- [ ] **Step 4: Commit**

  ```bash
  git add portfolio.html
  git commit -m "feat: lay out portfolio list-view project cards in a 2-column grid"
  ```

---

### Task 4: Variance color parity in the detail view + dead code cleanup

**Files:**
- Modify: `portfolio.html:1075-1080` (`kpiLeftColor`)
- Modify: `portfolio.html:1020-1046` (`cardData` — drop now-unused returned fields)
- Modify: `portfolio.html:1048-1057` (remove `varCellStyle`/`varCellText` — dead code after Task 1)

**Interfaces:**
- Consumes: nothing new.
- Produces: `cardData(cfg)` return shape changes from `{ months, monthSpend, hasData, hasPhasing, totalPtc, totalSpent, totalPhasing, totalVar, budgetBadgeHtml }` to `{ hasData, hasPhasing, totalPtc, totalSpent, totalPhasing, totalVar, budgetBadgeHtml }` (drops `months`/`monthSpend`, which were only consumed by the now-removed monthly table and by `varCellStyle`/`varCellText`, also removed in this task). `months`/`monthSpend` remain as **local variables inside `cardData`** — they're still needed internally to compute `totalSpent`/`totalPhasing` — only the object returned to callers changes.

- [ ] **Step 1: Add explicit green to `kpiLeftColor` for a positive residual**

  Find (currently lines 1075-1080):

  ```javascript
      kpiLeftColor(left, total) {
        if (left === null) return '';
        if (left < 0) return 'var(--color-danger)';
        if (total && left < total * 0.1) return '#fd7e14';
        return '';
      },
  ```

  Replace with:

  ```javascript
      kpiLeftColor(left, total) {
        if (left === null) return '';
        if (left < 0) return 'var(--color-danger)';
        if (total && left < total * 0.1) return '#fd7e14';
        return 'var(--color-success)';
      },
  ```

- [ ] **Step 2: Trim `cardData`'s returned object**

  Find the final line of `cardData` (currently line 1046):

  ```javascript
        return { months, monthSpend, hasData, hasPhasing, totalPtc, totalSpent, totalPhasing, totalVar, budgetBadgeHtml };
  ```

  Replace with:

  ```javascript
        return { hasData, hasPhasing, totalPtc, totalSpent, totalPhasing, totalVar, budgetBadgeHtml };
  ```

  Leave the rest of `cardData` (the `const months = ...` and `const monthSpend = {}` computation) untouched — those local variables are still needed to compute `totalSpent`/`totalPhasing`/the `!months.length` early return.

- [ ] **Step 3: Remove the now-dead `varCellStyle`/`varCellText` methods**

  Find (currently lines 1048-1057, immediately after `cardData`'s closing `},`):

  ```javascript
      varCellStyle(cfg, ym, cd) {
        if (!cd.hasData || !cd.hasPhasing) return {};
        const v = (cfg.phasing?.[ym]||0) - (cd.monthSpend[ym]||0);
        return { color: this.varColor(v), fontWeight: 600 };
      },
      varCellText(cfg, ym, cd) {
        if (!cd.hasData || !cd.hasPhasing) return '—';
        const v = (cfg.phasing?.[ym]||0) - (cd.monthSpend[ym]||0);
        return `${v>=0?'+':''}${this.fmtMoney ? this.fmtMoney(v) : fmtMoney(v)}`;
      },
      toggleSummary(id) {
  ```

  Replace with:

  ```javascript
      toggleSummary(id) {
  ```

  (Deletes the two now-unreachable methods; `toggleSummary` and everything after it is untouched, just now directly follows `cardData`.)

- [ ] **Step 4: Manual verification**

  In the browser: open a project detail page and confirm `⏳ Hours Left` and `💼 Budget Left` KPI cards render in green when the residual is comfortably positive (not near the 10% warning threshold), still red when negative, still orange near the threshold. Re-check the list view (from Task 1/3) still renders Sold/Spent/Variance totals correctly — confirms `cardData`'s trimmed return didn't break anything still reading it.

- [ ] **Step 5: Commit**

  ```bash
  git add portfolio.html
  git commit -m "fix: align variance color convention between list and detail views; remove dead monthly-cell helpers"
  ```

---

## Self-Review Notes

- **Spec coverage:** every acceptance criterion in the design spec maps to a task — card content (Task 1), relocated actions (Task 2), grid layout (Task 3), color parity + cleanup (Task 4).
- **No new CSS:** confirmed no new classes are introduced anywhere in this plan — only existing Bootstrap grid utilities (`row`, `col-12`, `col-md-6`, `g-3`) and existing token-driven utility classes/inline styles already used elsewhere on this page.
- **Type/interface consistency:** `cardDataMap[cfg.id]` field names used in Task 1's new markup (`hasData`, `hasPhasing`, `totalPhasing`, `totalSpent`, `totalVar`, `budgetBadgeHtml`) match exactly what Task 4 leaves in `cardData`'s return — verified no stale field references remain (`months`/`monthSpend` are fully removed from both the table markup, in Task 1, and the return object, in Task 4).
