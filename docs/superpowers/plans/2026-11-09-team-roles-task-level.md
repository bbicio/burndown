# Experience profile — task level under Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `team.html`'s Experience profile, Roles becomes role → project → task, with the person's hours in that role and, on every task row (Roles and dimensions), chips of its approved topics.

**Architecture:** The profile engine records role × task per contribution and stores profile `version: 3` with `roles[].byProject` and `topicIds` on tasks. The profile route resolves those ids to approved `{ id, name }` at read time. `buildProfileTree` and the panel markup render the new level.

**Tech Stack:** Node/Express + `node:test` (api), Vue 3 CDN + vitest/jsdom (frontend).

**Spec:** `docs/superpowers/specs/2026-11-09-team-roles-task-level-design.md`
**Branch:** `team-roles-task-level`
**Risk class:** standard — touches `api/src/lib/` modules and an API route; no migration, auth, money, multi-page shared file or destructive operation.

Execution worktree (from the main checkout, on local `main`): `git worktree add .claude/worktrees/team-roles-task-level -b team-roles-task-level`, then copy `.env` from the main checkout and run `npm ci` in the worktree.

**Task independence:** the tasks are **not** independent: Task 2 reads the stored shape from Task 1, and Task 3 renders the response shape from Task 2.

## Global Constraints

- Changes to `profile.roles` and `profile.projects[].tasks[]` are additive only; `api/src/lib/team-scoring.js` and its test stay unchanged.
- No DB migration, no LLM call, no new route.
- Bump every `?v=` reference of `js/lib/team-ui.js` (today `?v=7` in `team.html`) and of `css/team.css` (today `?v=1`) if it is touched.
- User-facing text in English; no hardcoded hex colours (tokens only).
- Edit HTML with the Edit tool, never via PowerShell `Set-Content` (BOM).
- Docs (`docs/api/profile-engine.md` "Profile version 3" + Rebuild note, `docs/pages/team.md`) are written by `/finish-cycle` Gate 5's `/sync-docs`, not by these tasks.

## Review Focus

1. **Partial rebuild:** the worker reprocesses one code and rebuilds the profile from old contributions of the other codes (no `roleTasks`) → those role → project rows keep the role's hours, have no tasks, render static. Test in Task 1 and Task 3.
2. **Task name spelling vs link key:** a task logged as `"  Medical  Review "` must pick up links stored under `medical review` (`normalizeTask` key = `taskKey`). Test in Task 1.
3. **Merge into a non-approved topic:** a topic merged into a `rejected` topic shows no chip. Test in Task 2.
4. **Same final topic twice on one task** (the topic and a topic merged into it) → one chip. Test in Task 2.
5. **`(no task)` rows under a role:** appear as a `(no task)` task with no chips, hours counted. Test in Task 1.

---

### Task 1: Role × task in the stored profile (version 3)

**Files:**
- Modify: `api/src/lib/resource-profile.js` (`buildContributions`, `aggregateProfile`)
- Test: `api/src/lib/resource-profile.test.js`

**Interfaces:**
- Produces: contribution `roleTasks: { [role]: { [taskKey]: { name, hours } } }`; profile `version: 3`; `roles[i].byProject: { [code]: { hours: number, tasks: [{ name, hours, topicIds: string[] }] } }`; `projects[code].tasks[i].topicIds: string[]`.

- [ ] **Step 1: Update the existing tests to the new shape**
  - `buildContributions: sums hours…`: the expected `r1` gains `roleTasks: { DEV: { analysis: { name: 'Analysis', hours: 6.5 } }, PM: { kickoff: { name: 'Kickoff', hours: 1 } } }`.
  - `aggregateProfile: totals…`: `assert.equal(p.version, 3)`; each expected task in `p.projects.*.tasks` gains `topicIds: []` (or the ids its `taskTopics` gives).
  - Any other `deepEqual` on `roles[]` gains the expected `byProject`.
- [ ] **Step 2: Write the new failing tests**

