/**
 * Authentication Middleware
 * THE INVITATION PALACE
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  // If API request, return JSON 401 error
  const isApi = (req.originalUrl && req.originalUrl.startsWith('/api')) ||
                (req.baseUrl && req.baseUrl.startsWith('/api')) ||
                (req.path && req.path.startsWith('/api'));

  if (isApi) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required or session expired. Please log in.'
    });
  }

  // Otherwise redirect to login page
  return res.redirect('/login.html');
}

module.exports = {
  requireAuth
};
