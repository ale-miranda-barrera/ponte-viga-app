// App shell: navegación por tabs, modales, hoy/calendario/semana/historial/medidas
const { useState, useEffect, useMemo } = React;

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

  const updateTweak = (patch) => {
    setTweaks(prev => ({ ...prev, ...patch }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };

  const [tab, setTab] = useState(() => localStorage.getItem('gym_tab') || 'today');
  useEffect(() => { localStorage.setItem('gym_tab', tab); }, [tab]);

  const [moodOpen, setMoodOpen] = useState(false);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh(r => r + 1);

  const today = new Date();
  const dow = today.getDay();
  const [routineVer, setRoutineVer] = useState(0);
  const routine = useMemo(() => window.GymStore.getRoutineFor(dow), [routineVer]);

  const [editingRoutine, setEditingRoutine] = useState(false);
  const [editingDow, setEditingDow] = useState(dow);

  const openRoutineEditor = (d) => {
    setEditingDow(d !== undefined ? d : dow);
    setEditingRoutine(true);
  };

  const streak = useMemo(() => window.GymStore.computeStreak(), [refresh]);
  const todayIso = window.GymStore.iso(today);

  const profileInfo = useMemo(() => {
    const name = window.GymStore.getActiveProfile();
    return window.GymStore.getProfiles().find(p => p.name === name) || null;
  }, []);

  const [active, setActive] = useState(() => {
    const a = window.GymStore.getActive();
    return (a && a.date === todayIso) ? a : null;
  });

  const startWorkout = (mood) => {
    const session = {
      date: todayIso, dow, title: routine.title, mood,
      exercises: routine.exercises.map(ex => ({
        id: ex.id, weight: ex.weight, sets: 0, targetSets: ex.sets, reps: ex.reps, done: false,
      })),
      cardioDone: false, completed: false,
    };
    window.GymStore.setActive(session);
    setActive(session);
    setMoodOpen(false);
  };

  const updateExercise = (exId, state) => {
    setActive(prev => {
      const next = { ...prev, exercises: prev.exercises.map(e => e.id === exId ? state : e) };
      window.GymStore.setActive(next);
      return next;
    });
  };

  const toggleCardio = (minutes) => {
    setActive(prev => {
      const next = { ...prev, cardioDone: !prev.cardioDone, cardioMinutes: minutes };
      window.GymStore.setActive(next);
      return next;
    });
  };

  const finish = () => {
    setActive(prev => {
      if (!prev) return null;
      const final = { ...prev, completed: true };
      window.GymStore.saveSession(final);
      window.GymStore.clearActive();
      return null;
    });
    bump();
    setTab('calendar');
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <div className="header-date">{window.DAY_LONG[dow]} · {today.getDate()} {window.MONTH_LONG[today.getMonth()].slice(0, 3).toUpperCase()}</div>
          <h1>Pongámonos Vigas</h1>
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

      <main className="app-scroll" key={refresh + tab + routineVer}>
        {tab === 'today' && (
          <TodayScreen
            active={active}
            today={today}
            routine={routine}
            onStart={() => setMoodOpen(true)}
            onUpdateExercise={updateExercise}
            onToggleCardio={toggleCardio}
            onFinish={finish}
            onOpenExercise={(ex) => setExerciseDetail(ex)}
            onEditRoutine={() => openRoutineEditor(dow)}
          />
        )}
        {tab === 'calendar' && (
          <CalendarScreen onPickDate={(d) => setDayDetail(d)} streak={streak} />
        )}
        {tab === 'week' && (
          <WeekScreen onEditDay={(d) => openRoutineEditor(d)} />
        )}
        {tab === 'history' && (
          <HistoryScreen onSelectExercise={(ex) => setExerciseDetail(ex)} />
        )}
        {tab === 'measures' && <MeasuresScreen />}
      </main>

      <nav className="tabbar">
        <TabBtn icon="💪" label="Hoy"        active={tab === 'today'}    onClick={() => setTab('today')} />
        <TabBtn icon="📅" label="Calendario" active={tab === 'calendar'} onClick={() => setTab('calendar')} />
        <TabBtn icon="🗓️" label="Semana"     active={tab === 'week'}     onClick={() => setTab('week')} />
        <TabBtn icon="📈" label="Progreso"   active={tab === 'history'}  onClick={() => setTab('history')} />
        <TabBtn icon="📏" label="Medidas"    active={tab === 'measures'} onClick={() => setTab('measures')} />
      </nav>

      <MoodModal open={moodOpen} onClose={() => setMoodOpen(false)} onPick={startWorkout} />
      <ExerciseDetail ex={exerciseDetail} onClose={() => setExerciseDetail(null)} />
      <DayDetail dateIso={dayDetail} onClose={() => setDayDetail(null)} />
      {editingRoutine && (
        <RoutineEditor
          dow={editingDow}
          routine={window.GymStore.getRoutineFor(editingDow)}
          onClose={() => setEditingRoutine(false)}
          onSave={(r) => { window.GymStore.saveRoutineFor(editingDow, r); setRoutineVer(v => v + 1); bump(); }}
          onReset={() => { window.GymStore.resetRoutineFor(editingDow); setRoutineVer(v => v + 1); bump(); }}
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
  const [profileName, setProfileName] = useState(() => {
    if (window.GymStore.getProfiles().length === 0 && localStorage.getItem('gym_seeded_v1')) {
      window.GymStore.migrateV1('Yo');
      window.GymStore.createProfile({ name: 'Yo', emoji: '💪', color: '#ec6032' });
    }
    const saved = window.GymStore.getActiveProfile();
    if (saved) window.GymStore.initProfile(saved);
    return saved;
  });
  const [ready, setReady] = useState(false);

  const selectProfile = (name) => {
    window.GymStore.initProfile(name);
    setProfileName(name);
    setReady(false);
  };

  const switchProfile = () => {
    window.GymStore.clearActiveProfile();
    setProfileName('');
    setReady(false);
  };

  useEffect(() => {
    if (!profileName) return;
    window.GymStore.hydrate().then(hasCloud => {
      if (!hasCloud) window.GymStore.ensureSeed();
      setReady(true);
    }).catch(() => {
      window.GymStore.ensureSeed();
      setReady(true);
    });
  }, [profileName]);

  if (!profileName) return <ProfilePicker onSelect={selectProfile} />;

  if (!ready) return (
    <div className="app-loading">
      <div className="loading-dots"><span /><span /><span /></div>
      <div className="loading-text">Sincronizando...</div>
    </div>
  );

  return <App onSwitchProfile={switchProfile} />;
};

window.GymApp = GymAppLoader;
