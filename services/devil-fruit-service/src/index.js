const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const client = require('prom-client');
const { pool, connectDB } = require('./db');
const { connectRedis, getCache, setCache, delCache } = require('./cache');

const app = express();
const PORT = process.env.PORT || 3003;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.use(helmet()); app.use(cors()); app.use(express.json()); app.use(morgan('combined'));

// ─── Devil Fruit Routes ───────────────────────────────────────────

// GET /api/devil-fruits
app.get('/api/devil-fruits', async (req, res, next) => {
  try {
    const { type } = req.query;
    const cacheKey = `fruits:${type || 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    let query = `
      SELECT df.*, ch.name AS owner_name, ch.alias AS owner_alias
      FROM devil_fruits df
      LEFT JOIN characters ch ON df.owner_id = ch.id
    `;
    const params = [];
    if (type) { params.push(type); query += ` WHERE df.type = $1`; }
    query += ' ORDER BY df.name';

    const { rows } = await pool.query(query, params);
    await setCache(cacheKey, rows, 60);
    res.json({ source: 'db', data: rows });
  } catch (err) { next(err); }
});

// GET /api/devil-fruits/stats — count by type
app.get('/api/devil-fruits/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT type, COUNT(*) AS total,
             COUNT(owner_id) AS claimed,
             COUNT(CASE WHEN is_awakened THEN 1 END) AS awakened
      FROM devil_fruits GROUP BY type ORDER BY type
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/devil-fruits/:id
app.get('/api/devil-fruits/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `fruit:${id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const { rows } = await pool.query(
      `SELECT df.*, ch.name AS owner_name, ch.alias AS owner_alias
       FROM devil_fruits df LEFT JOIN characters ch ON df.owner_id = ch.id
       WHERE df.id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devil Fruit not found' });
    await setCache(cacheKey, rows[0], 60);
    res.json({ source: 'db', data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/devil-fruits
app.post('/api/devil-fruits', async (req, res, next) => {
  try {
    const { name, type, ability, weakness, owner_id, is_awakened } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    if (!['Paramecia', 'Zoan', 'Logia'].includes(type))
      return res.status(400).json({ error: 'type must be Paramecia, Zoan, or Logia' });

    const { rows } = await pool.query(
      `INSERT INTO devil_fruits (name, type, ability, weakness, owner_id, is_awakened)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, type, ability, weakness || 'Seawater and Sea Prism Stone', owner_id, is_awakened || false]
    );
    await delCache('fruits:all');
    res.status(201).json({ data: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/devil-fruits/:id — assign owner / awaken
app.put('/api/devil-fruits/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { owner_id, is_awakened, ability } = req.body;

    const { rows } = await pool.query(
      `UPDATE devil_fruits SET
        owner_id = COALESCE($1, owner_id),
        is_awakened = COALESCE($2, is_awakened),
        ability = COALESCE($3, ability)
       WHERE id = $4 RETURNING *`,
      [owner_id, is_awakened, ability, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devil Fruit not found' });
    await delCache(`fruit:${id}`);
    await delCache('fruits:all');
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/devil-fruits/:id
app.delete('/api/devil-fruits/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM devil_fruits WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Devil Fruit not found' });
    await delCache(`fruit:${id}`);
    res.json({ message: `Devil Fruit ${id} deleted` });
  } catch (err) { next(err); }
});

// ─── Health & Metrics ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'devil-fruit-service' }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

async function start() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => console.log(`🍎 Devil Fruit Service running on port ${PORT}`));
}
start().catch(console.error);
