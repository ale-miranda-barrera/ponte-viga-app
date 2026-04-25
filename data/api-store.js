// data/api-store.js — Cliente REST para EC2 (sin AWS, sin SDK)
// El servidor Express sirve el app Y expone /data/*.json para leer y escribir
window.S3Store = (() => {
  'use strict';
  if (!window.__SERVER_STORAGE__) {
    return { get: async () => null, set: () => {}, flush: async () => {} };
  }

  // Escrituras debounced: 1s de inactividad antes de escribir al servidor
  const queue = {}, timers = {};

  async function _flush(key) {
    const data = queue[key];
    if (data === undefined) return;
    delete queue[key];
    try {
      const r = await fetch(`/data/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      });
      if (!r.ok) console.warn('[Storage] error escribiendo', key, r.status);
    } catch (e) { console.warn('[Storage] sin conexión', key, e.message); }
  }

  async function get(key) {
    try {
      const r = await fetch(`/data/${key}.json`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function set(key, data) {
    queue[key] = data;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => _flush(key), 1000);
  }

  async function flush() {
    return Promise.all(Object.keys(queue).map(_flush));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return { get, set, flush };
})();