```js
test('aggregateProfile v3: two roles on one project split hours and tasks per role', () => {
  const rows = [
    { owner: 'Mario Rossi', role: 'DEV', task: 'Analysis', hours: 4, date: '2026-01-15' },
    { owner: 'Mario Rossi', role: 'DEV', task: '  Medical  Review ', hours: 2, date: '2026-01-16' },
    { owner: 'Mario Rossi', role: 'PM', task: 'Analysis', hours: 1.5, date: '2026-01-17' },
    { owner: 'Mario Rossi', role: 'PM', task: '', hours: 0.5, date: '2026-01-18' },
    { owner: 'Mario Rossi', role: '', task: 'Analysis', hours: 3, date: '2026-01-19' },
  ];
  const contrib = { P1: buildContributions(rows, ctx, 'Alpha').get('r1') };
  const p = aggregateProfile(contrib, { P1: { projectId: 'id1', name: 'Alpha', tags: [],
    taskTopics: { analysis: ['t1'], 'medical review': ['t2', 't3'] } } }, NOW);
  const dev = p.roles.find(r => r.code === 'DEV'), pm = p.roles.find(r => r.code === 'PM');
  assert.deepEqual(dev.byProject.P1, { hours: 6, tasks: [
    { name: 'Analysis', hours: 4, topicIds: ['t1'] },
    { name: 'Medical Review', hours: 2, topicIds: ['t2', 't3'] },
  ] });
  assert.deepEqual(pm.byProject.P1, { hours: 2, tasks: [
    { name: 'Analysis', hours: 1.5, topicIds: ['t1'] },
    { name: '(no task)', hours: 0.5, topicIds: [] },
  ] });
  assert.equal(dev.byProject.P1.hours + pm.byProject.P1.hours, 8);   // no-role 3 h excluded from Roles
  assert.equal(p.projects.P1.hours, 11);
  assert.deepEqual(p.projects.P1.tasks.find(t => t.name === 'Analysis').topicIds, ['t1']);
  assert.equal(dev.hours, 6);                                        // existing fields unchanged
  assert.deepEqual(dev.projectCodes, ['P1']);
});

test('aggregateProfile v3: a contribution stored before v3 (no roleTasks) gives byProject hours with no tasks', () => {
  const p = aggregateProfile({ P2: C(3, '2026-03', '2026-03', { DEV: 2 }, { kickoff: { name: 'Kickoff', hours: 3 } }) },
    { P2: { projectId: 'id2', name: 'Beta', tags: [] } }, NOW);
  assert.deepEqual(p.roles[0].byProject, { P2: { hours: 2, tasks: [] } });
});
```

- [ ] **Step 3: Run and see them fail**

Run (from `api/`): `node --test src/lib/resource-profile.test.js`
Expected: FAIL (`version` 2 ≠ 3, `byProject` undefined).

- [ ] **Step 4: Implement**
  - `buildContributions`: in the `if (role)` branch also accumulate `c.roleTasks[role][t.key]`, where `t = normalizeTask(row.task)` is computed once before the branch. Initialise `roleTasks: {}`. Round in the final loop.
  - `aggregateProfile`: `version: 3`. `projects[code].tasks` is built from `Object.entries(c.tasks)`, adding `topicIds: [...((info.taskTopics || {})[key] || [])]`.
  - In the role loop add `r.byProject[code] = { hours: round2(h), tasks }`, where `tasks` comes from `Object.entries((c.roleTasks || {})[role] || {})` with the same `topicIds` rule, sorted by hours desc then name.
  - The `roles` map copies `byProject: r.byProject`.
- [ ] **Step 5: Run the backend lib tests**

Run (from `api/`): `node --test src/lib/resource-profile.test.js src/lib/team-scoring.test.js`
Expected: PASS, with `team-scoring.test.js` unmodified.

- [ ] **Step 6: Commit** — `feat(profile): v3 — role × task per project, topic ids on tasks`

### Task 2: Resolve task topics at read time

**Files:**
- Modify: `api/src/lib/topic-extract.js` (new exports), `api/src/routes/resources.js` (`GET /:id/profile`, around line 126)
- Test: `api/src/lib/topic-extract.test.js`

