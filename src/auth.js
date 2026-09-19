'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR } = require('./db');

const TOKEN_TTL = process.env.TOKEN_TTL || '12h';

// A stable secret so sessions survive a restart. Generated once if not supplied.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadSecret();

const PUBLIC_USER_COLUMNS =
  'id, username, full_name, role, is_active, must_change_password, created_at, last_login_at';

function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, SECRET, { expiresIn: TOKEN_TTL });
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function getUserById(id) {
  return db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(id);
}

/** Populates req.user when a valid bearer token is present. Never rejects. */
function attachUser(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      const user = getUserById(payload.uid);
      if (user && user.is_active) req.user = user;
    } catch {
      /* invalid or expired token - treated as anonymous */
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in again.' });
  next();
}

/** Route guard: requireRole('admin') or requireRole('admin', 'controller'). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your account does not have access to this action.' });
    }
    next();
  };
}

function logActivity(userId, action, entity, entityId, details = '') {
  db.prepare(
    'INSERT INTO activity_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)'
  ).run(userId ?? null, action, entity, entityId == null ? null : String(entityId), details);
}

/** Minimum password policy, shared by login seeding, user creation and self-service change. */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  return null;
}

module.exports = {
  PUBLIC_USER_COLUMNS,
  attachUser,
  getUserById,
  hashPassword,
  logActivity,
  requireAuth,
  requireRole,
  signToken,
  validatePassword,
  verifyPassword,
};
