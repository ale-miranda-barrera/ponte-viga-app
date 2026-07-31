// server/auth.js — Auth robusto: PIN hasheado con PBKDF2 + tokens de sesión.
//
// Diseño:
//   - Perfiles se guardan como { name, emoji, color, pinSalt, pinHash, pinIter }
//     (pinSalt/pinHash/pinIter opcionales — perfiles sin PIN pasan sin auth).
//   - Compatibilidad: perfiles legacy con { pin: '1234' } plaintext se migran al
//     primer login exitoso (verifica plaintext, luego hashea y guarda).
//   - Tokens: opacos, random 32 bytes hex. TTL 30 días. Guardados en memoria del
//     server (map token→{profileName, expiresAt}). Sobreviven reinicio? NO por
//     ahora — al reiniciar, todos los usuarios deben re-login. Aceptable dado
//     que EC2 no se reinicia frecuentemente.
//   - Rate limit login: 5 intentos por IP+perfil / 15 min. Después → 429.
//
// Uso externo:
//   const auth = require('./server/auth');
//   auth.attachToApp(app, backend);   // registra /api/auth/* + middleware helpers

const crypto = require('crypto');

const PBKDF2_ITER = 120_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return { pinSalt: salt, pinHash: hash, pinIter: PBKDF2_ITER };
}

