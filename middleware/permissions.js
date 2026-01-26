'use strict';

const { ROLE_PERMISSIONS } = require('../config/rolePermissions');

function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'Login required' });

    const rolePerms = ROLE_PERMISSIONS[user.role] || [];
    if (!rolePerms.includes(permission)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

module.exports = { requirePermission };
