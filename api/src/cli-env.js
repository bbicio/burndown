'use strict';
// Shared bootstrap of the two-step CLIs, the same as create-admin.js: loads .env from the project
// root (dotenv is not a declared dependency) and builds DATABASE_URL for local access.
const path = require('path');
const fs   = require('fs');

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

if (!process.env.DATABASE_URL) {
  const user = process.env.POSTGRES_USER     || 'pdash';
  const pass = process.env.POSTGRES_PASSWORD || '';
  const db   = process.env.POSTGRES_DB       || 'pdash';
  process.env.DATABASE_URL = `postgres://${user}:${encodeURIComponent(pass)}@localhost:5432/${db}`;
}
