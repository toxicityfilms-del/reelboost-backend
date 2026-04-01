const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { buildPostAnalyzeUsageMeta } = require('../services/usageService');
const { sendPasswordResetEmail } = require('../services/mailService');

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ sub: userId }, secret, { expiresIn });
}

function userPayload(user) {
  const usage = buildPostAnalyzeUsageMeta(user);
  return {
    id: user._id != null ? String(user._id) : user._id,
    email: user.email,
    name: user.name || '',
    bio: user.bio || '',
    instagramLink: user.instagramLink || '',
    facebookLink: user.facebookLink || '',
    tiktokLink: user.tiktokLink || '',
    niche: user.niche || '',
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

async function signup(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { email, password, name } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      passwordHash,
      name: name || '',
    });
    const token = signToken(user._id.toString());
    return res.status(201).json({
      success: true,
      token,
      user: userPayload(user),
    });
  } catch (e) {
    return next(e);
  }
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = signToken(user._id.toString());
    return res.json({
      success: true,
      token,
      user: userPayload(user),
    });
  } catch (e) {
    return next(e);
  }
}

function resetTokenTtlMinutes() {
  const ttl = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 20);
  if (Number.isNaN(ttl) || ttl < 15) return 15;
  if (ttl > 30) return 30;
  return ttl;
}

function buildResetLink(rawToken) {
  const base = (process.env.PASSWORD_RESET_BASE_URL || '').trim();
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(rawToken)}`;
}

async function forgotPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const email = String(req.body.email || '').trim().toLowerCase();

    const genericResponse = {
      success: true,
      message:
        'If this email is registered, a password reset link has been sent. Please check your inbox.',
    };

    const user = await User.findOne({ email });
    if (!user) {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const ttl = resetTokenTtlMinutes();
    const now = Date.now();
    const expiresAt = new Date(now + ttl * 60 * 1000);

    user.passwordResetTokenHash = tokenHash;
    user.passwordResetIssuedAt = new Date(now);
    user.passwordResetExpiresAt = expiresAt;
    await user.save();

    const resetLink = buildResetLink(rawToken);
    if (resetLink) {
      try {
        await sendPasswordResetEmail({
          to: user.email,
          resetLink,
          expiresMinutes: ttl,
        });
      } catch (mailErr) {
        // eslint-disable-next-line no-console
        console.error('[auth] failed to send password reset email', mailErr);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[auth] PASSWORD_RESET_BASE_URL not set; reset link not emailed.');
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      return res.json({
        ...genericResponse,
        devResetToken: rawToken,
        devResetLink: resetLink || null,
      });
    }
    return res.json(genericResponse);
  } catch (e) {
    return next(e);
  }
}

async function resetPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = '';
    user.passwordResetIssuedAt = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.json({
      success: true,
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { signup, login, forgotPassword, resetPassword };
