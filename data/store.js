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

  // Escribe a memoria + EC2 + emite notificación pubsub
  function _save(k, v) {
    _mem[k] = v;
    const s3key = S3_MAP[k];
    if (s3key && window.S3Store) window.S3Store.set(s3key, v).catch(() => {});
    _emit(k);
  }

  // Escribe global (perfiles, grupos) a memoria + EC2
  function _saveGlobal(memKey, s3key, v) {
    _mem[memKey] = v;
    if (window.S3Store) window.S3Store.set(s3key, v).catch(() => {});
    _emit(memKey);
  }

  // ── Pubsub simple: componentes se suscriben a cambios por "topic" ─────
  // Topics conocidos: 'sessions', 'measures', 'profile', 'routine', 'activities', 'foodLog', 'all'
  const _subs = {};
  function _subscribe(topic, fn) {
    if (!_subs[topic]) _subs[topic] = new Set();
    _subs[topic].add(fn);
    return () => _subs[topic].delete(fn);
  }
  // Emitir usando la KEY de mem: los subscribers reciben notificación por topic derivado
  function _emit(memKey) {
    let topic = null;
    if (memKey === KEY_SESSIONS)      topic = 'sessions';
    else if (memKey === KEY_MEASURES) topic = 'measures';
    else if (memKey === KEY_STATS)    topic = 'profile';
    else if (memKey === KEY_ROUTINE)  topic = 'routine';
    else if (memKey === KEY_ACTS)     topic = 'activities';
    else if (memKey === KEY_PROFILES_LIST) topic = 'profiles';
    else if (memKey === KEY_GROUPS)   topic = 'groups';
    // Notifica al topic + 'all'
    if (topic && _subs[topic]) _subs[topic].forEach(fn => { try { fn(); } catch (e) { console.error('[store sub]', e); } });
    if (_subs.all) _subs.all.forEach(fn => { try { fn(); } catch (e) { console.error('[store sub all]', e); } });
  }

  // Mutación atómica read-modify-write. Evita que dos updates concurrentes
  // pisen la misma clave (típico bug con saveProfile + saveSession que ambos
  // tocan KEY_STATS). Fn recibe el valor actual y devuelve el nuevo.
  function _mutate(k, def, fn) {
    const prev = _load(k, def);
    const next = fn(prev);
    if (next === undefined) return prev;
    _save(k, next);
    return next;
  }

  // Lee localStorage de forma segura (solo para migración y activos ephemeral)
  function _lsGet(k) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; }
  }

  function iso(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  }

  // ── Cálculo canónico de kcal (única fuente de verdad) ─────────────────
  // Convención:
  //   - Ejercicio done: sets_completados × (5 si tiene peso, 3 si es corporal)
  //   - Actividad done con value: value × kcalPerMin (o fallback cal10/10 ó 4)
  //   - Cardio done con minutes: minutes × 5
  // Ejercicios NO done pero con sets>0 (parciales) cuentan proporcional a sets completados.
  function calcSessionKcalPure(s) {
    if (!s) return 0;
    let kcal = 0;
    (s.exercises || []).forEach(ex => {
      const done = ex.done || (ex.sets > 0);
      if (!done) return;
      const setsCount = ex.done ? ex.sets : Math.min(ex.sets, ex.targetSets || ex.sets);
      kcal += setsCount * (ex.weight > 0 ? 5 : 3);
    });
    Object.values(s.activities || {}).forEach(a => {
      if (!a.done || !a.value) return;
      const def = (window.DEFAULT_ACTIVITIES || []).find(x => x.id === a.id);
      const kpm = def?.kcalPerMin ?? (def?.cal10 ? def.cal10 / 10 : 4);
      kcal += Math.round(a.value * kpm);
    });
    if (s.cardioDone && s.cardioMinutes) kcal += Math.round(s.cardioMinutes * 5);
    return kcal;
  }

  return {
    iso,

    // ─── API de reactividad ──────────────────────────────────────────────
    // Ejemplo: useEffect(() => GymStore.subscribe('sessions', bump), [])
    // Topics: 'sessions', 'measures', 'profile', 'routine', 'activities', 'profiles', 'groups', 'all'
    subscribe: _subscribe,

    // Cálculo canónico de kcal por sesión — usar en TODOS los consumidores
    calcSessionKcal: calcSessionKcalPure,

    // Suma kcal quemadas de todas las sesiones del día
    calcDayBurnedKcal(dateIso) {
      return this.getDaySessions(dateIso).reduce((s, sess) => s + calcSessionKcalPure(sess), 0);
    },

    // ─── Perfiles ────────────────────────────────────────────────────────
    getProfiles() { return _load(KEY_PROFILES_LIST, []); },

    // DEPRECATED: Usar `window.S3Store.register()` que crea via /api/auth/register.
    // Este método hace PUT directo sin auth; con las nuevas reglas de guard el
    // servidor rechaza (excepto para admin). Se mantiene por compat.
    createProfile(p) {
      console.warn('[store] GymStore.createProfile deprecated — usar S3Store.register()');
      const list = this.getProfiles();
      if (list.find(x => x.name === p.name)) return list;
      list.push(p);
      _saveGlobal(KEY_PROFILES_LIST, 'profiles', list);
      return list;
    },

    // Siempre trae perfiles del servidor (source of truth)
    async hydrateProfiles() {
      if (!window.S3Store) return;
      const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 10000))]).catch(() => null);
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
      const timed = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 10000))]).catch(() => null);
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

    // Reemplaza toda la lista de perfiles en memoria + servidor. Usado por admin.
    saveProfiles(list) { _saveGlobal(KEY_PROFILES_LIST, 'profiles', list); },

    // Perfil activo: localStorage (preferencia de dispositivo, no dato de usuario)
    getActiveProfile() { return localStorage.getItem(KEY_ACTIVE_PROFILE) || ''; },
    clearActiveProfile() { localStorage.removeItem(KEY_ACTIVE_PROFILE); },

    // ─── Auth: proxy a S3Store para tokens (una sola fuente en cliente) ──
    setToken(token) { if (window.S3Store && window.S3Store.setToken) window.S3Store.setToken(token); },
    getToken() { return window.S3Store && window.S3Store.getToken ? window.S3Store.getToken() : null; },
    hasToken() { return !!this.getToken(); },

    async logout() {
      try { if (window.S3Store && window.S3Store.logout) await window.S3Store.logout(); } catch (e) {}
      this.clearActiveProfile();
      try { localStorage.removeItem(KEY_ACTIVE); } catch (e) {}
    },

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
    //   - Timeout de 10s por petición (suficiente para Dynamo cold start).
    //   - Distingue "404/empty" (data === null) de "timeout/error" (data === undefined).
    //   - Si TODAS las claves dan timeout, devolvemos { ok: false } para que la
    //     app pueda alertar en vez de seedear vacío y sobreescribir el servidor.
    async hydrate() {
      if (!window.S3Store) return { ok: false, hasData: false };

      try {
        // Marcador único: undefined = error/timeout, null = 404 confirmado, dato = ok
        const ERR = Symbol('ERR');
        const timed = (p) => Promise.race([
          p,
          new Promise(r => setTimeout(() => r(ERR), 10000)),
        ]).catch(() => ERR);

        const [sessions, measures, profile, routines, activities] = await Promise.all([
          timed(window.S3Store.get(S3_MAP[KEY_SESSIONS])),
          timed(window.S3Store.get(S3_MAP[KEY_MEASURES])),
          timed(window.S3Store.get(S3_MAP[KEY_STATS])),
          timed(window.S3Store.get(S3_MAP[KEY_ROUTINE])),
          timed(window.S3Store.get(S3_MAP[KEY_ACTS])),
        ]);

        const allFailed = [sessions, measures, profile, routines, activities].every(v => v === ERR);
        if (allFailed) return { ok: false, hasData: false };

        if (sessions && sessions !== ERR)     _mem[KEY_SESSIONS] = sessions;
        if (measures && measures !== ERR)     _mem[KEY_MEASURES] = measures;
        if (profile && profile !== ERR)       _mem[KEY_STATS]    = profile;
        if (routines && routines !== ERR)     _mem[KEY_ROUTINE]  = routines;
        if (activities && activities !== ERR) _mem[KEY_ACTS]     = activities;

        // Migración única: actividades custom que solo estaban en localStorage
        if (activities === null) {
          const legacyActs = _lsGet('gym_activity_catalog_v1');
          if (legacyActs && legacyActs.length > 0) {
            _mem[KEY_ACTS] = legacyActs;
            window.S3Store.set(S3_MAP[KEY_ACTS], legacyActs).catch(() => {});
          }
        }

        const hasData = !!(
          (sessions && sessions !== ERR) ||
          (measures && measures !== ERR) ||
          (profile && profile !== ERR) ||
          (routines && routines !== ERR) ||
          (activities && activities !== ERR)
        );
        return { ok: true, hasData };
      } catch (e) {
        console.error('[Store] hydrate error:', e);
        return { ok: false, hasData: false };
      }
    },

    // Seed solo en memoria — NO escribe vacío al servidor. Esto evita el bug
    // donde un timeout de hydrate hacía que la app sobreescribiera datos
    // existentes con valores por defecto. La primera escritura real (saveSession,
    // saveMeasure, etc.) sí persiste, partiendo de la estructura correcta.
    ensureSeed() {
      if (_load(KEY_SESSIONS, null) == null) _mem[KEY_SESSIONS] = {};
      if (_load(KEY_MEASURES, null) == null) _mem[KEY_MEASURES] = [];
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
    // Migración defensiva: una entrada puede ser un objeto legacy (una sola
    // sesión) o un array (múltiples sesiones por día). Siempre normalizar a
    // array internamente para simplificar el resto del código.
    // Copia defensiva: retorna array nuevo para que llamadores no muten _mem.
    _normDay(entry) {
      if (!entry) return [];
      if (Array.isArray(entry)) return entry.slice();
      return [entry]; // objeto legacy → array de 1
    },

    // ─── Estado de sincronización ─────────────────────────────────────────
    // Retorna { pending: bool, hasToken: bool } para que UI muestre indicador.
    getConnectionStatus() {
      return {
        pending: !!(window.S3Store && window.S3Store.hasPendingWrites && window.S3Store.hasPendingWrites()),
        hasToken: !!(window.S3Store && window.S3Store.getToken && window.S3Store.getToken()),
      };
    },

    getAllSessions() { return _load(KEY_SESSIONS, {}); },

    // Lista plana de todas las sesiones (útil para historial, progreso, PB, etc.)
    getAllSessionsFlat() {
      const result = [];
      Object.values(this.getAllSessions()).forEach(entry => {
        if (Array.isArray(entry)) entry.forEach(s => result.push(s));
        else if (entry && entry.date) result.push(entry);
      });
      return result;
    },

    // Devuelve SIEMPRE un array de sesiones del día (vacío si no hay ninguna)
    getDaySessions(dateIso) {
      return this._normDay(this.getAllSessions()[dateIso]);
    },

    // Compatibilidad: devuelve la primera sesión del día o null (legacy API).
    // Internamente ya usamos getDaySessions en la mayoría de los lugares.
    getSession(dateIso) {
      const arr = this.getDaySessions(dateIso);
      return arr.length > 0 ? arr[0] : null;
    },

    // Nueva API singular para la vista de HOY: devuelve la sesión activa del día
    // (la última si es array legacy, el objeto si ya es objeto, null si no hay nada).
    // NO elimina los anteriores del array — los preserva en storage.
    getDaySession(dateIso) {
      const arr = this.getDaySessions(dateIso);
      return arr.length > 0 ? arr[arr.length - 1] : null;
    },

    // Guarda/actualiza una sesión. Si tiene sessionId la actualiza en su
    // posición; si no, la añade al array del día. Atomic vs otros writers de KEY_SESSIONS.
    saveSession(s) {
      let updatedDayArr = null;
      _mutate(KEY_SESSIONS, {}, (all) => {
        const arr = Array.isArray(all[s.date]) ? [...all[s.date]] : (all[s.date] ? [all[s.date]] : []);
        const idx = s.sessionId ? arr.findIndex(x => x && x.sessionId === s.sessionId) : -1;
        if (idx >= 0) arr[idx] = s;
        else arr.push(s);
        updatedDayArr = arr;
        return { ...all, [s.date]: arr };
      });
      if (updatedDayArr) this._updateDailyTotals(s.date, updatedDayArr);
    },

    // Recalcula y persiste dailyTotals para un día dado. Retro-compatible: si no existe
    // el campo en cargas antiguas, se calcula al vuelo cuando se llama saveSession.
    // Usa _mutate para evitar pisar foodLog / otros campos que pueden estar cambiando concurrente.
    _updateDailyTotals(dateIso, daySessions) {
      let totalKcal = 0, totalExercises = 0;
      daySessions.forEach(s => { totalKcal += calcSessionKcalPure(s); totalExercises += (s.exercises || []).filter(e => e.done).length; });
      _mutate(KEY_STATS, {}, (p) => ({
        ...p,
        dailyTotals: {
          ...(p.dailyTotals || {}),
          [dateIso]: { kcal: totalKcal, exercises: totalExercises, sessionsCount: daySessions.length },
        },
      }));
    },

    deleteSession(dateIso) {
      _mutate(KEY_SESSIONS, {}, (all) => {
        const next = { ...all };
        delete next[dateIso];
        return next;
      });
    },

    // Elimina una sesión específica del día por sessionId
    deleteDaySession(dateIso, sessionId) {
      _mutate(KEY_SESSIONS, {}, (all) => {
        const arr = (Array.isArray(all[dateIso]) ? all[dateIso] : (all[dateIso] ? [all[dateIso]] : []))
          .filter(s => s && s.sessionId !== sessionId);
        const next = { ...all };
        if (arr.length === 0) delete next[dateIso];
        else next[dateIso] = arr;
        return next;
      });
    },

    // ─── Medidas ─────────────────────────────────────────────────────────
    getMeasures()  { return _load(KEY_MEASURES, []); },
    saveMeasure(m) {
      // Sanitiza: peso/barriga/brazo dentro de rangos plausibles
      const clean = {
        date: m.date,
        peso:    m.peso    != null ? Math.max(20, Math.min(300, Number(m.peso)))    : null,
        barriga: m.barriga != null ? Math.max(30, Math.min(200, Number(m.barriga))) : null,
        brazo:   m.brazo   != null ? Math.max(15, Math.min(80,  Number(m.brazo)))   : null,
      };
      _mutate(KEY_MEASURES, [], (arr) => {
        const next = [...arr, clean];
        next.sort((a, b) => a.date.localeCompare(b.date));
        return next;
      });
    },

    // ─── Perfil físico ───────────────────────────────────────────────────
    // deficitKcal: magnitud del ajuste (positivo). Se resta si goal='deficit', se suma si 'surplus'.
    //   Rango razonable: 250 (suave) a 1000 (muy agresivo). Default 500 (moderado).
    // targetWeightKg: peso meta en kg. null = usa IMC 22 automático.
    getProfile()   { return _load(KEY_STATS, { height: 175, age: 28, sex: 'm', activity: 1.45, goal: 'deficit', deficitKcal: 500, targetWeightKg: null, daysPerWeek: 5, extraActivities: [] }); },
    // Merge de patch en vez de reemplazo total. Preserva foodLog/dailyTotals que otros callsites tocan.
    saveProfile(patch) { _mutate(KEY_STATS, {}, (p) => ({ ...p, ...patch })); },

    // ─── Registro de comidas (kcal consumidas por día) ────────────────────
    // Guardado dentro de KEY_STATS.foodLog[dateIso] = [{ id, name, kcal, ts }]
    // Todas las mutaciones usan _mutate para atomicidad vs saveSession / saveProfile.
    getFoodLog(dateIso) {
      const p = _load(KEY_STATS, {});
      return (p.foodLog || {})[dateIso] || [];
    },

    addFoodEntry(dateIso, entry) {
      // Sanitización: kcal debe ser positivo, name no vacío, cap razonable
      const kcal = Math.max(0, Math.min(9999, Math.round(Number(entry.kcal) || 0)));
      const name = String(entry.name || '').trim().slice(0, 60);
      if (!name || kcal <= 0) return null;
      const item = { id: 'food_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ts: Date.now(), name, kcal };
      _mutate(KEY_STATS, {}, (p) => ({
        ...p,
        foodLog: { ...(p.foodLog || {}), [dateIso]: [...((p.foodLog || {})[dateIso] || []), item] },
      }));
      return item;
    },

    removeFoodEntry(dateIso, id) {
      _mutate(KEY_STATS, {}, (p) => ({
        ...p,
        foodLog: { ...(p.foodLog || {}), [dateIso]: ((p.foodLog || {})[dateIso] || []).filter(e => e.id !== id) },
      }));
    },

    // Restaura una entrada específica (para undo). Devuelve true si se aplicó.
    restoreFoodEntry(dateIso, item) {
      if (!item || !item.id) return false;
      _mutate(KEY_STATS, {}, (p) => ({
        ...p,
        foodLog: { ...(p.foodLog || {}), [dateIso]: [...((p.foodLog || {})[dateIso] || []), item].sort((a, b) => a.ts - b.ts) },
      }));
      return true;
    },

    // Suma total de kcal consumidas por día (para el resumen)
    getDayFoodKcal(dateIso) {
      return this.getFoodLog(dateIso).reduce((s, e) => s + (Number(e.kcal) || 0), 0);
    },

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
      const overrides = _load(KEY_ROUTINE, {});
      const getDay = (dow) => overrides[dow] || window.WEEK_ROUTINE[dow];
      let streak = 0;
      const today = new Date();

      const todayDow = today.getDay();
      const todayR = getDay(todayDow);
      if (todayR && !todayR.rest && this.getDaySessions(iso(today)).length > 0) streak++;

      for (let i = 1; i < 120; i++) {
        const d = new Date(today.getTime() - i*86400000);
        const dow = d.getDay();
        const r = getDay(dow);
        if (!r || r.rest) continue;
        const key = iso(d);
        if (this.getDaySessions(key).length > 0) streak++;
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

    // Devuelve las últimas N sesiones (planas, desc por fecha) que contengan ejerciseName.
    // excludeSessionId: excluye la sesión actual para no comparar contra sí misma.
    // Compara por nombre normalizado (lowercase, sin espacios extra).
    getExerciseHistory(exerciseName, excludeSessionId, limit = 2) {
      const norm = (n) => n.toLowerCase().trim();
      const target = norm(exerciseName);
      return this.getAllSessionsFlat()
        .filter(s => s.sessionId !== excludeSessionId && (s.exercises || []).some(e => norm(e.name || '') === target))
        .sort((a, b) => b.date.localeCompare(a.date) || ((b.startTime||0) - (a.startTime||0)))
        .slice(0, limit);
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

    // Mapa id→ejercicio actualizado con overrides del perfil actual.
    // Útil para renderizar nombres de ejercicios en sesiones históricas
    // aunque el usuario haya renombrado o creado ejercicios custom.
    getAllExMeta() {
      const meta = { ...(window._allExMeta || {}) };
      const overrides = _load(KEY_ROUTINE, {});
      Object.values(overrides).forEach(r => {
        (r.exercises || []).forEach(e => { if (e.id) meta[e.id] = e; });
      });
      // También el nombre puede haber cambiado en sesiones históricas: recorrer sesiones flat
      const sessions = this.getAllSessionsFlat();
      sessions.forEach(s => {
        (s.exercises || []).forEach(e => {
          if (!meta[e.id] && e.id) meta[e.id] = { id: e.id, name: e.name || e.id, sub: e.sub || '' };
        });
      });
      return meta;
    },

    saveCustomActivity(a) {
      const custom = _load(KEY_ACTS, []);
      custom.push({ ...a, id: 'custom_' + Date.now() });
      _save(KEY_ACTS, custom);
    },

    // ─── Pool global de ejercicios ────────────────────────────────────────
    // Reúne ejercicios de TODOS los días de la rutina del perfil actual + resto de perfiles del grupo.
    // Deduplica por (name+sub) normalizados. Excluye IDs ya en el draft (currentExIds).
    getGlobalExercisePool(currentExIds) {
      const seen = new Set();
      const result = [];
      const currentProfile = this.getActiveProfile();

      // Helper: agrega ejercicios de un perfil (desde su rutina de los 7 días)
      const addFromRoutineOverrides = (overrides, defaultWeekRoutine, sourceProfile) => {
        for (let d = 0; d <= 6; d++) {
          const r = (overrides && overrides[d]) || (defaultWeekRoutine && defaultWeekRoutine[d]);
          if (!r || r.rest) continue;
          (r.exercises || []).forEach(ex => {
            if (currentExIds && currentExIds.has(ex.id)) return;
            const key = (ex.name + '|' + (ex.sub || '')).toLowerCase().trim();
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ ...ex, sourceProfile });
          });
        }
      };

      // 1. Ejercicios del perfil actual (todos los días, no solo el editado)
      const myOverrides = _load(KEY_ROUTINE, {});
      addFromRoutineOverrides(myOverrides, window.WEEK_ROUTINE, null);

      // 2. Ejercicios de otros perfiles del grupo (asíncrono no disponible aquí;
      //    usamos solo los datos en memoria — suficiente si el perfil fue activo antes)
      const groups = this.getGroups();
      const myGroups = Object.entries(groups)
        .filter(([, g]) => g.members.includes(currentProfile))
        .map(([code]) => code);

      const profiles = this.getProfiles();
      profiles.forEach(p => {
        if (p.name === currentProfile) return;
        // Solo incluir si comparte grupo con el perfil actual
        const inSameGroup = myGroups.some(code => {
          const g = groups[code];
          return g && g.members.includes(p.name);
        });
        if (!inSameGroup) return;

        // Intentar obtener rutinas del perfil desde memoria (si estuvo activo en esta sesión)
        const otherRoutineKey = `gym_routine_overrides_v2_${p.name}`;
        const otherOverrides = _load(otherRoutineKey, null);
        addFromRoutineOverrides(otherOverrides, window.WEEK_ROUTINE, p.name);
      });

      return result;
    },

    // ─── Estadísticas de perfil (para leaderboard, etc) ──────────────────
    // Async: lee las sesiones del servidor (S3/EC2). Cache simple para no
    // re-pedir cada render del leaderboard.
    _statsCache: {},
    async getProfileStats(profileName) {
      let sessions = this._statsCache[profileName];
      if (!sessions) {
        if (window.S3Store) {
          const data = await window.S3Store.get(`${profileName}_sessions`);
          sessions = data && typeof data === 'object' ? data : {};
        } else {
          sessions = {};
        }
        this._statsCache[profileName] = sessions;
      }

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

      // Aplanar: cada día puede ser objeto legacy o array de sesiones
      const flatSessions = [];
      Object.values(sessions).forEach(entry => {
        if (Array.isArray(entry)) entry.forEach(s => flatSessions.push(s));
        else if (entry && entry.date) flatSessions.push(entry);
      });

      flatSessions.forEach(s => {
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

      // Racha: días consecutivos con al menos una sesión completada
      // Normaliza entrada del día a array defensivamente
      const dayHasCompleted = (dStr) => {
        const entry = sessions[dStr];
        if (!entry) return false;
        if (Array.isArray(entry)) return entry.some(s => s.completed);
        return !!entry.completed;
      };
      let streak = 0;
      if (dayHasCompleted(todayStr)) streak++;
      for (let i = 1; i < 120; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        const dStr = toIso(d);
        const routineDay = window.WEEK_ROUTINE?.[d.getDay()];
        if (routineDay?.rest) continue;
        if (dayHasCompleted(dStr)) streak++;
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
