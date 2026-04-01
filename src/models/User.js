const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '', maxlength: 500 },
    instagramLink: { type: String, trim: true, default: '' },
    facebookLink: { type: String, trim: true, default: '' },
    tiktokLink: { type: String, trim: true, default: '', maxlength: 500 },
    niche: { type: String, trim: true, default: '', maxlength: 120 },
    isPremium: { type: Boolean, default: false },
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetIssuedAt: { type: Date, default: null },
    /** Set when invalid ad-completion abuse exceeds daily threshold (persists for review). */
    adRewardSuspiciousFlag: { type: Boolean, default: false },
    postAnalyzeDaily: {
      day: { type: String, default: '' },
      /** Max analyses/day = free tier + env `MAX_AD_REWARDS_PER_DAY` (cap 50 in app config). */
      count: { type: Number, default: 0, min: 0, max: 60 },
      rewardSlots: { type: Number, default: 0, min: 0, max: 50 },
      /** @deprecated legacy string ids — use adRewardClaims */
      rewardClaimIds: [{ type: String }],
      /** @deprecated use adRewardClaims */
      adCompletionIds: [{ type: String }],
      /** One row per successful claim; duplicate adCompletionId is rejected */
      adRewardClaims: [
        {
          adCompletionId: { type: String, required: true, trim: true },
          claimedAt: { type: Date, default: Date.now },
        },
      ],
      /** UTC day bucket: rewarded-ad funnel (resets with `day`) */
      adRewardAnalytics: {
        totalAdsWatched: { type: Number, default: 0, min: 0 },
        rewardsGranted: { type: Number, default: 0, min: 0 },
        rewardsRejected: {
          duplicate: { type: Number, default: 0, min: 0 },
          cooldown: { type: Number, default: 0, min: 0 },
          limit: { type: Number, default: 0, min: 0 },
        },
      },
      /** Invalid ad completion payloads this UTC day (format/expiry); see suspicious threshold */
      invalidAdCompletionCount: { type: Number, default: 0, min: 0 },
      /** When true, ad reward grants are rejected until next UTC day */
      adRewardsBlockedSuspicious: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
