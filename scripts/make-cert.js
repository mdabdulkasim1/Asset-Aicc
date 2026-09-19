'use strict';

/**
 * Makes a certificate so the register can be served over https on the office
 * network. Browsers only offer "Install app", and only allow offline use, on a
 * secure address - plain http works everywhere else, but not for those two.
 *
 *   npm run make-cert
 *   npm run make-cert -- assets.office.local 192.168.1.25
 *
 * The certificate signs itself, so each device shows a one-time warning the
 * first time (or install the file on the device to remove it for good).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');
const { DATA_DIR } = require('../src/db');

const extra = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// iPhones and Macs refuse a TLS certificate that lasts longer than 398 days,
// so this one runs just under that and is renewed by running the tool again.
const DAYS = 397;

function lanAddresses() {
  const found = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const entry of interfaces[name] || []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

const isIp = (value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value);

const hosts = ['localhost', os.hostname(), `${os.hostname()}.local`, ...extra.filter((v) => !isIp(v))];
const ips = ['127.0.0.1', ...lanAddresses(), ...extra.filter(isIp)];

const altNames = [
  ...[...new Set(hosts)].map((value) => ({ type: 2, value })), // DNS
  ...[...new Set(ips)].map((ip) => ({ type: 7, ip })), // IP
];

// selfsigned 5 hands back a promise.
Promise.resolve(
  selfsigned.generate([{ name: 'commonName', value: hosts[0] }], {
    // selfsigned 5 takes an end date; its `days` option is ignored.
    notAfterDate: new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000),
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  })
)
  .then((pems) => {
    const keyFile = path.join(DATA_DIR, 'key.pem');
    const certFile = path.join(DATA_DIR, 'cert.pem');

    fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
    fs.writeFileSync(certFile, pems.cert);

    console.log('----------------------------------------------------------');
    console.log(' Certificate created');
    console.log(`   key  : ${keyFile}`);
    console.log(`   cert : ${certFile}`);
    console.log(`   valid: ${DAYS} days (run this again to renew)`);
    console.log('   good for:');
    [...new Set(hosts)].forEach((h) => console.log(`     https://${h}`));
    [...new Set(ips)].forEach((ip) => console.log(`     https://${ip}`));
    console.log('');
    console.log(' Start the register again and it will pick these up by itself.');
    console.log('');
    console.log(' To install the register as an app on a phone, that phone must trust this');
    console.log(' certificate: open https://<this computer>:<port>/cert.pem on the device and');
    console.log(' install it. Simply clicking past the warning is not enough for installing.');
    console.log('----------------------------------------------------------');
  })
  .catch((error) => {
    console.error('Could not make the certificate:', error.message);
    process.exit(1);
  });
