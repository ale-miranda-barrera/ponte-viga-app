// Wrapper local para envolver hijos en SafeBoundary si está disponible.
const Safe = ({ children }) => {
  const SB = window.SafeBoundary;
  return SB ? <SB>{children}</SB> : <>{children}</>;
};

const REST_POOL = [
  { sub: 'Recupera. Hidrata. Lee.',         quote: '"Las mentes fuertes sufren sin quejarse,\nlas débiles se quejan sin sufrir."' },
  { sub: 'El descanso es parte del plan.',  quote: '"No hay campeón que no haya descansado\ncomo si su vida dependiera de ello."' },
  { sub: 'Hidrata. Estira. Duerme.',        quote: '"El cuerpo logra lo que la mente cree."' },
  { sub: 'Hoy el músculo crece.',           quote: '"La fuerza no viene de lo que puedes hacer.\nViene de superar lo que creías que no podías."' },
  { sub: 'Movilidad y calma.',              quote: '"Descansar no es rendirse.\nEs prepararse."' },
  { sub: 'Recarga. Mañana atacas.',         quote: '"La disciplina es hacer lo necesario\ncuando más cuesta."' },
  { sub: 'Nutrición y sueño primero.',      quote: '"El músculo se rompe en el gym,\nse alimenta en la cocina, crece en la cama."' },
];

const formatLastDate = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00');
  const diffDays = Math.floor((new Date() - d) / 86400000);
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7)  return `hace ${diffDays} días`;
  if (diffDays < 14) return 'hace 1 semana';
  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `hace ${weeks} semanas`;
  return `${d.getDate()} ${window.MONTH_LONG[d.getMonth()].slice(0, 3).toLowerCase()}`;
};

// Estimador para sesión activa (tiempo real, incluye parciales).
// Comparte convención con GymStore.calcSessionKcal.
const estimateSessionCals = (exercises, activeExMap, activities, activeActMap, cardio, cardioDone, cardioMinutes) => {
  const virtualSession = {
    exercises: (exercises || []).map(ex => ({ ...ex, ...(activeExMap[ex.id] || {}) })),
    activities: activeActMap || {},
    cardioDone,
    cardioMinutes,
  };
  return window.GymStore.calcSessionKcal(virtualSession);
};

