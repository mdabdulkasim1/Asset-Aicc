'use strict';

const express = require('express');
const { db } = require('../db');
const {
  PUBLIC_USER_COLUMNS,
  getUserById,
  hashPassword,
  logActivity,
  requireAuth,
  signToken,
  validatePassword,
  verifyPassword,
} = require('../auth');

const router = express.Router();

// Simple in-memory brute-force brake: 10 failures per username per 15 minutes.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function noteFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Enter both username and password.' });
  }

  const key = username.toLowerCase();
  if (tooManyAttempts(key)) {
    return res
      .status(429)
      .json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    noteFailure(key);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (!row.is_active) {
    return res.status(403).json({ error: 'This account has been disabled. Contact the admin.' });
  }

  attempts.delete(key);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
  logActivity(row.id, 'login', 'user', row.id, '');

  res.json({ token: signToken(row), user: getUserById(row.id) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, row.password_hash)) {
    return res.status(400).json({ error: 'Your current password is not correct.' });
  }
  const invalid = validatePassword(next);
  if (invalid) return res.status(400).json({ error: invalid });
  if (current === next) {
    return res.status(400).json({ error: 'The new password must be different.' });
  }

  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
  ).run(hashPassword(next), req.user.id);
  logActivity(req.user.id, 'change-password', 'user', req.user.id, '');

  res.json({ user: getUserById(req.user.id) });
});

module.exports = router;
module.exports.PUBLIC_USER_COLUMNS = PUBLIC_USER_COLUMNS;
