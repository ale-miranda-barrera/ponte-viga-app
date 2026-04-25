const TodayScreen = ({ active, today, routine, onStart, onUpdateExercise, onFinish, onToggleCardio, onOpenExercise, onEditRoutine }) => {
  // Build PB map and last-session map once, shared across all ExerciseCards
  const { pbMap, lastMap } = React.useMemo(() => {
    const pb = {}, last = {};
    const todayIso = window.GymStore.iso(new Date());
    const sorted = Object.values(window.GymStore.getAllSessions())
      .filter(s => s.date < todayIso)
      .sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(s => {
      (s.exercises || []).forEach(e => {
        if (e.weight > 0 && (pb[e.id] == null || e.weight > pb[e.id])) pb[e.id] = e.weight;
        if (!last[e.id]) last[e.id] = { session: s, ex: e };
      });
    });
    return { pbMap: pb, lastMap: last };
  }, []);

  const isRest = routine.rest;
  const isStarted = !!active;

  if (isRest) {
    return (
      <div className="today-rest">
        <div className="rest-badge">{window.DAY_LONG[today.getDay()].toUpperCase()}</div>
        <div className="rest-title">Día de descanso</div>
        <div className="rest-sub">Recupera. Hidrata. Lee.</div>
        <div className="rest-quote">"Las mentes fuertes sufren sin quejarse,<br/>las débiles se quejan sin sufrir."</div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="today-intro">
        <div className="intro-eyebrow">ENTRENAMIENTO DE HOY</div>
        <div className="intro-title">{routine.title}</div>
        <div className="intro-sub">{routine.subtitle}</div>
        <div className="intro-muscles">
          {(routine.muscles || []).map(m => <span key={m} className="muscle-chip">{m}</span>)}
        </div>
        <div className="intro-stats">
          <div className="stat-block">
            <div className="stat-num">{routine.exercises.length}</div>
            <div className="stat-label">Ejercicios</div>
          </div>
          <div className="stat-block">
            <div className="stat-num">{routine.exercises.reduce((s,e)=>s+e.sets,0)}</div>
            <div className="stat-label">Sets totales</div>
          </div>
          <div className="stat-block">
            <div className="stat-num">~{Math.round(routine.exercises.reduce((s,e)=>s+e.sets,0)*2.2 + (routine.cardio?.minutes||0))}<span className="stat-unit">min</span></div>
            <div className="stat-label">Estimado</div>
          </div>
        </div>
        <button className="btn-primary" onClick={onStart}>Empezar entrenamiento</button>
        <button className="btn-link" onClick={onEditRoutine}>Editar rutina del día</button>
      </div>
    );
  }

  const activeExMap = Object.fromEntries((active.exercises || []).map(e => [e.id, e]));
  const doneCount = routine.exercises.filter(ex => (activeExMap[ex.id]?.done)).length;
  const cardio = routine.cardio;
  const totalItems = routine.exercises.length + (cardio ? 1 : 0);
  const allDone = doneCount === routine.exercises.length && (!cardio || active.cardioDone);

  return (
    <div className="today-active">
      <div className="active-header">
        <div>
          <div className="intro-eyebrow">HOY · {window.DAY_LONG[today.getDay()].toUpperCase()}</div>
          <div className="active-title">{routine.title}</div>
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <button className="icon-btn" onClick={onEditRoutine} title="Editar rutina">✎</button>
          <MoodBadge mood={active.mood} />
        </div>
      </div>

      <ProgressBar done={doneCount + (active.cardioDone ? 1 : 0)} total={totalItems} />

      <div className="exercise-list">
        {routine.exercises.map((ex, i) => {
          const state = activeExMap[ex.id] || { id: ex.id, weight: ex.weight, sets: 0, targetSets: ex.sets, reps: ex.reps, done: false };
          return <ExerciseCard key={ex.id} index={i+1} ex={ex} state={state} pb={pbMap[ex.id] ?? null} last={lastMap[ex.id] ?? null} onChange={onUpdateExercise} onOpen={()=>onOpenExercise(ex)} />;
        })}
        {cardio && (
          <CardioCard cardio={cardio} done={!!active.cardioDone} onToggle={onToggleCardio} savedMinutes={active.cardioMinutes} />
        )}
      </div>

      <button className={`btn-primary finish ${allDone ? 'is-ready' : ''}`} disabled={!allDone} onClick={onFinish}>
        {allDone ? 'Terminar entrenamiento ✓' : `${doneCount + (active.cardioDone?1:0)}/${totalItems} completados`}
      </button>
    </div>
  );
};

const MOOD_META = {
  sick:   { icon: '🤧', label: 'Débil',  cls: 'mood-sick' },
  normal: { icon: '🙂', label: 'Normal', cls: 'mood-normal' },
  strong: { icon: '💪', label: 'Fuerte', cls: 'mood-strong' },
};

