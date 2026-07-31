// server.js — Sirve la PWA y persiste datos.
//   PONTE_VIGA_TABLE env var presente → DynamoDB (producción).
//   Sin env var                       → JSON files en data-files/ (dev local).
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const log = require('./server/logger').child('server');
const { requestLogger } = require('./server/logger');
const { rateLimit } = require('./server/rate-limit');
const { securityHeaders, restrictedCors } = require('./server/security');
const authModule = require('./server/auth');

// ─── Env vars ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const TABLE = process.env.PONTE_VIGA_TABLE || '';
const REGION = process.env.AWS_REGION || 'us-east-1';
const DATA_DIR = path.join(__dirname, 'data-files');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const ADMIN_PIN = process.env.PONTE_VIGA_ADMIN_PIN || '1236';
const ALLOWED_ORIGINS = process.env.PONTE_VIGA_ALLOWED_ORIGINS || '';
const IS_PROD = !!TABLE;

// Env validation al startup: falla fast si faltan requeridas en prod
function validateEnv() {
  const warnings = [];
  const errors = [];
  if (IS_PROD) {
    if (ADMIN_PIN === '1236') warnings.push('PONTE_VIGA_ADMIN_PIN usa default inseguro — cámbialo en prod');
    if (!ALLOWED_ORIGINS) warnings.push('PONTE_VIGA_ALLOWED_ORIGINS vacío — CORS permite mismo origen sólo');
    if (!ANTHROPIC_KEY) warnings.push('ANTHROPIC_API_KEY vacío — AI coach usará reglas locales');
  }
  warnings.forEach(w => log.warn(w));
  errors.forEach(e => log.error(e));
  if (errors.length > 0 && IS_PROD) process.exit(1);
}
validateEnv();

const app = express();

// ─── Middleware base ───────────────────────────────────────────────
app.use(securityHeaders());
app.use(restrictedCors(ALLOWED_ORIGINS));
app.use(express.json({ limit: '20mb' }));
// Handler específico para errores del body-parser (JSON malformado, payload
// demasiado grande). Debe ir INMEDIATAMENTE después de express.json().
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  next(err);
});
app.use(requestLogger('http'));

// Validación de claves: solo letras/números/guiones/underscore, máx 80 chars.
function isAllowedKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9_\-#]{1,80}$/.test(k);
}

// ─── Backend: DynamoDB ─────────────────────────────────────────────
function createDynamoBackend() {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
  const client = new DynamoDBClient({ region: REGION });
  const ddb = DynamoDBDocumentClient.from(client);

  return {
    label: `DynamoDB (${TABLE} en ${REGION})`,
    async get(key) {
      const r = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { pk: key },
        ConsistentRead: true,
      }));
      return r.Item ? r.Item.data : undefined;
    },
    async put(key, data) {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { pk: key, data, updatedAt: new Date().toISOString() },
      }));
    },
  };
}

// ─── Backend: archivos JSON (dev local) ────────────────────────────
function createFileBackend() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log.info(`Directorio ${DATA_DIR} creado`);
  }
  return {
    label: `Archivos JSON (${DATA_DIR})`,
    async get(key) {
      const f = path.join(DATA_DIR, `${key}.json`);
      if (!fs.existsSync(f)) return undefined;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    },
    async put(key, data) {
      const f = path.join(DATA_DIR, `${key}.json`);
      const tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, f); // escritura atómica
    },
  };
}

const backend = TABLE ? createDynamoBackend() : createFileBackend();
log.info(`Backend activo: ${backend.label}`);

// ─── Auth ──────────────────────────────────────────────────────────
const auth = authModule.attachToApp(app, backend, { adminPin: ADMIN_PIN });

// ─── Static + SPA routes ──────────────────────────────────────────
// Static primero pero SIN index.html automático — servimos manualmente para poder inyectar headers.
app.use(express.static(__dirname, { index: false }));

// Endpoints públicos ────────────────────────────────────────────────
app.get('/healthz', async (_, res) => {
  const checks = { backendOk: false, ai: !!ANTHROPIC_KEY, uptime: process.uptime() };
  try {
    await backend.get('__health_probe__');
    checks.backendOk = true;
  } catch (e) {
    checks.backendError = e.message;
  }
  const ok = checks.backendOk;
  res.status(ok ? 200 : 503).json({ ok, backend: backend.label, ...checks });
});

