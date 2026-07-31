// Vista semanal: muestra los 7 días con opción de editar cualquier día
// + Apartado "Ejercicios" con catálogo global de ejercicios
const WeekScreen = ({ onEditDay, routineVer }) => {
  const today = new Date();
  const todayDow = today.getDay();
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dom
  window.useStoreTopic('routine');

  // Tab interno: semana | ejercicios
  const [tab, setTab] = React.useState('semana');

  const routineMap = (() => {
    const map = {};
    for (let d of WEEK_ORDER) {
      map[d] = window.GymStore.getRoutineFor(d);
    }
    return map;
  })();

  return (
    <div className="week-screen">
      {/* Selector de sub-vista */}
      <div className="week-tabs">
        <button className={`week-tab ${tab === 'semana' ? 'on' : ''}`} onClick={() => setTab('semana')}>Semana</button>
        <button className={`week-tab ${tab === 'ejercicios' ? 'on' : ''}`} onClick={() => setTab('ejercicios')}>Ejercicios</button>
      </div>

      {tab === 'semana' ? (
        <WeekRoutineView routineMap={routineMap} todayDow={todayDow} onEditDay={onEditDay} />
      ) : (
        <ExerciseCatalogView routineMap={routineMap} routineVer={routineVer} />
      )}
    </div>
  );
};

