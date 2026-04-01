const { validationResult } = require('express-validator');
const { analyzePost, analyzeMediaPost, extractMediaContext } = require('../services/openaiService');
const { assertPostAnalyzeAllowed, commitPostAnalyzeUsageAfterSuccess } = require('../services/usageService');

function userId(req) {
  return req.user?.sub;
}

async function analyze(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const id = userId(req);
  try {
    const gate = await assertPostAnalyzeAllowed(id);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }

    const idea = req.body.idea;
    const imageBase64 = req.body.imageBase64;
    const niche = req.body.niche;
    const bio = req.body.bio;
    const data = await analyzePost({ idea, imageBase64, niche, bio });
    const meta = await commitPostAnalyzeUsageAfterSuccess(id);
    if (meta.postAnalyzeRemaining != null) {
      res.set('X-RateLimit-Remaining', String(meta.postAnalyzeRemaining));
    }
    if (meta.postAnalyzeLimit != null) {
      res.set('X-RateLimit-Limit', String(meta.postAnalyzeLimit));
    }
    return res.json({
      success: true,
      data,
      meta: {
        isPremium: meta.isPremium,
        postAnalyzeLimit: meta.postAnalyzeLimit,
        postAnalyzeRemaining: meta.postAnalyzeRemaining,
        postAnalyzeAdRewardsRemaining: meta.postAnalyzeAdRewardsRemaining,
        adRewardAnalytics: meta.adRewardAnalytics,
        adRewardSuspiciousFlag: meta.adRewardSuspiciousFlag,
        adRewardsBlockedSuspicious: meta.adRewardsBlockedSuspicious,
        invalidAdCompletionCountToday: meta.invalidAdCompletionCountToday,
      },
    });
  } catch (e) {
    return next(e);
  }
}

async function analyzeMedia(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const id = userId(req);
  try {
    const gate = await assertPostAnalyzeAllowed(id);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }

    const niche = req.body.niche;
    const bio = req.body.bio;
    const userNotes = req.body.notes;

    const file = req.file;
    const thumbnailDataUrl = req.body.thumbnailDataUrl;

    const ctx = await extractMediaContext({
      imageDataUrl: thumbnailDataUrl,
      file,
      niche,
      userNotes,
    });

    const data = await analyzeMediaPost({
      niche,
      bio,
      userNotes,
      mediaContext: ctx,
    });

    const meta = await commitPostAnalyzeUsageAfterSuccess(id);
    if (meta.postAnalyzeRemaining != null) {
      res.set('X-RateLimit-Remaining', String(meta.postAnalyzeRemaining));
    }
    if (meta.postAnalyzeLimit != null) {
      res.set('X-RateLimit-Limit', String(meta.postAnalyzeLimit));
    }
    return res.json({
      success: true,
      data,
      mediaContext: ctx,
      meta: {
        isPremium: meta.isPremium,
        postAnalyzeLimit: meta.postAnalyzeLimit,
        postAnalyzeRemaining: meta.postAnalyzeRemaining,
        postAnalyzeAdRewardsRemaining: meta.postAnalyzeAdRewardsRemaining,
        adRewardAnalytics: meta.adRewardAnalytics,
        adRewardSuspiciousFlag: meta.adRewardSuspiciousFlag,
        adRewardsBlockedSuspicious: meta.adRewardsBlockedSuspicious,
        invalidAdCompletionCountToday: meta.invalidAdCompletionCountToday,
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { analyze, analyzeMedia };
