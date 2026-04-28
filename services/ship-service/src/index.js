const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const client = require('prom-client');
const { pool, connectDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3004;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.use(helmet()); app.use(cors()); app.use(express.json()); app.use(morgan('combined'));

// GET /api/ships
app.get('/api/ships', async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT s.*, c.name AS crew_name
      FROM ships s LEFT JOIN crews c ON s.crew_id = c.id
    `;
    const params = [];
    if (status) { params.push(status); query += ' WHERE s.status = $1'; }
    query += ' ORDER BY s.speed_knots DESC';
    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/ships/:id
app.get('/api/ships/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS crew_name FROM ships s
       LEFT JOIN crews c ON s.crew_id = c.id WHERE s.id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ship not found' });
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/ships
app.post('/api/ships', async (req, res, next) => {
  try {
    const { name, type, crew_id, speed_knots, cannons, special, status } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO ships (name, type, crew_id, speed_knots, cannons, special, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, type, crew_id, speed_knots || 0, cannons || 0, special, status || 'sailing']
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/ships/:id
app.put('/api/ships/:id', async (req, res, next) => {
  try {
    const { name, type, crew_id, speed_knots, cannons, special, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE ships SET
        name = COALESCE($1, name), type = COALESCE($2, type),
        crew_id = COALESCE($3, crew_id), speed_knots = COALESCE($4, speed_knots),
        cannons = COALESCE($5, cannons), special = COALESCE($6, special),
        status = COALESCE($7, status)
       WHERE id = $8 RETURNING *`,
      [name, type, crew_id, speed_knots, cannons, special, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ship not found' });
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/ships/:id
app.delete('/api/ships/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ships WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Ship not found' });
    res.json({ message: `Ship ${req.params.id} sunk` });
  } catch (err) { next(err); }
});

// GET /api/ships/fastest — rank by speed
app.get('/api/ships/fastest', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.name, s.type, s.speed_knots, c.name AS crew
       FROM ships s LEFT JOIN crews c ON s.crew_id = c.id
       ORDER BY s.speed_knots DESC LIMIT 5`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ship-service' }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

connectDB().then(() => {
  app.listen(PORT, () => console.log(`⛵ Ship Service running on port ${PORT}`));
}).catch(console.error);
