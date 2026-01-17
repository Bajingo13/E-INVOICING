'use strict';

module.exports = {
  requireLogin: (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Login required' });
    }
    next();
  },

  requireRole: (...roles) => {
    return (req, res, next) => {
      if (!req.session?.user) {
        return res.status(401).json({ error: 'Login required' });
      }

      if (!roles.includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    };
  },

  requireSuper: (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.session.user.role !== 'super') {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }
};
