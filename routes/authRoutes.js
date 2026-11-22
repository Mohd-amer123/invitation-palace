/**
 * Authentication Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { verifyPassword, hashPassword } = require('../utils/security');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const match = verifyPassword(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // Set session
  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role
  };

  // Log action
  db.prepare(`
    INSERT INTO system_logs (level, action, details, ip)
    VALUES ('INFO', 'User Login', ?, ?)
  `).run(`User ${user.username} logged in successfully`, req.ip);

  res.json({
    success: true,
    message: 'Login successful.',
    user: req.session.user
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Could not log out.' });
      }
      res.clearCookie('palace_session');
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  } else {
    res.json({ success: true, message: 'Logged out.' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, user: req.session.user });
  }
  res.status(401).json({ success: false, error: 'Not authenticated.' });
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }

  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!user || !verifyPassword(current_password, user.password_hash)) {
    return res.status(400).json({ success: false, error: 'Current password is incorrect.' });
  }

  const newHash = hashPassword(new_password);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, user.id);

  db.prepare(`
    INSERT INTO system_logs (level, action, details, ip)
    VALUES ('INFO', 'Password Changed', ?, ?)
  `).run(`Password changed for user ${user.username}`, req.ip);

  res.json({ success: true, message: 'Password updated successfully.' });
});

module.exports = router;
