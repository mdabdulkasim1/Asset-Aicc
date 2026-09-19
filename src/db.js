'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { describeStorage, resolveDataDir } = require('./storage');

const resolved = resolveDataDir();
const DATA_DIR = resolved.dir;
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'assets.db');

resolved.notes.forEach((note) => console.warn(` ! ${note}`));

fs.mkdirSync(DATA_DIR, { recursive: true });

const STORAGE = describeStorage(DATA_DIR, DB_FILE);

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name            TEXT NOT NULL DEFAULT '',
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('admin','owner','controller')),
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at        TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  category_group TEXT NOT NULL DEFAULT 'General',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One running number per company + category pair, so asset codes never collide.
CREATE TABLE IF NOT EXISTS code_counters (
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  next_seq    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, category_id)
);

CREATE TABLE IF NOT EXISTS assets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  s_no             INTEGER NOT NULL UNIQUE,
  asset_code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  company_id       INTEGER NOT NULL REFERENCES companies(id),
  category_id      INTEGER NOT NULL REFERENCES categories(id),
  name             TEXT NOT NULL,
  unique_no        TEXT NOT NULL DEFAULT '',
  brand            TEXT NOT NULL DEFAULT '',
  model            TEXT NOT NULL DEFAULT '',
  serial_number    TEXT NOT NULL DEFAULT '',
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit             TEXT NOT NULL DEFAULT 'Nos',
  purchase_date    TEXT,
  purchase_cost    REAL,
  vendor           TEXT NOT NULL DEFAULT '',
  invoice_no       TEXT NOT NULL DEFAULT '',
  warranty_expiry  TEXT,
  handover_to      TEXT NOT NULL DEFAULT '',
  handover_date    TEXT,
  current_user     TEXT NOT NULL DEFAULT '',
  department       TEXT NOT NULL DEFAULT '',
  location         TEXT NOT NULL DEFAULT '',
  condition        TEXT NOT NULL DEFAULT 'Good',
  status           TEXT NOT NULL DEFAULT 'In Use',
  remarks          TEXT NOT NULL DEFAULT '',
  label_printed_at TEXT,
  last_verified_at TEXT,
  last_verified_by INTEGER REFERENCES users(id),
  created_by       INTEGER REFERENCES users(id),
  updated_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_company  ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_status   ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_serial   ON assets(serial_number);
