const HIST_MOOD = { sick: '🤧', normal: '🙂', strong: '💪' };

// Gráfico de línea SVG con área rellena y fechas en eje X
const LineChart = ({ id, points }) => {
  if (!points || points.length < 2) {
    if (points && points.length === 1) {
      return (
        <div className="chart-one">
          {points[0].weight} lb — {points[0].date.slice(5).replace('-', '/')}
        </div>
      );
    }
    return null;
  }

  const W = 300, H = 72, PX = 4, PY = 6;
  const labelH = 14;
  const chartH = H - labelH;
  const n = points.length;

  const weights = points.map(p => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = (maxW - minW) || 1;

  const cx = (i) => PX + (i / (n - 1)) * (W - 2 * PX);
  const cy = (w) => PY + (1 - (w - minW) / range) * (chartH - 2 * PY);

  const ptStr = points.map((p, i) => `${cx(i).toFixed(1)},${cy(p.weight).toFixed(1)}`).join(' ');
  const areaStr = `${cx(0).toFixed(1)},${chartH} ${ptStr} ${cx(n - 1).toFixed(1)},${chartH}`;
  const gradId = ('lg_' + id).replace(/[^a-z0-9_]/gi, '_');
  const lastPt = points[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#${gradId})`} />
      <polyline
        points={ptStr}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={cx(i)} cy={cy(p.weight)} r="2.5" fill="var(--accent)" />
      ))}
      {/* Etiqueta del último punto */}
      <text
        x={Math.min(W - PX, cx(n - 1))}
        y={Math.max(10, cy(lastPt.weight) - 5)}
        fontSize="9"
        fill="var(--text)"
        textAnchor="end"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        {lastPt.weight}lb
      </text>
      {/* Etiquetas de fecha en el eje X */}
      {points.map((p, i) => {
        const show = i === 0 || i === n - 1 || (n >= 5 && i === Math.round((n - 1) / 2));
        if (!show) return null;
        const label = p.date.slice(5).replace('-', '/');
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        const xPos = Math.max(PX, Math.min(W - PX, cx(i)));
        return (
          <text key={i} x={xPos} y={H - 1} fontSize="8" fill="var(--text-3)" textAnchor={anchor}>
            {label}
          </text>
        );
      })}
    </svg>
  );
};

window.LineChart = LineChart;

const HistoryScreen = ({ onSelectExercise }) => {
  const [tab, setTab] = React.useState('sessions');
  const sessions = React.useMemo(
    () => Object.values(window.GymStore.getAllSessions()).sort((a, b) => b.date.localeCompare(a.date)),
    []
  );
  const exMap = React.useMemo(() => {
    const m = {};
    sessions.forEach(s => (s.exercises || []).forEach(e => {
      if (!m[e.id]) m[e.id] = [];
      m[e.id].push({ date: s.date, weight: e.weight, reps: e.reps });
    }));
    // newest first
    Object.keys(m).forEach(k => m[k].sort((a, b) => b.date.localeCompare(a.date)));
    return m;
  }, [sessions]);

  const allEx = React.useMemo(() => {
    const m = { ...window._allExMeta };
    for (let d = 0; d <= 6; d++) {
      const r = window.GymStore.getRoutineFor(d);
      if (r) (r.exercises || []).forEach(e => { if (e.id && e.name) m[e.id] = e; });
    }
    return m;
  }, []);

  return (
    <div className="hist-screen">
      <div className="hist-tabs">
        <button className={`hist-tab ${tab === 'sessions' ? 'on' : ''}`} onClick={() => setTab('sessions')}>Sesiones</button>
        <button className={`hist-tab ${tab === 'progress' ? 'on' : ''}`} onClick={() => setTab('progress')}>Progreso</button>
      </div>

      {tab === 'sessions' && (
        <div className="hist-sessions">
          {sessions.length === 0 && <div className="empty">Aún sin sesiones registradas.</div>}
          {sessions.map(s => {
            const [, mo, day] = s.date.split('-');
            return (
              <div key={s.date} className="hist-item">
                <div className="hist-date">
                  <div className="hist-day">{day}</div>
                  <div className="hist-mo">{window.MONTH_LONG[parseInt(mo) - 1].slice(0, 3).toUpperCase()}</div>
                </div>
                <div className="hist-body">
                  <div className="hist-title">{s.title}</div>
                  <div className="hist-meta">
                    <span>{(s.exercises || []).length} ejercicios</span>
                    <span className="dot-sep">·</span>
                    <span>{HIST_MOOD[s.mood] || '🙂'}</span>
                    <span className="dot-sep">·</span>
                    <span className={s.completed ? 'ok' : 'warn'}>{s.completed ? 'Completo' : 'Parcial'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'progress' && (
        <div className="hist-progress">
          {Object.keys(exMap).length === 0 && <div className="empty">Haz al menos un entrenamiento para ver progreso.</div>}
          {Object.keys(exMap).map(id => {
            const points = exMap[id]; // newest first
            const ex = allEx[id] || { id, name: id, sub: 'Ejercicio personalizado' };
            const latest = points[0];
            const prev = points[1];
            const trend = prev ? (latest.weight > prev.weight ? 'up' : latest.weight < prev.weight ? 'down' : 'flat') : null;
            const delta = prev ? Math.round((latest.weight - prev.weight) * 10) / 10 : 0;
            // Chart: 16 más recientes, orden cronológico (más viejo primero)
            const chartPts = points.slice(0, 16).reverse();

            return (
              <div key={id} className="prog-item" onClick={() => onSelectExercise(ex)}>
                <div className="prog-head">
                  <div className="prog-name">{ex.name}</div>
                  <div className="prog-weight">
                    {latest.weight}<span className="prog-unit">lb</span>
                  </div>
                </div>
                <div className="prog-meta">
                  <span className="prog-sub">{ex.sub}</span>
                  {trend && (
                    <span className={`prog-trend trend-${trend}`}>
                      {trend === 'up' ? `↑ +${delta}` : trend === 'down' ? `↓ ${delta}` : `= 0`} lb
                    </span>
                  )}
                </div>
                <div className="prog-chart">
                  <LineChart id={`prog_${id}`} points={chartPts} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

window.HistoryScreen = HistoryScreen;
