/**
 * Usage / ad-reward tuning via environment (loaded when the process starts).
 * Defaults match previous hardcoded behavior.
 */

function readIntEnv(name, defaultVal, min, max) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultVal;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(max, Math.max(min, n));
}

/** Max rewarded-ad bonus slots per UTC day (was 5). */
const MAX_AD_REWARD_SLOTS = readIntEnv('MAX_AD_REWARDS_PER_DAY', 5, 1, 50);

/** Invalid ad-completion attempts before flag + daily block (strictly greater than this count triggers). */
const SUSPICIOUS_INVALID_AD_THRESHOLD = readIntEnv('SUSPICIOUS_INVALID_AD_THRESHOLD', 5, 1, 500);

/** Minimum seconds between distinct rewarded ad grants; 0 disables cooldown. */
const REWARD_COOLDOWN_SECONDS = readIntEnv('REWARD_COOLDOWN_SECONDS', 30, 0, 86400);
const AD_REWARD_COOLDOWN_MS = REWARD_COOLDOWN_SECONDS * 1000;

module.exports = {
  MAX_AD_REWARD_SLOTS,
  AD_REWARD_COOLDOWN_MS,
  REWARD_COOLDOWN_SECONDS,
  SUSPICIOUS_INVALID_AD_THRESHOLD,
};
