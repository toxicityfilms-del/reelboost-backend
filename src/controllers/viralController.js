const { validationResult } = require('express-validator');
const { analyzeViralScore } = require('../services/viralScoreService');

async function analyze(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    return res.json({
      success: true,
      data: {
        score: 999,
        niche: 'debug-business',
        bestTime: 'debug-11PM',
        audioSuggestion: 'debug-song',
        suggestions: ['debug'],
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { analyze };
