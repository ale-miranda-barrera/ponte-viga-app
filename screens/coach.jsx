// Coach IA: llama al endpoint /api/ai/coach con contexto del usuario
// y muestra headline motivacional + tips + sugerencias de peso.
// Fallback: si hay error, muestra tip local básico.

const buildCoachContext = (routine, dateIso) => {
  const profile = window.GymStore.getProfile();
  const streak = window.GymStore.computeStreak();
  const today = new Date(dateIso + 'T12:00:00');

  // Últimas sesiones completadas
  const allSessions = window.GymStore.getAllSessionsFlat()
    .filter(s => s.completed && s.date < dateIso)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastCompleted = allSessions[0];

  // PB por ejercicio para hoy
  const pb = {};
  const last = {};
  allSessions.forEach(s => (s.exercises || []).forEach(e => {
    if (e.weight > 0 && (pb[e.id] == null || e.weight > pb[e.id])) pb[e.id] = e.weight;
    if (!last[e.id]) last[e.id] = e.weight;
  }));

  const todayExercises = (routine?.exercises || []).slice(0, 6).map(ex => ({
    id: ex.id,
    name: ex.name,
    pb: pb[ex.id] || 0,
    lastWeight: last[ex.id] || 0,
    targetSets: ex.sets,
    targetReps: ex.reps,
  }));

  // kcal semana
  const calc = window.calcDayBurnedKcal;
  let kcalWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    kcalWeek += calc ? calc(window.GymStore.iso(d)) : 0;
  }

  const measures = window.GymStore.getMeasures();
  const latestPeso = [...measures].sort((a, b) => b.date.localeCompare(a.date)).find(m => m.peso != null);

  return {
    streak,
    mood: window.GymStore.getActive()?.mood || 'normal',
    todayName: window.DAY_LONG[today.getDay()].toLowerCase(),
    todayTitle: routine?.title || '',
    todayExercises,
    lastCompletedDate: lastCompleted?.date || null,
    kcalWeek,
    weightKg: latestPeso?.peso || null,
    goal: profile.goal || 'deficit',
    daysPerWeek: profile.daysPerWeek || 5,
  };
};

const CoachPanel = ({ routine, dateIso }) => {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const abortRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  // Cancelar cualquier fetch pendiente al desmontar (evita setState en zombie)
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  const fetchCoach = React.useCallback(async (force = false) => {
    // Cliente-side cache: 5min por (dateIso + routine.title). Evita spamear al toggle y en refresh.
    const cacheKey = 'pv_coach_' + dateIso + '_' + (routine?.title || '_');
    if (!force) {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const { ts, data } = JSON.parse(raw);
          if (Date.now() - ts < 5 * 60 * 1000) {
            if (mountedRef.current) setResult(data);
            return;
          }
        }
      } catch {}
    }
    // Aborta cualquier fetch previo antes de disparar uno nuevo
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const ctx = buildCoachContext(routine, dateIso);
      const baseUrl = (window.__SERVER_CONFIG__ && window.__SERVER_CONFIG__.apiUrl) || '';
      const r = await fetch(`${baseUrl}/api/ai/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (r.status === 429) {
        if (mountedRef.current) setError('Muchas peticiones. Espera un minuto.');
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (ctrl.signal.aborted || !mountedRef.current) return;
      setResult(j);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: j })); } catch {}
    } catch (e) {
      if (e.name === 'AbortError') return; // silencio: cancelación intencional
      if (mountedRef.current) setError(e.message || 'Error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [routine, dateIso]);

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !result && !loading) fetchCoach();
  };

  return (
    <div className={`coach-panel ${open ? 'is-open' : ''}`}>
      <button type="button" className="coach-head" onClick={toggleOpen}>
        <span className="coach-icon">🤖</span>
        <span className="coach-title">
          Consejo del coach
          {result?.source === 'ai' && <span className="coach-badge-ai">IA</span>}
        </span>
        <span className="coach-arrow">{open ? '∧' : '∨'}</span>
      </button>
      {open && (
        <div className="coach-body">
          {loading && (
            <div className="coach-loading">
              <div className="loading-dots"><span /><span /><span /></div>
              <span>Analizando tu semana...</span>
            </div>
          )}
          {error && !loading && (
            <div className="coach-error">
              <div>No pude conectar con el coach.</div>
              <button type="button" className="btn-link" onClick={fetchCoach}>Reintentar</button>
            </div>
          )}
          {result && !loading && (
            <>
              {result.headline && (
                <div className="coach-headline">{result.headline}</div>
              )}
              {result.weightAdvice && result.weightAdvice.length > 0 && (
                <>
                  <div className="coach-section">Sugerencias de peso hoy</div>
                  <div className="coach-list">
                    {result.weightAdvice.map((w, i) => (
                      <div key={i} className="coach-item">
                        <div className="coach-item-name">{w.exerciseName}</div>
                        <div className="coach-item-sub">{w.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {result.tips && result.tips.length > 0 && (
                <>
                  <div className="coach-section">Consejos</div>
                  <ul className="coach-tips">
                    {result.tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </>
              )}
              {result.nextFocus && (
                <div className="coach-focus">
                  <span className="coach-focus-icon">🎯</span>
                  <span>{result.nextFocus}</span>
                </div>
              )}
              <button type="button" className="btn-link coach-refresh" onClick={() => fetchCoach(true)}>
                ↻ Nuevo consejo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

window.CoachPanel = CoachPanel;
