'use strict';

const express = require('express');
const { db } = require('../db');
const {
  PUBLIC_USER_COLUMNS,
  getUserById,
  hashPassword,
  logActivity,
  requireRole,
  validatePassword,
} = require('../auth');

const router = express.Router();
const ROLES = ['admin', 'owner', 'controller'];

// Only the administrator manages accounts.
router.use(requireRole('admin'));

router.get('/', (_req, res) => {
  const users = db
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS},
              (SELECT COUNT(*) FROM assets a WHERE a.created_by = users.id) AS assets_created
       FROM users ORDER BY role, username`
    )
    .all();
  res.json({ users });
});

router.post('/', (req, res) => {
  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const role = String(req.body.role || 'controller');
  const password = String(req.body.password || '');

  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.',
    });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role.' });
  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  const taken = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (taken) return res.status(409).json({ error: 'That username is already taken.' });

  const info = db
    .prepare(
      `INSERT INTO users (username, full_name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(username, fullName, hashPassword(password), role);
  logActivity(req.user.id, 'create', 'user', info.lastInsertRowid, `${username} (${role})`);

  res.status(201).json({ user: getUserById(info.lastInsertRowid) });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const fields = {};
  if (req.body.full_name !== undefined) fields.full_name = String(req.body.full_name).trim();
  if (req.body.role !== undefined) {
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Unknown role.' });
    fields.role = req.body.role;
  }
  if (req.body.is_active !== undefined) fields.is_active = req.body.is_active ? 1 : 0;

  // Never let the last usable admin lock everyone out.
  const losingAdmin =
    (fields.role && fields.role !== 'admin' && user.role === 'admin') ||
    (fields.is_active === 0 && user.role === 'admin');
  if (losingAdmin) {
    const otherAdmins = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
      .get(id).n;
    if (!otherAdmins) {
      return res.status(400).json({ error: 'This is the last active admin - keep one in place.' });
    }
  }

  const keys = Object.keys(fields);
  if (!keys.length) return res.json({ user });

  db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    id
  );
  logActivity(req.user.id, 'update', 'user', id, keys.join(', '));

  res.json({ user: getUserById(id) });
});

router.post('/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const password = String(req.body.password || '');
  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  // The admin may hand over a password the user keeps, but asking them to
  // choose their own is the default.
  const mustChange = req.body.must_change_password === false ? 0 : 1;

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(
    hashPassword(password),
    mustChange,
    id
  );
  logActivity(req.user.id, 'reset-password', 'user', id, user.username);

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own login.' });

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const created = db.prepare('SELECT COUNT(*) AS n FROM assets WHERE created_by = ?').get(id).n;
  if (created) {
    // Keep the history intact - disable instead of deleting.
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    logActivity(req.user.id, 'disable', 'user', id, user.username);
    return res.json({
      ok: true,
      disabled: true,
      message: `${user.username} has entered ${created} asset(s), so the login was disabled instead of deleted.`,
    });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logActivity(req.user.id, 'delete', 'user', id, user.username);
  res.json({ ok: true, disabled: false });
});

module.exports = router;
