/**
 * Smoke-test /api routes against a running server (default http://localhost:3000).
 * Usage: npm run test:api
 * Requires: backend running, MongoDB. OpenAI routes skip if key is missing/invalid.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
if (process.env.MONGO_DNS_SERVERS) {
  const servers = process.env.MONGO_DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000/api';

function isOpenAiMisconfig(res, body) {
  const msg = (body && body.message) || '';
  return (
    res.status === 401 ||
    res.status === 503 ||
    /api key|openai|not configured/i.test(msg)
  );
}

async function json(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t };
  }
}

async function main() {
  const email = `apitest_${Date.now()}@example.com`;
  const password = 'testpass12';

  console.log('Base URL:', BASE);

  let res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'API Test' }),
  });
  let body = await json(res);
  if (!res.ok || !body.success) {
    console.error('FAIL signup', res.status, body);
    process.exit(1);
  }
  const signupUser = body.user;
  const ar = signupUser?.adRewardAnalytics;
  const signupUsageOk =
    signupUser &&
    signupUser.isPremium === false &&
    signupUser.postAnalyzeLimit === 5 &&
    signupUser.postAnalyzeRemaining === 5 &&
    signupUser.postAnalyzeAdRewardsRemaining === 5 &&
    ar &&
    ar.totalAdsWatched === 0 &&
    ar.rewardsGranted === 0 &&
    ar.rewardsRejected?.duplicate === 0 &&
    ar.rewardsRejected?.cooldown === 0 &&
    ar.rewardsRejected?.limit === 0 &&
    signupUser.adRewardSuspiciousFlag === false &&
    signupUser.adRewardsBlockedSuspicious === false &&
    signupUser.invalidAdCompletionCountToday === 0;
  if (!signupUsageOk) {
    console.error('FAIL signup user JSON missing usage fields', signupUser);
    process.exit(1);
  }
  const token = body.token;
  const auth = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  console.log('OK  signup + JWT + usage fields (isPremium, limit, remaining, ad rewards)');

  const results = [];

  res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  body = await json(res);
  const loginUser = body.user;
  const loginUsageOk =
    res.ok &&
    body.success &&
    loginUser &&
    loginUser.isPremium === false &&
    loginUser.postAnalyzeLimit === 5 &&
    typeof loginUser.postAnalyzeRemaining === 'number';
  results.push(['POST /auth/login user usage fields', loginUsageOk]);
  console.log(loginUsageOk ? 'OK  login user usage' : 'FAIL login user usage', res.status, body.message || '');

  res = await fetch(`${BASE}/profile/me`, { headers: { Authorization: `Bearer ${token}` } });
  body = await json(res);
  const profileGetOk =
    res.ok &&
    body.success &&
    body.data?.email === email &&
    body.data?.isPremium === false &&
    body.data?.postAnalyzeLimit === 5 &&
    typeof body.data?.postAnalyzeRemaining === 'number';
  results.push(['GET /profile/me', profileGetOk]);
  console.log(profileGetOk ? 'OK  profile me' : 'FAIL profile me', res.status, body.message || '');

  res = await fetch(`${BASE}/profile/save`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: 'API Tester',
      bio: 'Smoke test bio',
      instagram: 'https://instagram.com/test',
      facebook: 'https://facebook.com/test',
      niche: 'testing',
    }),
  });
  body = await json(res);
  const profileSaveOk =
    res.ok &&
    body.success &&
    body.data?.name === 'API Tester' &&
    body.data?.niche === 'testing' &&
    body.data?.isPremium === false &&
    body.data?.postAnalyzeLimit === 5 &&
    typeof body.data?.postAnalyzeRemaining === 'number' &&
    (body.data?.instagram?.includes('instagram') || body.data?.instagramLink?.includes('instagram'));
  results.push(['POST /profile/save', profileSaveOk]);
  console.log(profileSaveOk ? 'OK  profile save' : 'FAIL profile save', res.status, body.message || '');

  res = await fetch(`${BASE}/trends`, { headers: { Authorization: `Bearer ${token}` } });
  body = await json(res);
  results.push(['GET /trends', res.ok && body.success === true]);
  console.log(res.ok && body.success ? 'OK  trends' : 'FAIL trends', res.status, body.message || '');

  res = await fetch(`${BASE}/viral/analyze`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      caption: 'POV: you finally hit your goal 🎯 Comment SAVE if this is you!',
      hashtags: '#fitness #gym #motivation #health #workout #goals #fyp #reels #viral #insta',
    }),
  });
  body = await json(res);
  const viralOk = res.ok && body.success && typeof body.data?.score === 'number';
  results.push(['POST /viral/analyze', viralOk]);
  console.log(viralOk ? `OK  viral score=${body.data.score}` : 'FAIL viral', res.status, body.message || body);

  res = await fetch(`${BASE}/hashtag/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ keyword: 'fitness' }),
  });
  body = await json(res);
  let tagOk =
    res.ok &&
    body.success &&
    body.data?.high?.length &&
    body.data?.medium?.length &&
    body.data?.low?.length;
  let tagSkipped = false;
  if (!tagOk && isOpenAiMisconfig(res, body)) {
    console.log('SKIP POST /hashtag/generate (set valid OPENAI_API_KEY in .env to test)');
    tagOk = true;
    tagSkipped = true;
  }
  results.push(['POST /hashtag/generate', tagOk]);
  if (tagOk && !tagSkipped) {
    console.log(
      `OK  hashtag buckets high=${body.data.high.length} medium=${body.data.medium.length} low=${body.data.low.length}`
    );
  } else if (!tagOk) {
    console.log('FAIL hashtag', res.status, body.message || '');
  }

  res = await fetch(`${BASE}/caption/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ idea: 'morning gym motivation' }),
  });
  body = await json(res);
  let capOk = res.ok && body.success && body.data?.caption;
  let capSkipped = false;
  if (!capOk && isOpenAiMisconfig(res, body)) {
    console.log('SKIP POST /caption/generate (set valid OPENAI_API_KEY in .env to test)');
    capOk = true;
    capSkipped = true;
  }
  results.push(['POST /caption/generate', capOk]);
  if (capOk && !capSkipped) {
    console.log(`OK  caption (${body.data.caption.length} chars, hooks=${body.data.hooks?.length || 0})`);
  } else if (!capOk) {
    console.log('FAIL caption', res.status, body.message || '');
  }

  res = await fetch(`${BASE}/ideas/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ niche: 'skincare' }),
  });
  body = await json(res);
  let ideasOk = res.ok && body.success && Array.isArray(body.data?.ideas) && body.data.ideas.length >= 1;
  let ideasSkipped = false;
  if (!ideasOk && isOpenAiMisconfig(res, body)) {
    console.log('SKIP POST /ideas/generate (set valid OPENAI_API_KEY in .env to test)');
    ideasOk = true;
    ideasSkipped = true;
  }
  results.push(['POST /ideas/generate', ideasOk]);
  if (ideasOk && !ideasSkipped) {
    console.log(`OK  ideas count=${body.data.ideas.length}`);
  } else if (!ideasOk) {
    console.log('FAIL ideas', res.status, body.message || '');
  }

  const postPayload = () => ({
    idea: 'sunset coffee reel aesthetic',
    niche: 'testing',
    bio: 'Smoke test bio',
  });

  let postOk = true;
  let postSkipped = false;
  let postLimitSuiteOk = true;

  res = await fetch(`${BASE}/post/analyze`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(postPayload()),
  });
  body = await json(res);
  const firstAnalyzeOk =
    res.ok &&
    body.success &&
    body.data?.hook &&
    body.data?.caption &&
    Array.isArray(body.data?.hashtags) &&
    body.data.hashtags.length >= 1 &&
    body.data?.bestTime &&
    body.data?.audio;

  if (!firstAnalyzeOk && isOpenAiMisconfig(res, body)) {
    console.log('SKIP POST /post/analyze + limit suite (set valid OPENAI_API_KEY in .env)');
    postSkipped = true;
    postOk = true;
    postLimitSuiteOk = true;
  } else if (!firstAnalyzeOk) {
    postOk = false;
    postLimitSuiteOk = false;
    console.log('FAIL post analyze', res.status, body.message || '');
  } else {
    if (
      body.meta?.isPremium !== false ||
      body.meta?.postAnalyzeLimit !== 5 ||
      body.meta?.postAnalyzeRemaining !== 4
    ) {
      postLimitSuiteOk = false;
      console.log('FAIL post analyze meta after 1st call', body.meta);
    }
    for (let i = 1; i <= 4; i++) {
      res = await fetch(`${BASE}/post/analyze`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(postPayload()),
      });
      body = await json(res);
      if (
        !res.ok ||
        !body.success ||
        !body.data?.hook ||
        body.meta?.postAnalyzeRemaining !== 4 - i
      ) {
        postLimitSuiteOk = false;
        console.log(`FAIL post analyze call ${i + 1}`, res.status, body.message || '', body.meta);
        break;
      }
    }
    if (postLimitSuiteOk) {
      res = await fetch(`${BASE}/post/analyze`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(postPayload()),
      });
      body = await json(res);
      const limit403 =
        res.status === 403 &&
        body.success === false &&
        body.code === 'POST_ANALYZE_LIMIT' &&
        typeof body.used === 'number';
      if (!limit403) {
        postLimitSuiteOk = false;
        console.log('FAIL 6th POST /post/analyze expected 403 POST_ANALYZE_LIMIT', res.status, body);
      } else {
        console.log('OK  post analyze daily limit enforced (403)');
      }
    }
    if (postOk && postLimitSuiteOk) {
      console.log('OK  post analyze + meta countdown + limit');
    }
  }

  results.push(['POST /post/analyze (+ limit)', postSkipped || (postOk && postLimitSuiteOk)]);

  const failed = results.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error('\nFailed:', failed.map(([n]) => n).join(', '));
    process.exit(1);
  }
  const skipped = [tagSkipped, capSkipped, ideasSkipped, postSkipped].some(Boolean);
  console.log(
    skipped
      ? '\nAll checked endpoints passed (some OpenAI routes were skipped — check OPENAI_API_KEY).'
      : '\nAll checked endpoints passed.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
