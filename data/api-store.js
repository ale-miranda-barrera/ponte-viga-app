// data/api-store.js — Cliente REST para EC2 (sin AWS, sin SDK)
// El servidor Express sirve el app Y expone /data/*.json para leer y escribir
window.S3Store = (() => {
  'use strict';
  if (!window.__SERVER_STORAGE__) {
    return { get: async () => null, set: () => Promise.resolve(), flush: async () => {} };
  }

  // apiUrl vacío = same-origin (URL relativa). Funciona tanto en dev (localhost:3000)
  // como en producción (cualquier dominio). Solo se especifica si la API vive en otro host.
  const baseUrl = (window.__SERVER_CONFIG__ && window.__SERVER_CONFIG__.apiUrl) || '';
  console.log('[Storage] Modo servidor activo. baseUrl:', baseUrl || '(same-origin)');

  // Escrituras debounced: 1s de inactividad antes de escribir al servidor
  const queue = {}, timers = {};

  async function _flush(key) {
    const data = queue[key];
    if (data === undefined) return;
    delete queue[key];
    try {
      const url = `${baseUrl}/data/${key}.json`;
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      });
      if (!r.ok) console.warn('[Storage] error escribiendo', key, r.status, url);
    } catch (e) { console.warn('[Storage] sin conexión', key, e.message); }
  }

  async function get(key) {
    try {
      const url = `${baseUrl}/data/${key}.json`;
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) {
        console.warn('[Storage] error leyendo', key, r.status);
        return null;
      }
      const data = await r.json();
      // Validación básica de estructura
      if (key.includes('sessions') && typeof data !== 'object') return null;
      if (key.includes('profiles') && !Array.isArray(data)) return null;
      if (key.includes('measures') && !Array.isArray(data)) return null;
      return data;
    } catch (e) {
      console.warn('[Storage] error parseando', key, e.message);
      return null;
    }
  }

  function set(key, data) {
    queue[key] = data;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => _flush(key), 1000);
    return Promise.resolve();
  }

  async function flush() {
    return Promise.all(Object.keys(queue).map(_flush));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return { get, set, flush };
})();
