const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const client = require('prom-client');

const characterRoutes = require('./routes/characters');
const { connectDB } = require('./db');
const { connectRedis } = require('./cache');

const app = express();
const PORT = process.env.PORT || 3002;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.use('/api/characters', characterRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'character-service', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function start() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`🏴‍☠️ Character Service running on port ${PORT}`);
  });
}

start().catch(console.error);
