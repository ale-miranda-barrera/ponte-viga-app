// server/security.js — headers de seguridad + CORS restrictivo.
//
// CSP nota: la app inyecta JS y CSS inline (single-HTML build), así que
// script-src y style-src incluyen 'unsafe-inline'. Fuentes externas: Google Fonts.

function securityHeaders({ allowInlineScript = true } = {}) {
  const scriptSrc = ["'self'", allowInlineScript ? "'unsafe-inline'" : ''].filter(Boolean).join(' ');
  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob:`,
    `connect-src 'self' https://api.anthropic.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  return (req, res, next) => {
    res.set('Content-Security-Policy', csp);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // HSTS solo si sirve por HTTPS (asumimos true si detectamos header)
    if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

// CORS restrictivo. En prod, ALLOWED_ORIGINS='https://ponteviga.duckdns.org'.
//
// IMPORTANTE: por defecto (allowedList vacío) NO se envían CORS headers para
// requests cross-origin. Esto obliga a mismo-origen por defecto. Para
// permitir orígenes externos, hay que enumerarlos explícitamente.
function restrictedCors(allowedList) {
  const allowed = new Set((allowedList || '').split(',').map(s => s.trim()).filter(Boolean));
  return (req, res, next) => {
    const origin = req.headers.origin;
    // Sin Origin header = mismo origen o server-to-server: sin CORS necesario.
    if (!origin) return next();
    // Origen enumerado: emitir headers.
    if (allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    }
    // Cross-origin de origen no permitido: seguir sin headers (browser bloqueará).
    // Para preflight OPTIONS, responder 403 explícito ayuda a debug.
    if (req.method === 'OPTIONS') return res.status(403).end();
    next();
  };
}

module.exports = { securityHeaders, restrictedCors };
