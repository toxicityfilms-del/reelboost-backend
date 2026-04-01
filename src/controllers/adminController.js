const mongoose = require('mongoose');
const { resetSuspiciousAdFlags } = require('../services/usageService');

async function resetSuspiciousFlagsForUser(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const out = await resetSuspiciousAdFlags(userId);
    if (!out.ok) {
      return res.status(out.status).json(out.body);
    }
    const m = out.meta;
    return res.json({
      success: true,
      data: {
        userId,
        adRewardSuspiciousFlag: m.adRewardSuspiciousFlag,
        adRewardsBlockedSuspicious: m.adRewardsBlockedSuspicious,
        invalidAdCompletionCountToday: m.invalidAdCompletionCountToday,
        isPremium: m.isPremium,
        postAnalyzeLimit: m.postAnalyzeLimit,
        postAnalyzeRemaining: m.postAnalyzeRemaining,
        postAnalyzeAdRewardsRemaining: m.postAnalyzeAdRewardsRemaining,
        adRewardAnalytics: m.adRewardAnalytics,
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { resetSuspiciousFlagsForUser };
