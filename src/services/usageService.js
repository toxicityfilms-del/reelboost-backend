const User = require('../models/User');
const {
  MAX_AD_REWARD_SLOTS,
  AD_REWARD_COOLDOWN_MS,
  REWARD_COOLDOWN_SECONDS,
  SUSPICIOUS_INVALID_AD_THRESHOLD,
} = require('../config/usageEnv');

const FREE_POST_ANALYZE_DAILY = 5;
const MAX_REWARD_CLAIM_IDS_PER_DAY = 20;
const MAX_REWARD_COMPLETION_AGE_MS = 15 * 60 * 1000;

function utcDayString() {
  return new Date().toISOString().slice(0, 10);
}

/** Clamp stored usage count; max analyses today = base free + ad reward slots (env `MAX_AD_REWARDS_PER_DAY`). */
function clampUsedCount(n) {
  const v = Number(n);
  if (Number.isNaN(v) || v < 0) return 0;
  return Math.min(v, FREE_POST_ANALYZE_DAILY + MAX_AD_REWARD_SLOTS);
}

function rewardSlotsForDay(userDoc, today) {
  const d = userDoc.postAnalyzeDaily || {};
  if (d.day !== today) return 0;
  const r = Number(d.rewardSlots);
  if (Number.isNaN(r) || r < 0) return 0;
  return Math.min(r, MAX_AD_REWARD_SLOTS);
}

function effectiveLimitForDay(userDoc, today) {
  return FREE_POST_ANALYZE_DAILY + rewardSlotsForDay(userDoc, today);
}

/**
 * All completion IDs we have ever recorded for this daily bucket (subdocs + legacy string arrays).
 * Used to reject duplicate adCompletionId and ensure one reward per ID.
 */
function getClaimedCompletionIdSet(d) {
  const set = new Set();
  if (!d || typeof d !== 'object') return set;
  if (Array.isArray(d.adRewardClaims)) {
    for (const row of d.adRewardClaims) {
      const id = row && row.adCompletionId != null ? String(row.adCompletionId).trim() : '';
      if (id.length > 0) set.add(id);
    }
  }
  for (const key of ['adCompletionIds', 'rewardClaimIds']) {
    const arr = d[key];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const id = raw == null ? '' : String(raw).trim();
      if (id.length > 0) set.add(id);
    }
  }
  return set;
}

function trimRewardClaimsArray(claims) {
  if (!Array.isArray(claims)) return [];
  return claims
    .filter((c) => c && c.adCompletionId && String(c.adCompletionId).trim().length > 0)
    .slice(-MAX_REWARD_CLAIM_IDS_PER_DAY);
}

function defaultAdRewardAnalytics() {
  return {
    totalAdsWatched: 0,
    rewardsGranted: 0,
    rewardsRejected: { duplicate: 0, cooldown: 0, limit: 0 },
  };
}

/** Normalize stored analytics for reads and writes (UTC day bucket). */
function normalizeAdRewardAnalytics(d) {
  const a = d && d.adRewardAnalytics && typeof d.adRewardAnalytics === 'object' ? d.adRewardAnalytics : {};
  const rj = a.rewardsRejected && typeof a.rewardsRejected === 'object' ? a.rewardsRejected : {};
  return {
    totalAdsWatched: Math.max(0, Math.floor(Number(a.totalAdsWatched)) || 0),
    rewardsGranted: Math.max(0, Math.floor(Number(a.rewardsGranted)) || 0),
    rewardsRejected: {
      duplicate: Math.max(0, Math.floor(Number(rj.duplicate)) || 0),
      cooldown: Math.max(0, Math.floor(Number(rj.cooldown)) || 0),
      limit: Math.max(0, Math.floor(Number(rj.limit)) || 0),
    },
  };
}

