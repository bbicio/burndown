#!/usr/bin/env node
// Bootstrap or reset an admin user without psql.
//
// Usage (Docker — preferred):
//   docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
//
// Usage (host, after npm install in api/):
//   node api/src/create-admin.js <email> <password> [firstName] [lastName]
//
// If the email already exists the password is reset and the account is
// promoted to admin + activated. Safe to run multiple times.

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
const [,, email, password, firstName = 'Admin', lastName = 'User'] = process.argv;

if (!email || !password) {
  console.error('Usage: node api/create-admin.js <email> <password> [firstName] [lastName]');
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const hash = await bcrypt.hash(password, 12);
    const normalized = email.toLowerCase().trim();

    const existing = await pool.query(
      'SELECT id, email, role, status FROM users WHERE email = $1',
      [normalized]
    );

    if (existing.rows[0]) {
      const u = existing.rows[0];
      await pool.query(
        `UPDATE users
         SET password_hash = $1, role = 'admin', status = 'active',
             invite_token = NULL, invite_expires = NULL, reset_token = NULL, reset_expires = NULL
         WHERE id = $2`,
        [hash, u.id]
      );
      console.log(`Updated: ${normalized} (was role=${u.role} status=${u.status}) → role=admin status=active`);
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, status)
         VALUES ($1, $2, $3, $4, 'admin', 'active')
         RETURNING id`,
        [normalized, hash, firstName, lastName]
      );
      console.log(`Created: ${normalized} id=${rows[0].id} role=admin status=active`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
