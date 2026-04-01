const { validationResult } = require('express-validator');
const { analyzeViralScore } = require('../services/viralScoreService');

async function analyze(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { caption, hashtags } = req.body;
    const data = analyzeViralScore(caption, hashtags || '');
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
}

module.exports = { analyze };
