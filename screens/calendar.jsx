// Pantalla Calendario: mes actual, días marcados con estado
const CalendarScreen = ({ onPickDate, streak, refresh, routineVer }) => {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  window.useStoreTopic('sessions', 'routine');
  const sessions = window.GymStore.getAllSessions();
  const today = new Date();
  const todayIso = window.GymStore.iso(today);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m+1, 0).getDate();
  const startDow = first.getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Build a DOW→routine map once, respecting user overrides (7 reads max)
  const routineMap = React.useMemo(() => {
    const m = {};
    for (let d = 0; d <= 6; d++) m[d] = window.GymStore.getRoutineFor(d);
    return m;
  }, [routineVer]);

  // monthFlat: lista plana de sesiones del mes (migración: cada entrada puede ser objeto o array)
  const monthPrefix = cursor.y + '-' + String(cursor.m+1).padStart(2,'0');
  const monthFlat = Object.entries(sessions)
    .filter(([k]) => k.startsWith(monthPrefix))
    .flatMap(([, v]) => Array.isArray(v) ? v : (v && v.date ? [v] : []));
  // Para "días completos" contamos días donde TODAS las sesiones están completas
  const monthDayKeys = Object.keys(sessions).filter(k => k.startsWith(monthPrefix));
  const completedCount = monthDayKeys.filter(k => {
    const arr = Array.isArray(sessions[k]) ? sessions[k] : [sessions[k]];
    return arr.length > 0 && arr.every(s => s.completed);
  }).length;
  const partialCount = monthDayKeys.filter(k => {
    const arr = Array.isArray(sessions[k]) ? sessions[k] : [sessions[k]];
    return arr.some(s => !s.completed);
  }).length;

  // Días de gym que ya pasaron este mes (excluye días de descanso y días futuros)
  const isCurrentMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const lastDayToCount = isCurrentMonth ? today.getDate() : daysInMonth;
  let gymDaysPassed = 0;
  for (let d = 1; d <= lastDayToCount; d++) {
    const dow = (startDow + d - 1) % 7;
    if (!routineMap[dow]?.rest) gymDaysPassed++;
  }
  const constancy = Math.round((completedCount / Math.max(1, gymDaysPassed)) * 100);

  // Estadísticas de la semana actual (lunes a hoy)
  const weekStats = React.useMemo(() => {
    const d = new Date(today);
    const dayOfWeek = d.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - daysFromMonday);
    const mondayIso = window.GymStore.iso(monday);

    // weekDone/Partial a nivel de DÍA (no sesión): un día completo = todas sus sesiones completas
    let weekDone = 0, weekPartial = 0;
    for (let i = 0; i <= daysFromMonday; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      const dIso = window.GymStore.iso(dd);
      const arr = window.GymStore.getDaySessions(dIso);
      if (arr.length === 0) continue;
      if (arr.every(s => s.completed)) weekDone++;
      else weekPartial++;
    }

    let weekGymDays = 0;
    for (let i = 0; i <= daysFromMonday; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      if (!routineMap[dd.getDay()]?.rest) weekGymDays++;
    }

    const actividadPct = Math.round(((weekDone + weekPartial) / Math.max(1, weekGymDays)) * 100);
    const constanciaWeek = Math.round((weekDone / Math.max(1, weekGymDays)) * 100);
    return { weekDone, weekPartial, weekGymDays, actividadPct, constanciaWeek };
  }, [sessions, todayIso]);

  return (
    <div className="cal-screen">
      <div className="cal-header">
        <button type="button" className="cal-nav" onClick={() => setCursor(c => {
          const m = c.m-1;
          return m < 0 ? { y: c.y-1, m: 11 } : { y: c.y, m };
        })}>‹</button>
        <div className="cal-title">
          <div className="cal-month">{window.MONTH_LONG[cursor.m]}</div>
          <div className="cal-year">{cursor.y}</div>
        </div>
        <button type="button" className="cal-nav" onClick={() => setCursor(c => {
          const m = c.m+1;
          return m > 11 ? { y: c.y+1, m: 0 } : { y: c.y, m };
        })}>›</button>
      </div>

      <div className="cal-stats">
        <div className="cal-stat"><span className="cal-stat-icon">🔥</span>{completedCount} completos</div>
        <div className="cal-stat"><span className="cal-stat-icon">💪</span>{partialCount} parciales</div>
        <div className="cal-stat"><span className="cal-stat-dot rest"></span>Descanso</div>
      </div>

      <div className="cal-grid cal-dow">
        {window.DAY_LONG.map((d, i) => <div key={i} className="cal-dow-cell">{d[0]}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty"></div>;
          const dateObj = new Date(cursor.y, cursor.m, d);
          const iso = window.GymStore.iso(dateObj);
          const dow = dateObj.getDay();
          const isToday = iso === todayIso;
          const isFuture = iso > todayIso;
          const daySessions = window.GymStore.getDaySessions(iso);
          const hasSession = daySessions.length > 0;
          const isRestDay = routineMap[dow]?.rest;

          // Estado del día: completed solo si TODAS las sesiones están completas
          let state = 'none';
          if (hasSession) {
            const allDone = daySessions.every(s => s.completed);
            state = allDone ? 'completed' : 'partial';
          } else if (isRestDay) {
            state = 'rest';
          } else if (!isFuture) {
            state = 'missed';
          }

          // Badge múltiples sesiones
          const multiCount = daySessions.length > 1 ? daySessions.length : null;

          // Label parcial: ejercicios completados de la primera sesión
          let partialLabel = null;
          if (state === 'partial' && daySessions.length === 1) {
            const s = daySessions[0];
            const doneEx = (s.exercises || []).filter(e => e.done).length;
            const totalEx = (s.exercises || []).length;
            if (totalEx > 0) partialLabel = `${doneEx}/${totalEx}`;
          }

          return (
            <button key={i} className={`cal-cell state-${state} ${isToday ? 'is-today' : ''} ${isFuture?'is-future':''}`}
              disabled={!hasSession}
              onClick={() => onPickDate(iso)}>
              <div className="cal-day-num">{d}</div>
              {state === 'completed' && <div className="cal-big-icon">🔥</div>}
              {state === 'partial' && <div className="cal-big-icon partial">💪</div>}
              {partialLabel && <div className="cal-partial-label">{partialLabel}</div>}
              {multiCount && <div className="cal-multi-badge">{multiCount}x</div>}
              {state === 'rest' && <div className="cal-rest-icon">·</div>}
              {state === 'missed' && <div className="cal-dot missed"></div>}
            </button>
          );
        })}
      </div>

      <div className="cal-week-stats">
        <div className="cal-week-title">Esta semana</div>
        <div className="cal-week-row">
          <div className="week-stat">
            <div className="week-stat-num">{weekStats.weekDone}/{weekStats.weekGymDays}</div>
            <div className="week-stat-label">constancia</div>
          </div>
          <div className="week-stat">
            <div className="week-stat-num">{weekStats.actividadPct}<span className="mini-unit">%</span></div>
            <div className="week-stat-label">actividad</div>
          </div>
          <div className="week-stat">
            <div className="week-stat-num">{weekStats.constanciaWeek}<span className="mini-unit">%</span></div>
            <div className="week-stat-label">completos</div>
          </div>
          <div className="week-stat">
            <div className="week-stat-num">{streak ?? window.GymStore.computeStreak()}</div>
            <div className="week-stat-label">racha 🔥</div>
          </div>
        </div>
      </div>

      <div className="cal-footer-stats">
        <div className="mini-stat">
          <div className="mini-num">{completedCount}</div>
          <div className="mini-label">días al gym</div>
        </div>
        <div className="mini-stat">
          <div className="mini-num">{constancy}<span className="mini-unit">%</span></div>
          <div className="mini-label">constancia mes</div>
        </div>
        <div className="mini-stat">
          <div className="mini-num">{partialCount}</div>
          <div className="mini-label">parciales</div>
        </div>
      </div>
    </div>
  );
};

window.CalendarScreen = CalendarScreen;
