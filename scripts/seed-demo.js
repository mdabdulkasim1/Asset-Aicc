'use strict';

/**
 * Loads a handful of sample assets so the screens can be tried out.
 * Run with: npm run seed:demo
 * It refuses to run once real assets exist, unless you pass --force.
 */

const { db } = require('../src/db');
const { allocateCode, nextSerialNo } = require('../src/codes');

const force = process.argv.includes('--force');
const existing = db.prepare('SELECT COUNT(*) AS n FROM assets').get().n;

if (existing && !force) {
  console.log(`The register already holds ${existing} asset(s). Nothing added.`);
  console.log('Run "node scripts/seed-demo.js --force" if you really want the samples too.');
  process.exit(0);
}

const SAMPLES = [
  ['AICC', 'LAP', 'Dell Latitude 3540 Laptop', '2026-02-10', 52000, 'Mr Rahman', 'Accounts Dept', 'Head Office - 2nd floor'],
  ['AICC', 'DSK', 'HP ProDesk 400 Desktop', '2026-02-10', 41000, 'Mr Rahman', 'Accounts Dept', 'Head Office - 2nd floor'],
  ['AICC', 'MON', 'Dell 24 inch Monitor', '2026-02-10', 9500, 'Mr Rahman', 'Accounts Dept', 'Head Office - 2nd floor'],
  ['AICC', 'PRN', 'Canon LBP2900 Printer', '2025-12-01', 14500, 'Ms Fathima', 'Administration', 'Head Office - Reception'],
  ['AICC', 'ACU', 'Voltas 1.5 Ton Split AC', '2025-08-22', 38000, 'Maintenance', 'Administration', 'Head Office - Cabin 1'],
  ['AKB', 'EXC', 'JCB JS140 Excavator', '2024-11-02', 4500000, 'Site Engineer', 'Projects', 'Site 2 - Yard'],
  ['AKB', 'MIX', 'Concrete Mixer 10/7', '2025-01-18', 185000, 'Site Engineer', 'Projects', 'Site 2 - Yard'],
  ['AKB', 'GEN', 'Kirloskar 62.5 kVA DG Set', '2025-03-05', 620000, 'Site Engineer', 'Projects', 'Site 2 - Power room'],
  ['AKB', 'SCF', 'Scaffolding Frame Set', '2025-06-11', 95000, 'Store Keeper', 'Stores', 'Site 2 - Store'],
  ['AKB', 'SUR', 'Leica Total Station', '2025-02-20', 425000, 'Survey Team', 'Projects', 'Site 2 - Survey room'],
  ['AKR', 'SDK', 'Wooden Student Bench 3-seater', '2026-06-15', 4200, 'Head Master', 'School Block A', 'Class 6-B'],
  ['AKR', 'BRD', 'Green Chalk Board 6x4 ft', '2026-06-15', 6800, 'Head Master', 'School Block A', 'Class 6-B'],
  ['AKR', 'SMB', 'Interactive Smart Board 75 inch', '2026-07-01', 168000, 'IT Coordinator', 'School Block B', 'Smart Class 1'],
  ['AKR', 'LAB', 'Physics Lab Apparatus Set', '2026-07-04', 74000, 'Lab Assistant', 'Science Dept', 'Physics Lab'],
  ['AKR', 'BUS', 'School Bus 32 Seater', '2024-05-30', 2250000, 'Transport In-charge', 'Transport', 'School Parking'],
  ['AKR', 'CHR', 'Staff Room Chair', '2026-01-09', 2600, 'Office Assistant', 'Administration', 'Staff Room'],
];

const companyOf = db.prepare('SELECT * FROM companies WHERE code = ?');
const categoryOf = db.prepare('SELECT * FROM categories WHERE code = ?');
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();

const insert = db.prepare(
  `INSERT INTO assets
     (s_no, asset_code, company_id, category_id, name, purchase_date, purchase_cost,
      handover_to, handover_date, current_user, department, location, created_by, updated_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

let added = 0;
db.transaction(function () {
  for (const [companyCode, categoryCode, name, date, cost, person, department, location] of SAMPLES) {
    const company = companyOf.get(companyCode);
    const category = categoryOf.get(categoryCode);
    if (!company || !category) continue;
    const code = allocateCode(company, category);
    insert.run(
      nextSerialNo(),
      code,
      company.id,
      category.id,
      name,
      date,
      cost,
      person,
      date,
      person,
      department,
      location,
      admin ? admin.id : null,
      admin ? admin.id : null
    );
    added += 1;
    console.log(`  ${code}  ${name}`);
  }
})();

console.log(`\nAdded ${added} sample asset(s).`);
