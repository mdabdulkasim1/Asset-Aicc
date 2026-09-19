'use strict';

const express = require('express');
const { db } = require('../db');
const { logActivity, requireRole } = require('../auth');
const { allocateCode, nextSerialNo, previewCode } = require('../codes');

const router = express.Router();

const STATUSES = ['In Use', 'In Store', 'Under Repair', 'Disposed', 'Lost'];
const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];
const SORTABLE = {
  s_no: 'a.s_no',
  asset_code: 'a.asset_code',
  name: 'a.name',
  company: 'c.code',
  category: 'g.code',
  unique_no: 'a.unique_no',
  current_user: 'a.current_user',
  purchase_date: 'a.purchase_date',
  purchase_cost: 'a.purchase_cost',
  created_at: 'a.created_at',
};

const SELECT_ASSET = `
  SELECT a.*, c.code AS company_code, c.name AS company_name,
         g.code AS category_code, g.name AS category_name, g.category_group,
         cu.username AS created_by_name, uu.username AS updated_by_name
  FROM assets a
  JOIN companies c   ON c.id = a.company_id
  JOIN categories g  ON g.id = a.category_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users uu ON uu.id = a.updated_by
`;

const canEdit = requireRole('admin', 'controller');

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Reads asset fields from the request body, returning { values } or { error }. */
function readAssetBody(body, { partial = false } = {}) {
  const values = {};
  const text = (key, max = 200) => {
    if (body[key] === undefined) return null;
    const v = String(body[key]).trim();
    if (v.length > max) return `${key.replace(/_/g, ' ')} is too long (max ${max} characters).`;
    values[key] = v;
    return null;
  };

  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Enter what the asset is, e.g. "Dell 24 inch Monitor".' };
    if (name.length > 200) return { error: 'Asset name is too long (max 200 characters).' };
    values.name = name;
  }

  for (const [key, max] of [
    ['unique_no', 60],
    ['brand', 100],
    ['model', 100],
    ['serial_number', 100],
    ['unit', 20],
    ['vendor', 150],
    ['invoice_no', 80],
    ['handover_to', 150],
    ['current_user', 150],
    ['department', 100],
    ['location', 150],
    ['remarks', 1000],
  ]) {
    const err = text(key, max);
    if (err) return { error: err };
  }

  if (body.quantity !== undefined) {
    const qty = Number(String(body.quantity).trim() || 1);
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: 'Quantity must be a whole number of 1 or more.' };
    }
    values.quantity = qty;
  }

  for (const key of ['purchase_date', 'warranty_expiry', 'handover_date']) {
    if (body[key] === undefined) continue;
    const raw = String(body[key] || '').trim();
    if (!raw) {
      values[key] = null;
    } else if (!isDate(raw)) {
      return { error: `Enter ${key.replace(/_/g, ' ')} as a valid date.` };
    } else {
      values[key] = raw;
    }
  }
  if (!partial && !values.purchase_date) {
    return { error: 'Enter the purchase date.' };
  }

  if (body.purchase_cost !== undefined) {
    const raw = String(body.purchase_cost ?? '').trim();
    if (!raw) {
      values.purchase_cost = null;
    } else {
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        return { error: 'Purchase cost must be a positive number.' };
      }
      values.purchase_cost = num;
    }
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: 'Choose a valid status.' };
    values.status = body.status;
  }
  if (body.condition !== undefined) {
    if (!CONDITIONS.includes(body.condition)) return { error: 'Choose a valid condition.' };
    values.condition = body.condition;
  }

  return { values };
}

/** Friendly duplicate message instead of a raw SQLite constraint error. */
function uniqueNoTaken(uniqueNo, exceptId = null) {
  if (!uniqueNo) return null;
  const row = db
    .prepare('SELECT asset_code FROM assets WHERE unique_no = ? AND id IS NOT ?')
    .get(uniqueNo, exceptId);
  return row ? `Unique No "${uniqueNo}" is already on asset ${row.asset_code}.` : null;
}

function lookupPair(companyId, categoryId) {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(Number(companyId));
  if (!company) return { error: 'Choose which company the asset belongs to.' };
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(categoryId));
  if (!category) return { error: 'Choose an asset category.' };
  return { company, category };
}

