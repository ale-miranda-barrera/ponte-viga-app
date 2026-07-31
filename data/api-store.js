// data/api-store.js — Cliente REST robusto para el servidor (EC2 → DynamoDB).
//
// Features:
//   - Debounce 250 ms para evitar spam de PUT en cambios rápidos.
//   - fetch con keepalive: la escritura sobrevive a reload y pagehide.
//   - Backup en localStorage de la cola pendiente → reintenta al cargar la app.
//   - Listeners pagehide + visibilitychange para flush al salir.
//   - Reintentos con backoff exponencial + jitter si el servidor responde no-OK.
//   - Autenticación via Bearer token (opcional; GET público).
//   - Handler global de 401: dispara evento window 'ponteviga:auth-expired'.
window.S3Store = (() => {
  'use strict';
  if (!window.__SERVER_STORAGE__) {
    return {
      get: async () => null,
      set: () => Promise.resolve(),
      flush: async () => {},
      setToken: () => {},
      getToken: () => null,
      hasPendingWrites: () => false,
    };
  }

  const baseUrl = (window.__SERVER_CONFIG__ && window.__SERVER_CONFIG__.apiUrl) || '';
  const DEBOUNCE_MS = 250;
  const PENDING_LS_KEY = '__pv_pending_writes_v1';
  const TOKEN_LS_KEY = '__pv_auth_token_v1';
  const MAX_RETRIES = 5;
  console.log('[Storage] Modo servidor activo. baseUrl:', baseUrl || '(same-origin)');

  const queue = {};
  const timers = {};
  let currentToken = null;
  try { currentToken = localStorage.getItem(TOKEN_LS_KEY) || null; } catch {}

  // ── Token ──────────────────────────────────────────────────────
  function setToken(token) {
    currentToken = token || null;
    try {
      if (token) localStorage.setItem(TOKEN_LS_KEY, token);
      else localStorage.removeItem(TOKEN_LS_KEY);
    } catch {}
  }
  function getToken() { return currentToken; }

  function _authHeaders() {
    return currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {};
  }

  function _fireAuthExpired(reason) {
    try {
      window.dispatchEvent(new CustomEvent('ponteviga:auth-expired', { detail: { reason } }));
    } catch {}
  }

  // ── Backup en localStorage ────────────────────────────────────
  function _persistPending() {
    try { localStorage.setItem(PENDING_LS_KEY, JSON.stringify(queue)); } catch {}
  }
  function _clearPersistedKey(key) {
    try {
      const raw = localStorage.getItem(PENDING_LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      delete obj[key];
      if (Object.keys(obj).length === 0) localStorage.removeItem(PENDING_LS_KEY);
      else localStorage.setItem(PENDING_LS_KEY, JSON.stringify(obj));
    } catch {}
  }
  function _restorePending() {
    try {
      const raw = localStorage.getItem(PENDING_LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      Object.keys(obj).forEach(k => {
        queue[k] = obj[k];
        _flush(k);
      });
    } catch {}
  }

  // Backoff: 300ms, 700ms, 1500ms, 3200ms, 6500ms + jitter
  function _backoff(attempt) {
    const base = 300 * Math.pow(2.15, attempt - 1);
    return Math.round(base + Math.random() * 200);
  }

  // ── Escritura con reintentos ─────────────────────────────────
  async function _flush(key, attempt = 1) {
    const data = queue[key];
    if (data === undefined) return;

    try {
      const url = `${baseUrl}/data/${key}.json`;
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ..._authHeaders() },
        body: JSON.stringify(data),
        keepalive: true,
      });
      if (r.status === 401) {
        console.warn('[Storage] 401 — token expirado o inválido');
        _fireAuthExpired('write_401');
        // Mantener en queue para reintento tras re-login
        _persistPending();
        return;
      }
      if (r.status === 403) {
        console.error('[Storage] 403 forbidden en PUT', key);
        // No reintentar; el token no tiene permisos para esta clave
        delete queue[key];
        _clearPersistedKey(key);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (queue[key] === data) {
        delete queue[key];
        _clearPersistedKey(key);
      }
    } catch (e) {
      console.warn(`[Storage] error escribiendo ${key} (intento ${attempt}):`, e.message);
      _persistPending();
      if (attempt < MAX_RETRIES) {
        setTimeout(() => _flush(key, attempt + 1), _backoff(attempt));
      } else {
        console.error(`[Storage] escritura ${key} fallida tras ${MAX_RETRIES} intentos`);
      }
    }
  }

  async function get(key, opts) {
    const attempt = (opts && opts.attempt) || 1;
    try {
      const url = `${baseUrl}/data/${key}.json`;
      const r = await fetch(url, { headers: _authHeaders() });
      if (r.status === 404) return null;
      if (r.status === 401) {
        _fireAuthExpired('read_401');
        return null;
      }
      if (r.status === 429) {
        // Retry con backoff si hay margen
        if (attempt < 3) {
          const retryAfter = parseInt(r.headers.get('Retry-After') || '2', 10) * 1000;
          await new Promise(res => setTimeout(res, retryAfter));
          return get(key, { attempt: attempt + 1 });
        }
        console.warn('[Storage] rate limited leyendo', key);
        return null;
      }
      if (!r.ok) {
        console.warn('[Storage] error leyendo', key, r.status);
        return null;
      }
      const data = await r.json();
      // Validaciones ligeras
      if (key.endsWith('_sessions') && (data === null || typeof data !== 'object' || Array.isArray(data))) return null;
      if (key === 'profiles' && !Array.isArray(data)) return null;
      if (key.endsWith('_measures') && !Array.isArray(data)) return null;
      return data;
    } catch (e) {
      console.warn('[Storage] error parseando', key, e.message);
      // Retry transient network errors
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, _backoff(attempt)));
        return get(key, { attempt: attempt + 1 });
      }
      return null;
    }
  }

  function set(key, data) {
    queue[key] = data;
    _persistPending();
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => _flush(key), DEBOUNCE_MS);
    return Promise.resolve();
  }

  async function flush() {
    return Promise.all(Object.keys(queue).map(k => _flush(k)));
  }

  function hasPendingWrites() {
    return Object.keys(queue).length > 0;
  }

  // ── Auth helpers ──────────────────────────────────────────────
  async function register({ name, emoji, color, pin }) {
    const url = `${baseUrl}/api/auth/register`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, emoji, color, pin: pin || '' }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: body.error, retryAfterMs: body.retryAfterMs };
    setToken(body.token);
    return { ok: true, ...body };
  }

  async function login(name, pin) {
    const url = `${baseUrl}/api/auth/login`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin: pin || '' }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: body.error, retryAfterMs: body.retryAfterMs };
    setToken(body.token);
    return { ok: true, ...body };
  }

  async function adminLogin(pin) {
    const url = `${baseUrl}/api/auth/admin`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: body.error, retryAfterMs: body.retryAfterMs };
    setToken(body.token);
    return { ok: true, ...body };
  }

  async function logout() {
    const url = `${baseUrl}/api/auth/logout`;
    try {
      await fetch(url, { method: 'POST', headers: _authHeaders(), keepalive: true });
    } catch {}
    setToken(null);
  }

  async function checkSession() {
    if (!currentToken) return { ok: false };
    const url = `${baseUrl}/api/auth/session`;
    try {
      const r = await fetch(url, { headers: _authHeaders() });
      if (!r.ok) { setToken(null); return { ok: false }; }
      const body = await r.json();
      return { ok: true, ...body };
    } catch {
      return { ok: false };
    }
  }

  async function setPin(currentPin, newPin) {
    const r = await fetch(`${baseUrl}/api/auth/set-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._authHeaders() },
      body: JSON.stringify({ currentPin, newPin }),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, ...body };
  }

  async function removePin(currentPin) {
    const r = await fetch(`${baseUrl}/api/auth/remove-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._authHeaders() },
      body: JSON.stringify({ currentPin }),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, ...body };
  }

  window.addEventListener('pagehide', () => { flush(); }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  _restorePending();

  return {
    get, set, flush,
    setToken, getToken, hasPendingWrites,
    register, login, adminLogin, logout, checkSession, setPin, removePin,
  };
})();