const TodayScreen = ({ active, today, routine, todaySession, swappedFromDow, onClearSwap, onStart, onQuickStart, onUpdateExercise, onFinish, onToggleCardio, onOpenExercise, onEditRoutine, onSwapRoutine, onUpdateActivity, onResume, onFinishDay, onAddExercise, onAddActivity, onRemoveExercise, onRemoveActivity, onChangeMood }) => {
  const { pbMap, lastMap, lastRoutineSession } = React.useMemo(() => {
    const pb = {}, last = {};
    const todayIso = window.GymStore.iso(new Date());
    const sorted = window.GymStore.getAllSessionsFlat()
      .filter(s => s.date < todayIso)
      .sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(s => {
      (s.exercises || []).forEach(e => {
        if (e.weight > 0 && (pb[e.id] == null || e.weight > pb[e.id])) pb[e.id] = e.weight;
        if (!last[e.id]) last[e.id] = { session: s, ex: e };
      });
    });
    const lastForRoutine = sorted.find(s => s.title === routine.title) || null;
    return { pbMap: pb, lastMap: last, lastRoutineSession: lastForRoutine };
  }, [routine.title]);

  const [addExOpen, setAddExOpen] = React.useState(false);
  const [addActOpen, setAddActOpen] = React.useState(false);

  const isRest = routine.rest;
  const isStarted = !!active;

  const { activeExMap, allExercises, doneCount, cardio, allActivities, activeActMap, actsDone, totalItems, allDone, estimatedCals } = React.useMemo(() => {
    if (!active) {
      return { activeExMap: {}, allExercises: [], doneCount: 0, cardio: null, allActivities: [], activeActMap: {}, actsDone: 0, totalItems: 0, allDone: false, estimatedCals: 0 };
    }
    const activeExMap = Object.fromEntries((active.exercises || []).map(e => [e.id, e]));
    const addedExDefs = active.addedExDefs || [];
    // Filtrar los IDs que el usuario quitó de la sesión (X en card).
    // Son ejercicios de la routine que ya no queremos mostrar en la sesión activa.
    const skippedExIds = new Set(active._skippedExIds || []);
    const allExercises = [...(routine.exercises || []), ...addedExDefs]
      .filter(ex => !skippedExIds.has(ex.id));
    const doneCount = allExercises.filter(ex => activeExMap[ex.id]?.done).length;
    const cardio = routine.cardio;
    const addedActDefs = active.addedActDefs || [];
    const skippedActIds = new Set(active._skippedActIds || []);
    const allActivities = [...(routine.activities || []), ...addedActDefs]
      .filter(a => !skippedActIds.has(a.id));
    const activeActMap = active.activities || {};
    const actsDone = allActivities.filter(a => activeActMap[a.id]?.done).length;
    const totalItems = allExercises.length + (cardio ? 1 : 0) + allActivities.length;
    const allDone = doneCount === allExercises.length
      && (!cardio || active.cardioDone)
      && actsDone === allActivities.length;
    const estimatedCals = estimateSessionCals(allExercises, activeExMap, allActivities, activeActMap, cardio, active.cardioDone, active.cardioMinutes);
    return { activeExMap, allExercises, doneCount, cardio, allActivities, activeActMap, actsDone, totalItems, allDone, estimatedCals };
  }, [active, routine]);

  if (isRest) {
    const restItem = REST_POOL[today.getDate() % REST_POOL.length];
    return (
      <div className="today-rest">
        <div className="rest-badge">{window.DAY_LONG[today.getDay()].toUpperCase()}</div>
        <div className="rest-title">Día de descanso</div>
        <div className="rest-sub">{restItem.sub}</div>
        <div className="rest-quote">{restItem.quote.split('\n').map((line, i) => (
          <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>
        ))}</div>
      </div>
    );
  }

  const todayIso = window.GymStore.iso(today);
  const DailySummaryComp = window.DailySummary;

  if (!isStarted) {
    // Si hay sesión guardada del día, mostrar vista "done" con 1 card
    if (todaySession) {
      const s = todaySession;
      const doneExs = (s.exercises || []).filter(e => e.done).length;
      const totalExs = (s.exercises || []).length;
      const ms = (s.startTime && s.endTime) ? (s.endTime - s.startTime) : 0;
      const totalMin = ms > 0 ? Math.round(ms / 60000) : 0;
      const dur = totalMin >= 1
        ? (totalMin < 60 ? `${totalMin} min` : `${Math.floor(totalMin/60)}h${totalMin%60>0?' '+totalMin%60+'min':''}`)
        : null;

      const COMPLETE_MSGS = [
        '¡Eres un crack! 💪', '¡Maquinaaaaa! 🔥', '¡Súper! Lo lograste 😎',
        '¡Bestia! Eso es dedicación 🏆', '¡Imparable! Así se hace 🚀',
      ];
      const PARTIAL_MSGS = [
        'Algo es algo, sigue así 💪', 'Parcial pero presente 👊', 'Mañana lo terminás, crack',
      ];
      const msgs = s.completed ? COMPLETE_MSGS : PARTIAL_MSGS;
      const msg = msgs[today.getDate() % msgs.length];

      return (
        <div className="today-done">
          <Safe>{DailySummaryComp && <DailySummaryComp dateIso={todayIso} />}</Safe>
          <div className="done-trophy">{s.completed ? '😎' : '🙌'}</div>
          <div className="done-msg">{msg}</div>

          <div className="done-sessions-list">
            <div className="done-session-card">
              <div className="done-session-label">{s.label || s.title}</div>
              <div className="done-session-meta">
                <span className={s.completed ? 'ok' : 'warn'}>{s.completed ? 'Completo ✓' : 'Parcial'}</span>
                {totalExs > 0 && <><span className="dot-sep">·</span><span>{doneExs}/{totalExs} ejercicios</span></>}
                {dur && <><span className="dot-sep">·</span><span>{dur}</span></>}
              </div>
              <button type="button" className="btn-primary" style={{marginTop:8}} onClick={onResume}>
                Continuar entrenando
              </button>
              {!s.completed && (
                <button type="button" className="btn-success" style={{marginTop:6}} onClick={onFinishDay}>
                  Terminar entrenamiento
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const CoachComp = window.CoachPanel;
    return (
      <div className="today-intro">
        <Safe>{DailySummaryComp && <DailySummaryComp dateIso={todayIso} />}</Safe>
        {CoachComp && <CoachComp routine={routine} dateIso={todayIso} />}
        {swappedFromDow != null && (
          <div className="swap-banner">
            <span>↔ Solo por hoy: {routine.title}</span>
            <button type="button" className="swap-banner-clear" onClick={onClearSwap}>Cancelar</button>
          </div>
        )}
        <div className="intro-eyebrow">ENTRENAMIENTO DE HOY</div>
        <div className="intro-title">{routine.title}</div>
        <div className="intro-sub">{routine.subtitle}</div>
        <div className="intro-muscles">
          {(routine.muscles || []).map(m => <span key={m} className="muscle-chip">{m}</span>)}
        </div>
        <div className="intro-stats">
          <div className="stat-block">
            <div className="stat-num">{(routine.exercises || []).length}</div>
            <div className="stat-label">Ejercicios</div>
          </div>
          <div className="stat-block">
            <div className="stat-num">{(routine.exercises || []).reduce((s,e)=>s+e.sets,0)}</div>
            <div className="stat-label">Sets totales</div>
          </div>
          <div className="stat-block">
            <div className="stat-num">~{Math.round((routine.exercises || []).reduce((s,e)=>s+e.sets,0)*2.2 + (routine.cardio?.minutes||0))}<span className="stat-unit">min</span></div>
            <div className="stat-label">Estimado</div>
          </div>
        </div>
        {lastRoutineSession && (
          <div className="intro-last-session">
            Última vez: <strong>{formatLastDate(lastRoutineSession.date)}</strong>
            {lastRoutineSession.completed
              ? <span className="intro-last-ok"> · Completo ✓</span>
              : <span className="intro-last-partial"> · Parcial</span>}
          </div>
        )}
        <button type="button" className="btn-primary" onClick={onStart}>Empezar entrenamiento</button>
        <button type="button" className="btn-secondary" style={{marginTop:8}} onClick={() => onQuickStart && onQuickStart()}>⚡ Empezar rápido (sin mood)</button>
        <div className="intro-secondary-btns">
          <button type="button" className="btn-link" onClick={onSwapRoutine}>↔ Cambiar entrenamiento del día</button>
          <button type="button" className="btn-link" onClick={onEditRoutine}>✎ Editar rutina de hoy</button>
        </div>
        <div className="hint-text">Puedes agregar o quitar ejercicios en cualquier momento con las X y el botón +.</div>
      </div>
    );
  }

  return (
    <div className="today-active">
      {DailySummaryComp && <DailySummaryComp dateIso={todayIso} refreshKey={doneCount + actsDone + (active.cardioDone ? 1 : 0)} />}
      <div className="active-header">
        <div>
          <div className="intro-eyebrow">HOY · {window.DAY_LONG[today.getDay()].toUpperCase()}</div>
          <div className="active-title">{routine.title}</div>
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <button type="button" className="icon-btn" onClick={onEditRoutine} title="Editar rutina">✎</button>
          <MoodBadge mood={active.mood} onChange={onChangeMood} />
        </div>
      </div>

      <ProgressBar done={doneCount + (active.cardioDone ? 1 : 0) + actsDone} total={totalItems} />
      {estimatedCals > 0 && (
        <div className="active-cals">~{estimatedCals} kcal quemadas</div>
      )}

      <div className="exercise-list">
        {allExercises.map((ex, i) => {
          const state = activeExMap[ex.id] || { id: ex.id, weight: ex.weight, sets: 0, targetSets: ex.sets, reps: ex.reps, done: false };
          return <ExerciseCard key={ex.id} index={i+1} ex={ex} state={state} pb={pbMap[ex.id] ?? null} last={lastMap[ex.id] ?? null} onChange={onUpdateExercise} onOpen={()=>onOpenExercise(ex)} onRemove={onRemoveExercise ? () => onRemoveExercise(ex.id) : null} />;
        })}
        <button type="button" className="add-item-btn" onClick={() => setAddExOpen(true)}>+ Agregar ejercicio</button>

        {cardio && (
          <CardioCard cardio={cardio} done={!!active.cardioDone} onToggle={onToggleCardio} savedMinutes={active.cardioMinutes} savedLaps={active.cardioLaps} />
        )}
        {allActivities.map(act => {
          const state = activeActMap[act.id] || { id: act.id, done: false, value: act.defaultVal || 10 };
          return <ActivityCard key={act.id} activity={act} state={state} onChange={onUpdateActivity} onRemove={onRemoveActivity ? () => onRemoveActivity(act.id) : null} />;
        })}
        <button type="button" className="add-item-btn" onClick={() => setAddActOpen(true)}>+ Agregar actividad</button>
      </div>

      <button type="button" className={`btn-primary finish ${allDone ? 'is-ready' : ''}`} onClick={() => onFinish(allDone)}>
        {allDone ? '¡Terminar entrenamiento! ✓' : `Terminar · ${doneCount + (active.cardioDone?1:0) + actsDone}/${totalItems} listos`}
      </button>

      {addExOpen && (
        <AddExerciseSheet
          currentExIds={new Set(allExercises.map(e => e.id))}
          currentActIds={new Set(allActivities.map(a => a.id))}
          onAdd={(ex) => { onAddExercise(ex); setAddExOpen(false); }}
          onAddActivity={(act) => { onAddActivity(act); setAddExOpen(false); }}
          onClose={() => setAddExOpen(false)}
        />
      )}
      {addActOpen && (
        <AddActivitySheet
          currentActIds={new Set(allActivities.map(a => a.id))}
          onAdd={(act) => { onAddActivity(act); setAddActOpen(false); }}
          onClose={() => setAddActOpen(false)}
        />
      )}
    </div>
  );
};

const AddExerciseSheet = ({ currentExIds, currentActIds, onAdd, onAddActivity, onClose }) => {
  const [search, setSearch] = React.useState('');
  const allExs = React.useMemo(() => {
    const seen = new Set();
    const result = [];
    for (let d = 0; d <= 6; d++) {
      const r = window.GymStore.getRoutineFor(d);
      if (!r || r.rest) continue;
      for (const ex of (r.exercises || [])) {
        if (!seen.has(ex.id)) { seen.add(ex.id); result.push(ex); }
      }
    }
    return result;
  }, []);
  const featured = React.useMemo(() => {
    const ids = window.FEATURED_ACTIVITY_IDS || [];
    const all = window.DEFAULT_ACTIVITIES || [];
    return ids.map(id => all.find(a => a.id === id)).filter(Boolean);
  }, []);
  const filtered = allExs.filter(ex =>
    !currentExIds.has(ex.id) &&
    (search === '' || ex.name.toLowerCase().includes(search.toLowerCase()) || (ex.sub||'').toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle" />
        <div className="detail-head">
          <div className="detail-tag">AGREGAR EJERCICIO</div>
          <div className="detail-name">Elige de tu rutina</div>
        </div>

        {featured.length > 0 && onAddActivity && (
          <>
            <div className="featured-cardio-label">Cardio rápido</div>
            <div className="featured-cardio-row">
              {featured.map(act => {
                const already = currentActIds?.has(act.id);
                return (
                  <button
                    key={act.id}
                    className={`featured-cardio-btn${already ? ' is-in' : ''}`}
                    disabled={already}
                    onClick={() => onAddActivity(act)}
                    title={`${act.name} · ~${act.kcalPerMin} kcal/min`}
                  >
                    <span className="featured-cardio-icon">{act.icon}</span>
                    <span className="featured-cardio-name">{act.name}</span>
                    <span className="featured-cardio-kpm">~{act.kcalPerMin} kcal/min</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <input
          className="add-search-input"
          placeholder="Buscar ejercicio..."
          value={search}
          onFocus={e => e.target.select()}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="swap-list">
          {filtered.length === 0 && <div className="empty">No hay más ejercicios disponibles.</div>}
          {filtered.map(ex => (
            <button key={ex.id} className="swap-option" onClick={() => onAdd(ex)}>
              <div className="swap-option-info">
                <div className="swap-option-title">{ex.name}</div>
                <div className="swap-option-sub">{ex.sub} · {ex.sets}×{ex.reps} · {ex.weight > 0 ? ex.weight + ' lb' : 'Peso corporal'}</div>
              </div>
              <div className="swap-arrow" style={{color:'var(--accent)', fontWeight:700}}>+</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const AddActivitySheet = ({ currentActIds, onAdd, onClose }) => {
  const [customMode, setCustomMode] = React.useState(false);

  const available = React.useMemo(() => {
    return window.GymStore.getActivities().filter(a => !currentActIds.has(a.id));
  }, [currentActIds]);

  const actMetaLabel = (act) => {
    if (act.type === 'bodyweight') return 'Peso corporal';
    return `${act.defaultVal} ${act.unit}${act.kcalPerMin ? ` · ~${act.kcalPerMin} kcal/min` : ''}`;
  };

  // Formulario de actividad custom (inline, misma lógica que ActivityPickerModal)
  const [customForm, setCustomForm] = React.useState({
    name: '', icon: '🏃', type: 'time', unit: 'min', kcalPerMin: 5, defaultVal: 20
  });

  const handleTypeChange = (t) => {
    if (t.key === 'bodyweight') {
      setCustomForm(f => ({ ...f, type: t.key, unit: t.unit, defaultVal: 0, kcalPerMin: 0 }));
    } else {
      setCustomForm(f => ({ ...f, type: t.key, unit: t.unit }));
    }
  };

  const saveCustom = () => {
    if (!customForm.name.trim()) return;
    const act = { ...customForm, id: 'custom_' + Date.now(), name: customForm.name.trim() };
    window.GymStore.saveCustomActivity(act);
    onAdd(act);
  };

  if (customMode) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="detail-sheet" onClick={e => e.stopPropagation()}>
          <button type="button" className="sheet-close" onClick={onClose}>✕</button>
          <div className="modal-handle" />
          <div className="detail-head">
            <div className="detail-tag">NUEVA ACTIVIDAD</div>
            <div className="detail-name">Crear actividad</div>
          </div>
          <div className="picker-section-label">Nombre</div>
          <input
            className="picker-input"
            placeholder="Ej: Calistenia, Box, Patines..."
            value={customForm.name}
            onFocus={e => e.target.select()}
            onChange={e => setCustomForm(f => ({...f, name: e.target.value}))}
            autoFocus
          />
          <div className="picker-section-label" style={{marginTop:12}}>Tipo de valor</div>
          <div className="act-type-row">
            {(window.ACTIVITY_VALUE_TYPES || []).map(t => (
              <button key={t.key} className={`act-type-btn ${customForm.type === t.key ? 'on' : ''}`} onClick={() => handleTypeChange(t)}>
                {t.label}
              </button>
            ))}
          </div>
          {customForm.type !== 'bodyweight' && (
            <div className="editor-nums" style={{marginTop:12}}>
              <label>
                <span>Valor defecto</span>
                <input type="text" inputMode="decimal" value={customForm.defaultVal} onFocus={e=>e.target.select()} onChange={e => { const v=parseFloat(e.target.value); setCustomForm(f=>({...f, defaultVal: isNaN(v)?f.defaultVal:v})); }} />
              </label>
              <label>
                <span>kcal/min</span>
                <input type="text" inputMode="decimal" value={customForm.kcalPerMin} onFocus={e=>e.target.select()} onChange={e => { const v=parseFloat(e.target.value); setCustomForm(f=>({...f, kcalPerMin: isNaN(v)?f.kcalPerMin:v})); }} />
              </label>
            </div>
          )}
          <div className="picker-section-label" style={{marginTop:8}}>Ícono</div>
          <div className="picker-emoji-row">
            {['🏃','💃','🏊','🚴','🧘','⚡','🛼','🥊','⛷️','🏄','🤸','🤼','🧗'].map(ic => (
              <button key={ic} className={`picker-emoji-btn ${customForm.icon === ic ? 'on' : ''}`} onClick={() => setCustomForm(f=>({...f, icon: ic}))}>{ic}</button>
            ))}
          </div>
          <div className="picker-actions" style={{marginTop:12}}>
            <button type="button" className="btn-primary" onClick={saveCustom} disabled={!customForm.name.trim()}>Crear y agregar</button>
            <button type="button" className="btn-link" onClick={() => setCustomMode(false)}>← Volver al catálogo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle" />
        <div className="detail-head">
          <div className="detail-tag">AGREGAR ACTIVIDAD</div>
          <div className="detail-name">Actividad física</div>
        </div>
        <div className="swap-list">
          {available.length === 0 && <div className="empty">Ya tienes todas las actividades del catálogo.</div>}
          {available.map(act => (
            <button key={act.id} className="swap-option" onClick={() => onAdd(act)}>
              <div className="swap-option-day" style={{fontSize:22}}>{act.icon}</div>
              <div className="swap-option-info">
                <div className="swap-option-title">{act.name}</div>
                <div className="swap-option-sub">{actMetaLabel(act)}</div>
              </div>
              <div className="swap-arrow" style={{color:'var(--accent)', fontWeight:700}}>+</div>
            </button>
          ))}
        </div>
        <button type="button" className="btn-secondary" style={{marginTop:8}} onClick={() => setCustomMode(true)}>
          + Crear actividad nueva
        </button>
      </div>
    </div>
  );
};

const MOOD_META = {
  sick:   { icon: '🤧', label: 'Débil',  cls: 'mood-sick' },
  normal: { icon: '🙂', label: 'Normal', cls: 'mood-normal' },
  strong: { icon: '💪', label: 'Fuerte', cls: 'mood-strong' },
};

const MoodBadge = ({ mood, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const m = MOOD_META[mood] || MOOD_META.normal;
  if (!onChange) {
    return <div className={`mood-badge ${m.cls}`}><span>{m.icon}</span>{m.label}</div>;
  }
  return (
    <>
      <button type="button" className={`mood-badge ${m.cls}`} onClick={() => setOpen(true)} title="Cambiar cómo te sientes">
        <span>{m.icon}</span>{m.label}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <button type="button" className="sheet-close" onClick={() => setOpen(false)}>✕</button>
            <div className="modal-handle" />
            <div className="modal-title">Actualizar cómo te sientes</div>
            <div className="modal-sub">Puedes cambiarlo en cualquier momento</div>
            <div className="mood-grid">
              {Object.keys(MOOD_META).map(key => {
                const opt = MOOD_META[key];
                return (
                  <button
                    key={key}
                    className={`mood-opt mood-${key} ${mood === key ? 'is-selected' : ''}`}
                    onClick={() => { window.hapticTap && window.hapticTap(8); onChange(key); setOpen(false); }}
                  >
                    <div className="mood-icon">{opt.icon}</div>
                    <div className="mood-label">{opt.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ProgressBar = React.memo(({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className="progress-fill" style={{width: pct+'%'}} />
      </div>
      <div className="progress-label">{pct}%</div>
    </div>
  );
});

const TAG_META = {
  fire:   { icon: '🔥', label: 'Objetivo' },
  strong: { icon: '💪', label: 'Logrado' },
  cold:   { icon: '🥶', label: 'Peso alto' },
  pr:     { icon: '🏆', label: 'PR' },
  sick:   { icon: '🤧', label: 'Bajado' },
};

const ExerciseCard = React.memo(({ index, ex, state, pb, last, onChange, onOpen, onRemove }) => {
  const [justCompleted, setJustCompleted] = React.useState(false);
  const [weightStr, setWeightStr] = React.useState(() => String(state.weight));
  const isBodyweight = ex.weight === 0 && ex.unit === 'lb' && state.weight === 0;
  const isSeconds = ex.unit === 's';
  const stepSize = isSeconds ? 15 : 2.5;

  // Sync display string when stepper buttons change the weight from outside
  React.useEffect(() => { setWeightStr(String(state.weight)); }, [state.weight]);

  // Cleanup timeout cuando justCompleted cambia
  React.useEffect(() => {
    if (!justCompleted) return;
    const id = setTimeout(() => setJustCompleted(false), 550);
    return () => clearTimeout(id);
  }, [justCompleted]);

  const trend = (!isBodyweight && last)
    ? (state.weight > last.ex.weight ? 'up' : state.weight < last.ex.weight ? 'down' : 'flat')
    : null;

  const setWeight = (delta) => {
    const w = Math.max(0, Math.round((state.weight + delta) * 10) / 10);
    onChange(ex.id, { ...state, weight: w });
  };

  const toggleSet = (n) => {
    const newSets = state.sets === n ? n - 1 : n;
    const done = newSets >= ex.sets;
    onChange(ex.id, { ...state, sets: newSets, done });
    window.hapticTap && window.hapticTap(done && !state.done ? 25 : 6);
    if (done && !state.done) setJustCompleted(true);
  };

  const toggleComplete = (e) => {
    e.stopPropagation();
    if (state.done) {
      onChange(ex.id, { ...state, sets: 0, done: false });
      window.hapticTap && window.hapticTap(6);
    } else {
      onChange(ex.id, { ...state, sets: ex.sets, done: true });
      window.hapticTap && window.hapticTap([15, 40, 15]);
      setJustCompleted(true);
    }
  };

  const tagMeta = TAG_META[ex.tag] || TAG_META.fire;

  return (
    <div className={`ex-card ${state.done ? 'is-done' : ''} ${justCompleted ? 'just-done' : ''}`}>
      <div className="ex-head">
        <div className="ex-num">{String(index).padStart(2,'0')}</div>
        <div className="ex-info" onClick={onOpen}>
          <div className="ex-name">
            <span className="ex-tag">{tagMeta.icon}</span>
            {ex.name}
          </div>
          <div className="ex-sub">{ex.sub}</div>
          {isBodyweight
            ? <div className="ex-pb ex-pb-dim">Peso corporal</div>
            : pb != null && pb > 0
              ? <div className="ex-pb">Mejor: {pb}{isSeconds ? 's' : ' lb'}</div>
              : <div className="ex-pb ex-pb-dim">Sin registros aún</div>
          }
        </div>
        <button type="button" className={`ex-check ${state.done ? 'is-checked' : ''}`} onClick={toggleComplete}>
          {state.done ? '✓' : ''}
        </button>
        {onRemove && (
          <button
            type="button"
            className="ex-remove"
            title="Quitar de esta sesión"
            onClick={async (e) => {
              e.stopPropagation();
              const confirm = window.useConfirm ? window.useConfirm() : null;
              if (!confirm) { onRemove(); return; }
              const ok = await confirm({
                title: 'Quitar ejercicio',
                body: `¿Quitar "${ex.name}" de la sesión de hoy? No cambia tu rutina semanal.`,
                danger: true,
                confirmLabel: 'Quitar',
              });
              if (ok) { window.hapticTap && window.hapticTap(20); onRemove(); }
            }}
          >✕</button>
        )}
      </div>

      <div className="ex-body">
        {isBodyweight ? (
          <div className="weight-row bodyweight-row">
            <div className="bodyweight-label">💪 Peso corporal</div>
          </div>
        ) : (
          <div className="weight-row">
            <button type="button" className="stepper-btn" onClick={()=>setWeight(-stepSize)}>−</button>
            <div className="weight-display">
              <div className="weight-num-row">
                <input
                  className="weight-num weight-input"
                  type="text"
                  inputMode="decimal"
                  value={weightStr}
                  onFocus={e => e.target.select()}
                  onChange={e => setWeightStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={() => {
                    const v = parseFloat(weightStr);
                    const w = (!isNaN(v) && v >= 0) ? Math.round(v * 10) / 10 : state.weight;
                    onChange(ex.id, { ...state, weight: w });
                    setWeightStr(String(w));
                  }}
                />
                <span className="weight-unit">{isSeconds ? 's' : 'lb'}</span>
              </div>
              {last && (
                <div className={`weight-trend ${trend ? 'trend-'+trend : ''}`}>
                  {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '='} últ {last.ex.weight}{isSeconds ? 's' : ' lb'}
                </div>
              )}
            </div>
            <button type="button" className="stepper-btn" onClick={()=>setWeight(stepSize)}>+</button>
          </div>
        )}

        <div className="sets-row">
          {Array.from({length: ex.sets}).map((_, i) => (
            <button key={i}
              className={`set-chip ${i < state.sets ? 'is-done' : ''}`}
              onClick={() => toggleSet(i+1)}>
              <div className="set-reps">{ex.reps}</div>
              <div className="set-label">{isSeconds ? 'seg' : 'reps'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

const CARDIO_ICONS = { 'Patines': '🛼', 'Caminadora': '🚶' };

const CardioCard = React.memo(({ cardio, done, onToggle, savedMinutes, savedLaps }) => {
  const [minutes, setMinutes] = React.useState(savedMinutes || cardio.minutes || 10);
  const [laps, setLaps] = React.useState(savedLaps || cardio.laps || 1);

  const handleCheck = (e) => {
    e.stopPropagation();
    onToggle(minutes, cardio.laps != null ? laps : undefined);
  };

  const changeMinutes = (delta) => setMinutes(m => Math.max(5, m + delta));
  const changeLaps = (delta) => setLaps(l => Math.max(1, l + delta));
  const cardioIcon = CARDIO_ICONS[cardio.name] || '🏃';

  return (
    <div className={`cardio-card ${done ? 'is-done' : ''}`}>
      <div className="cardio-icon">{cardioIcon}</div>
      <div className="cardio-info">
        <div className="cardio-name">{cardio.name}</div>
        {cardio.laps != null && (
          <div className="cardio-time-row">
            <button type="button" className="cardio-time-btn" onClick={() => changeLaps(-1)}>−</button>
            <span className="cardio-time-val">{laps} vueltas</span>
            <button type="button" className="cardio-time-btn" onClick={() => changeLaps(1)}>+</button>
            <div className="cardio-presets">
              {[2, 4, 6].map(l => (
                <button key={l} className={`cardio-preset ${laps === l ? 'on' : ''}`} onClick={() => setLaps(l)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div className="cardio-time-row">
          <button type="button" className="cardio-time-btn" onClick={() => changeMinutes(-5)}>−</button>
          <span className="cardio-time-val">{minutes} min</span>
          <button type="button" className="cardio-time-btn" onClick={() => changeMinutes(5)}>+</button>
          <div className="cardio-presets">
            {[10, 15, 20].map(m => (
              <button key={m} className={`cardio-preset ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button type="button" className={`ex-check ${done ? 'is-checked' : ''}`} onClick={handleCheck}>
        {done ? '✓' : ''}
      </button>
    </div>
  );
});

// Tarjeta para actividades físicas (no basadas en peso)
const ActivityCard = React.memo(({ activity, state, onChange, onRemove }) => {
  const isBodyweight = activity.type === 'bodyweight';
  const initVal = isBodyweight ? 0 : (state.value ?? activity.defaultVal ?? 10);
  const [val, setVal] = React.useState(initVal);
  const [valStr, setValStr] = React.useState(() => String(initVal));

  React.useEffect(() => { if (!isBodyweight) setValStr(String(val)); }, [val, isBodyweight]);

  const toggle = (e) => {
    e.stopPropagation();
    onChange(activity.id, { ...state, done: !state.done, value: isBodyweight ? 0 : val });
  };

  const step = activity.unit === 'km' ? 0.5 : activity.unit === 's' ? 15 : 5;
  const changeVal = (delta) => {
    const newVal = Math.max(step, Math.round((val + delta) * 10) / 10);
    setVal(newVal);
    onChange(activity.id, { ...state, value: newVal });
  };

  const commitInput = () => {
    const v = parseFloat(valStr);
    const nv = (!isNaN(v) && v > 0) ? Math.round(v * 10) / 10 : val;
    setVal(nv);
    setValStr(String(nv));
    onChange(activity.id, { ...state, value: nv });
  };

  // kcalPerMin × minutos (o valor equivalente). Fallback a cal10/10 para actividades guardadas con el campo viejo.
  const kpm = activity.kcalPerMin ?? (activity.cal10 ? activity.cal10 / 10 : null);
  const calEst = (!isBodyweight && kpm) ? Math.round(val * kpm) : null;

  return (
    <div className={`activity-card ${state.done ? 'is-done' : ''}`}>
      <div className="activity-icon">{activity.icon || '🏃'}</div>
      <div className="activity-info">
        <div className="activity-name">{activity.name}</div>
        {isBodyweight ? (
          <div className="bodyweight-label" style={{marginTop: 4, display:'inline-block', fontSize:12}}>
            💪 Peso corporal
          </div>
        ) : (
          <div className="activity-val-row">
            <button type="button" className="cardio-time-btn" onClick={() => changeVal(-step)}>−</button>
            <input
              className="activity-val-input"
              type="text"
              inputMode="decimal"
              value={valStr}
              onFocus={e => e.target.select()}
              onChange={e => setValStr(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={commitInput}
            />
            <span className="activity-val-unit">{activity.unit}</span>
            <button type="button" className="cardio-time-btn" onClick={() => changeVal(step)}>+</button>
            {calEst != null && <span className="activity-cal">~{calEst} kcal</span>}
          </div>
        )}
      </div>
      <button type="button" className={`ex-check ${state.done ? 'is-checked' : ''}`} onClick={toggle}>
        {state.done ? '✓' : ''}
      </button>
      {onRemove && (
        <button
          type="button"
          className="ex-remove"
          title="Quitar de esta sesión"
          onClick={async (e) => {
            e.stopPropagation();
            const confirm = window.useConfirm ? window.useConfirm() : null;
            if (!confirm) { onRemove(); return; }
            const ok = await confirm({
              title: 'Quitar actividad',
              body: `¿Quitar "${activity.name}" de la sesión de hoy?`,
              danger: true,
              confirmLabel: 'Quitar',
            });
            if (ok) { window.hapticTap && window.hapticTap(20); onRemove(); }
          }}
        >✕</button>
      )}
    </div>
  );
});

// Modal de cambio de entrenamiento
const SwapRoutineModal = ({ currentDow, onClose, onSwap }) => {
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle" />
        <div className="detail-head">
          <div className="detail-tag">HOY · {window.DAY_LONG[currentDow].toUpperCase()}</div>
          <div className="detail-name">Cambiar entrenamiento</div>
          <div className="detail-sub">Elige qué hacer hoy en lugar de "{window.GymStore.getRoutineFor(currentDow).title}"</div>
        </div>
        <div className="swap-list">
          {WEEK_ORDER.filter(d => d !== currentDow).map(d => {
            const r = window.GymStore.getRoutineFor(d);
            if (r.rest) return null;
            return (
              <button key={d} className="swap-option" onClick={() => onSwap(d)}>
                <div className="swap-option-day">{window.DAY_LONG[d]}</div>
                <div className="swap-option-info">
                  <div className="swap-option-title">{r.title}</div>
                  <div className="swap-option-sub">{r.subtitle || (r.muscles || []).join(', ')}</div>
                </div>
                <div className="swap-arrow">›</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

window.TodayScreen = TodayScreen;
window.SwapRoutineModal = SwapRoutineModal;