**Interfaces:**
- Consumes: Task 1's stored shape.
- Produces: `resolveTaskTopics(ids: string[] | undefined, topicsById: Map) → [{ id, name }]` and `resolveProfileTaskTopics(profile, topicsById) → profile copy`. In the copy, every task in `projects[*].tasks` and `roles[*].byProject[*].tasks` has `topics: [{ id, name }]` and no `topicIds`. The input is not mutated.

- [ ] **Step 1: Write the failing tests** (a local vocabulary, so the shared `vocab` stays as is: `const { topicsById } = buildVocabulary([T('t1', 'Medical writing'), T('t2', 'Data visualization', 'proposed'), T('t3', 'Copy editing', 'rejected'), T('t4', 'Old name', 'approved', 't1'), T('t5', 'Stale', 'approved', 't3')], []);` — t5 is merged into a rejected topic)

```js
test('resolveTaskTopics: approved only, merges followed, merged-into-rejected hidden, one chip per final topic', () => {
  assert.deepEqual(resolveTaskTopics(['t4', 't1', 't2', 't3', 't5', 'gone'], topicsById), [{ id: 't1', name: 'Medical writing' }]);
  assert.deepEqual(resolveTaskTopics(undefined, topicsById), []);
});

test('resolveProfileTaskTopics: v3 tasks get topics, v2 tasks get [], input untouched', () => {
  const stored = {
    version: 3,
    projects: { P1: { tasks: [{ name: 'A', hours: 1, topicIds: ['t4'] }] } },
    roles: [{ code: 'DEV', byProject: { P1: { hours: 1, tasks: [{ name: 'A', hours: 1, topicIds: ['t2'] }] } } }, { code: 'PM' }],
  };
  const out = resolveProfileTaskTopics(stored, topicsById);
  assert.deepEqual(out.projects.P1.tasks, [{ name: 'A', hours: 1, topics: [{ id: 't1', name: 'Medical writing' }] }]);
  assert.deepEqual(out.roles[0].byProject.P1.tasks, [{ name: 'A', hours: 1, topics: [] }]);
  assert.equal(out.roles[1].byProject, undefined);
  assert.deepEqual(stored.projects.P1.tasks[0].topicIds, ['t4']);
  const v2 = resolveProfileTaskTopics({ version: 2, projects: { P1: { tasks: [{ name: 'A', hours: 1 }] } }, roles: [] }, topicsById);
  assert.deepEqual(v2.projects.P1.tasks, [{ name: 'A', hours: 1, topics: [] }]);
});
```

- [ ] **Step 2: Run and see them fail** — (from `api/`) `node --test src/lib/topic-extract.test.js` → FAIL, not a function.
- [ ] **Step 3: Implement**
  - Both functions use `finalTopic` and keep `status === 'approved'`.
  - Topics are de-duplicated by final id and sorted by `name.localeCompare`.
  - Export both functions.
- [ ] **Step 4: Wire the route**
  - In `GET /:id/profile`: `profile = resolveProfileTaskTopics({ ...profile, topics: resolveProfileTopics(profile.topics, vocab.topicsById) }, vocab.topicsById)`.
  - Import it next to `resolveProfileTopics`.
- [ ] **Step 5: Run** — (from `api/`) `node --test src/lib/topic-extract.test.js src/lib/resource-profile.test.js` → PASS.
- [ ] **Step 6: Commit** — `feat(profile): resolve per-task approved topics at read time`

### Task 3: Panel — role → project → task, topic chips on task rows

**Files:**
- Modify: `js/lib/team-ui.js` (`buildProfileTree`, lines ~76-120), `team.html` (Roles section ~lines 625-650, dimension task row ~lines 612-616, `team-ui.js?v=7` → `?v=8`; `team.css?v=1` → `?v=2` if CSS changes), `css/team.css` (only if the chips need alignment in the task cell)
- Test: `js/lib/team-ui.test.js`