const MoodBadge = ({ mood }) => {
  const m = MOOD_META[mood] || MOOD_META.normal;
  return <div className={`mood-badge ${m.cls}`}><span>{m.icon}</span>{m.label}</div>;
};

const ProgressBar = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className="progress-fill" style={{width: pct+'%'}} />
      </div>
      <div className="progress-label">{pct}%</div>
    </div>
  );
};

const TAG_META = {
  fire:   { icon: '🔥', label: 'Objetivo' },
  strong: { icon: '💪', label: 'Logrado' },
  cold:   { icon: '🥶', label: 'Peso alto' },
  pr:     { icon: '🏆', label: 'PR' },
  sick:   { icon: '🤧', label: 'Bajado' },
};

const ExerciseCard = ({ index, ex, state, pb, last, onChange, onOpen }) => {
  const trend = last ? (state.weight > last.ex.weight ? 'up' : state.weight < last.ex.weight ? 'down' : 'flat') : null;

  const setWeight = (delta) => {
    const w = Math.max(0, Math.round((state.weight + delta) * 10) / 10);
    onChange(ex.id, { ...state, weight: w });
  };

  const toggleSet = (n) => {
    const newSets = state.sets === n ? n - 1 : n;
    const done = newSets >= ex.sets;
    onChange(ex.id, { ...state, sets: newSets, done });
  };

  // Single tap on checkmark: complete all sets at once (or uncomplete)
  const toggleComplete = (e) => {
    e.stopPropagation();
    if (state.done) {
      onChange(ex.id, { ...state, sets: 0, done: false });
    } else {
      onChange(ex.id, { ...state, sets: ex.sets, done: true });
    }
  };

  const tagMeta = TAG_META[ex.tag] || TAG_META.fire;

  return (
    <div className={`ex-card ${state.done ? 'is-done' : ''}`}>
      <div className="ex-head">
        <div className="ex-num">{String(index).padStart(2,'0')}</div>
        {/* Info area → opens detail modal */}
        <div className="ex-info" onClick={onOpen}>
          <div className="ex-name">
            <span className="ex-tag">{tagMeta.icon}</span>
            {ex.name}
          </div>
          <div className="ex-sub">{ex.sub}</div>
          {pb != null && pb > 0
            ? <div className="ex-pb">Mejor: {pb} lb</div>
            : <div className="ex-pb ex-pb-dim">Sin registros aún</div>
          }
        </div>
        {/* Checkmark → complete/uncomplete with single tap */}
        <button className={`ex-check ${state.done ? 'is-checked' : ''}`} onClick={toggleComplete}>
          {state.done ? '✓' : ''}
        </button>
      </div>

      <div className="ex-body">
        <div className="weight-row">
          <button className="stepper-btn" onClick={()=>setWeight(-2.5)}>−</button>
          <div className="weight-display">
            <div className="weight-num">{state.weight}<span className="weight-unit">lb</span></div>
            {last && (
              <div className={`weight-trend ${trend ? 'trend-'+trend : ''}`}>
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '='} últ {last.ex.weight} lb
              </div>
            )}
          </div>
          <button className="stepper-btn" onClick={()=>setWeight(2.5)}>+</button>
        </div>

        <div className="sets-row">
          {Array.from({length: ex.sets}).map((_, i) => (
            <button key={i}
              className={`set-chip ${i < state.sets ? 'is-done' : ''}`}
              onClick={() => toggleSet(i+1)}>
              <div className="set-reps">{ex.reps}</div>
              <div className="set-label">reps</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const CardioCard = ({ cardio, done, onToggle, savedMinutes }) => {
  const [minutes, setMinutes] = React.useState(savedMinutes || cardio.minutes || 10);

  const handleCheck = (e) => {
    e.stopPropagation();
    onToggle(minutes);
  };

  const changeMinutes = (delta) => {
    setMinutes(m => Math.max(5, m + delta));
  };

  return (
    <div className={`cardio-card ${done ? 'is-done' : ''}`}>
      <div className="cardio-icon">🏃</div>
      <div className="cardio-info">
        <div className="cardio-name">{cardio.name}</div>
        <div className="cardio-time-row">
          <button className="cardio-time-btn" onClick={() => changeMinutes(-5)}>−</button>
          <span className="cardio-time-val">{minutes} min</span>
          <button className="cardio-time-btn" onClick={() => changeMinutes(5)}>+</button>
          <div className="cardio-presets">
            {[5, 10, 20].map(m => (
              <button key={m} className={`cardio-preset ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className={`ex-check ${done ? 'is-checked' : ''}`} onClick={handleCheck}>
        {done ? '✓' : ''}
      </button>
    </div>
  );
};

window.TodayScreen = TodayScreen;