function verifyPin(pin, profile) {
  if (!profile) return false;
  // Perfil sin PIN: no requiere auth
  if (!profile.pin && !profile.pinHash) return true;
  // Nuevo esquema (hasheado)
  if (profile.pinHash && profile.pinSalt) {
    const iter = profile.pinIter || PBKDF2_ITER;
    const computed = crypto.pbkdf2Sync(String(pin), profile.pinSalt, iter, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
    return timingSafeEq(computed, profile.pinHash);
  }
  // Legacy plaintext (migración one-shot en login exitoso)
  if (profile.pin) return timingSafeEq(String(pin), String(profile.pin));
  return false;
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function attachToApp(app, backend, { adminPin } = {}) {
  const tokens = new Map();   // token → { profileName, expiresAt, createdAt, isAdmin }
  const loginAttempts = new Map(); // `${ip}|${name}` → [timestamps]

  const now = () => Date.now();

  function gcTokens() {
    const t = now();
    for (const [k, v] of tokens) if (v.expiresAt < t) tokens.delete(k);
  }
  setInterval(gcTokens, 60 * 60 * 1000).unref();

  function ipOf(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .toString().split(',')[0].trim();
  }

  function checkLoginRate(ip, name) {
    const key = `${ip}|${name}`;
    const t = now();
    const arr = (loginAttempts.get(key) || []).filter(ts => t - ts < LOGIN_WINDOW_MS);
    loginAttempts.set(key, arr);
    return arr.length < LOGIN_MAX_ATTEMPTS;
  }

  function recordLoginAttempt(ip, name) {
    const key = `${ip}|${name}`;
    const arr = loginAttempts.get(key) || [];
    arr.push(now());
    loginAttempts.set(key, arr);
  }

  function clearLoginAttempts(ip, name) {
    loginAttempts.delete(`${ip}|${name}`);
  }

  async function getProfiles() {
    const list = await backend.get('profiles');
    return Array.isArray(list) ? list : [];
  }

  async function saveProfiles(list) {
    await backend.put('profiles', list);
  }

  // POST /api/auth/register  { name, emoji, color, pin? }  → { token, profile }
  // Endpoint idempotente: si el perfil ya existe SIN pin, permite recuperarlo
  // (útil para usuarios que crean en un dispositivo y luego se loguean en otro).
  // Si ya existe CON pin, requiere login explícito y falla con conflict.
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, emoji, color, pin } = req.body || {};
      if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_\- ]{2,30}$/.test(name)) {
        return res.status(400).json({ error: 'invalid_name' });
      }
      if (pin && !/^\d{4,8}$/.test(String(pin))) {
        return res.status(400).json({ error: 'invalid_pin' });
      }
      const ip = ipOf(req);
      if (!checkLoginRate(ip, `__register_${name}`)) {
        return res.status(429).json({ error: 'too_many_attempts', retryAfterMs: LOGIN_WINDOW_MS });
      }
      recordLoginAttempt(ip, `__register_${name}`);

      const profiles = await getProfiles();
      const existing = profiles.find(p => p.name === name);
      if (existing) {
        const hasPin = !!(existing.pin || existing.pinHash);
        if (hasPin) {
          return res.status(409).json({ error: 'profile_exists_with_pin' });
        }
        // Perfil existente sin PIN:
        //   - Si viene PIN en el request → rechazar; el usuario legítimo debe
        //     hacer login (sin PIN) primero y luego set-pin. Esto evita que un
        //     atacante "reclame" un perfil abierto poniéndole PIN.
        //   - Si viene sin PIN → permitir "recuperación" (login pasivo).
        if (pin) {
          return res.status(409).json({ error: 'profile_exists_use_login' });
        }
      } else {
        const newProfile = { name, emoji: emoji || '💪', color: color || '#ec6032' };
        if (pin) {
          const { pinSalt, pinHash, pinIter } = hashPin(pin);
          newProfile.pinSalt = pinSalt;
          newProfile.pinHash = pinHash;
          newProfile.pinIter = pinIter;
        }
        profiles.push(newProfile);
        await saveProfiles(profiles);
      }

      const token = makeToken();
      tokens.set(token, {
        profileName: name,
        expiresAt: now() + TOKEN_TTL_MS,
        createdAt: now(),
        isAdmin: false,
      });
      clearLoginAttempts(ip, `__register_${name}`);
      const finalProfile = profiles.find(p => p.name === name);
      const hasPin = !!(finalProfile.pin || finalProfile.pinHash);
      return res.json({
        token,
        expiresAt: now() + TOKEN_TTL_MS,
        profile: { name: finalProfile.name, emoji: finalProfile.emoji, color: finalProfile.color, hasPin },
      });
    } catch (e) {
      console.error('[auth] register error:', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // POST /api/auth/login  { name, pin }  → { token, profile }
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { name, pin } = req.body || {};
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      const ip = ipOf(req);
      if (!checkLoginRate(ip, name)) {
        return res.status(429).json({ error: 'too_many_attempts', retryAfterMs: LOGIN_WINDOW_MS });
      }

      const profiles = await getProfiles();
      const profile = profiles.find(p => p.name === name);
      if (!profile) {
        recordLoginAttempt(ip, name);
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      const hasPin = !!(profile.pin || profile.pinHash);
      if (hasPin && !pin) {
        recordLoginAttempt(ip, name);
        return res.status(401).json({ error: 'pin_required' });
      }

      const ok = verifyPin(pin || '', profile);
      if (!ok) {
        recordLoginAttempt(ip, name);
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      // Migración: si tenía PIN plaintext, hashearlo ahora
      if (profile.pin && !profile.pinHash) {
        const { pinSalt, pinHash, pinIter } = hashPin(profile.pin);
        const migrated = profiles.map(p => p.name === name
          ? { ...p, pinSalt, pinHash, pinIter, pin: undefined }
          : p);
        // Limpia el campo plaintext explícitamente
        migrated.forEach(p => { if (p.name === name) delete p.pin; });
        await saveProfiles(migrated);
      }

      const token = makeToken();
      tokens.set(token, {
        profileName: name,
        expiresAt: now() + TOKEN_TTL_MS,
        createdAt: now(),
        isAdmin: false,
      });
      clearLoginAttempts(ip, name);

      return res.json({
        token,
        expiresAt: now() + TOKEN_TTL_MS,
        profile: { name: profile.name, emoji: profile.emoji, color: profile.color, hasPin },
      });
    } catch (e) {
      console.error('[auth] login error:', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // POST /api/auth/logout  Authorization: Bearer <token>
  app.post('/api/auth/logout', (req, res) => {
    const token = extractToken(req);
    if (token) tokens.delete(token);
    res.json({ ok: true });
  });

  // GET /api/auth/session — devuelve info del token (para valid check tras reload)
  app.get('/api/auth/session', (req, res) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'no_token' });
    const info = tokens.get(token);
    if (!info || info.expiresAt < now()) {
      if (info) tokens.delete(token);
      return res.status(401).json({ error: 'expired' });
    }
    res.json({
      profileName: info.profileName,
      isAdmin: !!info.isAdmin,
      expiresAt: info.expiresAt,
    });
  });

  // POST /api/auth/set-pin  { currentPin, newPin }  Authorization: Bearer
  // Cambiar/establecer PIN del perfil actual.
  app.post('/api/auth/set-pin', async (req, res) => {
    try {
      const info = requireSession(req);
      if (!info) return res.status(401).json({ error: 'unauthorized' });
      const { currentPin, newPin } = req.body || {};
      if (typeof newPin !== 'string' || !/^\d{4,8}$/.test(newPin)) {
        return res.status(400).json({ error: 'invalid_new_pin' });
      }
      const profiles = await getProfiles();
      const idx = profiles.findIndex(p => p.name === info.profileName);
      if (idx < 0) return res.status(404).json({ error: 'profile_not_found' });
      const profile = profiles[idx];
      const hadPin = !!(profile.pin || profile.pinHash);
      if (hadPin && !verifyPin(currentPin || '', profile)) {
        return res.status(401).json({ error: 'current_pin_invalid' });
      }
      const { pinSalt, pinHash, pinIter } = hashPin(newPin);
      profiles[idx] = { ...profile, pinSalt, pinHash, pinIter };
      delete profiles[idx].pin;
      await saveProfiles(profiles);
      res.json({ ok: true });
    } catch (e) {
      console.error('[auth] set-pin error:', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // POST /api/auth/remove-pin  { currentPin }
  app.post('/api/auth/remove-pin', async (req, res) => {
    try {
      const info = requireSession(req);
      if (!info) return res.status(401).json({ error: 'unauthorized' });
      const { currentPin } = req.body || {};
      const profiles = await getProfiles();
      const idx = profiles.findIndex(p => p.name === info.profileName);
      if (idx < 0) return res.status(404).json({ error: 'profile_not_found' });
      const profile = profiles[idx];
      if (!verifyPin(currentPin || '', profile)) {
        return res.status(401).json({ error: 'current_pin_invalid' });
      }
      delete profile.pin;
      delete profile.pinHash;
      delete profile.pinSalt;
      delete profile.pinIter;
      profiles[idx] = profile;
      await saveProfiles(profiles);
      res.json({ ok: true });
    } catch (e) {
      console.error('[auth] remove-pin error:', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // POST /api/auth/admin  { pin } — devuelve token con isAdmin=true
  app.post('/api/auth/admin', (req, res) => {
    const { pin } = req.body || {};
    const ip = ipOf(req);
    if (!checkLoginRate(ip, '__admin__')) {
      return res.status(429).json({ error: 'too_many_attempts', retryAfterMs: LOGIN_WINDOW_MS });
    }
    if (!adminPin || !timingSafeEq(String(pin || ''), String(adminPin))) {
      recordLoginAttempt(ip, '__admin__');
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const token = makeToken();
    tokens.set(token, {
      profileName: '__admin__',
      expiresAt: now() + TOKEN_TTL_MS,
      createdAt: now(),
      isAdmin: true,
    });
    clearLoginAttempts(ip, '__admin__');
    res.json({ token, expiresAt: now() + TOKEN_TTL_MS, isAdmin: true });
  });

  function extractToken(req) {
    const h = req.headers['authorization'] || '';
    if (h.startsWith('Bearer ')) return h.slice(7).trim();
    return null;
  }

  function requireSession(req) {
    const token = extractToken(req);
    if (!token) return null;
    const info = tokens.get(token);
    if (!info || info.expiresAt < now()) {
      if (info) tokens.delete(token);
      return null;
    }
    return info;
  }

  // Middleware: valida token para operaciones autenticadas.
  function requireAuth(req, res, next) {
    const info = requireSession(req);
    if (!info) return res.status(401).json({ error: 'unauthorized' });
    req.session = info;
    next();
  }

  // Middleware: valida que el token pertenece a admin.
  function requireAdmin(req, res, next) {
    const info = requireSession(req);
    if (!info) return res.status(401).json({ error: 'unauthorized' });
    if (!info.isAdmin) return res.status(403).json({ error: 'forbidden' });
    req.session = info;
    next();
  }

  // Determina si una clave pertenece a un perfil dado.
  // Formato: `${profileName}_${suffix}` donde suffix ∈ {sessions,measures,profile,routines,activities}
  // Claves globales: 'profiles', 'groups' — requieren admin para escribir.
  const GLOBAL_KEYS = new Set(['profiles', 'groups']);
  const PROFILE_SUFFIXES = ['sessions', 'measures', 'profile', 'routines', 'activities'];

  function keyBelongsTo(key, profileName) {
    if (!key || !profileName) return false;
    for (const s of PROFILE_SUFFIXES) {
      if (key === `${profileName}_${s}`) return true;
    }
    return false;
  }

  // Middleware para /data/:key.json — valida escritura.
  //   - Claves globales: solo admin puede escribir.
  //   - Claves de perfil: token debe pertenecer a ese perfil (o ser admin).
  //   - GET permitido para todos (los datos no son secretos entre perfiles del mismo grupo).
  function guardDataWrite(req, res, next) {
    const key = req.params.key;
    const info = requireSession(req);
    if (!info) return res.status(401).json({ error: 'unauthorized' });
    if (info.isAdmin) return next();
    if (GLOBAL_KEYS.has(key)) {
      // Perfil normal puede actualizar 'profiles' (validateProfilesUpdate hace
      // el merge saneado, preservando PINs y bloqueando modificar otros).
      if (key === 'profiles') {
        req.session = info;
        return next();
      }
      return res.status(403).json({ error: 'admin_required' });
    }
    if (!keyBelongsTo(key, info.profileName)) {
      return res.status(403).json({ error: 'wrong_profile' });
    }
    req.session = info;
    next();
  }

  // Middleware que valida y "sanitiza" PUT /data/profiles.json.
  //
  // Reglas comunes (aplican SIEMPRE, incluso al admin):
  //   - Campos sensibles (pin/pinHash/salt/iter) NUNCA se aceptan del cliente.
  //     Se preservan del servidor si el perfil ya existía; los perfiles
  //     eliminados obviamente pierden su PIN.
  //   - Campos derivados (`hasPin`) se descartan del payload.
  //
  // Reglas para non-admin (adicionales):
  //   - No puede crear otros perfiles (sólo el propio, una vez).
  //   - No puede borrar ningún perfil (ni el suyo — para eso hay admin).
  async function validateProfilesUpdate(req, res, next) {
    if (req.params.key !== 'profiles') return next();
    const info = requireSession(req);
    if (!info) return res.status(401).json({ error: 'unauthorized' });

    const incoming = Array.isArray(req.body) ? req.body : null;
    if (!incoming) return res.status(400).json({ error: 'bad_payload' });
    const current = await getProfiles();

    if (!info.isAdmin) {
      const currentNames = current.map(p => p.name).sort().join('|');
      const incomingNames = incoming.map(p => p.name).sort().join('|');
      if (currentNames !== incomingNames) {
        const added = incoming.filter(p => !current.find(c => c.name === p.name));
        const removed = current.filter(p => !incoming.find(c => c.name === p.name));
        const okAdd = added.length <= 1 && (added.length === 0 || added[0].name === info.profileName);
        if (removed.length > 0 || !okAdd) {
          return res.status(403).json({ error: 'cannot_modify_other_profiles' });
        }
      }
    }

    // Merge saneado (siempre, admin incluido). Preserva PINs desde el servidor.
    // Los rename se detectan vía el campo `_originalName` opcional: cuando
    // el admin edita el nombre, envía { name: 'new', _originalName: 'old' }
    // y el server usa 'old' para buscar los PINs originales.
    const SENSITIVE = ['pin', 'pinHash', 'pinSalt', 'pinIter'];
    const DERIVED = ['hasPin'];
    const RENAME_MARKER = '_originalName';
    const merged = incoming.map(inp => {
      const lookupName = inp[RENAME_MARKER] || inp.name;
      const orig = current.find(c => c.name === lookupName);
      const clean = { ...inp };
      SENSITIVE.forEach(k => delete clean[k]);
      DERIVED.forEach(k => delete clean[k]);
      delete clean[RENAME_MARKER];
      if (orig) {
        SENSITIVE.forEach(k => { if (orig[k] !== undefined) clean[k] = orig[k]; });
      }
      return clean;
    });
    req.body = merged;
    next();
  }

  return { requireAuth, requireAdmin, guardDataWrite, validateProfilesUpdate, tokens };
}

module.exports = { attachToApp, hashPin, verifyPin };
