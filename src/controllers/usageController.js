const { grantAdRewardSlot } = require('../services/usageService');

function userId(req) {
  return req.user?.sub;
}

async function grantAdReward(req, res, next) {
  try {
    const id = userId(req);
    const out = await grantAdRewardSlot(id, {
      completionId: req.body?.completionId,
      completedAtMs: req.body?.completedAtMs,
    });
    if (!out.ok) {
      return res.status(out.status).json(out.body);
    }
    const m = out.meta;
    return res.json({
      success: true,
      data: {
        alreadyClaimed: out.alreadyClaimed === true,
        isPremium: m.isPremium,
        postAnalyzeLimit: m.postAnalyzeLimit,
        postAnalyzeRemaining: m.postAnalyzeRemaining,
        postAnalyzeAdRewardsRemaining: m.postAnalyzeAdRewardsRemaining,
        adRewardAnalytics: m.adRewardAnalytics,
        adRewardSuspiciousFlag: m.adRewardSuspiciousFlag,
        adRewardsBlockedSuspicious: m.adRewardsBlockedSuspicious,
        invalidAdCompletionCountToday: m.invalidAdCompletionCountToday,
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { grantAdReward };