/** Shared WHERE builder for the list, the CSV export and the totals. */
function buildFilter(query) {
  const where = [];
  const params = [];

  const search = String(query.search || '').trim();
  if (search) {
    where.push(`(a.asset_code LIKE ? OR a.name LIKE ? OR a.unique_no LIKE ?
                 OR a.serial_number LIKE ? OR a.brand LIKE ? OR a.model LIKE ?
                 OR a.location LIKE ? OR a.handover_to LIKE ? OR a.current_user LIKE ?
                 OR a.department LIKE ? OR CAST(a.s_no AS TEXT) = ?)`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like, like, like, search);
  }
  if (query.company_id) {
    where.push('a.company_id = ?');
    params.push(Number(query.company_id));
  }
  if (query.category_id) {
    where.push('a.category_id = ?');
    params.push(Number(query.category_id));
  }
  if (query.status) {
    where.push('a.status = ?');
    params.push(String(query.status));
  }
  if (query.condition) {
    where.push('a.condition = ?');
    params.push(String(query.condition));
  }
  if (query.from) {
    where.push('a.purchase_date >= ?');
    params.push(String(query.from));
  }
  if (query.to) {
    where.push('a.purchase_date <= ?');
    params.push(String(query.to));
  }
  if (query.unlabelled === '1') where.push('a.label_printed_at IS NULL');

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/meta', (_req, res) => {
  res.json({ statuses: STATUSES, conditions: CONDITIONS });
});

