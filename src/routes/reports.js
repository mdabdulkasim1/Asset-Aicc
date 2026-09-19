'use strict';

const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

router.get('/summary', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total_assets,
              COALESCE(SUM(purchase_cost), 0) AS total_cost,
              COALESCE(SUM(quantity), 0) AS total_quantity,
              SUM(CASE WHEN label_printed_at IS NULL THEN 1 ELSE 0 END) AS labels_pending
       FROM assets`
    )
    .get();

  const byCompany = db
    .prepare(
      `SELECT c.id, c.code, c.name,
              COUNT(a.id) AS asset_count,
              COALESCE(SUM(a.purchase_cost), 0) AS total_cost
       FROM companies c
       LEFT JOIN assets a ON a.company_id = c.id
       WHERE c.is_active = 1
       GROUP BY c.id
       ORDER BY asset_count DESC, c.code`
    )
    .all();

  const byGroup = db
    .prepare(
      `SELECT g.category_group AS name, COUNT(a.id) AS asset_count,
              COALESCE(SUM(a.purchase_cost), 0) AS total_cost
       FROM categories g
       JOIN assets a ON a.category_id = g.id
       GROUP BY g.category_group
       ORDER BY asset_count DESC`
    )
    .all();

  const byCategory = db
    .prepare(
      `SELECT g.id, g.code, g.name, g.category_group, COUNT(a.id) AS asset_count,
              COALESCE(SUM(a.purchase_cost), 0) AS total_cost
       FROM categories g
       JOIN assets a ON a.category_id = g.id
       GROUP BY g.id
       ORDER BY asset_count DESC
       LIMIT 15`
    )
    .all();

  const byStatus = db
    .prepare('SELECT status AS name, COUNT(*) AS asset_count FROM assets GROUP BY status ORDER BY asset_count DESC')
    .all();

  const byCondition = db
    .prepare('SELECT condition AS name, COUNT(*) AS asset_count FROM assets GROUP BY condition ORDER BY asset_count DESC')
    .all();

  // A company x category grid - the view an owner usually wants on one screen.
  const grid = db
    .prepare(
      `SELECT c.code AS company_code, g.category_group, COUNT(a.id) AS asset_count
       FROM assets a
       JOIN companies c ON c.id = a.company_id
       JOIN categories g ON g.id = a.category_id
       GROUP BY c.code, g.category_group`
    )
    .all();

  const byMonth = db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS asset_count
       FROM assets
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`
    )
    .all()
    .reverse();

  const recent = db
    .prepare(
      `SELECT a.id, a.s_no, a.asset_code, a.name, a.created_at,
              c.code AS company_code, g.name AS category_name, u.username AS created_by_name
       FROM assets a
       JOIN companies c ON c.id = a.company_id
       JOIN categories g ON g.id = a.category_id
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.id DESC LIMIT 10`
    )
    .all();

  const warrantyExpiring = db
    .prepare(
      `SELECT a.id, a.asset_code, a.name, a.warranty_expiry, c.code AS company_code
       FROM assets a JOIN companies c ON c.id = a.company_id
       WHERE a.warranty_expiry IS NOT NULL
         AND a.warranty_expiry >= date('now')
         AND a.warranty_expiry <= date('now', '+60 days')
       ORDER BY a.warranty_expiry LIMIT 10`
    )
    .all();

  res.json({
    totals,
    by_company: byCompany,
    by_group: byGroup,
    by_category: byCategory,
    by_status: byStatus,
    by_condition: byCondition,
    grid,
    by_month: byMonth,
    recent,
    warranty_expiring: warrantyExpiring,
  });
});

router.get('/activity', requireRole('admin', 'owner'), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = db
    .prepare(
      `SELECT l.*, u.username
       FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(limit);
  res.json({ activity: rows });
});

module.exports = router;
