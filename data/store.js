// Store: localStorage como caché rápida + S3 como persistencia durable
window.GymStore = (function() {
  // ── Claves de datos (se reasignan al seleccionar perfil) ──────────────
  let KEY_SESSIONS = 'gym_sessions_v1';
  let KEY_MEASURES = 'gym_measures_v1';
  let KEY_ACTIVE   = 'gym_active_v1';
  let KEY_SEEDED   = 'gym_seeded_v1';
  let KEY_STATS    = 'gym_profile_v1';   // estadísticas físicas (altura, edad…)
  let KEY_ROUTINE  = 'gym_routine_overrides_v1';

  // ── Claves globales (no dependen del perfil) ──────────────────────────
  const KEY_PROFILES_LIST   = 'gym_profiles_list_v1';
  const KEY_ACTIVE_PROFILE  = 'gym_active_profile_v1';

  // Mapa clave localStorage → nombre en S3 (se reconstruye en initProfile)
  let S3_MAP = {
    [KEY_SESSIONS]: 'sessions',
    [KEY_MEASURES]: 'measures',
    [KEY_STATS]:    'profile',
    [KEY_ROUTINE]:  'routines',
  };

  function _load(k, def) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : def; }
    catch { return def; }
  }

  function _saveLocal(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }

  function _save(k, v) {
    _saveLocal(k, v);
    const s3key = S3_MAP[k];
    if (s3key && window.S3Store) window.S3Store.set(s3key, v);
  }

  function iso(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  }

  return {
    iso,

    // ─── Perfiles ────────────────────────────────────────────────────────
    getProfiles() { return _load(KEY_PROFILES_LIST, []); },

    createProfile(p) { // p = { name, emoji, color }
      const list = this.getProfiles();
      if (list.find(x => x.name === p.name)) return list;
      list.push(p);
      _saveLocal(KEY_PROFILES_LIST, list);
      return list;
    },

    getActiveProfile() { return localStorage.getItem(KEY_ACTIVE_PROFILE) || ''; },
    clearActiveProfile() { localStorage.removeItem(KEY_ACTIVE_PROFILE); },

    // Cambia el perfil activo: reasigna todas las claves al namespace del perfil
    initProfile(name) {
      localStorage.setItem(KEY_ACTIVE_PROFILE, name);
      KEY_SESSIONS = `gym_sessions_v2_${name}`;
      KEY_MEASURES = `gym_measures_v2_${name}`;
      KEY_ACTIVE   = `gym_active_v2_${name}`;
      KEY_SEEDED   = `gym_seeded_v2_${name}`;
      KEY_STATS    = `gym_profile_v2_${name}`;
      KEY_ROUTINE  = `gym_routine_overrides_v2_${name}`;
      S3_MAP = {
        [KEY_SESSIONS]: `${name}_sessions`,
        [KEY_MEASURES]: `${name}_measures`,
        [KEY_STATS]:    `${name}_profile`,
        [KEY_ROUTINE]:  `${name}_routines`,
      };
    },

    // Copia datos v1 (sin perfil) a las claves v2 del perfil indicado
    migrateV1(name) {
      this.initProfile(name);
      const copy = (oldK, newK) => { const v = localStorage.getItem(oldK); if (v) localStorage.setItem(newK, v); };
      copy('gym_sessions_v1',           KEY_SESSIONS);
      copy('gym_measures_v1',           KEY_MEASURES);
      copy('gym_profile_v1',            KEY_STATS);
      copy('gym_routine_overrides_v1',  KEY_ROUTINE);
      copy('gym_seeded_v1',             KEY_SEEDED);
      localStorage.removeItem(KEY_ACTIVE_PROFILE); // fuerza re-selección de perfil
    },

    // Limpia datos del perfil activo para resembrar demo
    resetForDemo() {
      try {
        localStorage.removeItem(KEY_SEEDED);
        localStorage.removeItem(KEY_SESSIONS);
        localStorage.removeItem(KEY_MEASURES);
        localStorage.removeItem(KEY_ACTIVE);
      } catch(e) {}
    },

    // ─── Hidratación desde servidor ──────────────────────────────────────
    async hydrate() {
      if (localStorage.getItem(KEY_SEEDED)) return false;
      if (!window.S3Store) return false;
      const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
      const [sessions, measures, profile, routines] = await Promise.all([
        timed(window.S3Store.get(S3_MAP[KEY_SESSIONS])),
        timed(window.S3Store.get(S3_MAP[KEY_MEASURES])),
        timed(window.S3Store.get(S3_MAP[KEY_STATS])),
        timed(window.S3Store.get(S3_MAP[KEY_ROUTINE])),
      ]);
      let found = false;
      if (sessions) { _saveLocal(KEY_SESSIONS, sessions); found = true; }
      if (measures) { _saveLocal(KEY_MEASURES, measures); found = true; }
      if (profile)  _saveLocal(KEY_STATS, profile);
      if (routines) _saveLocal(KEY_ROUTINE, routines);
      if (found) localStorage.setItem(KEY_SEEDED, '1');
      return found;
    },

    ensureSeed() {
      if (!localStorage.getItem(KEY_SEEDED)) {
        _save(KEY_SESSIONS, {});
        _save(KEY_MEASURES, []);
        localStorage.setItem(KEY_SEEDED, '1');
      }
    },

    seedWithDemo() {
      _save(KEY_SESSIONS, window.SEED_HISTORY || {});
      _save(KEY_MEASURES, [{ date: iso(new Date()), barriga: 103, brazo: 38 }]);
      localStorage.setItem(KEY_SEEDED, '1');
    },

    clearHistory() {
      _save(KEY_SESSIONS, {});
      _save(KEY_MEASURES, []);
      try { localStorage.removeItem(KEY_ACTIVE); } catch(e) {}
    },

    // ─── Sesiones ────────────────────────────────────────────────────────
    getAllSessions()     { return _load(KEY_SESSIONS, {}); },
    getSession(dateIso) { return this.getAllSessions()[dateIso] || null; },
    saveSession(s) {
      const all = this.getAllSessions();
      all[s.date] = s;
      _save(KEY_SESSIONS, all);
    },
    deleteSession(dateIso) {
      const all = this.getAllSessions();
      delete all[dateIso];
      _save(KEY_SESSIONS, all);
    },
    // ─── Medidas ─────────────────────────────────────────────────────────
    getMeasures()  { return _load(KEY_MEASURES, []); },
    saveMeasure(m) {
      const arr = this.getMeasures();
      arr.push(m);
      arr.sort((a,b) => a.date.localeCompare(b.date));
      _save(KEY_MEASURES, arr);
    },

    // ─── Perfil físico ───────────────────────────────────────────────────
    getProfile()   { return _load(KEY_STATS, { height: 175, age: 28, sex: 'm', activity: 1.45, goal: 'deficit' }); },
    saveProfile(p) { _save(KEY_STATS, p); },

    // ─── Rutina ──────────────────────────────────────────────────────────
    getRoutineFor(dow) {
      const overrides = _load(KEY_ROUTINE, {});
      return overrides[dow] || window.WEEK_ROUTINE[dow];
    },
    saveRoutineFor(dow, routine) {
      const overrides = _load(KEY_ROUTINE, {});
      overrides[dow] = routine;
      _save(KEY_ROUTINE, overrides);
    },
    resetRoutineFor(dow) {
      const overrides = _load(KEY_ROUTINE, {});
      delete overrides[dow];
      _save(KEY_ROUTINE, overrides);
    },

    // ─── Sesión activa (ephemeral, no va a S3) ───────────────────────────
    getActive()  { return _load(KEY_ACTIVE, null); },
    setActive(s) { _saveLocal(KEY_ACTIVE, s); },
    clearActive(){ try { localStorage.removeItem(KEY_ACTIVE); } catch(e) {} },

    // ─── Racha ───────────────────────────────────────────────────────────
    computeStreak() {
      const all = this.getAllSessions();
      const overrides = _load(KEY_ROUTINE, {});
      const getDay = (dow) => overrides[dow] || window.WEEK_ROUTINE[dow];
      let streak = 0;
      const today = new Date();

      // Cuenta hoy si ya terminaste
      const todayDow = today.getDay();
      const todayR = getDay(todayDow);
      if (todayR && !todayR.rest && all[iso(today)]?.completed) streak++;

      for (let i = 1; i < 120; i++) {
        const d = new Date(today.getTime() - i*86400000);
        const dow = d.getDay();
        const r = getDay(dow);
        if (!r || r.rest) continue;
        const key = iso(d);
        if (all[key] && all[key].completed) streak++;
        else break;
      }
      return streak;
    },
  };
})();
