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
  const [daySummaryData, setDaySummaryData] = useState(null);

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

  // Suscribir el shell a cambios de sesiones/routine para recomputar streak/todaySession sin recargar.
  // El useStoreTopic ya dispara re-render en cambios; refresh es fallback para cambios locales.
  window.useStoreTopic && window.useStoreTopic('sessions', 'routine');
  const streak = useMemo(() => window.GymStore.computeStreak(), [refresh]);
  const todayIso = window.GymStore.iso(today);
  const todaySession = useMemo(() => window.GymStore.getDaySession(todayIso), [refresh, todayIso]);

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
    window.GymStore.getAllSessionsFlat()
      .filter(s => s.date < todayIso)
      .forEach(s => (s.exercises || []).forEach(e => {
        if (e.weight > 0 && (pb[e.id] == null || e.weight > pb[e.id])) pb[e.id] = e.weight;
      }));

    const session = {
      sessionId: 'sid_' + Date.now(),
      date: todayIso, dow, title: routine.title, mood,
      label: routine.title,
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

  const changeMood = useCallback((mood) => {
    setActive(prev => {
      if (!prev) return prev;
      const next = { ...prev, mood };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const finish = useCallback((isComplete) => {
    setActive(prev => {
      if (!prev) return null;
      // Asegurar sessionId (migración: sesiones reanudadas pueden no tenerlo)
      const sid = prev.sessionId || ('sid_' + Date.now());
      const final = { ...prev, sessionId: sid, completed: !!isComplete, endTime: Date.now() };
      window.GymStore.saveSession(final);
      window.GymStore.clearActive();
      if (isComplete) setCompletionData(final);
      return null;
    });
    setRefresh(r => r + 1);
  }, []);

  // Marca la sesión del día como completada directamente desde la vista "done"
  // (sin pasar por la vista activa). Abre DaySummaryModal con comparaciones.
  const finishDay = useCallback(() => {
    const s = window.GymStore.getDaySession(todayIso);
    if (!s) return;
    const completed = { ...s, completed: true };
    window.GymStore.saveSession(completed);
    setDaySummaryData(completed);
    setRefresh(r => r + 1);
  }, [todayIso]);

  const resumeSession = useCallback(() => {
    // Reanuda la última sesión del día (la más reciente si hay varias)
    const daySessions = window.GymStore.getDaySessions(window.GymStore.iso(new Date()));
    if (daySessions.length === 0) {
      window.location.reload();
      return;
    }
    const saved = daySessions[daySessions.length - 1];
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

  // Remueve un ejercicio de la sesión activa (rutina o agregado). No toca la rutina persistida.
  const removeExerciseFromSession = useCallback((exId) => {
    setActive(prev => {
      if (!prev) return prev;
      const exercises = (prev.exercises || []).filter(e => e.id !== exId);
      const addedExDefs = (prev.addedExDefs || []).filter(e => e.id !== exId);
      const next = { ...prev, exercises, addedExDefs, _skippedExIds: [...(prev._skippedExIds || []), exId] };
      window.GymStore.setActive(next);
      return next;
    });
  }, []);

  const removeActivityFromSession = useCallback((actId) => {
    setActive(prev => {
      if (!prev) return prev;
      const activities = { ...(prev.activities || {}) };
      delete activities[actId];
      const addedActDefs = (prev.addedActDefs || []).filter(a => a.id !== actId);
      const next = { ...prev, activities, addedActDefs, _skippedActIds: [...(prev._skippedActIds || []), actId] };
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
  // Al cerrar DayDetail, forzamos refresh porque el usuario pudo haber editado/borrado sesiones.
  // El store ya emite eventos, pero refresh es la key del <main> que remonta todo.
  const handleCloseDayDetail = useCallback(() => {
    setDayDetail(null);
    setRefresh(r => r + 1);
  }, []);
  const handleCloseEditingRoutine = useCallback(() => setEditingRoutine(false), []);
  const handleCloseSwapOpen = useCallback(() => setSwapOpen(false), []);
  const handleCloseCompletion = useCallback(() => { setCompletionData(null); setTab('calendar'); }, []);
  const handleCloseDaySummary = useCallback(() => setDaySummaryData(null), []);

  return (
    <div className="app-root">
      <ConnectionBanner />
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        <div>
          <div className="header-greeting">{greeting}{profileInfo ? `, ${profileInfo.name}` : ''}</div>
          <div className="header-date">{window.DAY_LONG[dow]} · {today.getDate()} {window.MONTH_LONG[today.getMonth()].slice(0, 3).toUpperCase()}</div>
          <h1>Ponte Viga App</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="header-streak" aria-label={`Racha ${streak} días`}>
            <span aria-hidden="true">🔥</span> {streak}
          </div>
          {profileInfo && (
            <button
              className="profile-btn"
              style={{ background: profileInfo.color }}
              onClick={onSwitchProfile}
              title={`Perfil: ${profileInfo.name}`}
              aria-label={`Cambiar de perfil, actualmente ${profileInfo.name}`}
            >
              <span aria-hidden="true">{profileInfo.emoji}</span>
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
            onQuickStart={() => startWorkout('normal')}
            onUpdateExercise={updateExercise}
            onToggleCardio={toggleCardio}
            onFinish={finish}
            onOpenExercise={(ex) => setExerciseDetail(ex)}
            onEditRoutine={() => openRoutineEditor(dow)}
            onSwapRoutine={() => setSwapOpen(true)}
            onUpdateActivity={updateActivity}
            onResume={resumeSession}
            onFinishDay={finishDay}
            onAddExercise={addExerciseToSession}
            onAddActivity={addActivityToSession}
            onRemoveExercise={removeExerciseFromSession}
            onRemoveActivity={removeActivityFromSession}
            onChangeMood={changeMood}
          />
        )}
        {tab === 'calendar' && (
          <CalendarScreen onPickDate={handleSetDayDetail} streak={streak} refresh={refresh} routineVer={routineVer} />
        )}
        {tab === 'week' && (
          <WeekScreen onEditDay={handleOpenRoutineEditor} routineVer={routineVer} />
        )}
        {tab === 'history' && (
          <HistoryScreen onSelectExercise={handleSetExerciseDetail} onSelectDay={handleSetDayDetail} refresh={refresh} routineVer={routineVer} />
        )}
        {tab === 'measures' && <MeasuresScreen />}
      </main>

      <nav className="tabbar">
        <TabBtn icon="💪" label="Hoy"      active={tab === 'today'}    onClick={() => handleSetTab('today')} />
        <TabBtn icon="📅" label="Mes"      active={tab === 'calendar'} onClick={() => handleSetTab('calendar')} />
        <TabBtn icon="🗓️" label="Semana"   active={tab === 'week'}     onClick={() => handleSetTab('week')} />
        <TabBtn icon="📈" label="Datos"    active={tab === 'history'}  onClick={() => handleSetTab('history')} />
        <TabBtn icon="📏" label="Medidas"  active={tab === 'measures'} onClick={() => handleSetTab('measures')} />
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

      {daySummaryData && (
        <DaySummaryModal
          session={daySummaryData}
          onClose={handleCloseDaySummary}
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

      <GlobalSystemHosts />
    </div>
  );
};

// Monta ConfirmHost + ToastHost si están disponibles (una sola vez en el árbol).
const GlobalSystemHosts = () => {
  const CH = window.ConfirmHost;
  const TH = window.ToastHost;
  return (
    <>
      {CH && <CH />}
      {TH && <TH />}
    </>
  );
};

const TabBtn = ({ icon, label, active, onClick }) => (
  <button
    className={`tab-btn ${active ? 'is-active' : ''}`}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    aria-label={label}
  >
    <div className="tab-icon" aria-hidden="true">{icon}</div>
    <div className="tab-label">{label}</div>
  </button>
);

// Banner de conexión: aparece cuando el navegador está offline o hay writes pendientes
const ConnectionBanner = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(() => window.GymStore?.getConnectionStatus?.().pending || false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const int = setInterval(() => {
      setPending(window.GymStore?.getConnectionStatus?.().pending || false);
    }, 1500);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(int);
    };
  }, []);

  if (online && !pending) return null;
  return (
    <div className={`conn-banner ${online ? 'is-pending' : 'is-offline'}`} role="status">
      {online
        ? <><span aria-hidden="true">↻</span> Sincronizando cambios…</>
        : <><span aria-hidden="true">🔌</span> Sin conexión — cambios se guardarán localmente</>
      }
    </div>
  );
};

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

  // Siempre sincronizar perfiles Y grupos del servidor al arrancar.
  // También valida el token guardado — si expiró, limpia el perfil activo.
  useEffect(() => {
    setDebugInfo('Cargando perfiles...');
    Promise.all([
      window.GymStore.hydrateProfiles(),
      window.GymStore.hydrateGroups(),
      // Verifica sesión: si el token expiró/no vale, tratamos como sin perfil
      (window.S3Store && window.S3Store.checkSession)
        ? window.S3Store.checkSession()
        : Promise.resolve({ ok: true }),
    ]).then(([, , session]) => {
      const saved = window.GymStore.getActiveProfile();
      const exists = window.GymStore.getProfiles().find(p => p.name === saved);
      const sessionValid = !session || session.ok !== false;
      const sessionMatches = session && session.profileName === saved;
      const canResume = saved && exists && (sessionValid && (session.ok ? sessionMatches : true));
      if (!profilesReady) {
        if (canResume) {
          window.GymStore.initProfile(saved);
          setProfileName(saved);
        } else if (saved) {
          // Token no valido o perfil borrado: limpiar puntero local
          window.GymStore.clearActiveProfile();
        }
        setProfilesReady(true);
      } else {
        setProfilesVer(v => v + 1);
      }
    }).catch(err => {
      console.error('[DEBUG] hydrate error:', err);
      setProfilesReady(true);
    });
  }, []);

  const selectProfile = (name) => {
    console.log('[DEBUG] selectProfile:', name);
    window.GymStore.initProfile(name);
    setProfileName(name);
    setReady(false);
    setDebugInfo('Seleccionado: ' + name);
  };

  const switchProfile = async () => {
    try { await window.GymStore.logout(); } catch (e) { console.warn(e); }
    // Navegación a URL fresca con cache-bust: evita que iOS PWA/SW
    // sirva un HTML viejo desde caché aun después del clear.
    window.location.replace('/?_=' + Date.now());
  };

  // Escuchar auth expired global (401 desde api-store). Vuelve al picker.
  useEffect(() => {
    const handler = () => {
      console.warn('[App] auth expired, volviendo al picker');
      window.GymStore.clearActiveProfile();
      window.location.replace('/?_=' + Date.now());
    };
    window.addEventListener('ponteviga:auth-expired', handler);
    return () => window.removeEventListener('ponteviga:auth-expired', handler);
  }, []);

  const [hydrateError, setHydrateError] = useState(false);

  useEffect(() => {
    if (!profileName) return;
    console.log('[DEBUG] Iniciando hydrate para:', profileName);
    setDebugInfo('Hidratando perfil: ' + profileName);
    setHydrateError(false);
    const startTime = Date.now();
    window.GymStore.hydrate().then(result => {
      const elapsed = Date.now() - startTime;
      console.log('[DEBUG] hydrate completado en', elapsed + 'ms, result:', result);
      if (!result.ok) {
        // Servidor inalcanzable: NO seedear vacío (sobrescribiría datos reales).
        setDebugInfo('Sin conexión al servidor');
        setHydrateError(true);
        return;
      }
      setDebugInfo('Datos: ' + (result.hasData ? 'Encontrados' : 'Creando nuevos'));
      if (!result.hasData) window.GymStore.ensureSeed();
      setReady(true);
    }).catch(err => {
      const elapsed = Date.now() - startTime;
      console.error('[DEBUG] hydrate error en', elapsed + 'ms:', err);
      setDebugInfo('Error: ' + err.message);
      setHydrateError(true);
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

  if (hydrateError) return (
    <div className="app-loading">
      <div style={{fontSize:40}}>🔌</div>
      <div className="loading-text" style={{color:'#ff8a3c'}}>Sin conexión al servidor</div>
      <div style={{fontSize: 12, color: '#888', textAlign:'center', maxWidth: 280, lineHeight: 1.4}}>
        No pudimos cargar tus datos. Para evitar perder información, no abriremos la app sin confirmar el servidor.
      </div>
      <button
        style={{marginTop: 12, background:'#ec6032', color:'#fff', border:'none', padding:'10px 18px', borderRadius:8, fontWeight:600}}
        onClick={() => window.location.reload()}
      >Reintentar</button>
    </div>
  );

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
