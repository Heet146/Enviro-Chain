'use strict';

function createAuthMiddleware(auth, db) {
  return async function authenticate(req, res, next) {
    if (!auth) {
      return res.status(503).json({ error: 'Authentication is not configured. Add Firebase Admin credentials before enabling dashboard access.' });
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in is required.' });

    try {
      const decoded = await auth.verifyIdToken(token, true);
      const snapshot = await db.ref(`accessControl/users/${decoded.uid}`).once('value');
      const profile = snapshot.val();
      if (!profile || profile.active === false || !['admin', 'user'].includes(profile.role)) {
        return res.status(403).json({ error: 'This account does not have an active dashboard role.' });
      }
      req.user = { ...profile, uid: decoded.uid, email: decoded.email || '' };
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

function userLocationIds(user) {
  const values = Array.isArray(user.locationIds) ? user.locationIds : (user.locationId ? [user.locationId] : []);
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
}

module.exports = { createAuthMiddleware, requireRole, userLocationIds };