-- A blank unique number is allowed on many rows; a filled one must be one of a kind.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_unique_no
  ON assets(unique_no) WHERE unique_no <> '';

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
`);

/** Adds a column to an existing database that was created by an older version. */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('categories', 'category_group', "TEXT NOT NULL DEFAULT 'General'");
for (const [column, definition] of [
  ['unique_no', "TEXT NOT NULL DEFAULT ''"],
  ['quantity', 'INTEGER NOT NULL DEFAULT 1'],
  ['unit', "TEXT NOT NULL DEFAULT 'Nos'"],
  ['handover_to', "TEXT NOT NULL DEFAULT ''"],
  ['handover_date', 'TEXT'],
  ['current_user', "TEXT NOT NULL DEFAULT ''"],
  ['department', "TEXT NOT NULL DEFAULT ''"],
]) {
  ensureColumn('assets', column, definition);
}

const DEFAULT_COMPANIES = [
  ['AICC', 'AICC'],
  ['AKB', 'AKB'],
  ['AKR', 'AKR'],
  ['OTHER', 'Other / Unassigned'],
];

// [code, name, group] - the code becomes the middle part of every asset code.
const DEFAULT_CATEGORIES = [
  // IT and electronics
  ['LAP', 'Laptop', 'IT & Electronics'],
  ['DSK', 'Desktop Computer', 'IT & Electronics'],
  ['CPU', 'CPU / System Unit', 'IT & Electronics'],
  ['MON', 'Monitor', 'IT & Electronics'],
  ['KBM', 'Keyboard & Mouse', 'IT & Electronics'],
  ['MOB', 'Mobile Phone', 'IT & Electronics'],
  ['TAB', 'Tablet / iPad', 'IT & Electronics'],
  ['PRN', 'Printer', 'IT & Electronics'],
  ['SCN', 'Scanner', 'IT & Electronics'],
  ['XER', 'Photocopier', 'IT & Electronics'],
  ['SRV', 'Server', 'IT & Electronics'],
  ['NET', 'Network Equipment (Router / Switch)', 'IT & Electronics'],
  ['UPS', 'UPS / Power Backup', 'IT & Electronics'],
  ['CAM', 'CCTV / Camera', 'IT & Electronics'],
  ['PRJ', 'Projector', 'IT & Electronics'],
  ['TEL', 'Telephone / Intercom', 'IT & Electronics'],
  ['BIO', 'Biometric / Access Control', 'IT & Electronics'],
  ['SFT', 'Software Licence', 'IT & Electronics'],

  // Furniture and fixtures
  ['CHR', 'Chair', 'Furniture & Fixtures'],
  ['TBL', 'Table / Desk', 'Furniture & Fixtures'],
  ['CAB', 'Cabinet / Cupboard', 'Furniture & Fixtures'],
  ['ALM', 'Almirah / Steel Locker', 'Furniture & Fixtures'],
  ['RCK', 'Rack / Shelving', 'Furniture & Fixtures'],
  ['SOF', 'Sofa / Reception Seating', 'Furniture & Fixtures'],
  ['BED', 'Bed / Bunk (Hostel, Camp)', 'Furniture & Fixtures'],
  ['DIN', 'Dining Table / Canteen Furniture', 'Furniture & Fixtures'],
  ['PRT', 'Partition / Workstation', 'Furniture & Fixtures'],
  ['SAFE', 'Safe / Cash Box', 'Furniture & Fixtures'],
  ['EXD', 'Executive Desk', 'Furniture & Fixtures'],
  ['CFT', 'Conference / Meeting Table', 'Furniture & Fixtures'],
  ['RCP', 'Reception Counter', 'Furniture & Fixtures'],
  ['ECH', 'Executive / Revolving Chair', 'Furniture & Fixtures'],
  ['VCH', 'Visitor / Guest Chair', 'Furniture & Fixtures'],
  ['STL', 'Stool', 'Furniture & Fixtures'],
  ['CTB', 'Centre / Coffee Table', 'Furniture & Fixtures'],
  ['SDT', 'Side / Corner Table', 'Furniture & Fixtures'],
  ['FIL', 'Filing Cabinet', 'Furniture & Fixtures'],
  ['PED', 'Pedestal / Drawer Unit', 'Furniture & Fixtures'],
  ['DSP', 'Display / Showcase Unit', 'Furniture & Fixtures'],
  ['KEY', 'Key Cabinet', 'Furniture & Fixtures'],
  ['CST', 'Coat / Umbrella Stand', 'Furniture & Fixtures'],
  ['SHR', 'Shoe Rack', 'Furniture & Fixtures'],
  ['BLD', 'Curtain / Blinds', 'Furniture & Fixtures'],
  ['CRP', 'Carpet / Floor Mat', 'Furniture & Fixtures'],

  // School and education
  ['SDK', 'Student Desk / Bench', 'School & Education'],
  ['TTB', 'Teacher Table & Chair', 'School & Education'],
  ['BRD', 'Black Board / White Board', 'School & Education'],
  ['SMB', 'Smart Board / Interactive Panel', 'School & Education'],
  ['NTB', 'Notice / Display Board', 'School & Education'],
  ['BSF', 'Book Shelf', 'School & Education'],
  ['LIB', 'Library Books & Media', 'School & Education'],
  ['LAB', 'Laboratory Equipment', 'School & Education'],
  ['LBF', 'Laboratory Furniture', 'School & Education'],
  ['SPT', 'Sports Equipment', 'School & Education'],
  ['PLY', 'Playground Equipment', 'School & Education'],
  ['MUS', 'Musical Instrument', 'School & Education'],
  ['AUD', 'Audio / PA System', 'School & Education'],
  ['MED', 'First Aid / Medical Equipment', 'School & Education'],
  ['UNI', 'Uniform & Stationery Stock', 'School & Education'],

  // Construction site
  ['EXC', 'Excavator', 'Construction Plant & Tools'],
  ['JCB', 'Backhoe Loader / JCB', 'Construction Plant & Tools'],
  ['CRN', 'Crane / Hoist', 'Construction Plant & Tools'],
  ['FRK', 'Forklift', 'Construction Plant & Tools'],
  ['ROL', 'Road Roller / Compactor', 'Construction Plant & Tools'],
  ['MIX', 'Concrete Mixer / Batching Plant', 'Construction Plant & Tools'],
  ['VIB', 'Concrete Vibrator', 'Construction Plant & Tools'],
  ['GEN', 'Generator / DG Set', 'Construction Plant & Tools'],
  ['CMP', 'Air Compressor', 'Construction Plant & Tools'],
  ['WLD', 'Welding Machine', 'Construction Plant & Tools'],
  ['CUT', 'Cutting / Grinding Machine', 'Construction Plant & Tools'],
  ['DRL', 'Drilling Machine', 'Construction Plant & Tools'],
  ['PMP', 'Water Pump / Dewatering Pump', 'Construction Plant & Tools'],
  ['PTL', 'Power Tools', 'Construction Plant & Tools'],
  ['HTL', 'Hand Tools', 'Construction Plant & Tools'],
  ['SCF', 'Scaffolding & Props', 'Construction Plant & Tools'],
  ['FRM', 'Formwork / Shuttering', 'Construction Plant & Tools'],
  ['LFT', 'Lifting Tackle / Chain Block', 'Construction Plant & Tools'],
  ['SUR', 'Survey Instrument (Total Station, Level)', 'Construction Plant & Tools'],
  ['TST', 'Testing Instrument', 'Construction Plant & Tools'],
  ['SAF', 'Safety Equipment / PPE', 'Construction Plant & Tools'],
  ['LAD', 'Ladder / Work Platform', 'Construction Plant & Tools'],
  ['CNT', 'Site Cabin / Container', 'Construction Plant & Tools'],
  ['TNK', 'Water Tank / Storage Tank', 'Construction Plant & Tools'],

  // Vehicles
  ['VEH', 'Car / Light Vehicle', 'Vehicles'],
  ['TRK', 'Truck / Tipper', 'Vehicles'],
  ['BUS', 'Bus / School Bus', 'Vehicles'],
  ['VAN', 'Van / Pickup', 'Vehicles'],
  ['BIK', 'Motorcycle', 'Vehicles'],
  ['TRL', 'Trailer', 'Vehicles'],

  // Electrical and utility
  ['ACU', 'Air Conditioner', 'Electrical & Utility'],
  ['FAN', 'Fan / Cooler', 'Electrical & Utility'],
  ['ELC', 'Electrical Fitting / Light', 'Electrical & Utility'],
  ['WTR', 'Water Purifier / Dispenser', 'Electrical & Utility'],
  ['REF', 'Refrigerator / Freezer', 'Electrical & Utility'],
  ['KIT', 'Kitchen / Pantry Equipment', 'Electrical & Utility'],
  ['FIR', 'Fire Extinguisher / Fire Safety', 'Electrical & Utility'],
  ['SOL', 'Solar Panel / Inverter', 'Electrical & Utility'],

  // Fallback
  ['LND', 'Land & Building', 'General'],
  ['OTH', 'Other', 'General'],
];

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

/**
 * Reads the first administrator login from the environment, refusing anything
 * that cannot be typed into the sign-in box. A hosting dashboard makes it easy
 * to paste a whole command line into one variable by mistake; falling back to
 * the default and saying so beats creating an account nobody can sign in to.
 */
function firstAdminLogin() {
  const rawUser = (process.env.ADMIN_USERNAME || '').trim();
  const rawPassword = process.env.ADMIN_PASSWORD || '';
  const warn = [];

  let username = DEFAULT_ADMIN_USERNAME;
  if (rawUser && USERNAME_PATTERN.test(rawUser)) {
    username = rawUser;
  } else if (rawUser) {
    warn.push(
      `ADMIN_USERNAME "${rawUser}" is not a usable username (3-32 letters, numbers, dot, ` +
        `dash or underscore - no spaces), so "${DEFAULT_ADMIN_USERNAME}" was used instead.`
    );
    if (/\s/.test(rawUser)) {
      warn.push('It looks like a whole command was pasted into one variable. Set');
      warn.push('ADMIN_USERNAME and ADMIN_PASSWORD as two separate variables, values only.');
    }
  }

  let password = DEFAULT_ADMIN_PASSWORD;
  if (rawPassword.length >= 6) {
    password = rawPassword;
  } else if (rawPassword) {
    warn.push('ADMIN_PASSWORD is shorter than 6 characters, so the default password was used.');
  }

  if (warn.length) {
    console.warn('----------------------------------------------------------');
    warn.forEach((line) => console.warn(` ! ${line}`));
    console.warn('----------------------------------------------------------');
  }

  return { username, password };
}

function seed() {
  const insCompany = db.prepare('INSERT OR IGNORE INTO companies (code, name) VALUES (?, ?)');
  const insCategory = db.prepare(
    'INSERT OR IGNORE INTO categories (code, name, category_group) VALUES (?, ?, ?)'
  );
  db.transaction(() => {
    for (const [code, name] of DEFAULT_COMPANIES) insCompany.run(code, name);
    for (const [code, name, group] of DEFAULT_CATEGORIES) insCategory.run(code, name, group);
  })();

  const haveAdmin = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (!haveAdmin) {
    const { username, password } = firstAdminLogin();
    db.prepare(
      `INSERT INTO users (username, full_name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, 'admin', ?)`
    ).run(
      username,
      'Administrator',
      bcrypt.hashSync(password, 10),
      password === DEFAULT_ADMIN_PASSWORD ? 1 : 0
    );

    console.log('----------------------------------------------------------');
    console.log(' First run: administrator account created');
    console.log(`   username : ${username}`);
    console.log(`   password : ${password}`);
    if (password === DEFAULT_ADMIN_PASSWORD) {
      console.log('   You will be asked to change this password at first login.');
    }
    console.log('----------------------------------------------------------');
  }
}

seed();

module.exports = { db, DATA_DIR, DB_FILE, STORAGE };
