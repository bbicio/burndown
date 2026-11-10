#!/usr/bin/env node
// Emergency/test CLI: prints a fresh 6-digit code for the user's open login challenge (the
// password is still required to open one). Valid for 10 minutes.
//
// Usage (Docker — preferred):
//   docker exec pdash-api node /app/src/two-step-code.js <email>

'use strict';
require('./cli-env');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node api/src/two-step-code.js <email>');
  process.exit(1);
}

const { pool } = require('./db/client');
const { resetLatestCode } = require('./services/two-step');

(async () => {
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const code = rows[0] ? await resetLatestCode(rows[0].id) : null;
    if (!code) {
      console.error(`No open sign-in challenge for ${email}`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(code + '\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
