#!/usr/bin/env node
// One-shot migration: PDash localStorage backup JSON → PostgreSQL
// Usage: node api/src/db/migrate-backup.js <path-to-backup.json>

const path = require('path');
const fs   = require('fs');
const { Pool } = require('pg');

// ── ARGS ──────────────────────────────────────────────────────────────────────

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: node migrate-backup.js <path-to-backup.json>');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(path.resolve(backupPath), 'utf8'));
const stores = backup.stores;

// ── DB CONNECTION ─────────────────────────────────────────────────────────────

// Load .env from project root (two levels up from api/src/db/)
const envFile = path.join(__dirname, '../../../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}

// Use DATABASE_URL as-is when running inside the container (db hostname resolves via Docker DNS).
// On a host machine, override with DATABASE_URL=postgres://pdash:pass@localhost:5432/pdash node ...
const dbUrl = process.env.DATABASE_URL || 'postgres://pdash:pdash@db:5432/pdash';

const pool = new Pool({ connectionString: dbUrl });

// ── HELPERS ───────────────────────────────────────────────────────────────────

const yyyymm     = s => s ? String(s).slice(0, 6) : null;
const toDate     = s => { if (!s) return null; const m = String(s).slice(0, 6); return `${m.slice(0,4)}-${m.slice(4,6)}-01`; };
const toCurrency = s => (s === '€' || !s) ? 'EUR' : s;

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function run() {
  const db = await pool.connect();

  try {
    await db.query('BEGIN');

    // ── 1. PROGRAMS ───────────────────────────────────────────────────────────
    console.log('1/6  programs…');
    for (const p of (stores.programs || [])) {
      await db.query(
        `INSERT INTO programs (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = $2`,
        [p.id, p.name]
      );
    }

    // ── 2. CLIENTS ────────────────────────────────────────────────────────────
    console.log('2/6  clients…');
    const clientMap = {};   // old "cli_..." id → new UUID
    for (const c of (stores.clients || [])) {
      const { rows } = await db.query(
        `INSERT INTO clients (name) VALUES ($1)
         ON CONFLICT DO NOTHING RETURNING id`,
        [c.name]
      );
      if (rows[0]) {
        clientMap[c.id] = rows[0].id;
      } else {
        const { rows: ex } = await db.query('SELECT id FROM clients WHERE name = $1', [c.name]);
        if (ex[0]) clientMap[c.id] = ex[0].id;
      }
    }

    // ── 3. ROLES ──────────────────────────────────────────────────────────────
    console.log('3/6  roles…');
    const roleMap = {};     // role code → UUID
    for (const r of (stores.roles || [])) {
      const { rows } = await db.query(
        `INSERT INTO roles (label, code, hourly_rate)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET label = $1, hourly_rate = $3
         RETURNING id, code`,
        [r.label, r.code, r.rate ?? null]
      );
      roleMap[rows[0].code] = rows[0].id;
    }

    // ── 4. OWNER ──────────────────────────────────────────────────────────────
    const { rows: admins } = await db.query(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
    );
    if (!admins[0]) throw new Error('No admin user found — create admin first.');
    const ownerId = admins[0].id;
    console.log(`     owner id: ${ownerId}`);

    // ── 5. COST GRIDS ─────────────────────────────────────────────────────────
    console.log('4/6  cost grids…');
    const cgMap  = {};  // old "cg_..." id → new UUID
    const verMap = {};  // old "ver_..." id → new UUID

    for (const cg of (stores.costgrids?.grids || [])) {

      // Insert or find the cost grid
      const { rows: cgR } = await db.query(
        `INSERT INTO cost_grids (name, owner_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING id`,
        [cg.name, ownerId]
      );
      let cgId = cgR[0]?.id;
      if (!cgId) {
        const { rows: ex } = await db.query('SELECT id FROM cost_grids WHERE name = $1', [cg.name]);
        cgId = ex[0]?.id;
      }
      cgMap[cg.id] = cgId;

      await db.query(
        `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
         VALUES ('cost_grid', $1, $2, 'owner', $2) ON CONFLICT DO NOTHING`,
        [cgId, ownerId]
      );

      for (const v of (cg.versions || [])) {
        // Per-version role rate map: roleCode → rate
        const vRateMap = {};
        for (const vr of (v.roles || [])) vRateMap[vr.roleCode] = vr.rate;

        const { rows: verR } = await db.query(
          `INSERT INTO cost_grid_versions
             (cost_grid_id, label, pipeline, start_date, end_date, currency, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [cgId,
           v.versionLabel || 'v1.0',
           v.pipeline || null,
           toDate(v.startDate),
           toDate(v.endDate),
           toCurrency(v.currency),
           v.note || null]
        );
        const verId = verR[0].id;
        verMap[v.versionId] = verId;

        for (let phIdx = 0; phIdx < (v.phases || []).length; phIdx++) {
          const ph = v.phases[phIdx];
          const { rows: phR } = await db.query(
            `INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id`,
            [verId, ph.phaseName || ph.phaseId, phIdx]
          );
          const phaseId = phR[0].id;

          for (let tIdx = 0; tIdx < (ph.tasks || []).length; tIdx++) {
            const t = ph.tasks[tIdx];
            const { rows: tR } = await db.query(
              `INSERT INTO tasks (phase_id, title, ptc, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
              [phaseId, t.taskName || t.taskId, t.ptc ?? 0, tIdx]
            );
            const taskId = tR[0].id;

            // t.hours = { "ROLE_CODE": hoursNum }
            for (const [code, hours] of Object.entries(t.hours || {})) {
              const roleId = roleMap[code];
              if (!roleId) { console.warn(`     unknown role code: ${code}`); continue; }
              await db.query(
                `INSERT INTO task_roles (task_id, role_id, days, rate_override)
                 VALUES ($1, $2, $3, $4)`,
                [taskId, roleId, parseFloat(hours) / 8, vRateMap[code] ?? null]
              );
            }
          }
        }
      }
    }

    // ── 6. PROJECTS ───────────────────────────────────────────────────────────
    console.log('5/6  projects…');
    for (const p of (stores.config?.projects || [])) {
      const { rows: pR } = await db.query(
        `INSERT INTO projects
           (name, program_id, client_id, start_date, end_date,
            currency, pipeline, status, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [p.name,
         p.programId || null,
         p.clientId ? clientMap[p.clientId] ?? null : null,
         yyyymm(p.startDate),
         yyyymm(p.endDate),
         toCurrency(p.currency),
         p.pipeline || null,
         p.status || null,
         ownerId]
      );
      const projId = pR[0].id;

      await db.query(
        `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
         VALUES ('project', $1, $2, 'owner', $2) ON CONFLICT DO NOTHING`,
        [projId, ownerId]
      );

      // Link to cost grid version
      if (p.costGridRef?.versionId) {
        const cgvId = verMap[p.costGridRef.versionId];
        if (cgvId) {
          await db.query('UPDATE projects SET cg_version_id = $1 WHERE id = $2', [cgvId, projId]);
          await db.query(
            `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [cgvId, projId, p.name]
          );
        }
      }

      if (p.phasing && Object.keys(p.phasing).length)
        await db.query('UPDATE projects SET phasing = $1 WHERE id = $2', [JSON.stringify(p.phasing), projId]);

      if (Array.isArray(p.ptc) && p.ptc.length)
        await db.query('UPDATE projects SET ptc = $1 WHERE id = $2', [JSON.stringify(p.ptc), projId]);

      // Project tasks
      for (let i = 0; i < (p.tasks || []).length; i++) {
        const t = p.tasks[i];
        await db.query(
          `INSERT INTO project_tasks
             (project_id, name, billable, completed, start_date, end_date, resources, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [projId, t.name, t.billable ?? true, t.completed ?? false,
           yyyymm(t.startDate), yyyymm(t.endDate),
           t.resources ? JSON.stringify(t.resources) : null, i]
        );
      }
    }

    await db.query('COMMIT');

    console.log('6/6  done.\n');
    console.log('✅  Migration complete');
    console.log(`    Programs  : ${stores.programs?.length ?? 0}`);
    console.log(`    Clients   : ${stores.clients?.length ?? 0}`);
    console.log(`    Roles     : ${stores.roles?.length ?? 0}`);
    console.log(`    Cost grids: ${stores.costgrids?.grids?.length ?? 0}`);
    console.log(`    Projects  : ${stores.config?.projects?.length ?? 0}`);

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('\n❌  Migration failed (rolled back):', err.message);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

run();
