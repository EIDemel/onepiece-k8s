const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const client = require('prom-client');

const crewRoutes = require('./routes/crews');
const { connectDB } = require('./db');
const { connectRedis } = require('./cache');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Prometheus metrics ────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ─── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Metrics middleware
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status_code: res.statusCode });
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/crews', crewRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crew-service', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`⚓ Crew Service running on port ${PORT}`);
  });
}

start().catch(console.error);
