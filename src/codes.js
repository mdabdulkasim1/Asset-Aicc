'use strict';

const { db } = require('./db');

const SEQ_PAD = 4; // AICC-COM-0001

function pad(n) {
  return String(n).padStart(SEQ_PAD, '0');
}

function format(companyCode, categoryCode, seq) {
  return `${companyCode.toUpperCase()}-${categoryCode.toUpperCase()}-${pad(seq)}`;
}

function currentSeq(companyId, categoryId) {
  const row = db
    .prepare('SELECT next_seq FROM code_counters WHERE company_id = ? AND category_id = ?')
    .get(companyId, categoryId);
  return row ? row.next_seq : 1;
}

/**
 * Shows the code the next saved asset would get, without consuming it.
 * Two controllers previewing at once can see the same code; allocate() is what
 * decides, so the second one saved simply gets the following number.
 */
function previewCode(company, category) {
  return format(company.code, category.code, currentSeq(company.id, category.id));
}

/**
 * Consumes and returns the next free code for a company + category pair.
 * Must run inside the caller's transaction so the counter cannot be handed
 * to two assets at once. Codes already taken (e.g. by an import) are skipped.
 */
function allocateCode(company, category) {
  const exists = db.prepare('SELECT 1 FROM assets WHERE asset_code = ?');
  let seq = currentSeq(company.id, category.id);
  let code = format(company.code, category.code, seq);
  while (exists.get(code)) {
    seq += 1;
    code = format(company.code, category.code, seq);
  }
  db.prepare(
    `INSERT INTO code_counters (company_id, category_id, next_seq) VALUES (?, ?, ?)
     ON CONFLICT (company_id, category_id) DO UPDATE SET next_seq = excluded.next_seq`
  ).run(company.id, category.id, seq + 1);
  return code;
}

/** The running S.NO shown in the register - one sequence for the whole group. */
function nextSerialNo() {
  const row = db.prepare('SELECT MAX(s_no) AS max_s FROM assets').get();
  return (row.max_s || 0) + 1;
}

module.exports = { allocateCode, nextSerialNo, previewCode };
