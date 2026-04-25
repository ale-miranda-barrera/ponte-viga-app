// server.js — Backend Express para EC2
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ROOT     = __dirname;

// Crear directorio de datos al iniciar
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '5mb' }));

// CORS (permite acceso desde cualquier origen — es una app personal)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Claves permitidas: "type" o "profileName_type"
// Solo alfanumérico + guión bajo/medio: previene path traversal
const DATA_SUFFIXES = new Set(['sessions', 'measures', 'profile', 'routines']);

function isAllowedKey(key) {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return false;
  const parts = key.split('_');
  return DATA_SUFFIXES.has(parts[parts.length - 1]);
}

app.get('/data/:key.json', (req, res) => {
  if (!isAllowedKey(req.params.key)) return res.status(404).end();
  const file = path.join(DATA_DIR, `${req.params.key}.json`);
  if (!fs.existsSync(file)) return res.status(404).json(null);
  res.sendFile(file);
});

app.put('/data/:key.json', (req, res) => {
  if (!isAllowedKey(req.params.key)) return res.status(403).end();
  const file = path.join(DATA_DIR, `${req.params.key}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('[server] error escribiendo', req.params.key, e.message);
    res.status(500).json({ error: 'write failed' });
  }
});

// Solo se sirven estos dos archivos estáticos — nada más del filesystem
app.get('/sw.js', (req, res) => res.sendFile(path.join(ROOT, 'sw.js')));
app.get('*',      (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, () => {
  console.log(`Ponte Viga → http://localhost:${PORT}`);
  console.log(`Datos  → ${DATA_DIR}`);
});
