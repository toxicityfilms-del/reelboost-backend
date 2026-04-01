/**
 * Invalid ad completion abuse: count per UTC day, flag + block after >5 invalid attempts.
 *
 * Usage: npm run test:api:suspicious-ad
 * Requires: backend running (TEST_API_BASE).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000/api';

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
    body: JSON.stringify({ email, password, name: 'Suspicious Ad Test' }),
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

async function postInvalidAdReward(token) {
  const res = await fetch(`${BASE}/usage/ad-reward`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      completionId: 'bad',
      completedAtMs: Date.now(),
    }),
  });
  const body = await json(res);
  return { res, body };
}

async function main() {
  console.log('Base URL:', BASE);

  const email = `susp_ad_${Date.now()}@example.com`;
  const password = 'testpass12';
  const { token } = await signupUser(email, password);

  for (let i = 1; i <= 5; i++) {
    const { res, body } = await postInvalidAdReward(token);
    assert(res.status === 400, `attempt ${i} expected 400, got ${res.status}`);
    assert(body.success === false, `attempt ${i} should fail`);
    assert(body.code === 'INVALID_AD_COMPLETION', `attempt ${i} expected INVALID_AD_COMPLETION`);
    const p = await getProfile(token);
    assert(p.adRewardsBlockedSuspicious === false, `attempt ${i} should not block yet`);
    assert(p.invalidAdCompletionCountToday === i, `attempt ${i} count should be ${i}`);
    assert(p.adRewardSuspiciousFlag === false, `attempt ${i} should not flag account yet`);
  }

  const sixth = await postInvalidAdReward(token);
  assert(sixth.res.status === 400, '6th invalid expected 400');
  assert(sixth.body.code === 'INVALID_AD_COMPLETION', '6th still returns payload error code');
  const p6 = await getProfile(token);
  assert(p6.invalidAdCompletionCountToday === 6, 'count should be 6');
  assert(p6.adRewardsBlockedSuspicious === true, 'should block rewards for the day');
  assert(p6.adRewardSuspiciousFlag === true, 'should flag user account');

  const seventh = await postInvalidAdReward(token);
  assert(seventh.res.status === 400, '7th expected 400');
  assert(seventh.body.code === 'AD_REWARD_SUSPENDED', `expected AD_REWARD_SUSPENDED, got ${seventh.body.code}`);
  const p7 = await getProfile(token);
  assert(p7.invalidAdCompletionCountToday === 6, 'invalid count should not increase while blocked');

  console.log('OK  suspicious-ad: invalid counts + flag + block + suspended gate');
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
