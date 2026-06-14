// restore-backup.js  — run with:
//   docker exec pdash-api node /app/src/restore-backup.js
'use strict';

const path   = require('path');
const fs     = require('fs');
const { pool } = require('./db/client');

const BACKUP_PATH = path.join(__dirname, '../PDash_backup_from_gist.json');
const ADMIN_ID    = 'f32cb3a8-0169-4e5e-b797-6f40d121401a'; // bbicio@gmail.com

async function run() {
  const raw    = fs.readFileSync(BACKUP_PATH, 'utf8');
  const backup = JSON.parse(raw);
  const { config, roles: rolesArr, programs, clients, costgrids } = backup.stores;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Roles (upsert by code) ────────────────────────────────────────────
    console.log('Upserting roles…');
    const roleCodeToId = {};
    for (const r of rolesArr) {
      const res = await client.query(
        `INSERT INTO roles (label, code, hourly_rate)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, hourly_rate = EXCLUDED.hourly_rate
         RETURNING id, code`,
        [r.label, r.code, r.rate || 0]
      );
      roleCodeToId[res.rows[0].code] = res.rows[0].id;
    }
    console.log(`  ${Object.keys(roleCodeToId).length} roles ready`);

    // ── 2. Programs (upsert by id, which is VARCHAR) ─────────────────────────
    console.log('Upserting programs…');
    for (const p of programs) {
      await client.query(
        `INSERT INTO programs (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [p.id, p.name]
      );
    }
    console.log(`  ${programs.length} programs ready`);

    // ── 3. Clients (upsert by name, generate stable UUID) ───────────────────
    console.log('Upserting clients…');
    const oldClientToNewId = {};
    for (const c of clients) {
      const res = await client.query(
        `INSERT INTO clients (name) VALUES ($1)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [c.name]
      );
      let dbId;
      if (res.rows.length) {
        dbId = res.rows[0].id;
      } else {
        const existing = await client.query(
          'SELECT id FROM clients WHERE name = $1', [c.name]
        );
        dbId = existing.rows[0].id;
      }
      oldClientToNewId[c.id] = dbId;
    }
    console.log(`  ${clients.length} clients ready`);

    // ── 4. Cost grids + versions + phases + tasks + task_roles ───────────────
    console.log('Inserting cost grids…');
    // Wipe existing cost grids first (cascade deletes everything beneath)
    await client.query('DELETE FROM cost_grids');
    console.log('  existing cost grids cleared');

    const oldCgToNewId  = {};   // old localStorage cgId  → new UUID
    const oldVerToNewId = {};   // old localStorage verId → new UUID

    for (const cg of costgrids.grids) {
      // Insert cost grid
      const cgRes = await client.query(
        `INSERT INTO cost_grids (name, owner_id) VALUES ($1, $2) RETURNING id`,
        [cg.name, ADMIN_ID]
      );
      const newCgId = cgRes.rows[0].id;
      oldCgToNewId[cg.id] = newCgId;

      // Register owner share
      await client.query(
        `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
         VALUES ('cost_grid', $1, $2, 'owner', $2)`,
        [newCgId, ADMIN_ID]
      );

      for (const ver of cg.versions) {
        const clientId = ver.clientId ? oldClientToNewId[ver.clientId] : null;

        // Insert version
        // Convert YYYYMM → YYYY-MM-01 for the date column; null if not parseable
        const toDate = s => (s && s.length >= 6) ? `${s.slice(0,4)}-${s.slice(4,6)}-01` : null;

        const verRes = await client.query(
          `INSERT INTO cost_grid_versions
             (cost_grid_id, label, pipeline, start_date, end_date, currency, note, ratecard_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            newCgId,
            ver.versionLabel,
            ver.pipeline || 'SIP',
            toDate(ver.startDate),
            toDate(ver.endDate),
            ver.currency  || 'EUR',
            ver.note      || '',
            null,
          ]
        );
        const newVerId = verRes.rows[0].id;
        oldVerToNewId[ver.versionId] = newVerId;

        // Phases → tasks → task_roles
        for (let pi = 0; pi < (ver.phases || []).length; pi++) {
          const ph = ver.phases[pi];
          const phRes = await client.query(
            `INSERT INTO phases (version_id, title, sort_order) VALUES ($1,$2,$3) RETURNING id`,
            [newVerId, ph.phaseName || 'New Phase', pi]
          );
          const newPhId = phRes.rows[0].id;

          for (let ti = 0; ti < (ph.tasks || []).length; ti++) {
            const tk = ph.tasks[ti];
            // Normalize YYYY-MM-DD → YYYYMMDD (VARCHAR(8)); keep empty as ''
            const normDate = s => s ? s.replace(/-/g, '').slice(0, 8) : '';

            const tkRes = await client.query(
              `INSERT INTO tasks (phase_id, title, description, start_date, end_date, ptc, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
              [
                newPhId,
                tk.taskName || 'New Task',
                tk.taskDescription || '',
                normDate(tk.taskStartDate),
                normDate(tk.taskEndDate),
                tk.ptc || 0,
                ti,
              ]
            );
            const newTkId = tkRes.rows[0].id;

            // hours: { roleCode: days }
            for (const [code, days] of Object.entries(tk.hours || {})) {
              const roleId = roleCodeToId[code];
              if (!roleId || !days) continue;
              await client.query(
                `INSERT INTO task_roles (task_id, role_id, days) VALUES ($1,$2,$3)`,
                [newTkId, roleId, days]
              );
            }
          }
        }
      }
    }
    console.log(`  ${costgrids.grids.length} cost grids inserted`);

    // ── 5. Projects ──────────────────────────────────────────────────────────
    console.log('Inserting projects…');
    await client.query('DELETE FROM projects');

    const oldProjNameToNewId = {}; // projectName → new UUID

    for (const proj of config.projects) {
      const clientDbId  = proj.clientId  ? oldClientToNewId[proj.clientId]  : null;
      const programId   = proj.programId || null;

      // Map costGridRef versionId to new UUID
      const newVerId = proj.costGridRef?.versionId
        ? (oldVerToNewId[proj.costGridRef.versionId] || null)
        : null;

      const projRes = await client.query(
        `INSERT INTO projects
           (name, program_id, client_id, start_date, end_date, currency, pipeline, status, owner_id, cg_version_id, phasing, ptc, planning, groups)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          proj.name,
          programId,
          clientDbId,
          proj.startDate || null,
          proj.endDate   || null,
          proj.currency  || 'EUR',
          proj.pipeline  || null,
          proj.status    || null,
          ADMIN_ID,
          newVerId,
          proj.phasing   ? JSON.stringify(proj.phasing)  : null,
          proj.ptc?.length ? JSON.stringify(proj.ptc)    : null,
          proj.planning  ? JSON.stringify(proj.planning) : null,
          proj.groups?.length ? JSON.stringify(proj.groups) : null,
        ]
      );
      const newProjId = projRes.rows[0].id;
      oldProjNameToNewId[proj.name] = newProjId;

      // Project tasks
      for (let i = 0; i < (proj.tasks || []).length; i++) {
        const tk = proj.tasks[i];
        await client.query(
          `INSERT INTO project_tasks (project_id, name, billable, completed, start_date, end_date, resources, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            newProjId,
            tk.name,
            tk.billable !== false,
            tk.completed === true,
            tk.startDate ? tk.startDate.slice(0,6) : null,
            tk.endDate   ? tk.endDate.slice(0,6)   : null,
            JSON.stringify(tk.resources || []),
            i,
          ]
        );
      }

      // Register owner share
      await client.query(
        `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
         VALUES ('project', $1, $2, 'owner', $2)`,
        [newProjId, ADMIN_ID]
      );
    }
    console.log(`  ${config.projects.length} projects inserted`);

    // ── 6. cg_version_projects (linked projects) ─────────────────────────────
    console.log('Linking projects to cost grid versions…');
    for (const cg of costgrids.grids) {
      for (const ver of cg.versions) {
        const newVerId = oldVerToNewId[ver.versionId];
        if (!newVerId) continue;
        for (const lp of (ver.linkedProjects || [])) {
          const newProjId = oldProjNameToNewId[lp.projectName];
          if (!newProjId) {
            console.warn(`  ⚠ project not found for linkedProject: ${lp.projectName}`);
            continue;
          }
          const projName = lp.projectName;
          await client.query(
            `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [newVerId, newProjId, projName]
          );
        }
      }
    }
    console.log('  done');

    await client.query('COMMIT');
    console.log('\n✅ Restore complete.');

    // Print summary
    const cgCount  = (await pool.query('SELECT COUNT(*) FROM cost_grids')).rows[0].count;
    const verCount = (await pool.query('SELECT COUNT(*) FROM cost_grid_versions')).rows[0].count;
    const phCount  = (await pool.query('SELECT COUNT(*) FROM phases')).rows[0].count;
    const tkCount  = (await pool.query('SELECT COUNT(*) FROM tasks')).rows[0].count;
    const prCount  = (await pool.query('SELECT COUNT(*) FROM projects')).rows[0].count;
    console.log(`  cost_grids: ${cgCount}  versions: ${verCount}  phases: ${phCount}  tasks: ${tkCount}  projects: ${prCount}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Restore failed, rolled back:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
