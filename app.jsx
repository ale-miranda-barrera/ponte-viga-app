// App shell: navegación por tabs, modales, hoy/calendario/semana/historial/medidas
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
};

const App = ({ onSwitchProfile }) => {
  // Tweaks
  const [tweaks, setTweaks] = useState(window.__TWEAKS__);
  const [showTweaks, setShowTweaks] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setShowTweaks(true);
      if (e.data?.type === '__deactivate_edit_mode') setShowTweaks(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', tweaks.accent);
    document.documentElement.style.setProperty('--accent-2', tweaks.accent2);
    document.documentElement.style.setProperty('--accent-soft', tweaks.accent + '24');
    document.body.style.fontSize = tweaks.fontSize + 'px';
  }, [tweaks]);

  const updateTweak = useCallback((patch) => {
    setTweaks(prev => ({ ...prev, ...patch }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  }, []);

  const [tab, setTab] = useState(() => localStorage.getItem('gym_tab') || 'today');
  useEffect(() => { localStorage.setItem('gym_tab', tab); }, [tab]);

  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);
  const greeting = useMemo(getGreeting, []);

  const [moodOpen, setMoodOpen] = useState(false);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [swapOpen, setSwapOpen] = useState(false);
  const [completionData, setCompletionData] = useState(null);

  const today = new Date();
  const dow = today.getDay();

  // Recarga cuando cambia el día (setInterval cada 60s + visibilitychange)
  const mountedDayRef = useRef(window.GymStore.iso(today));
  useEffect(() => {
    const check = () => {
      if (window.GymStore.iso(new Date()) !== mountedDayRef.current) {
        window.location.reload();
      }
    };
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const [routineVer, setRoutineVer] = useState(0);
  // Swap ephemeral: solo para esta sesión, no modifica el horario semanal.
  // Se descarta al recargar la app o al cambiar de día.
  const [todaySwapDow, setTodaySwapDow] = useState(null);
  const routine = useMemo(() => {
    const effective = todaySwapDow != null ? todaySwapDow : dow;
    return window.GymStore.getRoutineFor(effective);
  }, [routineVer, dow, todaySwapDow]);

  const [editingRoutine, setEditingRoutine] = useState(false);
  const [editingDow, setEditingDow] = useState(dow);

  const openRoutineEditor = useCallback((d) => {
    setEditingDow(d !== undefined ? d : dow);
    setEditingRoutine(true);
  }, [dow]);

  const streak = useMemo(() => window.GymStore.computeStreak(), [refresh]);
  const todayIso = window.GymStore.iso(today);
  const todaySession = useMemo(() => window.GymStore.getSession(todayIso), [refresh]);

  const profileInfo = useMemo(() => {
    const name = window.GymStore.getActiveProfile();
    return window.GymStore.getProfiles().find(p => p.name === name) || null;
  }, []);

  const [active, setActive] = useState(() => {
    const a = window.GymStore.getActive();
    return (a && a.date === todayIso) ? a : null;
  });

  const startWorkout = useCallback((mood) => {
    // Peso inteligente: usar máximo histórico por ejercicio como punto de partida
    const pb = {};
    Object.values(window.GymStore.getAllSessions())
      .filter(s => s.date < todayIso)
      .forEach(s => (s.exercises || []).forEach(e => {
        if (e.weight > 0 && (pb[e.id] == null || e.weight > pb[e.id])) pb[e.id] = e.weight;
      }));

    const session = {
      date: todayIso, dow, title: routine.title, mood,
      startTime: Date.now(),
      exercises: (routine.exercises || []).map(ex => ({
        id: ex.id,
        weight: pb[ex.id] != null ? pb[ex.id] : ex.weight,
        sets: 0, targetSets: ex.sets, reps: ex.reps, done: false,
      })),
      activities: Object.fromEntries(
        (routine.activities || []).map(a => [a.id, { id: a.id, done: false, value: a.defaultVal || 10 }])
      ),
      cardioDone: false, completed: false,
    };
    window.GymStore.setActive(session);
    setActive(session);
    setMoodOpen(false);
  }, [todayIso, dow, routine.title]);

  const updateExercise = useCallback((exId, state) => {
    setActive(prev => {
      const next = { ...prev, exercises: prev.exercises.map(e => e.id === exId ? state : e) };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const updateActivity = useCallback((actId, state) => {
    setActive(prev => {
      const next = { ...prev, activities: { ...(prev.activities || {}), [actId]: state } };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const toggleCardio = useCallback((minutes, laps) => {
    setActive(prev => {
      const next = { ...prev, cardioDone: !prev.cardioDone, cardioMinutes: minutes, cardioLaps: laps };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const finish = useCallback((isComplete) => {
    setActive(prev => {
      if (!prev) return null;
      const final = { ...prev, completed: !!isComplete, endTime: Date.now() };
      window.GymStore.saveSession(final);
      window.GymStore.clearActive();
      if (isComplete) setCompletionData(final);
      return null;
    });
    setRefresh(r => r + 1);
  }, []);

  const resumeSession = useCallback(() => {
    const saved = window.GymStore.getSession(window.GymStore.iso(new Date()));
    if (!saved) {
      window.location.reload();
      return;
    }
    window.GymStore.setActive(saved);
    setActive(saved);
  }, []);

  const addExerciseToSession = useCallback((exDef) => {
    setActive(prev => {
      if (!prev) return prev;
      const alreadyIn = (prev.exercises || []).some(e => e.id === exDef.id);
      if (alreadyIn) return prev;
      const exState = { id: exDef.id, weight: exDef.weight || 0, sets: 0, targetSets: exDef.sets || 3, reps: exDef.reps || 10, done: false };
      const exercises = [...(prev.exercises || []), exState];
      const addedExDefs = [...(prev.addedExDefs || []), exDef];
      const next = { ...prev, exercises, addedExDefs };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const addActivityToSession = useCallback((actDef) => {
    setActive(prev => {
      if (!prev) return prev;
      const activities = { ...(prev.activities || {}), [actDef.id]: { id: actDef.id, done: false, value: actDef.defaultVal || 10 } };
      const addedActDefs = [...(prev.addedActDefs || []), actDef];
      const next = { ...prev, activities, addedActDefs };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  // Swap solo para esta sesión: no persiste, no toca el horario semanal.
  const swapRoutine = useCallback((srcDow) => {
    setTodaySwapDow(srcDow);
    setSwapOpen(false);
  }, []);

  const clearSwap = useCallback(() => setTodaySwapDow(null), []);

  // Lambdas estables para props
  const handleSetTab = useCallback((newTab) => setTab(newTab), []);
  const handleSetDayDetail = useCallback((d) => setDayDetail(d), []);
  const handleSetExerciseDetail = useCallback((ex) => setExerciseDetail(ex), []);
  const handleOpenRoutineEditor = useCallback((d) => openRoutineEditor(d), [openRoutineEditor]);
  const handleCloseMoodOpen = useCallback(() => setMoodOpen(false), []);
  const handleCloseExerciseDetail = useCallback(() => setExerciseDetail(null), []);
  const handleCloseDayDetail = useCallback(() => setDayDetail(null), []);
  const handleCloseEditingRoutine = useCallback(() => setEditingRoutine(false), []);
  const handleCloseSwapOpen = useCallback(() => setSwapOpen(false), []);
  const handleCloseCompletion = useCallback(() => { setCompletionData(null); setTab('calendar'); }, []);

  return (
    <div className="app-root">
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        <div>
          <div className="header-greeting">{greeting}{profileInfo ? `, ${profileInfo.name}` : ''}</div>
          <div className="header-date">{window.DAY_LONG[dow]} · {today.getDate()} {window.MONTH_LONG[today.getMonth()].slice(0, 3).toUpperCase()}</div>
          <h1>Ponte Viga App</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="header-streak">🔥 {streak}</div>
          {profileInfo && (
            <button
              className="profile-btn"
              style={{ background: profileInfo.color }}
              onClick={onSwitchProfile}
              title={`Perfil: ${profileInfo.name}`}
            >
              {profileInfo.emoji}
            </button>
          )}
        </div>
      </header>

      <main
        ref={scrollRef}
        className="app-scroll"
        key={refresh + tab + routineVer}
        onScroll={e => setScrolled(e.target.scrollTop > 8)}
      >
        {tab === 'today' && (
          <TodayScreen
            active={active}
            today={today}
            routine={routine}
            todaySession={todaySession}
            swappedFromDow={todaySwapDow != null ? dow : null}
            onClearSwap={clearSwap}
            onStart={() => setMoodOpen(true)}
            onUpdateExercise={updateExercise}
            onToggleCardio={toggleCardio}
            onFinish={finish}
            onOpenExercise={(ex) => setExerciseDetail(ex)}
            onEditRoutine={() => openRoutineEditor(dow)}
            onSwapRoutine={() => setSwapOpen(true)}
            onUpdateActivity={updateActivity}
            onResume={resumeSession}
            onAddExercise={addExerciseToSession}
            onAddActivity={addActivityToSession}
          />
        )}
        {tab === 'calendar' && (
          <CalendarScreen onPickDate={handleSetDayDetail} streak={streak} refresh={refresh} routineVer={routineVer} />
        )}
        {tab === 'week' && (
          <WeekScreen onEditDay={handleOpenRoutineEditor} routineVer={routineVer} />
        )}
        {tab === 'history' && (
          <HistoryScreen onSelectExercise={handleSetExerciseDetail} refresh={refresh} routineVer={routineVer} />
        )}
        {tab === 'measures' && <MeasuresScreen />}
      </main>

      <nav className="tabbar">
        <TabBtn icon="💪" label="Hoy"        active={tab === 'today'}    onClick={() => handleSetTab('today')} />
        <TabBtn icon="📅" label="Calendario" active={tab === 'calendar'} onClick={() => handleSetTab('calendar')} />
        <TabBtn icon="🗓️" label="Semana"     active={tab === 'week'}     onClick={() => handleSetTab('week')} />
        <TabBtn icon="📈" label="Progreso"   active={tab === 'history'}  onClick={() => handleSetTab('history')} />
        <TabBtn icon="📏" label="Medidas"    active={tab === 'measures'} onClick={() => handleSetTab('measures')} />
      </nav>

      <MoodModal open={moodOpen} onClose={handleCloseMoodOpen} onPick={startWorkout} />
      <ExerciseDetail ex={exerciseDetail} onClose={handleCloseExerciseDetail} />
      <DayDetail dateIso={dayDetail} onClose={handleCloseDayDetail} />

      {editingRoutine && (
        <RoutineEditor
          dow={editingDow}
          routine={window.GymStore.getRoutineFor(editingDow)}
          onClose={handleCloseEditingRoutine}
          onSave={(r) => { window.GymStore.saveRoutineFor(editingDow, r); setRoutineVer(v => v + 1); setRefresh(r => r + 1); }}
          onReset={() => { window.GymStore.resetRoutineFor(editingDow); setRoutineVer(v => v + 1); setRefresh(r => r + 1); }}
        />
      )}

      {swapOpen && (
        <SwapRoutineModal
          currentDow={dow}
          onClose={handleCloseSwapOpen}
          onSwap={swapRoutine}
        />
      )}

      {completionData && (
        <CompletionModal
          session={completionData}
          onClose={handleCloseCompletion}
        />
      )}

      {showTweaks && (
        <div className="tweaks-panel">
          <div className="tweaks-title">Tweaks</div>
          <div className="tweak-row">
            <label>Acento principal</label>
            <input type="color" value={tweaks.accent} onChange={e => updateTweak({ accent: e.target.value })} />
          </div>
          <div className="tweak-row">
            <label>Acento secundario</label>
            <input type="color" value={tweaks.accent2} onChange={e => updateTweak({ accent2: e.target.value })} />
          </div>
          <div className="tweak-row">
            <label>Tamaño texto ({tweaks.fontSize}px)</label>
            <input type="range" min="13" max="17" step="1" value={tweaks.fontSize} onChange={e => updateTweak({ fontSize: +e.target.value })} />
          </div>
          <div className="tweak-row">
            <label>Demo</label>
            <button className="tweak-reset" onClick={() => { window.GymStore.seedWithDemo(); window.location.reload(); }}>
              Resembrar datos demo
            </button>
          </div>
          <div className="tweak-row">
            <label>Historial</label>
            <button className="tweak-reset tweak-danger" onClick={() => {
              if (window.confirm('¿Borrar todo el historial y medidas de este perfil?')) {
                window.GymStore.clearHistory();
                window.location.reload();
              }
            }}>
              Limpiar historial
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const TabBtn = ({ icon, label, active, onClick }) => (
  <button className={`tab-btn ${active ? 'is-active' : ''}`} onClick={onClick}>
    <div className="tab-icon">{icon}</div>
    <div className="tab-label">{label}</div>
  </button>
);

// Wrapper con selección de perfil + hidratación
const GymAppLoader = () => {
  const [profilesReady, setProfilesReady] = useState(
    () => window.GymStore.getProfiles().length > 0
  );
  const [profileName, setProfileName] = useState(() => {
    const saved = window.GymStore.getActiveProfile();
    if (saved) window.GymStore.initProfile(saved);
    return saved;
  });
  const [ready, setReady] = useState(false);
  const [profilesVer, setProfilesVer] = useState(0);
  const [debugInfo, setDebugInfo] = useState('');

  // Siempre sincronizar perfiles Y grupos del servidor al arrancar
  // (cada navegador tiene su propio localStorage aislado)
  useEffect(() => {
    console.log('[DEBUG] Iniciando hydrateProfiles + hydrateGroups');
    setDebugInfo('Cargando perfiles...');
    Promise.all([
      window.GymStore.hydrateProfiles(),
      window.GymStore.hydrateGroups(),
    ]).finally(() => {
      console.log('[DEBUG] hydrateProfiles + hydrateGroups completado');
      const saved = window.GymStore.getActiveProfile();
      console.log('[DEBUG] Perfil guardado:', saved);
      const exists = window.GymStore.getProfiles().find(p => p.name === saved);
      console.log('[DEBUG] Perfil existe:', !!exists);
      if (!profilesReady) {
        if (saved && exists) {
          window.GymStore.initProfile(saved);
          setProfileName(saved);
        }
        setProfilesReady(true);
      } else {
        setProfilesVer(v => v + 1);
      }
    });
  }, []);

  const selectProfile = (name) => {
    console.log('[DEBUG] selectProfile:', name);
    window.GymStore.initProfile(name);
    setProfileName(name);
    setReady(false);
    setDebugInfo('Seleccionado: ' + name);
  };

  const switchProfile = () => {
    console.log('[DEBUG] switchProfile clicked');
    try { window.GymStore.clearActiveProfile(); } catch (e) { console.warn(e); }
    try { window.GymStore.clearActive(); } catch (e) {}
    // Navegación a URL fresca con cache-bust: evita que iOS PWA/SW
    // sirva un HTML viejo desde caché aun después del clear.
    window.location.replace('/?_=' + Date.now());
  };

  useEffect(() => {
    if (!profileName) return;
    console.log('[DEBUG] Iniciando hydrate para:', profileName);
    setDebugInfo('Hidratando perfil: ' + profileName);
    const startTime = Date.now();
    window.GymStore.hydrate().then(hasCloud => {
      const elapsed = Date.now() - startTime;
      console.log('[DEBUG] hydrate completado en', elapsed + 'ms, hasCloud:', hasCloud);
      setDebugInfo('Datos: ' + (hasCloud ? 'Encontrados' : 'Creando nuevos'));
      if (!hasCloud) window.GymStore.ensureSeed();
      setReady(true);
    }).catch(err => {
      const elapsed = Date.now() - startTime;
      console.error('[DEBUG] hydrate error en', elapsed + 'ms:', err);
      setDebugInfo('Error: ' + err.message);
      window.GymStore.ensureSeed();
      setReady(true);
    });
  }, [profileName]);

  if (!profilesReady) return (
    <div className="app-loading">
      <div className="loading-dots"><span /><span /><span /></div>
      <div className="loading-text">Cargando perfiles...</div>
      <div style={{fontSize: 11, color: '#666', marginTop: 8}}>{debugInfo}</div>
    </div>
  );

  if (!profileName) return <ProfilePicker key={profilesVer} onSelect={selectProfile} />;

  if (!ready) return (
    <div className="app-loading">
      <div className="loading-dots"><span /><span /><span /></div>
      <div className="loading-text">Sincronizando...</div>
      <div style={{fontSize: 11, color: '#666', marginTop: 8}}>{debugInfo}</div>
    </div>
  );

  return <App onSwitchProfile={switchProfile} />;
};

window.GymApp = GymAppLoader;
