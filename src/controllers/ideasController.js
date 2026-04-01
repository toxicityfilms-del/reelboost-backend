const { validationResult } = require('express-validator');
const { generateIdeas } = require('../services/openaiService');

async function generate(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { niche } = req.body;
    const ideas = await generateIdeas(niche);
    return res.json({ success: true, data: { ideas } });
  } catch (e) {
    return next(e);
  }
}

module.exports = { generate };