/** Latest successful claim time for this daily bucket (ms since epoch), or 0 if none. */
function lastAdRewardClaimAtMs(d) {
  if (!d || !Array.isArray(d.adRewardClaims)) return 0;
  let max = 0;
  for (const row of d.adRewardClaims) {
    if (!row || row.claimedAt == null) continue;
    const t = new Date(row.claimedAt).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

function normalizeSuspiciousDailyFields(d) {
  return {
    invalidAdCompletionCount: Math.max(0, Math.floor(Number(d.invalidAdCompletionCount)) || 0),
    adRewardsBlockedSuspicious: d.adRewardsBlockedSuspicious === true,
  };
}

/** Preserve ad reward claim rows + analytics when staying on the same UTC day; reset when the day rolls. */
function rewardClaimsForCommit(prev, today) {
  if (!prev || prev.day !== today) {
    return {
      adRewardClaims: [],
      adCompletionIds: [],
      rewardClaimIds: [],
      adRewardAnalytics: defaultAdRewardAnalytics(),
      invalidAdCompletionCount: 0,
      adRewardsBlockedSuspicious: false,
    };
  }
  const sus = normalizeSuspiciousDailyFields(prev);
  return {
    adRewardClaims: trimRewardClaimsArray(prev.adRewardClaims),
    adCompletionIds: Array.isArray(prev.adCompletionIds) ? prev.adCompletionIds : [],
    rewardClaimIds: Array.isArray(prev.rewardClaimIds) ? prev.rewardClaimIds : [],
    adRewardAnalytics: normalizeAdRewardAnalytics(prev),
    invalidAdCompletionCount: sus.invalidAdCompletionCount,
    adRewardsBlockedSuspicious: sus.adRewardsBlockedSuspicious,
  };
}

function validateRewardCompletionPayload(completionId, completedAtMs) {
  const id = completionId == null ? '' : String(completionId).trim();
  if (id.length < 8 || id.length > 120) {
    return { ok: false, code: 'INVALID_AD_COMPLETION', message: 'Invalid ad completion id.' };
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
    return { ok: false, code: 'INVALID_AD_COMPLETION', message: 'Invalid ad completion id format.' };
  }
  const ts = Number(completedAtMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, code: 'INVALID_AD_COMPLETION', message: 'Invalid ad completion time.' };
  }
  const delta = Date.now() - ts;
  if (delta < -60 * 1000 || delta > MAX_REWARD_COMPLETION_AGE_MS) {
    return { ok: false, code: 'AD_COMPLETION_EXPIRED', message: 'Ad completion expired. Please watch again.' };
  }
  return { ok: true, completionId: id, completedAtMs: ts };
}

/** Read-only usage for API responses (profile, login, post-analyze meta). */
function buildPostAnalyzeUsageMeta(userDoc) {
  if (!userDoc) {
    return {
      isPremium: false,
      postAnalyzeLimit: FREE_POST_ANALYZE_DAILY,
      postAnalyzeRemaining: FREE_POST_ANALYZE_DAILY,
      postAnalyzeAdRewardsRemaining: MAX_AD_REWARD_SLOTS,
      adRewardAnalytics: defaultAdRewardAnalytics(),
      adRewardSuspiciousFlag: false,
      adRewardsBlockedSuspicious: false,
      invalidAdCompletionCountToday: 0,
    };
  }
  if (userDoc.isPremium === true) {
    return {
      isPremium: true,
      postAnalyzeLimit: null,
      postAnalyzeRemaining: null,
      postAnalyzeAdRewardsRemaining: null,
      adRewardAnalytics: null,
      adRewardSuspiciousFlag: userDoc.adRewardSuspiciousFlag === true,
      adRewardsBlockedSuspicious: null,
      invalidAdCompletionCountToday: null,
    };
  }
  const today = utcDayString();
  const d = userDoc.postAnalyzeDaily || {};
  const rewardSlots = rewardSlotsForDay(userDoc, today);
  const effectiveLimit = FREE_POST_ANALYZE_DAILY + rewardSlots;
  const usedToday = d.day === today ? clampUsedCount(d.count) : 0;
  const sus = d.day === today ? normalizeSuspiciousDailyFields(d) : { invalidAdCompletionCount: 0, adRewardsBlockedSuspicious: false };
  return {
    isPremium: false,
    postAnalyzeLimit: effectiveLimit,
    postAnalyzeRemaining: Math.max(0, effectiveLimit - usedToday),
    postAnalyzeAdRewardsRemaining: Math.max(0, MAX_AD_REWARD_SLOTS - rewardSlots),
    adRewardAnalytics:
      d.day === today ? normalizeAdRewardAnalytics(d) : defaultAdRewardAnalytics(),
    adRewardSuspiciousFlag: userDoc.adRewardSuspiciousFlag === true,
    adRewardsBlockedSuspicious: d.day === today ? sus.adRewardsBlockedSuspicious : false,
    invalidAdCompletionCountToday: sus.invalidAdCompletionCount,
  };
}

/**
 * Free: block if today's count already at effective limit (does not increment).
 * Premium: always allowed; no counter.
 */
async function assertPostAnalyzeAllowed(userId) {
  const user = await User.findById(userId);
  if (!user) {
    return {
      ok: false,
      status: 404,
      body: { success: false, message: 'User not found' },
    };
  }
  if (user.isPremium === true) {
    return { ok: true, isPremium: true };
  }
  const today = utcDayString();
  const d = user.postAnalyzeDaily || { day: '', count: 0, rewardSlots: 0 };
  const used = d.day === today ? clampUsedCount(d.count) : 0;
  const eff = effectiveLimitForDay(user, today);
  if (used >= eff) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        code: 'POST_ANALYZE_LIMIT',
        message: `Free plan allows ${eff} post analyses today (including ad bonuses). Upgrade to Premium for unlimited analyses.`,
        limit: eff,
        used,
      },
    };
  }
  return { ok: true, isPremium: false };
}

