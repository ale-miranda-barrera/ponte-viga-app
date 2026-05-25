// build.js — Compila JSX + ensambla un único HTML auto-contenido para iPhone
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = __dirname;

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const CACHE_DIR  = path.join(ROOT, '.react-cache');
const REACT_FILE = path.join(CACHE_DIR, 'react.min.js');
const DOM_FILE   = path.join(CACHE_DIR, 'react-dom.min.js');

async function getReact() {
  if (fs.existsSync(REACT_FILE) && fs.existsSync(DOM_FILE)) {
    console.log('📦 React + ReactDOM (caché local)...');
    return [fs.readFileSync(REACT_FILE, 'utf8'), fs.readFileSync(DOM_FILE, 'utf8')];
  }
  console.log('📦 Descargando React + ReactDOM (primera vez)...');
  const [r, d] = await Promise.all([
    download('https://unpkg.com/react@18.3.1/umd/react.production.min.js'),
    download('https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'),
  ]);
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
  fs.writeFileSync(REACT_FILE, r);
  fs.writeFileSync(DOM_FILE, d);
  console.log('  ✓ Guardado en caché para próximos builds');
  return [r, d];
}

async function main() {
  const [reactJs, reactDomJs] = await getReact();
  console.log('  ✓ React', reactJs.length, 'bytes');
  console.log('  ✓ ReactDOM', reactDomJs.length, 'bytes');

  // Babel config
  const babelConfig = {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
  };
  const babel = require(path.join(ROOT, 'node_modules/@babel/core'));

  function compileFile(filePath) {
    const src = fs.readFileSync(filePath, 'utf8');
    try {
      const result = babel.transformSync(src, {
        ...babelConfig,
        filename: filePath,
      });
      return result.code;
    } catch (e) {
      console.error('❌ Error compilando', filePath, e.message);
      process.exit(1);
    }
  }

  // Modo de almacenamiento:
  //   aws-config.json presente → S3 (firma AWS Sig V4)
  //   ec2-config.json presente → EC2 servidor local (REST simple)
  //   ninguno               → solo localStorage
  let awsConfig = {};
  let serverConfig = {};
  let serverStorage = false;
  const awsConfigPath = path.join(ROOT, 'aws-config.json');
  const ec2ConfigPath = path.join(ROOT, 'ec2-config.json');

  if (fs.existsSync(awsConfigPath)) {
    awsConfig = JSON.parse(fs.readFileSync(awsConfigPath, 'utf8'));
    console.log('  ✓ Modo S3 — bucket:', awsConfig.bucket);
  } else if (fs.existsSync(ec2ConfigPath)) {
    serverStorage = true;
    serverConfig = JSON.parse(fs.readFileSync(ec2ConfigPath, 'utf8'));
    console.log('  ✓ Modo EC2 — API:', serverConfig.apiUrl);
  } else {
    console.log('  ⚠ Sin config — solo localStorage (crea aws-config.json o ec2-config.json)');
  }

  const storeFile = serverStorage ? 'data/api-store.js' : 'data/s3-store.js';

  // Archivos en orden de dependencia
  const jsFiles = [
    'data/routine.js',
    'data/seed-history.js',
    storeFile,
    'data/store.js',
    'screens/profile-picker.jsx',
    'screens/today.jsx',
    'screens/calendar.jsx',
    'screens/history.jsx',
    'screens/measures.jsx',
    'screens/modals.jsx',
    'screens/routine-editor.jsx',
    'screens/week.jsx',
    'screens/admin.jsx',
    'app.jsx',
  ];

  console.log('🔨 Compilando JSX...');
  const compiledScripts = jsFiles.map(f => {
    const full = path.join(ROOT, f);
    const code = compileFile(full);
    console.log('  ✓', f);
    return `// === ${f} ===\n${code}`;
  }).join('\n\n');

  // ios-frame no lo necesitamos (lo removemos — app corre full-screen en iPhone real)
  // Pero sí compilamos el app.jsx modificado

  const css = fs.readFileSync(path.join(ROOT, 'styles/app.css'), 'utf8');

  // Mount script (sin IOSDevice frame — la app llena toda la pantalla del iPhone)
  const mountScript = babel.transformSync(`
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {
          color: '#ff6b6b', background: '#111', padding: 20,
          fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap',
          height: '100dvh', overflow: 'auto', boxSizing: 'border-box'
        }
      }, 'ERROR EN RENDER:\\n\\n' + this.state.error.message + '\\n\\n' + (this.state.error.stack || ''));
    }
    return this.props.children;
  }
}

function tryMount() {
  const isAdmin = window.location.pathname === '/admin';
  if (isAdmin) {
    if (!window.AdminApp) return setTimeout(tryMount, 40);
    const root = document.getElementById('root');
    ReactDOM.createRoot(root).render(
      React.createElement(ErrorBoundary, null, React.createElement(window.AdminApp, null))
    );
    return;
  }
  if (!window.GymApp || !window.TodayScreen) {
    return setTimeout(tryMount, 40);
  }
  const root = document.getElementById('root');
  ReactDOM.createRoot(root).render(
    React.createElement(ErrorBoundary, null, React.createElement(window.GymApp, null))
  );
}
tryMount();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function() {});
}
`, { presets: [['@babel/preset-react', { runtime: 'classic' }]] }).code;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ponte Viga">
<meta name="theme-color" content="#0A0A0B">
<title>Ponte Viga App</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
html, body {
  margin: 0; padding: 0;
  height: 100%; width: 100%;
  background: #0A0A0B;
  overflow: hidden;
}
#root {
  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-root {
  height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
/* Fix tabbar para Dynamic Island / home indicator */
.tabbar {
  padding-bottom: max(20px, env(safe-area-inset-bottom)) !important;
}
.app-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100dvh; background: #0A0A0B; gap: 16px;
}
.loading-dots { display: flex; gap: 8px; }
.loading-dots span {
  width: 8px; height: 8px; border-radius: 50%; background: #ec6032;
  animation: ldot 1s ease-in-out infinite alternate;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ldot { to { opacity: 0.2; transform: scale(0.7); } }
.loading-text { color: #555; font-size: 13px; }
${css}
</style>
</head>
<body>
<div id="root"></div>

<script>
/* React */
${reactJs}
</script>
<script>
/* ReactDOM */
${reactDomJs}
</script>
<script>
/* Config */
window.__TWEAKS__ = { accent: "#ec6032", accent2: "#C93416", fontSize: 15 };
window.__AWS__ = ${JSON.stringify(awsConfig)};
window.__SERVER_CONFIG__ = ${JSON.stringify(serverConfig)};
window.__SERVER_STORAGE__ = ${serverStorage};
</script>
<script>
${compiledScripts}
</script>
<script>
${mountScript}
</script>
</body>
</html>`;

  const outPath = path.join(ROOT, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\n✅ Generado: index.html (${kb} KB)`);
  console.log('   Abre este archivo en Safari / Chrome para probar.');
  console.log('   En iPhone: sirve con "python3 -m http.server 8080" y abre http://TU-IP:8080');
}

main().catch(e => { console.error(e); process.exit(1); });
