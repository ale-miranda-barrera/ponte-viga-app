// Store: memoria en sesión + EC2 como única persistencia durable.
// localStorage solo para: perfil activo (preferencia de dispositivo) y sesión activa (ephemeral).
window.GymStore = (function() {
  // ── Cache en memoria (sin localStorage para datos) ────────────────────
  let _mem = {};

  // ── Claves de datos (se reasignan en initProfile) ─────────────────────
  let KEY_SESSIONS = 'gym_sessions_v2_default';
  let KEY_MEASURES = 'gym_measures_v2_default';
  let KEY_ACTIVE   = 'gym_active_v2_default';   // localStorage solo (ephemeral)
  let KEY_STATS    = 'gym_profile_v2_default';
  let KEY_ROUTINE  = 'gym_routine_overrides_v2_default';
  let KEY_ACTS     = 'gym_activity_catalog_v2_default';

  // ── Claves globales ────────────────────────────────────────────────────
  const KEY_PROFILES_LIST  = 'gym_profiles_list_v1';
  const KEY_ACTIVE_PROFILE = 'gym_active_profile_v1';
  const KEY_GROUPS         = 'gym_groups_v1';

  // ── Mapa a nombres EC2 ─────────────────────────────────────────────────
  let S3_MAP = {};

  // Lee de memoria
  function _load(k, def) {
    const v = _mem[k];
    return v !== undefined ? v : def;
  }

  // Escribe a memoria + EC2
  function _save(k, v) {
    _mem[k] = v;
    const s3key = S3_MAP[k];
    if (s3key && window.S3Store) window.S3Store.set(s3key, v).catch(() => {});
  }

  // Escribe global (perfiles, grupos) a memoria + EC2
  function _saveGlobal(memKey, s3key, v) {
    _mem[memKey] = v;
    if (window.S3Store) window.S3Store.set(s3key, v).catch(() => {});
  }

  // Lee localStorage de forma segura (solo para migración y activos ephemeral)
  function _lsGet(k) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; }
  }

  function iso(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  }

  return {
    iso,

    // ─── Perfiles ────────────────────────────────────────────────────────
    getProfiles() { return _load(KEY_PROFILES_LIST, []); },

    createProfile(p) {
      const list = this.getProfiles();
      if (list.find(x => x.name === p.name)) return list;
      list.push(p);
      _saveGlobal(KEY_PROFILES_LIST, 'profiles', list);
      return list;
    },

    // Siempre trae perfiles del servidor (source of truth)
    async hydrateProfiles() {
      if (!window.S3Store) return;
      const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
      const serverProfiles = await timed(window.S3Store.get('profiles'));
      if (serverProfiles && serverProfiles.length > 0) {
        // Server es autoritativo; preservar perfiles locales nuevos no sincronizados aún
        const local = _load(KEY_PROFILES_LIST, []);
        const merged = [...serverProfiles];
        local.forEach(lp => { if (!merged.find(sp => sp.name === lp.name)) merged.push(lp); });
        _mem[KEY_PROFILES_LIST] = merged;
      }
    },

    // Siempre trae grupos del servidor
    async hydrateGroups() {
      if (!window.S3Store) return;
      const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
      const serverGroups = await timed(window.S3Store.get('groups'));
      if (serverGroups) _mem[KEY_GROUPS] = serverGroups;
    },

    deleteProfile(name) {
      const list = this.getProfiles().filter(p => p.name !== name);
      _saveGlobal(KEY_PROFILES_LIST, 'profiles', list);
      const groups = this.getGroups();
      let changed = false;
      Object.keys(groups).forEach(k => {
        const before = groups[k].members.length;
        groups[k].members = groups[k].members.filter(m => m !== name);
        if (groups[k].members.length !== before) changed = true;
      });
      if (changed) _saveGlobal(KEY_GROUPS, 'groups', groups);
      return list;
    },

    saveGroups(groups) { _saveGlobal(KEY_GROUPS, 'groups', groups); },

    // Perfil activo: localStorage (preferencia de dispositivo, no dato de usuario)
    getActiveProfile() { return localStorage.getItem(KEY_ACTIVE_PROFILE) || ''; },
    clearActiveProfile() { localStorage.removeItem(KEY_ACTIVE_PROFILE); },

    initProfile(name) {
      localStorage.setItem(KEY_ACTIVE_PROFILE, name);
      KEY_SESSIONS = `gym_sessions_v2_${name}`;
      KEY_MEASURES = `gym_measures_v2_${name}`;
      KEY_ACTIVE   = `gym_active_v2_${name}`;
      KEY_STATS    = `gym_profile_v2_${name}`;
      KEY_ROUTINE  = `gym_routine_overrides_v2_${name}`;
      KEY_ACTS     = `gym_activity_catalog_v2_${name}`;
      S3_MAP = {
        [KEY_SESSIONS]: `${name}_sessions`,
        [KEY_MEASURES]: `${name}_measures`,
        [KEY_STATS]:    `${name}_profile`,
        [KEY_ROUTINE]:  `${name}_routines`,
        [KEY_ACTS]:     `${name}_activities`,
      };
    },

    migrateV1() { /* no-op: datos ya en EC2 */ },

    // ─── Hidratación desde servidor (siempre, sin caché localStorage) ────
    async hydrate() {
      if (!window.S3Store) return false;

      try {
        // Timeout agresivo: si tarda más de 2s, timeout
        const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 2000))]).catch(() => null);

        const [sessions, measures, profile, routines, activities] = await Promise.all([
          timed(window.S3Store.get(S3_MAP[KEY_SESSIONS])),
          timed(window.S3Store.get(S3_MAP[KEY_MEASURES])),
          timed(window.S3Store.get(S3_MAP[KEY_STATS])),
          timed(window.S3Store.get(S3_MAP[KEY_ROUTINE])),
          timed(window.S3Store.get(S3_MAP[KEY_ACTS])),
        ]);

        if (sessions)   _mem[KEY_SESSIONS] = sessions;
        if (measures)   _mem[KEY_MEASURES] = measures;
        if (profile)    _mem[KEY_STATS]    = profile;
        if (routines)   _mem[KEY_ROUTINE]  = routines;
        if (activities) _mem[KEY_ACTS]     = activities;

        // Migración única: actividades custom que solo estaban en localStorage
        if (!activities) {
          const legacyActs = _lsGet('gym_activity_catalog_v1');
          if (legacyActs && legacyActs.length > 0) {
            _mem[KEY_ACTS] = legacyActs;
            window.S3Store.set(S3_MAP[KEY_ACTS], legacyActs).catch(() => {});
          }
        }

        return !!(sessions || measures || profile || routines || activities);
      } catch (e) {
        console.error('[Store] hydrate error:', e);
        return false;
      }
    },

    ensureSeed() {
      if (!_load(KEY_SESSIONS, null)) _save(KEY_SESSIONS, {});
      if (!_load(KEY_MEASURES, null)) _save(KEY_MEASURES, []);
    },

    seedWithDemo() {
      _save(KEY_SESSIONS, window.SEED_HISTORY || {});
      _save(KEY_MEASURES, [{ date: iso(new Date()), barriga: 103, brazo: 38 }]);
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
    getProfile()   { return _load(KEY_STATS, { height: 175, age: 28, sex: 'm', activity: 1.45, goal: 'deficit', daysPerWeek: 5, extraActivities: [] }); },
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

    // ─── Sesión activa (localStorage: ephemeral, específica del dispositivo) ──
    getActive()  { try { const r = localStorage.getItem(KEY_ACTIVE); return r ? JSON.parse(r) : null; } catch { return null; } },
    setActive(s) { try { localStorage.setItem(KEY_ACTIVE, JSON.stringify(s)); } catch(e) {} },
    clearActive(){ try { localStorage.removeItem(KEY_ACTIVE); } catch(e) {} },

    // ─── Racha ───────────────────────────────────────────────────────────
    computeStreak() {
      const all = this.getAllSessions();
      const overrides = _load(KEY_ROUTINE, {});
      const getDay = (dow) => overrides[dow] || window.WEEK_ROUTINE[dow];
      let streak = 0;
      const today = new Date();

      const todayDow = today.getDay();
      const todayR = getDay(todayDow);
      if (todayR && !todayR.rest && all[iso(today)]) streak++;

      for (let i = 1; i < 120; i++) {
        const d = new Date(today.getTime() - i*86400000);
        const dow = d.getDay();
        const r = getDay(dow);
        if (!r || r.rest) continue;
        const key = iso(d);
        if (all[key]) streak++;
        else break;
      }
      return streak;
    },

    // ─── Grupos ───────────────────────────────────────────────────────────
    getGroups() { return _load(KEY_GROUPS, {}); },

    createGroup(code, name) {
      const groups = this.getGroups();
      const key = code.startsWith('#') ? code : '#' + code;
      if (!groups[key]) groups[key] = { name, members: [] };
      _saveGlobal(KEY_GROUPS, 'groups', groups);
      return key;
    },

    joinGroup(code, profileName) {
      const groups = this.getGroups();
      const key = code.startsWith('#') ? code.toLowerCase() : '#' + code.toLowerCase();
      if (!groups[key]) groups[key] = { name: key.slice(1), members: [] };
      if (!groups[key].members.includes(profileName)) groups[key].members.push(profileName);
      _saveGlobal(KEY_GROUPS, 'groups', groups);
    },

    leaveGroup(code, profileName) {
      const groups = this.getGroups();
      const key = code.startsWith('#') ? code : '#' + code;
      if (groups[key]) {
        groups[key].members = groups[key].members.filter(m => m !== profileName);
        _saveGlobal(KEY_GROUPS, 'groups', groups);
      }
    },

    getGroupMembers(code) {
      const groups = this.getGroups();
      const key = code.startsWith('#') ? code : '#' + code;
      return groups[key]?.members || [];
    },

    getProfileGroups(profileName) {
      const groups = this.getGroups();
      return Object.entries(groups)
        .filter(([, g]) => g.members.includes(profileName))
        .map(([code, g]) => ({ code, name: g.name }));
    },

    getGroupFriends(profileName) {
      const myGroups = this.getProfileGroups(profileName);
      const friendNames = new Set();
      myGroups.forEach(({ code }) =>
        this.getGroupMembers(code).forEach(m => { if (m !== profileName) friendNames.add(m); })
      );
      return this.getProfiles().filter(p => friendNames.has(p.name));
    },

    // ─── Actividades custom (por perfil, en EC2) ──────────────────────────
    getActivities() {
      const custom = _load(KEY_ACTS, []);
      return [...(window.DEFAULT_ACTIVITIES || []), ...custom];
    },

    saveCustomActivity(a) {
      const custom = _load(KEY_ACTS, []);
      custom.push({ ...a, id: 'custom_' + Date.now() });
      _save(KEY_ACTS, custom);
    },

    // ─── Estadísticas de perfil (para leaderboard, etc) ──────────────────
    getProfileStats(profileName) {
      let sessions = {};
      try {
        const raw = localStorage.getItem(`gym_sessions_v2_${profileName}`);
        sessions = raw ? JSON.parse(raw) : {};
      } catch(e) {}

      const toIso = (d) =>
        d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

      const today = new Date();
      const todayStr = toIso(today);

      // Semana: lunes a hoy
      const dow = today.getDay();
      const daysFromMon = dow === 0 ? 6 : dow - 1;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysFromMon);
      weekStart.setHours(0,0,0,0);

      let weekSessions = 0;
      let maxCardioWeek = 0;
      const prevBest = {};
      const weekBest = {};

      Object.values(sessions).forEach(s => {
        if (!s.completed) return;
        const sDate = new Date(s.date + 'T12:00:00');
        const isThisWeek = sDate >= weekStart && s.date <= todayStr;

        if (isThisWeek) weekSessions++;
        if (isThisWeek && s.cardioMinutes > maxCardioWeek) maxCardioWeek = s.cardioMinutes;

        (s.exercises || []).forEach(ex => {
          const w = ex.weight || 0;
          if (w <= 0) return;
          if (isThisWeek) {
            if (!weekBest[ex.id] || w > weekBest[ex.id]) weekBest[ex.id] = w;
          } else {
            if (!prevBest[ex.id] || w > prevBest[ex.id]) prevBest[ex.id] = w;
          }
        });
      });

      // Racha: días consecutivos con sesión completada
      let streak = 0;
      if (sessions[todayStr]?.completed) streak++;
      for (let i = 1; i < 120; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        const dStr = toIso(d);
        const routineDay = window.WEEK_ROUTINE?.[d.getDay()];
        if (routineDay?.rest) continue;
        if (sessions[dStr]?.completed) streak++;
        else break;
      }

      // PR: subió peso esta semana vs antes
      let hasPR = false;
      Object.keys(weekBest).forEach(id => {
        if (!prevBest[id] || weekBest[id] > prevBest[id]) hasPR = true;
      });

      return { weekSessions, maxCardioWeek, streak, hasPR };
    },
  };
})();