/**
 * Call only after OpenAI analysis succeeded. Free users: +1 for today (capped). Premium: no DB change.
 */
async function commitPostAnalyzeUsageAfterSuccess(userId) {
  const user = await User.findById(userId);
  if (!user) {
    return {
      isPremium: false,
      postAnalyzeLimit: FREE_POST_ANALYZE_DAILY,
      postAnalyzeRemaining: 0,
      postAnalyzeAdRewardsRemaining: MAX_AD_REWARD_SLOTS,
      adRewardAnalytics: defaultAdRewardAnalytics(),
      adRewardSuspiciousFlag: false,
      adRewardsBlockedSuspicious: false,
      invalidAdCompletionCountToday: 0,
    };
  }
  if (user.isPremium === true) {
    const meta = buildPostAnalyzeUsageMeta(user);
    return {
      isPremium: true,
      postAnalyzeLimit: null,
      postAnalyzeRemaining: null,
      postAnalyzeAdRewardsRemaining: null,
      adRewardAnalytics: null,
      adRewardSuspiciousFlag: meta.adRewardSuspiciousFlag,
      adRewardsBlockedSuspicious: null,
      invalidAdCompletionCountToday: null,
    };
  }
  const today = utcDayString();
  const prev = user.postAnalyzeDaily || { day: '', count: 0, rewardSlots: 0 };
  const rewardSlots = prev.day === today ? rewardSlotsForDay(user, today) : 0;
  const eff = FREE_POST_ANALYZE_DAILY + rewardSlots;
  let used = prev.day === today ? clampUsedCount(prev.count) : 0;
  used = Math.min(used + 1, eff);
  const keptClaims = rewardClaimsForCommit(prev, today);
  user.postAnalyzeDaily = {
    day: today,
    count: used,
    rewardSlots,
    ...keptClaims,
  };
  await user.save();
  const remaining = Math.max(0, eff - used);
  const fresh = await User.findById(userId);
  const meta = buildPostAnalyzeUsageMeta(fresh);
  return {
    isPremium: false,
    postAnalyzeLimit: eff,
    postAnalyzeRemaining: remaining,
    postAnalyzeAdRewardsRemaining: Math.max(0, MAX_AD_REWARD_SLOTS - rewardSlots),
    adRewardAnalytics: meta.adRewardAnalytics,
    adRewardSuspiciousFlag: meta.adRewardSuspiciousFlag,
    adRewardsBlockedSuspicious: meta.adRewardsBlockedSuspicious,
    invalidAdCompletionCountToday: meta.invalidAdCompletionCountToday,
  };
}

/**
 * Grant +1 effective post-analyze slot for today by watching a rewarded ad (max 3/day). Premium: no-op / error.
 */
