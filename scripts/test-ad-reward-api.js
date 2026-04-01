/**
 * API tests for POST /api/usage/ad-reward (rewarded ad claim + idempotency).
 *
 * Usage: npm run test:api:ad-reward
 * Requires: backend running, MongoDB (MONGO_URI for premium user flag).
 *
 * Env: TEST_API_BASE (default http://localhost:3000/api)
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertAdRewardAnalytics(a, exp) {
  assert(a && typeof a === 'object', 'adRewardAnalytics should be an object');
  assert(a.totalAdsWatched === exp.totalAdsWatched, `totalAdsWatched: got ${a.totalAdsWatched}, want ${exp.totalAdsWatched}`);
  assert(a.rewardsGranted === exp.rewardsGranted, `rewardsGranted: got ${a.rewardsGranted}, want ${exp.rewardsGranted}`);
  const rj = a.rewardsRejected || {};
  assert(rj.duplicate === exp.duplicate, `rewardsRejected.duplicate: got ${rj.duplicate}, want ${exp.duplicate}`);
  assert(rj.cooldown === exp.cooldown, `rewardsRejected.cooldown: got ${rj.cooldown}, want ${exp.cooldown}`);
  assert(rj.limit === exp.limit, `rewardsRejected.limit: got ${rj.limit}, want ${exp.limit}`);
}

async function json(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t };
  }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function freshCompletionPayload(suffix) {
  const ts = Date.now();
  return {
    completionId: `testad_${ts}_${suffix}_claim`,
    completedAtMs: ts,
  };
}

async function signupUser(email, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Ad Reward Test' }),
  });
  const body = await json(res);
  assert(res.ok && body.success === true, `signup failed: ${res.status} ${JSON.stringify(body)}`);
  return { token: body.token, user: body.user };
}

async function getProfile(token) {
  const res = await fetch(`${BASE}/profile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await json(res);
  assert(res.ok && body.success === true, `profile/me failed: ${res.status}`);
  return body.data;
}

async function postAdReward(token, { completionId, completedAtMs }) {
  const res = await fetch(`${BASE}/usage/ad-reward`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ completionId, completedAtMs }),
  });
  const body = await json(res);
  return { res, body };
}

async function main() {
  console.log('Base URL:', BASE);

  const freeEmail = `adreward_free_${Date.now()}@example.com`;
  const premEmail = `adreward_prem_${Date.now()}@example.com`;
  const password = 'testpass12';

  // --- Free user: first claim ---
  const { token: freeToken } = await signupUser(freeEmail, password);
  const before = await getProfile(freeToken);
  assert(before.isPremium === false, 'free user should not be premium');
  const remBefore = before.postAnalyzeRemaining;
  const limBefore = before.postAnalyzeLimit;
  assert(typeof remBefore === 'number', 'postAnalyzeRemaining should be a number');
  assert(typeof limBefore === 'number', 'postAnalyzeLimit should be a number');
  assert(remBefore <= limBefore, 'remaining must not exceed limit before claim');

  const payload1 = freshCompletionPayload('a');
  let { res, body } = await postAdReward(freeToken, payload1);
  assert(res.status === 200, `first claim expected 200, got ${res.status}`);
  assert(body.success === true, 'first claim success');
  assert(body.data?.alreadyClaimed === false, 'first claim should set alreadyClaimed false');
  const d1 = body.data;
  assert(d1.postAnalyzeRemaining === remBefore + 1, `remaining should increment by 1: ${remBefore} -> ${d1.postAnalyzeRemaining}`);
  assert(d1.postAnalyzeLimit === limBefore + 1, `limit should increase by 1 for new reward slot: ${limBefore} -> ${d1.postAnalyzeLimit}`);
  assert(d1.postAnalyzeRemaining <= d1.postAnalyzeLimit, 'remaining must not exceed limit after first claim');
  assertAdRewardAnalytics(d1.adRewardAnalytics, {
    totalAdsWatched: 1,
    rewardsGranted: 1,
    duplicate: 0,
    cooldown: 0,
    limit: 0,
  });

  const afterFirstRem = d1.postAnalyzeRemaining;
  const afterFirstLim = d1.postAnalyzeLimit;

  // --- Second claim same completion ID: idempotent ---
  ({ res, body } = await postAdReward(freeToken, payload1));
  assert(res.status === 200, `duplicate claim expected 200, got ${res.status}`);
  assert(body.success === true, 'duplicate claim success');
  assert(body.data?.alreadyClaimed === true, 'duplicate claim should set alreadyClaimed true');
  assert(
    body.data.postAnalyzeRemaining === afterFirstRem,
    'postAnalyzeRemaining must not increase on duplicate completion id'
  );
  assert(
    body.data.postAnalyzeLimit === afterFirstLim,
    'postAnalyzeLimit must not change on duplicate completion id'
  );

  // --- Repeat same request multiple times ---
  for (let i = 0; i < 3; i++) {
    ({ res, body } = await postAdReward(freeToken, payload1));
    assert(res.status === 200, `repeat ${i} expected 200`);
    assert(body.data?.alreadyClaimed === true, `repeat ${i} should be alreadyClaimed`);
    assert(body.data.postAnalyzeRemaining === afterFirstRem, `repeat ${i} remaining stable`);
  }
  assertAdRewardAnalytics(body.data.adRewardAnalytics, {
    totalAdsWatched: 5,
    rewardsGranted: 1,
    duplicate: 4,
    cooldown: 0,
    limit: 0,
  });

  // --- New completion id before cooldown: rejected ---
  const payloadTooSoon = freshCompletionPayload('cooldown');
  ({ res, body } = await postAdReward(freeToken, payloadTooSoon));
  assert(res.status === 400, `cooldown claim expected 400, got ${res.status}`);
  assert(body.success === false, 'cooldown should not succeed');
  assert(body.code === 'REWARD_COOLDOWN', `expected REWARD_COOLDOWN, got ${body.code}`);

  const afterCooldown = await getProfile(freeToken);
  assertAdRewardAnalytics(afterCooldown.adRewardAnalytics, {
    totalAdsWatched: 6,
    rewardsGranted: 1,
    duplicate: 4,
    cooldown: 1,
    limit: 0,
  });

  // --- Logical cap: remaining never above effective limit ---
  assert(afterFirstRem <= afterFirstLim, 'sanity: remaining <= limit');

  // --- Premium user: not affected (reject claim; usage stays premium-shaped) ---
  const { token: premToken } = await signupUser(premEmail, password);
  const mongoUri = process.env.MONGO_URI;
  assert(mongoUri, 'MONGO_URI is required to mark a user premium for this test');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  try {
    const u = await User.findOneAndUpdate(
      { email: premEmail },
      { $set: { isPremium: true } },
      { new: true }
    );
    assert(u && u.isPremium === true, 'failed to set premium flag in DB');
  } finally {
    await mongoose.disconnect();
  }

  const premProfileBefore = await getProfile(premToken);
  assert(premProfileBefore.isPremium === true, 'premium user should show isPremium');

  const premPayload = freshCompletionPayload('p');
  ({ res, body } = await postAdReward(premToken, premPayload));
  assert(res.status === 400, `premium ad-reward should be 400, got ${res.status}`);
  assert(body.success === false, 'premium should not succeed');

  const premProfileAfter = await getProfile(premToken);
  assert(premProfileAfter.isPremium === true, 'premium flag unchanged');
  assert(
    premProfileAfter.postAnalyzeRemaining == null && premProfileAfter.postAnalyzeLimit == null,
    'premium user usage fields should stay null (unaffected by failed claim)'
  );
  assert(premProfileAfter.adRewardAnalytics == null, 'premium user adRewardAnalytics should be null');
  assert(premProfileAfter.invalidAdCompletionCountToday == null, 'premium invalid count should be null');

  console.log('OK  ad-reward: first claim increments remaining');
  console.log('OK  ad-reward: duplicate completionId returns alreadyClaimed without bumping remaining');
  console.log('OK  ad-reward: repeated duplicate requests stay idempotent');
  console.log('OK  ad-reward: new id within cooldown returns REWARD_COOLDOWN');
  console.log('OK  ad-reward: per-day adRewardAnalytics (watched / granted / rejected)');
  console.log('OK  ad-reward: remaining <= limit');
  console.log('OK  ad-reward: premium users rejected and usage unchanged');
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
