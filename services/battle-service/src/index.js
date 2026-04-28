const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const axios = require('axios');
const client = require('prom-client');
const { connectRedis, getCache, setCache } = require('./cache');

const app = express();
const PORT = process.env.PORT || 3005;

const CHARACTER_SERVICE = process.env.CHARACTER_SERVICE_URL || 'http://character-service:3002';
const CREW_SERVICE = process.env.CREW_SERVICE_URL || 'http://crew-service:3001';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const battlesTotal = new client.Counter({
  name: 'battles_total', help: 'Total battles fought',
  labelNames: ['winner_type'], registers: [register]
});

app.use(helmet()); app.use(cors()); app.use(express.json()); app.use(morgan('combined'));

// ─── Battle Engine ────────────────────────────────────────────────

const TECHNIQUES = [
  'Gum-Gum Pistol', 'Three-Sword Style: Onigiri', 'Diable Jambe', 'Clima-Tact Thunder',
  'Haki Infusion', 'Gear Fourth', 'Black Blade', 'Galaxy Impact', 'Heaven-Splitting Dragon',
  "Conqueror's Haki Burst", 'Room + Shambles', 'Fishman Karate', 'Coup de Burst'
];

const LOCATIONS = [
  'Marineford', 'Wano', 'Dressrosa', 'Alabasta', 'Enies Lobby',
  'Fishman Island', 'Punk Hazard', 'Whole Cake Island', 'Thriller Bark'
];

function calculatePower(character) {
  let power = Number(character.bounty) / 1_000_000 || 1;
  power += (character.haki_types?.length || 0) * 50;
  if (character.devil_fruit) power += 100;
  return power + Math.random() * 30; // add randomness
}

function simulateBattle(attacker, defender) {
  const attackerPower = calculatePower(attacker);
  const defenderPower = calculatePower(defender);
  const total = attackerPower + defenderPower;
  const attackerWins = Math.random() < (attackerPower / total);

  return {
    winner: attackerWins ? attacker : defender,
    loser: attackerWins ? defender : attacker,
    technique: TECHNIQUES[Math.floor(Math.random() * TECHNIQUES.length)],
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    damage: Math.floor(Math.random() * 9000) + 1000,
    duration_ms: Math.floor(Math.random() * 60000) + 5000,
    attacker_power: Math.round(attackerPower),
    defender_power: Math.round(defenderPower),
  };
}

// In-memory battle log (in production: use DB)
const battleLog = [];

// POST /api/battles/fight — trigger a fight
app.post('/api/battles/fight', async (req, res, next) => {
  try {
    const { attacker_id, defender_id } = req.body;
    if (!attacker_id || !defender_id)
      return res.status(400).json({ error: 'attacker_id and defender_id required' });
    if (attacker_id === defender_id)
      return res.status(400).json({ error: 'A pirate cannot fight themselves' });

    // Fetch both characters
    const [attackerRes, defenderRes] = await Promise.all([
      axios.get(`${CHARACTER_SERVICE}/api/characters/${attacker_id}`, { timeout: 5000 }),
      axios.get(`${CHARACTER_SERVICE}/api/characters/${defender_id}`, { timeout: 5000 }),
    ]);

    const attacker = attackerRes.data.data;
    const defender = defenderRes.data.data;

    const result = simulateBattle(attacker, defender);

    const battleRecord = {
      id: battleLog.length + 1,
      attacker_id: Number(attacker_id),
      defender_id: Number(defender_id),
      attacker_name: attacker.name,
      defender_name: defender.name,
      winner_id: result.winner.id,
      winner_name: result.winner.name,
      loser_name: result.loser.name,
      technique_used: result.technique,
      location: result.location,
      damage_dealt: result.damage,
      duration_ms: result.duration_ms,
      attacker_power: result.attacker_power,
      defender_power: result.defender_power,
      timestamp: new Date().toISOString(),
    };

    battleLog.push(battleRecord);
    battlesTotal.inc({ winner_type: result.winner.id === Number(attacker_id) ? 'attacker' : 'defender' });

    // Cache recent battles
    await setCache('battles:recent', battleLog.slice(-20), 300);

    res.status(201).json({
      message: `⚔️ ${attacker.name} VS ${defender.name} — Winner: ${result.winner.name}!`,
      battle: battleRecord,
      play_by_play: [
        `${attacker.name} challenges ${defender.name} at ${result.location}!`,
        `${attacker.name} uses ${result.technique}!`,
        `${result.winner.name} wins with ${result.damage} damage after ${(result.duration_ms / 1000).toFixed(1)}s!`,
      ]
    });
  } catch (err) {
    if (err.response?.status === 404)
      return res.status(404).json({ error: 'One or both characters not found' });
    next(err);
  }
});

// GET /api/battles — list battles
app.get('/api/battles', async (req, res, next) => {
  try {
    const cached = await getCache('battles:recent');
    const data = cached || battleLog.slice(-20);
    res.json({ data: data.reverse(), total: battleLog.length });
  } catch (err) { next(err); }
});

// GET /api/battles/leaderboard — most wins
app.get('/api/battles/leaderboard', async (req, res, next) => {
  try {
    const wins = {};
    battleLog.forEach(b => {
      wins[b.winner_name] = (wins[b.winner_name] || 0) + 1;
    });
    const leaderboard = Object.entries(wins)
      .map(([name, wins]) => ({ name, wins }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);
    res.json({ data: leaderboard });
  } catch (err) { next(err); }
});

// POST /api/battles/crew-war — two crews fight each other
app.post('/api/battles/crew-war', async (req, res, next) => {
  try {
    const { crew1_id, crew2_id } = req.body;
    if (!crew1_id || !crew2_id)
      return res.status(400).json({ error: 'crew1_id and crew2_id required' });

    const [c1Res, c2Res] = await Promise.all([
      axios.get(`${CREW_SERVICE}/api/crews/${crew1_id}`, { timeout: 5000 }),
      axios.get(`${CREW_SERVICE}/api/crews/${crew2_id}`, { timeout: 5000 }),
    ]);

    const crew1 = c1Res.data.data;
    const crew2 = c2Res.data.data;

    const crew1Members = crew1.members?.filter(m => !m.note) || [];
    const crew2Members = crew2.members?.filter(m => !m.note) || [];

    let crew1Wins = 0, crew2Wins = 0;
    const fights = [];

    const battles = Math.min(crew1Members.length, crew2Members.length, 5);
    for (let i = 0; i < battles; i++) {
      const r = simulateBattle(crew1Members[i] || crew1, crew2Members[i] || crew2);
      if (r.winner === crew1Members[i]) crew1Wins++; else crew2Wins++;
      fights.push({
        attacker: crew1Members[i]?.name || crew1.name,
        defender: crew2Members[i]?.name || crew2.name,
        winner: r.winner.name,
        technique: r.technique,
      });
    }

    res.json({
      message: `⚓ ${crew1.name} vs ${crew2.name} — ${crew1Wins > crew2Wins ? crew1.name : crew2.name} wins the war!`,
      crew1: { name: crew1.name, wins: crew1Wins },
      crew2: { name: crew2.name, wins: crew2Wins },
      overall_winner: crew1Wins > crew2Wins ? crew1.name : crew2.name,
      fights,
    });
  } catch (err) { next(err); }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'battle-service' }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

connectRedis().then(() => {
  app.listen(PORT, () => console.log(`⚔️  Battle Service running on port ${PORT}`));
}).catch(console.error);
