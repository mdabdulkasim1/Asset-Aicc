'use strict';

const express = require('express');
const { db } = require('../db');
const { logActivity, requireRole } = require('../auth');

/**
 * Companies and categories are the same shape (code + name + active flag),
 * so one factory serves both. `assetColumn` is the assets column pointing here.
 */
function masterRouter({ table, entity, assetColumn, codePattern, codeHint, groupColumn }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT t.*,
                (SELECT COUNT(*) FROM assets a WHERE a.${assetColumn} = t.id) AS asset_count
         FROM ${table} t
         ORDER BY t.is_active DESC, ${groupColumn ? `t.${groupColumn}, ` : ''}t.name`
      )
      .all();
    res.json({ [table]: rows });
  });

  router.post('/', requireRole('admin'), (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    if (!codePattern.test(code)) return res.status(400).json({ error: codeHint });
    if (!name) return res.status(400).json({ error: 'Enter a name.' });

    const taken = db.prepare(`SELECT 1 FROM ${table} WHERE code = ?`).get(code);
    if (taken) return res.status(409).json({ error: `The code ${code} is already in use.` });

    const group = groupColumn ? String(req.body[groupColumn] || 'General').trim() || 'General' : null;
    const info = groupColumn
      ? db
          .prepare(`INSERT INTO ${table} (code, name, ${groupColumn}) VALUES (?, ?, ?)`)
          .run(code, name, group)
      : db.prepare(`INSERT INTO ${table} (code, name) VALUES (?, ?)`).run(code, name);
    logActivity(req.user.id, 'create', entity, info.lastInsertRowid, `${code} - ${name}`);
    res.status(201).json({ item: db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid) });
  });

  router.patch('/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'Not found.' });

    const fields = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Enter a name.' });
      fields.name = name;
    }
    if (req.body.is_active !== undefined) fields.is_active = req.body.is_active ? 1 : 0;
    if (groupColumn && req.body[groupColumn] !== undefined) {
      fields[groupColumn] = String(req.body[groupColumn]).trim() || 'General';
    }

    // The code is baked into every asset code already issued, so it is fixed
    // once an asset exists under it.
    if (req.body.code !== undefined) {
      const code = String(req.body.code).trim().toUpperCase();
      if (!codePattern.test(code)) return res.status(400).json({ error: codeHint });
      if (code !== row.code.toUpperCase()) {
        const used = db
          .prepare(`SELECT COUNT(*) AS n FROM assets WHERE ${assetColumn} = ?`)
          .get(id).n;
        if (used) {
          return res.status(400).json({
            error: `${row.code} is already printed on ${used} asset code(s) and can no longer be renamed. Add a new entry instead.`,
          });
        }
        const taken = db.prepare(`SELECT 1 FROM ${table} WHERE code = ? AND id != ?`).get(code, id);
        if (taken) return res.status(409).json({ error: `The code ${code} is already in use.` });
        fields.code = code;
      }
    }

    const keys = Object.keys(fields);
    if (keys.length) {
      db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => fields[k]),
        id
      );
      logActivity(req.user.id, 'update', entity, id, keys.join(', '));
    }
    res.json({ item: db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) });
  });

  router.delete('/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'Not found.' });

    const used = db.prepare(`SELECT COUNT(*) AS n FROM assets WHERE ${assetColumn} = ?`).get(id).n;
    if (used) {
      return res.status(400).json({
        error: `${row.code} is used by ${used} asset(s). Switch it off instead of deleting it.`,
      });
    }
    db.prepare(`DELETE FROM code_counters WHERE ${assetColumn} = ?`).run(id);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    logActivity(req.user.id, 'delete', entity, id, row.code);
    res.json({ ok: true });
  });

  return router;
}

module.exports = {
  companies: masterRouter({
    table: 'companies',
    entity: 'company',
    assetColumn: 'company_id',
    codePattern: /^[A-Z0-9]{2,8}$/,
    codeHint: 'Company code must be 2-8 capital letters or numbers, e.g. AICC.',
  }),
  categories: masterRouter({
    table: 'categories',
    entity: 'category',
    assetColumn: 'category_id',
    codePattern: /^[A-Z0-9]{2,5}$/,
    codeHint: 'Category code must be 2-5 capital letters or numbers, e.g. MON.',
    groupColumn: 'category_group',
  }),
};
