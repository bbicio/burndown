const { Pool } = require('pg');

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
