'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const express = require('express');

const { DATA_DIR, DB_FILE, STORAGE } = require('./src/db');
const { attachUser, requireAuth } = require('./src/auth');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const masters = require('./src/routes/masters');
const assetRoutes = require('./src/routes/assets');
const reportRoutes = require('./src/routes/reports');

/**
 * Serves over https when a certificate is available, because browsers only
 * offer "Install app" and offline use on a secure address. Run
 * `npm run make-cert` to create one, or point SSL_KEY / SSL_CERT at your own.
 */
function tlsOptions() {
  const keyFile = process.env.SSL_KEY || path.join(DATA_DIR, 'key.pem');
  const certFile = process.env.SSL_CERT || path.join(DATA_DIR, 'cert.pem');
  try {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  } catch (error) {
    if (process.env.SSL_KEY || process.env.SSL_CERT) {
      console.error(`Could not read the certificate (${error.message}). Starting without https.`);
    }
    return null;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const tls = tlsOptions();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/companies', requireAuth, masters.companies);
app.use('/api/categories', requireAuth, masters.categories);
app.use('/api/assets', requireAuth, assetRoutes);
app.use('/api/reports', requireAuth, reportRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// Hands out the public certificate so a phone can install it as trusted. A
// certificate is public by design - only the key beside it is a secret, and
// that is never served. Without this, a browser refuses to install the app or
// keep it working offline, because a certificate it was only told to ignore
// does not count as secure.
if (tls) {
  app.get('/cert.pem', (_req, res) => {
    res.type('application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="asset-register.crt"');
    res.send(tls.cert);
  });
}

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders(res, filePath) {
      const name = path.basename(filePath);
      // The worker and the page itself are re-checked every time, or a browser
      // would keep serving an old version of the app after an update.
      if (name === 'sw.js' || name === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}icons${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    },
  })
);
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'That value is already used by another record.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/** The addresses other computers in the office should type in. */
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

const scheme = tls ? 'https' : 'http';
const server = tls ? https.createServer(tls, app) : http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Asset register is running.');
  console.log(`    On this computer      : ${scheme}://localhost:${PORT}`);

  const addresses = lanAddresses();
  if (addresses.length && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    addresses.forEach((address, index) => {
      const label = index === 0 ? 'From other computers  ' : '                      ';
      console.log(`    ${label}: ${scheme}://${address}:${PORT}`);
    });
  } else if (!addresses.length) {
    console.log('    (no office network found - only this computer can open it)');
  }
  if (!tls) {
    console.log('');
    console.log('    Tip: run "npm run make-cert" to serve this over https, which is what');
    console.log('         phones need before they will install it as an app.');
  }
  const megabytes = (STORAGE.db_size_bytes / 1024 / 1024).toFixed(2);
  console.log('');
  console.log(`  Data     : ${DB_FILE}`);
  console.log(
    `             ${STORAGE.db_exists ? `existing register, ${megabytes} MB` : 'new, empty register'}` +
      (STORAGE.volume_mount ? ` on the disk mounted at ${STORAGE.volume_mount}` : '')
  );

  if (!STORAGE.persistent) {
    console.log('');
    console.log('  !! THIS FOLDER IS NOT ON A MOUNTED DISK.');
    console.log('  !! Everything entered will be lost the next time this container restarts.');
    console.log('  !! Mount a volume, and either mount it here or point DATA_DIR at it.');
  } else if (!STORAGE.writable) {
    console.log('');
    console.log('  !! This folder cannot be written to, so nothing can be saved.');
  }

  console.log('');
  console.log('  Keep this window open. Closing it stops the register.');
  console.log('');
});
