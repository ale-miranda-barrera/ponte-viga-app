const MOOD_OPTIONS = [
  { key: 'sick', icon: '🤧', label: 'Débil', sub: 'Enfermo / cansado' },
  { key: 'normal', icon: '🙂', label: 'Normal', sub: 'Como cualquier día' },
  { key: 'strong', icon: '💪', label: 'Fuerte', sub: 'A darle con todo' },
];

const MoodModal = ({ open, onPick, onClose }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle"></div>
        <div className="modal-title">¿Cómo te sientes hoy?</div>
        <div className="modal-sub">Elige antes de empezar tu entrenamiento</div>
        <div className="mood-grid">
          {MOOD_OPTIONS.map(o => (
            <button key={o.key} className={`mood-opt mood-${o.key}`} onClick={() => onPick(o.key)}>
              <div className="mood-icon">{o.icon}</div>
              <div className="mood-label">{o.label}</div>
              <div className="mood-sub">{o.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const DETAIL_TAG_META = {
  fire:   { icon: '🔥', label: 'Objetivo' },
  strong: { icon: '💪', label: 'Logrado' },
  cold:   { icon: '🥶', label: 'Peso alto' },
  pr:     { icon: '🏆', label: 'PR' },
};
const DETAIL_MOOD_META = { sick: '🤧', normal: '🙂', strong: '💪' };

const ExerciseDetail = ({ ex, onClose }) => {
  if (!ex) return null;

  // Todos los registros: orden cronológico para el gráfico (aplana arrays multi-sesión)
  const allSessions = React.useMemo(() =>
    window.GymStore.getAllSessionsFlat()
      .filter(s => (s.exercises || []).some(e => e.id === ex.id))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [ex.id]
  );

  const chartPoints = allSessions.map(s => ({
    date: s.date,
    weight: s.exercises.find(e => e.id === ex.id)?.weight ?? 0,
  })).filter(p => p.weight > 0);

  // Últimas 8 sesiones en orden inverso (más reciente primero)
  const recentSessions = [...allSessions].reverse().slice(0, 8);

  const tagMeta = DETAIL_TAG_META[ex.tag] || DETAIL_TAG_META.fire;
  const Chart = window.LineChart;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle"></div>
        <div className="detail-head">
          <div className="detail-tag">{tagMeta.icon} {tagMeta.label}</div>
          <div className="detail-name">{ex.name}</div>
          <div className="detail-sub">{ex.sub}</div>
          {ex.target && <div className="detail-target">{ex.target}</div>}
        </div>

        {Chart && chartPoints.length >= 2 && (
          <>
            <div className="detail-section-title">Evolución de peso</div>
            <div className="detail-chart-wrap">
              <Chart id={`detail_${ex.id}`} points={chartPoints} />
            </div>
          </>
        )}

        <div className="detail-section-title">Últimas sesiones</div>
        <div className="detail-history">
          {recentSessions.length === 0 && <div className="empty">Aún sin registros.</div>}
          {recentSessions.map(s => {
            const e = s.exercises.find(x => x.id === ex.id);
            if (!e) return null;
            return (
              <div key={s.date} className="detail-row">
                <div className="detail-row-date">{s.date.slice(5).replace('-', '/')}</div>
                <div className="detail-row-body">
                  <div className="detail-row-w">{e.weight} lb</div>
                  <div className="detail-row-meta">{e.sets}×{e.reps}</div>
                </div>
                <div className={`detail-row-mood mood-${s.mood}`}>
                  {DETAIL_MOOD_META[s.mood] || '🙂'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Render de una sola sesión dentro del DayDetail
const DaySessionBlock = ({ s, exMeta, showTitle }) => {
  const dur = (s.startTime && s.endTime) ? (() => {
    const ms = s.endTime - s.startTime;
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return null;
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  })() : null;

  const doneActs = Object.values(s.activities || {}).filter(a => a.done);
  const displayTitle = (s.label && s.label !== s.title) ? s.label : s.title;

  return (
    <>
      {showTitle && (
        <div className="day-session-header">
          <div className="day-session-title">{displayTitle}</div>
          <div className="day-session-meta">
            {DETAIL_MOOD_META[s.mood] || '🙂'} · {s.completed ? 'Completo' : 'Parcial'}{dur && ` · ${dur}`}
          </div>
        </div>
      )}
      {!showTitle && (
        <div className="detail-sub" style={{marginBottom:8}}>
          {DETAIL_MOOD_META[s.mood] || '🙂'} · {s.completed ? 'Completo' : 'Parcial'}
          {dur && ` · ${dur}`}
        </div>
      )}
      {(s.exercises || []).length > 0 && (
        <>
          {showTitle && <div className="detail-section-title" style={{marginTop:4}}>Ejercicios</div>}
          <div className="detail-history">
            {(s.exercises || []).map(e => {
              const meta = exMeta[e.id];
              const partial = !e.done && e.sets > 0;
              return (
                <div key={e.id} className="detail-row">
                  <div className="detail-row-body" style={{ flex: 1 }}>
                    <div className="detail-row-w" style={{ fontSize: 15 }}>{meta?.name || e.id}</div>
                    <div className="detail-row-meta">{e.weight > 0 ? `${e.weight} lb · ` : ''}{e.sets}/{e.targetSets}×{e.reps}</div>
                  </div>
                  {e.done
                    ? <div className="set-dot is-done">✓</div>
                    : partial
                      ? <div className="set-chip-partial">{e.sets}/{e.targetSets}</div>
                      : <div className="set-dot">·</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      {s.cardioDone && s.cardioMinutes && (
        <>
          <div className="detail-section-title">Cardio</div>
          <div className="detail-history">
            <div className="detail-row">
              <div className="detail-row-body" style={{ flex: 1 }}>
                <div className="detail-row-w" style={{ fontSize: 15 }}>🏃 {s.cardioMinutes} min</div>
                {s.cardioLaps != null && <div className="detail-row-meta">{s.cardioLaps} vueltas</div>}
              </div>
              <div className="set-dot is-done">✓</div>
            </div>
          </div>
        </>
      )}
      {doneActs.length > 0 && (
        <>
          <div className="detail-section-title">Actividades</div>
          <div className="detail-history">
            {doneActs.map(a => {
              const actDef = (window.DEFAULT_ACTIVITIES || []).find(x => x.id === a.id);
              return (
                <div key={a.id} className="detail-row">
                  <div className="detail-row-body" style={{ flex: 1 }}>
                    <div className="detail-row-w" style={{ fontSize: 15 }}>{actDef?.icon || '🏃'} {actDef?.name || a.id}</div>
                    {a.value != null && <div className="detail-row-meta">{a.value} {actDef?.unit || ''}</div>}
                  </div>
                  <div className="set-dot is-done">✓</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

// Detalle de día (desde calendario) — soporta múltiples sesiones por día
const DayDetail = ({ dateIso, onClose }) => {
  if (!dateIso) return null;
  const daySessions = window.GymStore.getDaySessions(dateIso);
  if (daySessions.length === 0) return null;
  const d = new Date(dateIso + 'T00:00:00');
  const exMeta = window._allExMeta;
  const multi = daySessions.length > 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle"></div>
        <div className="detail-head">
          <div className="detail-tag">{window.DAY_LONG[d.getDay()]} · {d.getDate()} {window.MONTH_LONG[d.getMonth()]}</div>
          {!multi && <div className="detail-name">{daySessions[0].label || daySessions[0].title}</div>}
          {multi && <div className="detail-name">{daySessions.length} sesiones</div>}
        </div>
        {!multi && <DaySessionBlock s={daySessions[0]} exMeta={exMeta} showTitle={false} />}
        {multi && (
          <>
            <div className="detail-section-title">Sesiones del día</div>
            {daySessions.map((s, idx) => (
              <div key={s.sessionId || idx} className="day-session-block">
                <DaySessionBlock s={s} exMeta={exMeta} showTitle={true} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// Calcula kcal de una sesión:
// - Ejercicios con peso: 5 kcal/set (estimación basada en esfuerzo por set de fuerza ~70kg).
// - Ejercicios sin peso (bodyweight): 3 kcal/set.
// - Actividades: val * kcalPerMin (minutos por tasa metabólica). Fallback cal10/10 para registros viejos.
// - Cardio: minutos * 5 kcal/min (estimación caminadora/trote ligero, ~70kg).
const calcSessionKcal = (s) => {
  let kcal = 0;
  (s.exercises || []).forEach(ex => {
    if (ex.done) kcal += ex.sets * (ex.weight > 0 ? 5 : 3);
  });
  Object.values(s.activities || {}).forEach(a => {
    if (!a.done || !a.value) return;
    // Busca la definición en catálogo para obtener kcalPerMin
    const def = (window.DEFAULT_ACTIVITIES || []).find(x => x.id === a.id);
    const kpm = def?.kcalPerMin ?? (def?.cal10 ? def.cal10 / 10 : 4);
    kcal += Math.round(a.value * kpm);
  });
  if (s.cardioDone && s.cardioMinutes) kcal += Math.round(s.cardioMinutes * 5);
  return kcal;
};

const CompletionModal = ({ session, onClose }) => {
  const doneCount = (session.exercises || []).filter(e => e.done).length;
  const setsTotal = (session.exercises || []).reduce((s, e) => s + (e.sets || 0), 0);

  const { hasPR, dayKcal } = React.useMemo(() => {
    const allSessions = window.GymStore.getAllSessionsFlat();
    const before = allSessions.filter(s => s.date < session.date || (s.date === session.date && s.sessionId !== session.sessionId));
    const pr = (session.exercises || []).some(ex => {
      const pastBest = before.reduce((max, s) => {
        const found = (s.exercises || []).find(e => e.id === ex.id);
        return found ? Math.max(max, found.weight) : max;
      }, 0);
      return ex.weight > pastBest && pastBest > 0;
    });
    // Suma kcal de TODAS las sesiones del día (incluye la actual que ya fue guardada)
    const todaySessions = window.GymStore.getDaySessions(session.date);
    const totalKcal = todaySessions.reduce((sum, s) => sum + calcSessionKcal(s), 0);
    return { hasPR: pr, dayKcal: totalKcal };
  }, [session]);

  const MSGS = ['¡Buen trabajo!', '¡Lo lograste!', '¡Excelente sesión!', '¡Sigue así!'];
  const [msg] = React.useState(() => MSGS[Math.floor(Math.random() * MSGS.length)]);

  return (
    <div className="completion-backdrop" onClick={onClose}>
      <div className="completion-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="completion-trophy">🏆</div>
        <div className="completion-title">{msg}</div>
        <div className="completion-routine">{session.title}</div>
        <div className="completion-stats">
          <div className="completion-stat">
            <div className="completion-stat-num">{doneCount}</div>
            <div className="completion-stat-label">ejercicios</div>
          </div>
          <div className="completion-divider" />
          <div className="completion-stat">
            <div className="completion-stat-num">{setsTotal}</div>
            <div className="completion-stat-label">sets</div>
          </div>
          {session.cardioDone && session.cardioMinutes && (
            <>
              <div className="completion-divider" />
              <div className="completion-stat">
                <div className="completion-stat-num">{session.cardioMinutes}</div>
                <div className="completion-stat-label">min cardio</div>
              </div>
            </>
          )}
          {dayKcal > 0 && (
            <>
              <div className="completion-divider" />
              <div className="completion-stat">
                <div className="completion-stat-num">~{dayKcal}</div>
                <div className="completion-stat-label">kcal hoy</div>
              </div>
            </>
          )}
        </div>
        {hasPR && (
          <div className="completion-pr">⬆️ ¡Nuevo récord personal!</div>
        )}
        <div className="completion-sub-msg">Entrenamiento guardado. ¡Descansa bien!</div>
        <button type="button" className="btn-primary" onClick={onClose}>Ver calendario →</button>
      </div>
    </div>
  );
};

// Modal de resumen al terminar entrenamiento desde la vista "done" (sin pasar por activo).
// Muestra: ejercicios completados, kcal, y comparación por ejercicio vs sesión anterior.
const DaySummaryModal = ({ session, onClose }) => {
  const doneExs = (session.exercises || []).filter(e => e.done);
  const kcal = calcSessionKcal(session);

  // Comparaciones: para cada ejercicio completado, busca la sesión anterior con ese ejercicio
  const comparisons = React.useMemo(() => {
    const exMeta = window._allExMeta || {};
    return doneExs.map(ex => {
      // Nombre del ejercicio: usar metadatos de rutina si están disponibles
      const meta = exMeta[ex.id];
      const name = meta?.name || ex.id;
      const isBodyweight = ex.weight === 0;

      // Busca la sesión anterior que tenga este ejercicio (excluye la actual)
      const [prevSession] = window.GymStore.getExerciseHistory(name, session.sessionId, 1);
      if (!prevSession) {
        return { name, diff: 'primera' };
      }

      const prevEx = (prevSession.exercises || []).find(e => {
        const pMeta = exMeta[e.id];
        const pName = pMeta?.name || e.id;
        return pName.toLowerCase().trim() === name.toLowerCase().trim();
      });
      if (!prevEx) return { name, diff: 'primera' };

      if (isBodyweight) {
        // Comparar reps totales (sets completados × reps)
        const currReps = ex.sets * (ex.reps || 0);
        const prevReps = prevEx.sets * (prevEx.reps || 0);
        const delta = currReps - prevReps;
        return { name, diff: 'reps', curr: currReps, prev: prevReps, delta };
      } else {
        // Comparar peso
        const delta = Math.round((ex.weight - prevEx.weight) * 10) / 10;
        return { name, diff: 'weight', curr: ex.weight, prev: prevEx.weight, delta };
      }
    });
  }, [session.sessionId]);

  const MSGS = ['¡Buen trabajo!', '¡Lo lograste!', '¡Excelente sesión!', '¡Sigue así!'];
  const [msg] = React.useState(() => MSGS[Math.floor(Math.random() * MSGS.length)]);

  return (
    <div className="completion-backdrop" onClick={onClose}>
      <div className="completion-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="completion-trophy">✅</div>
        <div className="completion-title">{msg}</div>
        <div className="completion-routine">{session.title}</div>

        <div className="completion-stats">
          <div className="completion-stat">
            <div className="completion-stat-num">{doneExs.length}</div>
            <div className="completion-stat-label">ejercicios</div>
          </div>
          {kcal > 0 && (
            <>
              <div className="completion-divider" />
              <div className="completion-stat">
                <div className="completion-stat-num">~{kcal}</div>
                <div className="completion-stat-label">kcal</div>
              </div>
            </>
          )}
        </div>

        {comparisons.length > 0 && (
          <>
            <div className="detail-section-title" style={{marginTop:16, marginBottom:8}}>Comparación con última vez</div>
            <div className="summary-comparisons">
              {comparisons.map((c, i) => (
                <div key={i} className="summary-cmp-row">
                  <div className="summary-cmp-name">{c.name}</div>
                  <div className="summary-cmp-val">
                    {c.diff === 'primera' && <span className="summary-cmp-new">Primera vez</span>}
                    {c.diff === 'weight' && (
                      <span className={c.delta > 0 ? 'summary-cmp-up' : c.delta < 0 ? 'summary-cmp-down' : 'summary-cmp-same'}>
                        {c.prev} → {c.curr} lb{c.delta > 0 ? ` (+${c.delta})` : c.delta < 0 ? ` (${c.delta})` : ' (=)'}
                      </span>
                    )}
                    {c.diff === 'reps' && (
                      <span className={c.delta > 0 ? 'summary-cmp-up' : c.delta < 0 ? 'summary-cmp-down' : 'summary-cmp-same'}>
                        {c.prev} → {c.curr} reps{c.delta > 0 ? ` (+${c.delta})` : c.delta < 0 ? ` (${c.delta})` : ' (=)'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="completion-sub-msg" style={{marginTop:16}}>Entrenamiento guardado. ¡Descansa bien!</div>
        <button type="button" className="btn-primary" onClick={onClose}>Ver progreso →</button>
      </div>
    </div>
  );
};

window.MoodModal = MoodModal;
window.ExerciseDetail = ExerciseDetail;
window.DayDetail = DayDetail;
window.CompletionModal = CompletionModal;
window.DaySummaryModal = DaySummaryModal;
