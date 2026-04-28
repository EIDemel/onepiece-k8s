const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'onepiece',
  password: process.env.DB_PASSWORD || 'grandline',
  database: process.env.DB_NAME     || 'onepiece',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function connectDB() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    // Retry after 5s
    setTimeout(connectDB, 5000);
  }
}

module.exports = { pool, connectDB };