// ─── Dev helper: reset + seed ──────────────────────────────────────
// Solo responde en dev (backend de archivos), NUNCA en DynamoDB.
app.post('/dev-seed', async (req, res) => {
  if (TABLE) return res.status(403).json({ error: 'seed_disabled_in_prod' });
  const profile = (req.body && req.body.profile) || 'alejo';
  const today = new Date();
  const dayMs = 86400000;
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

  await backend.put('profiles', [{ name: profile, emoji: '💪', color: '#ec6032', goal: 'Fuerza', daysPerWeek: 5, extraActivities: ['run', 'swim'] }]);

  const sessions = {};
  const dayNames = ['Descanso','Pierna','Espalda y bíceps','Pecho y tríceps','Pierna','Tríceps y bíceps','Hombro y abdominales'];
  const kExs = {
    1: [{id:'l1',name:'Sentadilla',weight:115,sets:4,reps:8},{id:'l2',name:'Prensa',weight:225,sets:5,reps:8},{id:'l4',name:'Extensión pierna',weight:120,sets:3,reps:12}],
    2: [{id:'m1',name:'Dominadas',weight:60,sets:3,reps:8},{id:'m2',name:'Jalón al pecho',weight:132,sets:3,reps:10},{id:'m5',name:'Curl predicador',weight:90,sets:4,reps:10}],
    3: [{id:'w1',name:'Press plano',weight:70,sets:3,reps:12},{id:'w2',name:'Press inclinado',weight:60,sets:3,reps:6},{id:'w5',name:'Press tríceps',weight:25,sets:3,reps:12}],
    4: [{id:'j1',name:'Peso muerto rumano',weight:115,sets:3,reps:12},{id:'j3',name:'Hip Thrust',weight:115,sets:3,reps:10}],
    5: [{id:'v1',name:'Curl barra',weight:60,sets:4,reps:12},{id:'v5',name:'Extensión polea',weight:55,sets:3,reps:12}],
    6: [{id:'s1',name:'Press militar',weight:108,sets:4,reps:8},{id:'s2',name:'Elevaciones laterales',weight:25,sets:4,reps:15}],
  };
  for (let back = 1; back <= 21; back++) {
    const d = new Date(today.getTime() - back*dayMs);
    const dow = d.getDay();
    if (dow === 0) continue;
    if (Math.random() > 0.85) continue;
    const mood = ['strong','normal','strong','normal','sick'][Math.floor(Math.random()*5)];
    const drift = (back / 60);
    const exs = (kExs[dow] || []).map(ex => {
      const w = Math.round(ex.weight * (1 - drift * 0.15) / 2.5) * 2.5;
      const completedSets = Math.random() > 0.15 ? ex.sets : Math.max(1, ex.sets - 1);
      return { id: ex.id, weight: Math.max(0, w), sets: completedSets, targetSets: ex.sets, reps: ex.reps, done: completedSets === ex.sets };
    });
    const done = exs.every(e => e.done);
    sessions[iso(d)] = [{
      sessionId: 'sid_seed_' + back,
      date: iso(d), dow, title: dayNames[dow], label: dayNames[dow], mood,
      startTime: d.getTime(), endTime: d.getTime() + 45*60*1000,
      exercises: exs, activities: {}, cardioDone: Math.random() > 0.4, cardioMinutes: 20,
      completed: done,
    }];
  }
  await backend.put(`${profile}_sessions`, sessions);

  const measures = [];
  for (let back = 56; back >= 0; back -= 7) {
    const d = new Date(today.getTime() - back*dayMs);
    measures.push({
      date: iso(d),
      peso: Math.round((88 - (56 - back) * 0.15) * 10) / 10,
      barriga: Math.round((103 - (56 - back) * 0.1) * 10) / 10,
      brazo: Math.round((38 + (56 - back) * 0.02) * 10) / 10,
    });
  }
  await backend.put(`${profile}_measures`, measures);

  const todayIso = iso(today);
  const foodLog = {};
  foodLog[todayIso] = [
    { id: 'f1', ts: today.getTime() - 5*3600*1000, name: 'Desayuno estándar', kcal: 450 },
    { id: 'f2', ts: today.getTime() - 3*3600*1000, name: 'Fruta', kcal: 90 },
    { id: 'f3', ts: today.getTime() - 1*3600*1000, name: 'Almuerzo estándar', kcal: 650 },
  ];
  const dailyTotals = {};
  dailyTotals[todayIso] = { kcal: 0, exercises: 0, sessionsCount: 0 };
  await backend.put(`${profile}_profile`, {
    height: 175, age: 30, sex: 'm', activity: 1.45, goal: 'deficit', daysPerWeek: 5,
    extraActivities: ['run', 'swim'],
    foodLog, dailyTotals,
  });

  res.json({ ok: true, profile, sessions: Object.keys(sessions).length, measures: measures.length });
});