**Interfaces:**
- Consumes: Task 2's response — tasks carry `topics: [{ id, name }]`, and roles may carry `byProject`.
- Produces: in `buildProfileTree`, every task node has `topics` (an array, `[]` when absent). Role project nodes are `{ code, name, hours, last, tasks }`: `hours`/`tasks` come from `r.byProject[code]` when present, otherwise from today's project node with `tasks: []`. They are sorted by these hours, desc then name.

- [ ] **Step 1: Write the failing tests** (in `describe('buildProfileTree')`)

```js
it('v3: role → project uses the role hours and tasks with topics', () => {
  const v3 = { ...profile, version: 3,
    projects: { ...profile.projects, P1: { ...profile.projects.P1, tasks: [{ name: 'Analysis', hours: 10, topics: [{ id: 't1', name: 'Medical writing' }] }] } },
    roles: [{ ...profile.roles[0], byProject: {
      P1: { hours: 9, tasks: [{ name: 'Analysis', hours: 9, topics: [{ id: 't1', name: 'Medical writing' }] }] },
      P2: { hours: 3, tasks: [] },                                   // contribution from before v3
    } }, profile.roles[1]] };
  const t = buildProfileTree(v3, roles);
  const dev = t.roles[0];
  expect(dev.projects.map(p => [p.code, p.hours])).toEqual([['P1', 9], ['P2', 3]]);
  expect(dev.projects[0].tasks).toEqual([{ name: 'Analysis', hours: 9, topics: [{ id: 't1', name: 'Medical writing' }] }]);
  expect(dev.projects[1].tasks).toEqual([]);
  const italy = t.dimensions.find(d => d.slug === 'market').values.find(v => v.label === 'Italy');
  expect(italy.projects[0].tasks[0].topics).toEqual([{ id: 't1', name: 'Medical writing' }]);
});

it('v2: role → project keeps the project total and has no tasks; dimension tasks get topics []', () => {
  const t = buildProfileTree(profile, roles);
  expect(t.roles[0].projects.map(p => [p.code, p.hours, p.tasks.length])).toEqual([['P1', 10, 0], ['P2', 3, 0]]);
  expect(t.dimensions.find(d => d.slug === 'market').values[0].projects[0].tasks[0].topics).toEqual([]);
});
```

- [ ] **Step 2: Run and see them fail** — `npx vitest run js/lib/team-ui.test.js` → FAIL. Also update any existing assertion that today expects role project nodes to carry the project's tasks.
- [ ] **Step 3: Implement `buildProfileTree`** — per the Produces block; `node(code)` maps tasks to `{ ...t, topics: t.topics || [] }`.
- [ ] **Step 4: Markup in `team.html`**
  - Roles: a role project row with `p.tasks.length` becomes a `<button>` identical to the dimension project row (chevron `ph-icon`, `:aria-expanded`, `@click="toggleExpanded(...)"`), with key `'role:' + r.code + ':' + p.code`.
  - Under it, task rows use the dimension task-row markup.
  - A row with no tasks stays the existing static `div`.
  - On every task row (Roles and dimensions), inside the `tm-dim-task` cell after the name: `<span v-if="t.topics.length" class="tm-topic-chips"><span v-for="x in t.topics" :key="x.id" class="tm-chip">{{ x.name }}</span></span>`.
  - Bump `?v=`.
- [ ] **Step 5: Run** `npm test` → all pass, including `js/lib/nav-shell-guard.test.js` / `page-head-guard` (`?v=` agreement).
- [ ] **Step 6: Visual check**
  - Render `team.html` with the panel open on the Experience tab via `scripts/shoot.mjs` (see `docs/scripts/shoot.md`), against the branch stack (`scripts/test-branch.sh up`), at 1440 and 390 widths.
  - Read the PNGs back: chips must wrap inside the task cell without overflowing the grid. Add a `css/team.css` rule only if they do not.
  - Before Rebuild the branch stack shows v2 data: no tasks under roles. To see v3, trigger Rebuild on the **branch stack's** `profile-jobs.html`, never the main stack.
- [ ] **Step 7: Commit** — `feat(team): Roles → project → task with topic chips`

## Decisioni aperte

Nessuna.
