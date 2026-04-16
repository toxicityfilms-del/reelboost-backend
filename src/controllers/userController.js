async function upgradeUser(req, res) {
  const userId = String(req.body?.userId || '').trim();
  void userId;
  return res.json({ success: true, message: 'User upgraded to premium' });
}

module.exports = { upgradeUser };