// ─── SPA routes ────────────────────────────────────────────────────
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Data routes ───────────────────────────────────────────────────
// GET: rate-limitado suave; sin auth (datos de perfil no son secretos, están
// en un mismo servidor multi-tenant. Leaderboards leen sesiones ajenas.)
const dataReadLimit  = rateLimit({ windowMs: 60_000, max: 120 });
const dataWriteLimit = rateLimit({ windowMs: 60_000, max: 60 });

// Campos sensibles que NUNCA deben salir por GET público (evita brute-force
// offline del hash con salt conocido).
const SENSITIVE_PROFILE_FIELDS = ['pin', 'pinHash', 'pinSalt', 'pinIter'];

function stripSensitive(key, data) {
  if (key === 'profiles' && Array.isArray(data)) {
    return data.map(p => {
      const clean = { ...p, hasPin: !!(p.pin || p.pinHash) };
      SENSITIVE_PROFILE_FIELDS.forEach(f => delete clean[f]);
      return clean;
    });
  }
  return data;
}

app.get('/data/:key.json', dataReadLimit, async (req, res) => {
  const key = req.params.key;
  if (!isAllowedKey(key)) return res.status(400).json({ error: 'invalid_key' });
  try {
    const data = await backend.get(key);
    if (data === undefined) return res.status(404).json({ error: 'not_found' });
    res.json(stripSensitive(key, data));
  } catch (e) {
    log.error('GET /data/' + key, { err: e.message });
    res.status(500).json({ error: 'internal' });
  }
});

// PUT: requiere auth + validación de ownership + validación estructural.
app.put('/data/:key.json',
  dataWriteLimit,
  (req, res, next) => {
    const key = req.params.key;
    if (!isAllowedKey(key)) return res.status(400).json({ error: 'invalid_key' });
    next();
  },
  auth.guardDataWrite,
  auth.validateProfilesUpdate,
  validatePayload,
  async (req, res) => {
    const key = req.params.key;
    try {
      await backend.put(key, req.body);
      res.json({ success: true, key });
    } catch (e) {
      log.error('PUT /data/' + key, { err: e.message });
      res.status(500).json({ error: 'internal' });
    }
  },
);

// Validación estructural mínima por tipo de clave.
//
// El "sufijo" de una clave de perfil es el ÚLTIMO segmento tras `_`
// (ej: `smoke_alice_sessions` → `sessions`). Esto es robusto ante nombres
// de perfil con underscores. Claves globales (sin `_`) usan la clave directa.
function validatePayload(req, res, next) {
  const key = req.params.key;
  const body = req.body;
  if (body === undefined || body === null) return res.status(400).json({ error: 'empty_body' });

  const parts = key.split('_');
  const shortKey = parts.length > 1 ? parts[parts.length - 1] : key;

  const rules = {
    profiles:   () => Array.isArray(body) && body.every(p => p && typeof p.name === 'string'),
    groups:     () => body && typeof body === 'object' && !Array.isArray(body),
    sessions:   () => body && typeof body === 'object' && !Array.isArray(body),
    measures:   () => Array.isArray(body) && body.every(m => m && typeof m.date === 'string'),
    profile:    () => body && typeof body === 'object' && !Array.isArray(body),
    routines:   () => body && typeof body === 'object' && !Array.isArray(body),
    activities: () => Array.isArray(body),
  };

  const validator = rules[shortKey];
  if (validator && !validator()) {
    log.warn('invalid payload', { key, shortKey });
    return res.status(400).json({ error: 'invalid_payload', key });
  }
  next();
}

// ─── AI Coach ──────────────────────────────────────────────────────
const coachLimit = rateLimit({ windowMs: 60_000, max: 20 });

app.post('/api/ai/coach', coachLimit, async (req, res) => {
  try {
    const ctx = req.body || {};
    if (!ANTHROPIC_KEY) {
      return res.json({ source: 'rules', ...ruleBasedCoach(ctx) });
    }
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    const systemPrompt = `Eres el entrenador de la app "Ponte Viga". Respondes SIEMPRE en español, con tono cercano y directo. Devuelves JSON válido con la forma:
{"headline":"1 frase motivadora corta","weightAdvice":[{"exerciseName":"...","suggestion":"..."}],"tips":["...","..."],"nextFocus":"..."}
No incluyas markdown ni texto fuera del JSON.`;
    const userPrompt = `Contexto del usuario:\n${JSON.stringify(ctx).slice(0, 8000)}\n\nDame:
- headline motivador (máx 12 palabras)
- weightAdvice: máx 4 sugerencias concretas de peso o reps por ejercicio con base en su historial
- tips: 2-3 consejos accionables (nutrición, descanso, técnica) según su racha y ánimo
- nextFocus: 1 frase sobre qué mejorar la próxima semana`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      log.warn('Claude API error', { status: r.status, body: errText.slice(0, 200) });
      return res.json({ source: 'rules', ...ruleBasedCoach(ctx) });
    }
    const j = await r.json();
    const text = (j.content || []).map(c => c.text).join('').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ source: 'rules', ...ruleBasedCoach(ctx) });
    try {
      const parsed = JSON.parse(match[0]);
      return res.json({ source: 'ai', ...parsed });
    } catch {
      return res.json({ source: 'rules', ...ruleBasedCoach(ctx) });
    }
  } catch (e) {
    log.warn('AI fallback por error', { err: e.message });
    res.json({ source: 'rules', ...ruleBasedCoach(req.body || {}) });
  }
});

