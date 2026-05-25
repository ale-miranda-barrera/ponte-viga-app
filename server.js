// server.js — Servidor Express simple para servir /data/*.json localmente
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data-files');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`✓ Directorio ${DATA_DIR} creado`);
}

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos (index.html, etc)
app.use(express.static(__dirname));

// GET /data/:key.json — Leer datos
app.get('/data/:key.json', (req, res) => {
  const key = req.params.key;
  const filePath = path.join(DATA_DIR, `${key}.json`);

  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`[GET] /data/${key}.json ✓`);
      res.json(data);
    } catch (e) {
      console.error(`[GET] /data/${key}.json - Error parsing:`, e.message);
      res.status(500).json({ error: 'Invalid JSON' });
    }
  } else {
    console.log(`[GET] /data/${key}.json - Not found (404)`);
    // Retornar 404 para datos no encontrados (correcto)
    res.status(404).json({ error: 'Not found' });
  }
});

// PUT /data/:key.json — Escribir datos
app.put('/data/:key.json', (req, res) => {
  const key = req.params.key;
  const filePath = path.join(DATA_DIR, `${key}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
    console.log(`[PUT] /data/${key}.json ✓`);
    res.json({ success: true, key });
  } catch (e) {
    console.error(`[PUT] /data/${key}.json - Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor Ponte Viga en http://localhost:${PORT}`);
  console.log(`📁 Datos guardados en: ${DATA_DIR}`);
  console.log(`🌐 Abre http://localhost:${PORT}\n`);
});
