const { validationResult } = require('express-validator');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { buildPostAnalyzeUsageMeta } = require('../services/usageService');

function userId(req) {
  return req.user?.sub;
}

/** Response shape matches Flutter [UserModel] + API field names. */
function shapeMe(user, profileDoc) {
  const p = profileDoc || {};
  const ig = p.instagram != null && p.instagram !== '' ? p.instagram : user.instagramLink || '';
  const fb = p.facebook != null && p.facebook !== '' ? p.facebook : user.facebookLink || '';
  const usage = buildPostAnalyzeUsageMeta(user);
  return {
    id: user._id != null ? String(user._id) : user._id,
    email: user.email,
    name: p.name != null && p.name !== '' ? p.name : user.name || '',
    bio: p.bio != null && p.bio !== '' ? p.bio : user.bio || '',
    niche: p.niche != null && p.niche !== '' ? p.niche : user.niche || '',
    instagram: ig,
    facebook: fb,
    instagramLink: ig,
    facebookLink: fb,
    tiktokLink: user.tiktokLink || '',
    isPremium: usage.isPremium,
    postAnalyzeLimit: usage.postAnalyzeLimit,
    postAnalyzeRemaining: usage.postAnalyzeRemaining,
    postAnalyzeAdRewardsRemaining: usage.postAnalyzeAdRewardsRemaining,
    adRewardAnalytics: usage.adRewardAnalytics,
    adRewardSuspiciousFlag: usage.adRewardSuspiciousFlag,
    adRewardsBlockedSuspicious: usage.adRewardsBlockedSuspicious,
    invalidAdCompletionCountToday: usage.invalidAdCompletionCountToday,
  };
}

async function getProfileMe(req, res, next) {
  try {
    const id = userId(req);
    const user = await User.findById(id).select('-passwordHash').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const profile = await Profile.findOne({ userId: id }).lean();
    return res.json({ success: true, data: shapeMe(user, profile) });
  } catch (e) {
    return next(e);
  }
}

async function saveProfile(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const id = userId(req);
    const name = req.body.name !== undefined ? String(req.body.name).trim() : '';
    const bio = req.body.bio !== undefined ? String(req.body.bio).trim().slice(0, 500) : '';
    const instagram = req.body.instagram !== undefined ? String(req.body.instagram).trim().slice(0, 500) : '';
    const facebook = req.body.facebook !== undefined ? String(req.body.facebook).trim().slice(0, 500) : '';
    const niche = req.body.niche !== undefined ? String(req.body.niche).trim().slice(0, 120) : '';

    const user = await User.findById(id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await Profile.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          userId: id,
          name,
          bio,
          instagram,
          facebook,
          niche,
        },
      },
      { upsert: true, new: true }
    );

    user.name = name;
    user.bio = bio;
    user.instagramLink = instagram;
    user.facebookLink = facebook;
    user.niche = niche;
    await user.save();

    const profile = await Profile.findOne({ userId: id }).lean();
    const fresh = await User.findById(id).select('-passwordHash').lean();
    return res.json({ success: true, data: shapeMe(fresh, profile) });
  } catch (e) {
    return next(e);
  }
}

module.exports = { getProfileMe, saveProfile };
