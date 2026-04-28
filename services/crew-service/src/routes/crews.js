const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../db');
const { getCache, setCache, delCache } = require('../cache');

const CHARACTER_SERVICE = process.env.CHARACTER_SERVICE_URL || 'http://character-service:3002';
const CACHE_TTL = 60;

// GET /api/crews — list all crews
router.get('/', async (req, res, next) => {
  try {
    const cached = await getCache('crews:all');
    if (cached) return res.json({ source: 'cache', data: cached });

    const { rows } = await pool.query(`
      SELECT c.*, s.name AS ship_name,
             COUNT(ch.id) AS member_count
      FROM crews c
      LEFT JOIN ships s ON c.ship_id = s.id
      LEFT JOIN characters ch ON ch.crew_id = c.id
      GROUP BY c.id, s.name
      ORDER BY c.bounty_total DESC
    `);

    await setCache('crews:all', rows, CACHE_TTL);
    res.json({ source: 'db', data: rows });
  } catch (err) { next(err); }
});

// GET /api/crews/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `crew:${id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const { rows } = await pool.query(
      `SELECT c.*, s.name AS ship_name, s.type AS ship_type
       FROM crews c LEFT JOIN ships s ON c.ship_id = s.id
       WHERE c.id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Crew not found' });

    // Fetch members from character-service
    let members = [];
    try {
      const charRes = await axios.get(`${CHARACTER_SERVICE}/api/characters?crew_id=${id}`, { timeout: 3000 });
      members = charRes.data.data || [];
    } catch {
      members = [{ note: 'character-service unavailable' }];
    }

    const result = { ...rows[0], members };
    await setCache(cacheKey, result, CACHE_TTL);
    res.json({ source: 'db', data: result });
  } catch (err) { next(err); }
});

// POST /api/crews — create crew
router.post('/', async (req, res, next) => {
  try {
    const { name, jolly_roger, home_island, bounty_total, status } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO crews (name, jolly_roger, home_island, bounty_total, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, jolly_roger, home_island, bounty_total || 0, status || 'active']
    );

    await delCache('crews:all');
    res.status(201).json({ data: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/crews/:id — update crew
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, jolly_roger, home_island, bounty_total, status } = req.body;

    const { rows } = await pool.query(
      `UPDATE crews SET
        name = COALESCE($1, name),
        jolly_roger = COALESCE($2, jolly_roger),
        home_island = COALESCE($3, home_island),
        bounty_total = COALESCE($4, bounty_total),
        status = COALESCE($5, status),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, jolly_roger, home_island, bounty_total, status, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Crew not found' });

    await delCache(`crew:${id}`);
    await delCache('crews:all');
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/crews/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM crews WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Crew not found' });

    await delCache(`crew:${id}`);
    await delCache('crews:all');
    res.json({ message: `Crew ${id} disbanded` });
  } catch (err) { next(err); }
});

// GET /api/crews/:id/bounty — total bounty of a crew
router.get('/:id/bounty', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT c.name, SUM(ch.bounty) AS total_bounty, COUNT(ch.id) AS members
       FROM crews c
       LEFT JOIN characters ch ON ch.crew_id = c.id
       WHERE c.id = $1
       GROUP BY c.name`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Crew not found' });
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
