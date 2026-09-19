'use strict';

/**
 * Makes a safe copy of the register, even while it is running and in use.
 *
 *   npm run backup                      copy into ./backups
 *   npm run backup -- D:\\AssetBackups   copy into a folder of your choice
 *   npm run backup -- /mnt/usb --keep 30
 *
 * It uses SQLite's own backup, so the copy is always a complete database -
 * never a half-written file, which is the risk of copying it by hand.
 */

const fs = require('fs');
const path = require('path');
const { db, DB_FILE } = require('../src/db');

const argv = process.argv.slice(2);
const keepIndex = argv.indexOf('--keep');
const keep = keepIndex === -1 ? 30 : Number(argv[keepIndex + 1]);
const target = argv.find((a, i) => !a.startsWith('--') && i !== keepIndex + 1) ||
  path.join(__dirname, '..', 'backups');

if (!Number.isInteger(keep) || keep < 1) {
  console.error('--keep needs a whole number of copies to hold on to, e.g. --keep 30');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });

const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace('T', '-')
  .replace(':', '');
const file = path.join(target, `assets-${stamp}.db`);

db.backup(file)
  .then(() => {
    const size = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
    console.log(`Backed up ${DB_FILE}`);
    console.log(`        -> ${file}  (${size} MB)`);

    // Keep the newest copies, drop the rest.
    const old = fs
      .readdirSync(target)
      .filter((name) => /^assets-.*\.db$/.test(name))
      .sort()
      .reverse()
      .slice(keep);

    for (const name of old) {
      fs.unlinkSync(path.join(target, name));
      console.log(`Removed old backup ${name}`);
    }
  })
  .catch((error) => {
    console.error('Backup failed:', error.message);
    process.exit(1);
  });
