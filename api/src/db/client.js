const { Pool, types } = require('pg');

// B-193: NUMERIC (OID 1700) reaches every reader as a JS number, not a string.
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  connectionString:       process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,  // fail fast if pool is exhausted
  idleTimeoutMillis:       30000,  // release idle connections after 30s
});

async function testConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, testConnection };
