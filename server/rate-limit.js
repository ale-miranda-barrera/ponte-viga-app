// server/rate-limit.js — Rate limiter in-memory por IP.
// Sin dependencias. Buckets se limpian periódicamente.
//
// Uso:
//   const { rateLimit } = require('./server/rate-limit');
//   app.use('/api/foo', rateLimit({ windowMs: 60000, max: 30 }));

function rateLimit({ windowMs = 60_000, max = 60, keyBy = 'ip' } = {}) {
  const buckets = new Map();
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of buckets) {
      const filtered = arr.filter(t => now - t < windowMs);
      if (filtered.length === 0) buckets.delete(k);
      else buckets.set(k, filtered);
    }
  }, Math.max(windowMs, 60_000));
  gcInterval.unref();

  return function rateLimitMw(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .toString().split(',')[0].trim();
    const key = keyBy === 'ip' ? ip : `${ip}|${req.session?.profileName || 'anon'}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - arr[0])) / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        retryAfterMs: windowMs - (now - arr[0]),
      });
    }
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

module.exports = { rateLimit };