// Coach de reglas: útil sin API key, siempre disponible como fallback
function ruleBasedCoach(ctx) {
  const streak = ctx.streak || 0;
  const mood = ctx.mood || 'normal';
  const dayName = ctx.todayName || 'hoy';
  const kcalWeek = ctx.kcalWeek || 0;
  const kcalTarget = ctx.kcalTargetWeek || 0;

  const headline = streak >= 5
    ? `Llevas ${streak} días. Sigue así.`
    : streak >= 2
      ? `Racha de ${streak}. Suma otro hoy.`
      : `Buen ${dayName} para empezar.`;

  const tips = [];
  if (mood === 'sick') tips.push('Baja 10-15% el peso y prioriza técnica.');
  if (mood === 'strong') tips.push('Sube 2.5-5 lb en un solo ejercicio y valida.');
  if (streak >= 3) tips.push('Meta un día extra de movilidad esta semana.');
  if (kcalTarget > 0 && kcalWeek < kcalTarget * 0.5) tips.push('Vas debajo de tu meta semanal de kcal — agrega 15 min de cardio.');
  if (tips.length === 0) tips.push('Hidrátate: 500 ml antes y 500 ml durante.');

  const weightAdvice = (ctx.todayExercises || []).slice(0, 4).map(ex => {
    const pb = ex.pb || 0;
    const last = ex.lastWeight || pb;
    if (pb === 0) return { exerciseName: ex.name, suggestion: 'Empieza con peso moderado que puedas mantener 12 reps.' };
    if (mood === 'strong' && last >= pb) return { exerciseName: ex.name, suggestion: `Sube a ${last + 2.5} lb en la primera serie.` };
    if (mood === 'sick') return { exerciseName: ex.name, suggestion: `Mantén ${Math.max(0, last - 5)} lb, más control.` };
    return { exerciseName: ex.name, suggestion: `Repite ${last} lb con 1 rep extra por serie.` };
  });

  return {
    headline,
    weightAdvice,
    tips: tips.slice(0, 3),
    nextFocus: streak >= 4 ? 'Empieza a variar cardio: nadar o bicicleta.' : 'Mantén el ritmo — 1 sesión más te lleva a racha.',
  };
}

// ─── Fallback: si no matcheó nada arriba, servir index.html para SPA ───
app.get(/^\/(?!api\/|data\/|healthz|dev-seed).*/, (req, res, next) => {
  // Solo si Accept HTML (evita interceptar assets rotos)
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

// ─── Error handler global ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  log.error('unhandled', { url: req.url, err: err.message, stack: err.stack });
  res.status(500).json({ error: 'internal' });
});

// ─── LAN URLs helper ───────────────────────────────────────────────
function getLanUrls() {
  const ifaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${PORT}`);
      }
    }
  }
  return urls;
}

app.listen(PORT, '0.0.0.0', () => {
  log.info(`Ponte Viga server escuchando en 0.0.0.0:${PORT}`);
  log.info(`   Local:      http://localhost:${PORT}`);
  const lan = getLanUrls();
  if (lan.length > 0) {
    lan.forEach(u => log.info(`   LAN:        ${u}  ← abre esta en tu iPhone`));
  } else {
    log.info(`   (No detecté IP LAN — revisa tu WiFi)`);
  }
  log.info(`Backend: ${backend.label}`);
  log.info(`IA: ${ANTHROPIC_KEY ? 'Claude API activa' : 'reglas locales (sin ANTHROPIC_API_KEY)'}`);
  log.info(`Admin PIN: ${ADMIN_PIN === '1236' ? '⚠ default — cámbialo con PONTE_VIGA_ADMIN_PIN env' : 'configurado ✓'}`);
});

// Manejo limpio de shutdown
process.on('SIGTERM', () => { log.info('SIGTERM, closing'); process.exit(0); });
process.on('SIGINT',  () => { log.info('SIGINT, closing');  process.exit(0); });
process.on('unhandledRejection', (err) => log.error('unhandled rejection', { err: String(err) }));
