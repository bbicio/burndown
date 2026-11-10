#!/usr/bin/env node
// Mints a trusted device for an active user and prints the value of the pdash_device cookie.
// Automated logins (test-api.js, scripts/shoot.mjs, seed-planning-golden.js) send it to skip the code.
//
// Usage (Docker — preferred):
//   docker exec pdash-api node /app/src/trust-device.js <email> [--days N]

'use strict';
require('./cli-env');

const args = process.argv.slice(2);
const daysAt = args.indexOf('--days');
const days = daysAt >= 0 ? Number(args[daysAt + 1]) : undefined;
const email = daysAt >= 0 ? args.filter((_, i) => i !== daysAt && i !== daysAt + 1)[0] : args[0];

if (!email || (daysAt >= 0 && !(days > 0))) {
  console.error('Usage: node api/src/trust-device.js <email> [--days N]');
  process.exit(1);
}

const { pool } = require('./db/client');
const { trustDevice } = require('./services/two-step');

(async () => {
  try {
    const { rows } = await pool.query('SELECT id, status FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!rows[0] || rows[0].status !== 'active') {
      console.error(`No active user ${email}`);
      process.exitCode = 1;
      return;
    }
    const token = await trustDevice(rows[0].id, '', { label: 'Automation (CLI)', ...(days ? { days } : {}) });
    process.stdout.write(token + '\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
