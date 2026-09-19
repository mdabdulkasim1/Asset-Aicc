'use strict';

const os = require('os');
const path = require('path');
const express = require('express');

const { attachUser, requireAuth } = require('./src/auth');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const masters = require('./src/routes/masters');
const assetRoutes = require('./src/routes/assets');
const reportRoutes = require('./src/routes/reports');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
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

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Asset register is running.');
  console.log(`    On this computer      : http://localhost:${PORT}`);

  const addresses = lanAddresses();
  if (addresses.length && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    addresses.forEach((address, index) => {
      const label = index === 0 ? 'From other computers  ' : '                      ';
      console.log(`    ${label}: http://${address}:${PORT}`);
    });
  } else if (!addresses.length) {
    console.log('    (no office network found - only this computer can open it)');
  }
  console.log('');
  console.log('  Keep this window open. Closing it stops the register.');
  console.log('');
});
