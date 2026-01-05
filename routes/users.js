const express = require('express');
const router = express.Router();
const { notifyAdminUserCreated } = require('../utils/mailer');

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // 🔐 Save user (replace with your DB logic)
    // await db.query(
    //   'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    //   [username, hashedPassword, role]
    // );

    // 📧 Notify admin
    await notifyAdminUserCreated({
      username,
      role,
      createdBy: req.user?.username
    });

    res.json({ message: 'User created successfully!' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;
