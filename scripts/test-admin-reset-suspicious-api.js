/**
 * POST /api/admin/users/:userId/reset-suspicious-flags
 *
 * Requires: backend running, MONGO_URI, ADMIN_API_KEY in env (same as server).
 * Usage: npm run test:api:admin-reset
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
if (process.env.MONGO_DNS_SERVERS) {
  const servers = process.env.MONGO_DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

const mongoose = require('mongoose');
const User = require('../src/models/User');

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000/api';
const ADMIN_KEY = process.env.ADMIN_API_KEY;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function json(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t };
  }
}

async function signupUser(email, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Admin Reset Test' }),
  });
  const body = await json(res);
  assert(res.ok && body.success === true, `signup failed: ${res.status} ${JSON.stringify(body)}`);
  return { token: body.token, user: body.user };
}

async function main() {
  console.log('Base URL:', BASE);
  assert(ADMIN_KEY && ADMIN_KEY.length >= 8, 'ADMIN_API_KEY must be set (min 8 chars) in .env');
  const mongoUri = process.env.MONGO_URI;
  assert(mongoUri, 'MONGO_URI required to seed suspicious flags');

  const email = `admin_reset_${Date.now()}@example.com`;
  const password = 'testpass12';
  const { user } = await signupUser(email, password);
  const userId = user.id;

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await User.findByIdAndUpdate(userId, {
      $set: {
        adRewardSuspiciousFlag: true,
        'postAnalyzeDaily.invalidAdCompletionCount': 9,
        'postAnalyzeDaily.adRewardsBlockedSuspicious': true,
      },
    });
  } finally {
    await mongoose.disconnect();
  }

  const res = await fetch(`${BASE}/admin/users/${userId}/reset-suspicious-flags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await json(res);
  assert(res.status === 200, `admin reset expected 200, got ${res.status} ${JSON.stringify(body)}`);
  assert(body.success === true, 'success');
  const d = body.data;
  assert(d.userId === userId, 'userId in response');
  assert(d.adRewardSuspiciousFlag === false, 'flag cleared');
  assert(d.adRewardsBlockedSuspicious === false, 'unblocked');
  assert(d.invalidAdCompletionCountToday === 0, 'invalid count reset');

  const badKey = await fetch(`${BASE}/admin/users/${userId}/reset-suspicious-flags`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer wrong-key',
      'Content-Type': 'application/json',
    },
  });
  assert(badKey.status === 401, 'wrong key should 401');

  console.log('OK  admin reset-suspicious-flags + unauthorized guard');
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