router.get('/', (req, res) => {
  const { clause, params } = buildFilter(req.query);
  const sortKey = SORTABLE[req.query.sort] ? req.query.sort : 's_no';
  const direction = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageSize = Math.min(Math.max(Number(req.query.page_size) || 25, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(a.purchase_cost), 0) AS total_cost
       FROM assets a JOIN companies c ON c.id = a.company_id
       JOIN categories g ON g.id = a.category_id ${clause}`
    )
    .get(...params);

  const rows = db
    .prepare(
      `${SELECT_ASSET} ${clause} ORDER BY ${SORTABLE[sortKey]} ${direction} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  res.json({
    assets: rows,
    page,
    page_size: pageSize,
    total: totals.total,
    total_cost: totals.total_cost,
    pages: Math.max(Math.ceil(totals.total / pageSize), 1),
  });
});

router.get('/export.csv', (req, res) => {
  const { clause, params } = buildFilter(req.query);
  const rows = db.prepare(`${SELECT_ASSET} ${clause} ORDER BY a.s_no`).all(...params);

  const columns = [
    ['s_no', 'S.NO'],
    ['asset_code', 'Asset Code'],
    ['company_code', 'Belongs To'],
    ['category_group', 'Category Group'],
    ['category_name', 'Category'],
    ['name', 'Name of Asset'],
    ['unique_no', 'Unique No'],
    ['brand', 'Brand'],
    ['model', 'Model'],
    ['serial_number', 'Serial Number'],
    ['quantity', 'Qty'],
    ['unit', 'Unit'],
    ['purchase_date', 'Date of Purchase'],
    ['purchase_cost', 'Purchase Cost'],
    ['vendor', 'Vendor'],
    ['invoice_no', 'Invoice No'],
    ['warranty_expiry', 'Warranty Expiry'],
    ['handover_to', 'Handover To'],
    ['handover_date', 'Handover Date'],
    ['current_user', 'Currently Used By'],
    ['department', 'Department'],
    ['location', 'Location'],
    ['condition', 'Condition'],
    ['status', 'Status'],
    ['remarks', 'Remarks'],
    ['created_by_name', 'Entered By'],
    ['created_at', 'Entered On'],
  ];

  const escape = (value) => {
    const s = value == null ? '' : String(value);
    // Stop spreadsheets from treating a leading =, +, - or @ as a formula.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const lines = [columns.map(([, label]) => escape(label)).join(',')];
  for (const row of rows) lines.push(columns.map(([key]) => escape(row[key])).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="assets-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(`﻿${lines.join('\r\n')}\r\n`);
});

router.post('/preview-code', canEdit, (req, res) => {
  const pair = lookupPair(req.body.company_id, req.body.category_id);
  if (pair.error) return res.status(400).json({ error: pair.error });
  res.json({ code: previewCode(pair.company, pair.category), s_no: nextSerialNo() });
});

router.get('/by-code/:code', (req, res) => {
  const asset = db
    .prepare(`${SELECT_ASSET} WHERE a.asset_code = ?`)
    .get(String(req.params.code).trim());
  if (!asset) return res.status(404).json({ error: 'No asset found with that code.' });
  res.json({ asset });
});

router.get('/:id', (req, res) => {
  const asset = db.prepare(`${SELECT_ASSET} WHERE a.id = ?`).get(Number(req.params.id));
  if (!asset) return res.status(404).json({ error: 'Asset not found.' });
  res.json({ asset });
});

router.post('/', canEdit, (req, res) => {
  const pair = lookupPair(req.body.company_id, req.body.category_id);
  if (pair.error) return res.status(400).json({ error: pair.error });

  const parsed = readAssetBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const v = parsed.values;
  const duplicate = uniqueNoTaken(v.unique_no);
  if (duplicate) return res.status(409).json({ error: duplicate });
  const create = db.transaction(() => {
    const assetCode = allocateCode(pair.company, pair.category);
    const info = db
      .prepare(
        `INSERT INTO assets
           (s_no, asset_code, company_id, category_id, name, unique_no, brand, model,
            serial_number, quantity, unit, purchase_date, purchase_cost, vendor, invoice_no,
            warranty_expiry, handover_to, handover_date, current_user, department, location,
            condition, status, remarks, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nextSerialNo(),
        assetCode,
        pair.company.id,
        pair.category.id,
        v.name,
        v.unique_no || '',
        v.brand || '',
        v.model || '',
        v.serial_number || '',
        v.quantity || 1,
        v.unit || 'Nos',
        v.purchase_date,
        v.purchase_cost ?? null,
        v.vendor || '',
        v.invoice_no || '',
        v.warranty_expiry ?? null,
        v.handover_to || '',
        v.handover_date ?? null,
        v.current_user || '',
        v.department || '',
        v.location || '',
        v.condition || 'Good',
        v.status || 'In Use',
        v.remarks || '',
        req.user.id,
        req.user.id
      );
    return { id: info.lastInsertRowid, assetCode };
  });

  const { id, assetCode } = create();
  logActivity(req.user.id, 'create', 'asset', id, assetCode);
  res.status(201).json({ asset: db.prepare(`${SELECT_ASSET} WHERE a.id = ?`).get(id) });
});

router.patch('/:id', canEdit, (req, res) => {
  const id = Number(req.params.id);
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  if (!asset) return res.status(404).json({ error: 'Asset not found.' });

  const parsed = readAssetBody(req.body, { partial: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const fields = parsed.values;

  if (fields.unique_no !== undefined) {
    const duplicate = uniqueNoTaken(fields.unique_no, id);
    if (duplicate) return res.status(409).json({ error: duplicate });
  }

  // The code is already on a printed sticker, so the company and category that
  // make it up stay fixed. Admins can move an asset; the code travels with it.
  if (req.body.company_id !== undefined || req.body.category_id !== undefined) {
    const pair = lookupPair(
      req.body.company_id ?? asset.company_id,
      req.body.category_id ?? asset.category_id
    );
    if (pair.error) return res.status(400).json({ error: pair.error });
    if (pair.company.id !== asset.company_id || pair.category.id !== asset.category_id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Only the admin can move an asset to another company or category.',
        });
      }
      fields.company_id = pair.company.id;
      fields.category_id = pair.category.id;
    }
  }

  const keys = Object.keys(fields);
  if (keys.length) {
    db.prepare(
      `UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')},
       updated_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(...keys.map((k) => fields[k]), req.user.id, id);
    logActivity(req.user.id, 'update', 'asset', id, `${asset.asset_code}: ${keys.join(', ')}`);
  }

  res.json({ asset: db.prepare(`${SELECT_ASSET} WHERE a.id = ?`).get(id) });
});

router.post('/:id/verify', canEdit, (req, res) => {
  const id = Number(req.params.id);
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  if (!asset) return res.status(404).json({ error: 'Asset not found.' });

  db.prepare(
    "UPDATE assets SET last_verified_at = datetime('now'), last_verified_by = ? WHERE id = ?"
  ).run(req.user.id, id);
  logActivity(req.user.id, 'verify', 'asset', id, asset.asset_code);

  res.json({ asset: db.prepare(`${SELECT_ASSET} WHERE a.id = ?`).get(id) });
});

router.post('/mark-printed', canEdit, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'No assets selected.' });

  const update = db.prepare("UPDATE assets SET label_printed_at = datetime('now') WHERE id = ?");
  db.transaction(() => ids.forEach((id) => update.run(id)))();
  logActivity(req.user.id, 'print-label', 'asset', null, `${ids.length} label(s)`);

  res.json({ ok: true, count: ids.length });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  if (!asset) return res.status(404).json({ error: 'Asset not found.' });

  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  logActivity(req.user.id, 'delete', 'asset', id, asset.asset_code);
  res.json({ ok: true });
});

module.exports = router;