async function grantAdRewardSlot(userId, { completionId, completedAtMs } = {}) {
  const user = await User.findById(userId);
  if (!user) {
    return {
      ok: false,
      status: 404,
      body: { success: false, message: 'User not found' },
    };
  }
  if (user.isPremium === true) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Premium users do not need ad rewards' },
    };
  }
  const today = utcDayString();
  let d = user.postAnalyzeDaily || {
    day: '',
    count: 0,
    rewardSlots: 0,
    adRewardClaims: [],
    adCompletionIds: [],
    rewardClaimIds: [],
    adRewardAnalytics: defaultAdRewardAnalytics(),
    invalidAdCompletionCount: 0,
    adRewardsBlockedSuspicious: false,
  };
  if (d.day !== today) {
    d = {
      day: today,
      count: 0,
      rewardSlots: 0,
      adRewardClaims: [],
      adCompletionIds: [],
      rewardClaimIds: [],
      adRewardAnalytics: defaultAdRewardAnalytics(),
      invalidAdCompletionCount: 0,
      adRewardsBlockedSuspicious: false,
    };
  } else {
    const sus = normalizeSuspiciousDailyFields(d);
    d.invalidAdCompletionCount = sus.invalidAdCompletionCount;
    d.adRewardsBlockedSuspicious = sus.adRewardsBlockedSuspicious;
  }

  if (d.adRewardsBlockedSuspicious === true) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        code: 'AD_REWARD_SUSPENDED',
        message: 'Ad rewards are temporarily unavailable for your account. Try again tomorrow.',
      },
    };
  }

  const payload = validateRewardCompletionPayload(completionId, completedAtMs);
  if (!payload.ok) {
    d.invalidAdCompletionCount = normalizeSuspiciousDailyFields(d).invalidAdCompletionCount + 1;
    if (d.invalidAdCompletionCount > SUSPICIOUS_INVALID_AD_THRESHOLD) {
      d.adRewardsBlockedSuspicious = true;
      user.adRewardSuspiciousFlag = true;
    }
    user.postAnalyzeDaily = d;
    await user.save();
    return {
      ok: false,
      status: 400,
      body: { success: false, code: payload.code, message: payload.message },
    };
  }

  d.adRewardAnalytics = normalizeAdRewardAnalytics(d);
  d.adRewardAnalytics.totalAdsWatched += 1;

  const claimedIds = getClaimedCompletionIdSet(d);
  if (claimedIds.has(payload.completionId)) {
    d.adRewardAnalytics.rewardsRejected.duplicate += 1;
    user.postAnalyzeDaily = d;
    await user.save();
    const fresh = await User.findById(userId);
    return { ok: true, alreadyClaimed: true, meta: buildPostAnalyzeUsageMeta(fresh) };
  }
  const lastClaimMs = lastAdRewardClaimAtMs(d);
  if (lastClaimMs > 0 && Date.now() - lastClaimMs < AD_REWARD_COOLDOWN_MS) {
    d.adRewardAnalytics.rewardsRejected.cooldown += 1;
    user.postAnalyzeDaily = d;
    await user.save();
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        code: 'REWARD_COOLDOWN',
        message: 'Please wait before claiming another ad reward.',
      },
    };
  }
  const rs = rewardSlotsForDay({ postAnalyzeDaily: d }, today);
  if (rs >= MAX_AD_REWARD_SLOTS) {
    d.adRewardAnalytics.rewardsRejected.limit += 1;
    user.postAnalyzeDaily = d;
    await user.save();
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        code: 'MAX_AD_REWARD_REACHED',
        message: 'Maximum rewarded ad claims for today reached. Try again tomorrow or upgrade to Premium.',
      },
    };
  }
  d.adRewardAnalytics.rewardsGranted += 1;
  const priorClaims = Array.isArray(d.adRewardClaims) ? [...d.adRewardClaims] : [];
  priorClaims.push({
    adCompletionId: payload.completionId,
    claimedAt: new Date(),
  });
  d.rewardSlots = rs + 1;
  d.day = today;
  if (d.count == null) d.count = 0;
  d.adRewardClaims = trimRewardClaimsArray(priorClaims);
  user.postAnalyzeDaily = d;
  await user.save();
  const fresh = await User.findById(userId);
  return { ok: true, alreadyClaimed: false, meta: buildPostAnalyzeUsageMeta(fresh) };
}

/**
 * Admin: clear suspicious-ad flags and today's invalid/block counters on the user document.
 */
async function resetSuspiciousAdFlags(userId) {
  const user = await User.findById(userId);
  if (!user) {
    return {
      ok: false,
      status: 404,
      body: { success: false, message: 'User not found' },
    };
  }
  user.adRewardSuspiciousFlag = false;
  if (!user.postAnalyzeDaily) {
    user.postAnalyzeDaily = {};
  }
  user.postAnalyzeDaily.invalidAdCompletionCount = 0;
  user.postAnalyzeDaily.adRewardsBlockedSuspicious = false;
  user.markModified('postAnalyzeDaily');
  await user.save();
  const fresh = await User.findById(userId);
  return { ok: true, meta: buildPostAnalyzeUsageMeta(fresh) };
}

module.exports = {
  FREE_POST_ANALYZE_DAILY,
  MAX_AD_REWARD_SLOTS,
  AD_REWARD_COOLDOWN_MS,
  REWARD_COOLDOWN_SECONDS,
  SUSPICIOUS_INVALID_AD_THRESHOLD,
  defaultAdRewardAnalytics,
  normalizeAdRewardAnalytics,
  buildPostAnalyzeUsageMeta,
  assertPostAnalyzeAllowed,
  commitPostAnalyzeUsageAfterSuccess,
  grantAdRewardSlot,
  resetSuspiciousAdFlags,
};
