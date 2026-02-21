/**
 * Middleware: Require authenticated session.
 * Checks that the user has a valid access_token in their session.
 * Returns 401 if not authenticated.
 */
function requireAuth(req, res, next) {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = { requireAuth };
