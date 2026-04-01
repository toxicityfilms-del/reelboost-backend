/**
 * Protects admin routes. Set `ADMIN_API_KEY` in the environment (long random string).
 * Send `Authorization: Bearer <ADMIN_API_KEY>` or `X-Admin-Key: <ADMIN_API_KEY>`.
 */
function adminMiddleware(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key || String(key).length < 8) {
    return res.status(503).json({
      success: false,
      message: 'Admin API is not configured (set ADMIN_API_KEY).',
    });
  }
  const header = req.headers.authorization;
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const xKey = req.headers['x-admin-key'];
  const provided = bearer != null && bearer !== '' ? bearer : xKey;
  if (provided !== key) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  return next();
}

module.exports = { adminMiddleware };
