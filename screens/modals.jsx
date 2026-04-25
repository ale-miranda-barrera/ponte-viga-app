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

  // Todos los registros: orden cronológico para el gráfico
  const allSessions = React.useMemo(() =>
    Object.values(window.GymStore.getAllSessions())
      .filter(s => (s.exercises || []).some(e => e.id === ex.id))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [ex.id]
  );

  const chartPoints = allSessions.map(s => ({
    date: s.date,
    weight: s.exercises.find(e => e.id === ex.id).weight,
  }));

  // Últimas 8 sesiones en orden inverso (más reciente primero)
  const recentSessions = [...allSessions].reverse().slice(0, 8);

  const tagMeta = DETAIL_TAG_META[ex.tag] || DETAIL_TAG_META.fire;
  const Chart = window.LineChart;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
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

// Detalle de día (desde calendario)
const DayDetail = ({ dateIso, onClose }) => {
  if (!dateIso) return null;
  const s = window.GymStore.getSession(dateIso);
  if (!s) return null;
  const d = new Date(dateIso + 'T00:00:00');
  const exMeta = window._allExMeta;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle"></div>
        <div className="detail-head">
          <div className="detail-tag">{window.DAY_LONG[d.getDay()]} · {d.getDate()} {window.MONTH_LONG[d.getMonth()]}</div>
          <div className="detail-name">{s.title}</div>
          <div className="detail-sub">Estado: {DETAIL_MOOD_META[s.mood] || '🙂'} · {s.completed ? 'Completo' : 'Parcial'}</div>
        </div>
        <div className="detail-section-title">Ejercicios</div>
        <div className="detail-history">
          {(s.exercises || []).map(e => {
            const meta = exMeta[e.id];
            return (
              <div key={e.id} className="detail-row">
                <div className="detail-row-body" style={{ flex: 1 }}>
                  <div className="detail-row-w" style={{ fontSize: 15 }}>{meta?.name || e.id}</div>
                  <div className="detail-row-meta">{e.weight} lb · {e.sets}/{e.targetSets}×{e.reps}</div>
                </div>
                <div className={`set-dot ${e.done ? 'is-done' : ''}`}>{e.done ? '✓' : '·'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

window.MoodModal = MoodModal;
window.ExerciseDetail = ExerciseDetail;
window.DayDetail = DayDetail;
