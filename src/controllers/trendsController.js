const { getMockTrends } = require('../services/trendsMockService');

function list(req, res) {
  const data = getMockTrends();
  return res.json({ success: true, data });
}

module.exports = { list };
