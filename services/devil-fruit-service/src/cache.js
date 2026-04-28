const { createClient } = require('redis');

let redisClient;

async function connectRedis() {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => console.error('Redis error:', err));

  await redisClient.connect();
  console.log('✅ Redis connected');
}

async function getCache(key) {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

async function setCache(key, value, ttlSeconds = 60) {
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('Redis set error:', err.message);
  }
}

async function delCache(key) {
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error('Redis del error:', err.message);
  }
}

module.exports = { connectRedis, getCache, setCache, delCache };
