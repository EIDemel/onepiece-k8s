const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../db');
const { getCache, setCache, delCache } = require('../cache');

const DEVIL_FRUIT_SERVICE = process.env.DEVIL_FRUIT_SERVICE_URL || 'http://devil-fruit-service:3003';
const CACHE_TTL = 60;

// GET /api/characters — list with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { crew_id, affiliation, search } = req.query;
    let query = `
      SELECT ch.*, c.name AS crew_name
      FROM characters ch
      LEFT JOIN crews c ON ch.crew_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (crew_id) {
      params.push(crew_id);
      query += ` AND ch.crew_id = $${params.length}`;
    }
    if (affiliation) {
      params.push(`%${affiliation}%`);
      query += ` AND ch.affiliation ILIKE $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (ch.name ILIKE $${params.length} OR ch.alias ILIKE $${params.length})`;
    }
    query += ' ORDER BY ch.bounty DESC';

    const cacheKey = `characters:${JSON.stringify(req.query)}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const { rows } = await pool.query(query, params);
    await setCache(cacheKey, rows, CACHE_TTL);
    res.json({ source: 'db', data: rows });
  } catch (err) { next(err); }
});

// GET /api/characters/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `character:${id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const { rows } = await pool.query(
      `SELECT ch.*, c.name AS crew_name
       FROM characters ch LEFT JOIN crews c ON ch.crew_id = c.id
       WHERE ch.id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Character not found' });

    const character = rows[0];

    // Enrich with devil fruit if any
    if (character.devil_fruit_id) {
      try {
        const dfRes = await axios.get(
          `${DEVIL_FRUIT_SERVICE}/api/devil-fruits/${character.devil_fruit_id}`,
          { timeout: 3000 }
        );
        character.devil_fruit = dfRes.data.data;
      } catch {
        character.devil_fruit = { note: 'devil-fruit-service unavailable' };
      }
    }

    await setCache(cacheKey, character, CACHE_TTL);
    res.json({ source: 'db', data: character });
  } catch (err) { next(err); }
});

// POST /api/characters
router.post('/', async (req, res, next) => {
  try {
    const {
      name, alias, role, bounty, affiliation,
      crew_id, devil_fruit_id, haki_types,
      origin_island, age, height_cm, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO characters
        (name, alias, role, bounty, affiliation, crew_id, devil_fruit_id, haki_types, origin_island, age, height_cm, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [name, alias, role, bounty || 0, affiliation, crew_id, devil_fruit_id,
       haki_types || [], origin_island, age, height_cm, status || 'alive']
    );

    await delCache('characters:{}');
    res.status(201).json({ data: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/characters/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, alias, role, bounty, crew_id, devil_fruit_id, haki_types, status } = req.body;

    const { rows } = await pool.query(
      `UPDATE characters SET
        name = COALESCE($1, name),
        alias = COALESCE($2, alias),
        role = COALESCE($3, role),
        bounty = COALESCE($4, bounty),
        crew_id = COALESCE($5, crew_id),
        devil_fruit_id = COALESCE($6, devil_fruit_id),
        haki_types = COALESCE($7, haki_types),
        status = COALESCE($8, status),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [name, alias, role, bounty, crew_id, devil_fruit_id, haki_types, status, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Character not found' });
    await delCache(`character:${id}`);
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/characters/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM characters WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Character not found' });
    await delCache(`character:${id}`);
    res.json({ message: `Character ${id} removed` });
  } catch (err) { next(err); }
});

// GET /api/characters/top/bounties — top 10 bounties
router.get('/top/bounties', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.name, ch.alias, ch.bounty, c.name AS crew
       FROM characters ch LEFT JOIN crews c ON ch.crew_id = c.id
       ORDER BY ch.bounty DESC LIMIT 10`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