// ─── Vista de rutina semanal (igual que antes) ────────────────────────────────
const WeekRoutineView = ({ routineMap, todayDow, onEditDay }) => {
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  return (
    <>
      <div className="week-eyebrow">Rutina Semanal</div>
      {WEEK_ORDER.map(dow => {
        const routine = routineMap[dow];
        const isToday = dow === todayDow;
        const isRest = !!routine.rest;
        return (
          <div key={dow} className={`week-card${isToday ? ' week-today' : ''}${isRest ? ' week-rest' : ''}`}>
            <div className="week-card-head">
              <div className="week-day-pill">
                {isToday && <span className="week-today-dot" />}
                {window.DAY_LONG[dow]}
              </div>
              <div className="week-card-title">{routine.title}</div>
              {!isRest && (
                <button type="button" className="icon-btn" onClick={() => onEditDay(dow)} title={`Editar ${window.DAY_LONG[dow]}`}>✎</button>
              )}
            </div>
            {!isRest && (
              <div className="week-card-body">
                {routine.subtitle && <div className="week-card-sub">{routine.subtitle}</div>}
                {(routine.muscles || []).length > 0 && (
                  <div className="week-muscles-row">
                    {routine.muscles.map(m => <span key={m} className="muscle-chip">{m}</span>)}
                  </div>
                )}
                <div className="week-ex-table">
                  {(routine.exercises || []).map((ex, i) => (
                    <div key={ex.id} className="week-ex-row">
                      <span className="week-ex-i">{String(i + 1).padStart(2, '0')}</span>
                      <span className="week-ex-name">{ex.name}</span>
                      <span className="week-ex-spec">
                        {ex.sets}×{ex.reps} · {ex.weight > 0 ? ex.weight + (ex.unit !== 'lb' ? ex.unit : 'lb') : 'Corporal'}
                      </span>
                    </div>
                  ))}
                  {routine.cardio && (
                    <div className="week-ex-row week-cardio-row">
                      <span className="week-ex-i">🏃</span>
                      <span className="week-ex-name">{routine.cardio.name}</span>
                      <span className="week-ex-spec">{routine.cardio.minutes} min</span>
                    </div>
                  )}
                  {(routine.activities || []).map(act => (
                    <div key={act.id} className="week-ex-row week-cardio-row">
                      <span className="week-ex-i">{act.icon || '🏃'}</span>
                      <span className="week-ex-name">{act.name}</span>
                      <span className="week-ex-spec">
                        {act.type === 'bodyweight' ? 'Peso corporal' : `${act.defaultVal} ${act.unit}`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="week-card-stats">
                  <span>{(routine.exercises || []).length} ejercicios</span>
                  <span className="dot-sep">·</span>
                  <span>~{Math.round((routine.exercises || []).reduce((s,e) => s + e.sets, 0) * 2.2 + (routine.cardio?.minutes || 0))} min</span>
                  {(routine.exercises || []).reduce((s,e) => s + e.sets, 0) > 0 && (
                    <>
                      <span className="dot-sep">·</span>
                      <span>{(routine.exercises || []).reduce((s,e) => s + e.sets, 0)} sets</span>
                    </>
                  )}
                </div>
              </div>
            )}
            {isRest && (
              <div className="week-rest-body">Día de descanso · Recupera y disfruta</div>
            )}
          </div>
        );
      })}
    </>
  );
};

// ─── Vista de catálogo de ejercicios ─────────────────────────────────────────
// Muestra todos los ejercicios de todas las rutinas, agrupados por rutina.
// Permite ver en qué día(s) aparece cada ejercicio.
// Permite agregar grupos de ejercicios extras a un día (para cuando hay
// múltiples actividades ese día, ej: gym + calistenia).
const ExerciseCatalogView = ({ routineMap, routineVer }) => {
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const [search, setSearch] = React.useState('');
  const [expandedGroup, setExpandedGroup] = React.useState(null);

  // Construir catálogo global: un entry por grupo (rutina de cada día)
  const groups = React.useMemo(() => {
    return WEEK_ORDER
      .map(dow => ({ dow, routine: routineMap[dow] }))
      .filter(({ routine }) => !routine.rest && (routine.exercises || []).length > 0);
  }, [routineMap]);

  // Lista plana de todos los ejercicios para búsqueda
  const allExercises = React.useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const { dow, routine } of groups) {
      for (const ex of (routine.exercises || [])) {
        if (!seen.has(ex.id)) {
          seen.add(ex.id);
          result.push({ ...ex, routineTitle: routine.title, dow });
        }
      }
    }
    return result;
  }, [groups]);

  const filtered = search.trim()
    ? allExercises.filter(ex =>
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        (ex.sub || '').toLowerCase().includes(search.toLowerCase()) ||
        ex.routineTitle.toLowerCase().includes(search.toLowerCase())
      )
    : null; // null = no hay búsqueda activa, mostrar por grupos

  const exSpec = (ex) =>
    `${ex.sets}×${ex.reps} · ${ex.weight > 0 ? ex.weight + (ex.unit !== 'lb' ? ex.unit : ' lb') : 'Peso corporal'}`;

  return (
    <>
      <div className="week-eyebrow">Ejercicios</div>

      {/* Buscador */}
      <input
        className="add-search-input"
        placeholder="Buscar ejercicio..."
        value={search}
        onFocus={e => e.target.select()}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered ? (
        // Vista de búsqueda: lista plana
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {filtered.length === 0 && (
            <div className="empty">No se encontraron ejercicios.</div>
          )}
          {filtered.map(ex => (
            <div key={ex.id} className="cat-ex-row">
              <div className="cat-ex-info">
                <div className="cat-ex-name">{ex.name}</div>
                <div className="cat-ex-sub">{ex.sub}</div>
                <div className="cat-ex-spec">{exSpec(ex)} · <span className="cat-ex-routine">{ex.routineTitle}</span></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Vista agrupada por rutina
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {groups.map(({ dow, routine }) => {
            const isExpanded = expandedGroup === dow;
            return (
              <div key={dow} className="cat-group-card">
                <button
                  type="button"
                  className="cat-group-head"
                  onClick={() => setExpandedGroup(isExpanded ? null : dow)}
                >
                  <div>
                    <div className="cat-group-day">{window.DAY_LONG[dow]}</div>
                    <div className="cat-group-title">{routine.title}</div>
                  </div>
                  <div className="cat-group-count">{(routine.exercises || []).length} ejercicios</div>
                  <div className="cat-group-arrow">{isExpanded ? '∧' : '∨'}</div>
                </button>
                {isExpanded && (
                  <div className="cat-group-body">
                    {(routine.exercises || []).map((ex, i) => (
                      <div key={ex.id} className="cat-ex-row">
                        <span className="cat-ex-num">{String(i+1).padStart(2,'0')}</span>
                        <div className="cat-ex-info">
                          <div className="cat-ex-name">{ex.name}</div>
                          {ex.sub && <div className="cat-ex-sub">{ex.sub}</div>}
                          <div className="cat-ex-spec">{exSpec(ex)}</div>
                        </div>
                      </div>
                    ))}
                    {(routine.activities || []).length > 0 && (
                      <>
                        <div className="cat-acts-label">Actividades</div>
                        {(routine.activities || []).map(act => (
                          <div key={act.id} className="cat-ex-row">
                            <span className="cat-ex-num">{act.icon || '🏃'}</span>
                            <div className="cat-ex-info">
                              <div className="cat-ex-name">{act.name}</div>
                              <div className="cat-ex-spec">
                                {act.type === 'bodyweight' ? 'Peso corporal' : `${act.defaultVal} ${act.unit}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </>
  );
};

window.WeekScreen = WeekScreen;
