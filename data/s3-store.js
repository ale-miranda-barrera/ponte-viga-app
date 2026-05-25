// data/s3-store.js — Cliente S3 con AWS Sig V4 + WebCrypto (sin SDK, sin dependencias)
window.S3Store = (() => {
  'use strict';
  const cfg = window.__AWS__ || {};
  if (!cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
    return { get: async () => null, set: () => Promise.resolve(), flush: async () => {} };
  }

  const { bucket, region, accessKey, secretKey } = cfg;
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(n => n.toString(16).padStart(2,'0')).join('');

  async function sha256hex(str) {
    return hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
  }

  async function hmac(key, msg) {
    const k = await crypto.subtle.importKey('raw', key, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  }

  async function deriveSigKey(ds) {
    let k = enc.encode('AWS4' + secretKey);
    for (const v of [ds, region, 's3', 'aws4_request']) k = await hmac(k, v);
    return k;
  }

  async function buildHeaders(method, s3Key, bodyStr) {
    const now  = new Date();
    const ts   = now.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const ds   = ts.slice(0, 8);
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const path = '/' + s3Key.split('/').map(encodeURIComponent).join('/');
    const ph   = await sha256hex(bodyStr);
    const isPut = method === 'PUT';

    const ch = isPut
      ? `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${ts}\n`
      : `host:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${ts}\n`;
    const sh = isPut
      ? 'content-type;host;x-amz-content-sha256;x-amz-date'
      : 'host;x-amz-content-sha256;x-amz-date';

    const canonical = [method, path, '', ch, sh, ph].join('\n');
    const scope = `${ds}/${region}/s3/aws4_request`;
    const sts   = `AWS4-HMAC-SHA256\n${ts}\n${scope}\n${await sha256hex(canonical)}`;
    const sig   = hex(await hmac(await deriveSigKey(ds), sts));
    const auth  = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${sh}, Signature=${sig}`;

    const headers = { 'x-amz-content-sha256': ph, 'x-amz-date': ts, Authorization: auth };
    if (isPut) headers['content-type'] = 'application/json';
    return { url: `https://${host}${path}`, headers };
  }

  // Escrituras en cola — 1s de debounce para no saturar S3 con cada keystroke
  const queue = {}, timers = {};

  async function _flush(key) {
    const data = queue[key];
    if (data === undefined) return;
    delete queue[key];
    try {
      const body = JSON.stringify(data, null, 2);
      const { url, headers } = await buildHeaders('PUT', `data/${key}.json`, body);
      const r = await fetch(url, { method: 'PUT', headers, body });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.warn('[S3] PUT error', key, r.status, txt);
      }
    } catch (e) { console.warn('[S3] write failed', key, e.message); }
  }

  async function get(key) {
    try {
      const { url, headers } = await buildHeaders('GET', `data/${key}.json`, '');
      const r = await fetch(url, { headers });
      if (r.status === 404) return null;
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
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

  // Flush inmediato cuando iOS pone la app en background
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return { get, set, flush };
})();
