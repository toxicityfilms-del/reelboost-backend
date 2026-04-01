const { validationResult } = require('express-validator');
const { generateCaptionAndHooks } = require('../services/openaiService');

async function generate(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { idea } = req.body;
    const data = await generateCaptionAndHooks(idea);
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
}

module.exports = { generate };
