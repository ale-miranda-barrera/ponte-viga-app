// dev.js — Un solo comando para desarrollo local con acceso desde iPhone.
//   1. Genera ec2-config.json en modo same-origin si no existe.
//   2. Ejecuta build.js.
//   3. Inicia server.js con URL LAN detectada.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const CFG_PATH = path.join(ROOT, 'ec2-config.json');

function pickLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

// Modo servidor: el frontend usa fetch same-origin (apiUrl vacío) →
// funciona igual desde localhost, desde LAN y desde prod.
if (!fs.existsSync(CFG_PATH)) {
  fs.writeFileSync(CFG_PATH, JSON.stringify({ apiUrl: '' }, null, 2));
  console.log('✓ Creado ec2-config.json (same-origin)');
}

console.log('🔨 Compilando app...');
const build = spawn(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'inherit' });

build.on('exit', (code) => {
  if (code !== 0) {
    console.error('❌ Build falló con código', code);
    process.exit(code);
  }
  const lanIp = pickLanIp();
  const port = process.env.PORT || 3000;
  console.log('\n🚀 Iniciando server...');
  if (lanIp) {
    console.log(`\n📱 Para probar desde tu iPhone (misma WiFi):`);
    console.log(`   http://${lanIp}:${port}`);
    console.log(`   (asegúrate de que tu firewall permita conexiones en el puerto ${port})\n`);
  }
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'inherit' });
  srv.on('exit', (c) => process.exit(c || 0));
});
