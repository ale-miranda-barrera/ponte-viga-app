// server/logger.js — logger estructurado sin dependencias.
// Emite JSON en prod (para CloudWatch/parseable), texto legible en dev.
//
// Uso:
//   const log = require('./server/logger').child('auth');
//   log.info('login ok', { profile: 'alejo' });
//   log.warn('bad pin', { ip });
//   log.error('db down', { err: e.message });

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;
const PRETTY = process.env.NODE_ENV !== 'production' && !process.env.PONTE_VIGA_TABLE;

function emit(level, context, msg, extra) {
  if ((LEVELS[level] || 0) < MIN_LEVEL) return;
  const rec = {
    t: new Date().toISOString(),
    level,
    ctx: context,
    msg,
    ...(extra || {}),
  };
  const line = PRETTY
    ? formatPretty(rec)
    : JSON.stringify(rec);
  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  target(line);
}

function formatPretty(r) {
  const badge = r.level === 'error' ? '\x1b[31mERR\x1b[0m'
    : r.level === 'warn' ? '\x1b[33mWRN\x1b[0m'
    : r.level === 'info' ? '\x1b[36mINF\x1b[0m'
    : '\x1b[90mDBG\x1b[0m';
  const time = r.t.slice(11, 19);
  const ctx = r.ctx ? `\x1b[35m[${r.ctx}]\x1b[0m` : '';
  const extra = { ...r };
  delete extra.t; delete extra.level; delete extra.ctx; delete extra.msg;
  const extraStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  return `${time} ${badge} ${ctx} ${r.msg}${extraStr}`;
}

function child(context) {
  return {
    debug: (msg, extra) => emit('debug', context, msg, extra),
    info:  (msg, extra) => emit('info',  context, msg, extra),
    warn:  (msg, extra) => emit('warn',  context, msg, extra),
    error: (msg, extra) => emit('error', context, msg, extra),
  };
}

// Request logger middleware. Usa un id corto por request.
function requestLogger(context = 'http') {
  const log = child(context);
  return (req, res, next) => {
    const start = Date.now();
    const rid = Math.random().toString(36).slice(2, 8);
    req._rid = rid;
    res.on('finish', () => {
      const ms = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      emit(level, context, `${req.method} ${req.url} ${res.statusCode} (${ms}ms)`, { rid });
    });
    next();
  };
}

module.exports = { child, requestLogger, LEVELS };
