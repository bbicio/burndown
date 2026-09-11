#!/usr/bin/env node
// Promote an existing user to sysadmin. create-admin.js always sets
// role='admin' by design (it's the plain-admin bootstrap tool) — this is the
// separate step needed to get a sysadmin account, e.g. for the integration
// test suite's dedicated sysadmin test user (see docker-compose.yml's `test`
// service, which runs this right after create-admin.js for that account).
//
// Usage (Docker — preferred):
//   docker exec pdash-api node /app/src/promote-sysadmin.js <email>
//
// Usage (host, after npm install in api/):
//   node api/src/promote-sysadmin.js <email>

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Load .env from project root ──────────────────────────────────────────────
// dotenv is not a declared dependency, so we parse manually.
const envFile = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ── Build DATABASE_URL for local access (localhost, not Docker service name) ─
if (!process.env.DATABASE_URL) {
  const user = process.env.POSTGRES_USER     || 'pdash';
  const pass = process.env.POSTGRES_PASSWORD || '';
  const db   = process.env.POSTGRES_DB       || 'pdash';
  process.env.DATABASE_URL = `postgres://${user}:${encodeURIComponent(pass)}@localhost:5432/${db}`;
}

// ── Parse CLI args ────────────────────────────────────────────────────────────
const [,, email] = process.argv;

if (!email) {
  console.error('Usage: node api/src/promote-sysadmin.js <email>');
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const normalized = email.toLowerCase().trim();
    const { rows } = await pool.query(
      `UPDATE users SET role = 'sysadmin' WHERE email = $1 RETURNING id, email, role`,
      [normalized]
    );
    if (!rows[0]) {
      console.error(`No user found with email ${normalized}`);
      process.exit(1);
    }
    console.log(`Promoted: ${rows[0].email} (id=${rows[0].id}) -> role=${rows[0].role}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
