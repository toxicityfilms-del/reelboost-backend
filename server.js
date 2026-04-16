/**
 * ReelBoost API — entry: `npm start` → `node server.js`
 *
 * Railway: set Root Directory to `backend` (if repo is monorepo). In Railway Variables add at least
 * MONGO_URI, JWT_SECRET, OPENAI_API_KEY. Railway injects PORT — do not set PORT manually unless needed.
 * Health check path: GET /health
 *
 * Local / LAN: HOST defaults to 0.0.0.0; use ipconfig IPv4 on the phone for http://<IP>:PORT/api
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { connectDb } = require('./src/config/db');
const { authMiddleware } = require('./src/middleware/authMiddleware');
const { adminMiddleware } = require('./src/middleware/adminMiddleware');
const { errorHandler } = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const hashtagRoutes = require('./src/routes/hashtagRoutes');
const captionRoutes = require('./src/routes/captionRoutes');
const ideasRoutes = require('./src/routes/ideasRoutes');
const viralRoutes = require('./src/routes/viralRoutes');
const trendsRoutes = require('./src/routes/trendsRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const postRoutes = require('./src/routes/postRoutes');
const usageRoutes = require('./src/routes/usageRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const corsOriginsEnv = (process.env.CORS_ORIGINS || '').trim();
const corsAllowlist =
  corsOriginsEnv.length > 0
    ? corsOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

function corsOriginDelegate(origin, callback) {
  if (!corsAllowlist) {
    callback(null, true);
    return;
  }
  if (!origin) {
    callback(null, true);
    return;
  }
  callback(null, corsAllowlist.includes(origin));
}

const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '15mb' }));

// Railway / load balancer liveness (keep minimal JSON for health checks)
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

// Optional: detailed readiness (DB) for your own monitoring — not required by Railway
app.get('/health/ready', (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.set('Cache-Control', 'no-store');
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: 'reelboost-ai-api',
    db: dbOk,
  });
});

app.use('/api/auth', authRoutes);

app.use('/api/admin', adminMiddleware, adminRoutes);

app.use('/api/profile', authMiddleware, profileRoutes);

app.use('/api/post', authMiddleware, postRoutes);

app.use('/api/usage', authMiddleware, usageRoutes);
app.use('/api/user', userRoutes);

app.use('/api/hashtag', authMiddleware, hashtagRoutes);
app.use('/api/caption', authMiddleware, captionRoutes);
app.use('/api/ideas', authMiddleware, ideasRoutes);
app.use('/api/viral', authMiddleware, viralRoutes);
app.use('/api/trends', authMiddleware, trendsRoutes);

app.use(errorHandler);

async function start() {
  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`ReelBoost AI API listening on http://${host}:${port}`);
      resolve();
    });
    server.on('error', reject);
  });

  try {
    await connectDb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('MongoDB not connected (API up; auth needs DB):', err.message);
  }
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bind HTTP server:', err);
  process.exit(1);
});
