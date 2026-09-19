'use strict';

/**
 * Sets a new password for a login, for when it has been forgotten.
 * Run it on the computer that holds the database, with the app stopped or running.
 *
 *   npm run reset-password -- admin                 (generates a password)
 *   npm run reset-password -- admin 'MyNewPass123'  (sets the one you choose)
 *   npm run reset-password -- --list                (shows the logins)
 *
 * Options:
 *   --enable   also switch the login back on if it was disabled
 *   --keep     do not ask the user to change it again at next sign-in
 */

const crypto = require('crypto');
const { db, DB_FILE } = require('../src/db');
const { hashPassword, logActivity, validatePassword } = require('../src/auth');

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const words = argv.filter((a) => !a.startsWith('--'));
const has = (flag) => flags.includes(flag);

function listUsers() {
  const users = db.prepare('SELECT username, role, is_active FROM users ORDER BY role, username').all();
  if (!users.length) {
    console.log('There are no logins in this database yet.');
    return;
  }
  console.log(`Logins in ${DB_FILE}:\n`);
  for (const u of users) {
    console.log(`  ${u.username.padEnd(20)} ${u.role.padEnd(12)} ${u.is_active ? '' : '(disabled)'}`);
  }
}

/** Readable but strong: two blocks of letters/digits plus a symbol. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = (n) =>
    Array.from(crypto.randomBytes(n))
      .map((byte) => alphabet[byte % alphabet.length])
      .join('');
  return `${pick(5)}-${pick(5)}`;
}

if (has('--help') || (!words.length && !has('--list'))) {
  console.log(
    [
      'Reset a password for the asset register.',
      '',
      '  npm run reset-password -- <username> [new password]',
      '  npm run reset-password -- --list',
      '',
      'Leave the password out and one is generated for you.',
      'Options: --enable (switch a disabled login back on), --keep (do not force a change at next sign-in)',
    ].join('\n')
  );
  if (!has('--help')) process.exitCode = 1;
  process.exit();
}

if (has('--list')) {
  listUsers();
  process.exit();
}

const [username, given] = words;
const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

if (!user) {
  console.error(`No login called "${username}" in ${DB_FILE}.\n`);
  listUsers();
  process.exit(1);
}

const password = given || generatePassword();
const invalid = validatePassword(password);
if (invalid) {
  console.error(invalid);
  process.exit(1);
}

const fields = ['password_hash = ?', `must_change_password = ${has('--keep') ? 0 : 1}`];
if (has('--enable')) fields.push('is_active = 1');

db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(hashPassword(password), user.id);
logActivity(null, 'reset-password', 'user', user.id, `${user.username} (command line)`);

console.log('----------------------------------------------------------');
console.log(` Password reset for ${user.username} (${user.role})`);
console.log(`   password : ${password}`);
if (!has('--keep')) console.log('   They will be asked to choose their own at next sign-in.');
if (!user.is_active && !has('--enable')) {
  console.log('   Note: this login is disabled. Add --enable to switch it back on.');
}
console.log('----------------------------------------------------------');
if (given) {
  console.log('Tip: leave the password out next time and one is generated, so it stays out of your');
  console.log('shell history.');
}
