// Pantalla Calendario: mes actual, días marcados con estado
const CalendarScreen = ({ onPickDate, streak }) => {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const sessions = React.useMemo(() => window.GymStore.getAllSessions(), []);
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
  }, []);

  const monthSessions = Object.values(sessions).filter(s => s.date.startsWith(
    cursor.y + '-' + String(cursor.m+1).padStart(2,'0')
  ));
  const completedCount = monthSessions.filter(s => s.completed).length;
  const partialCount = monthSessions.filter(s => !s.completed).length;

  // Días de gym que ya pasaron este mes (excluye días de descanso y días futuros)
  const isCurrentMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const lastDayToCount = isCurrentMonth ? today.getDate() : daysInMonth;
  let gymDaysPassed = 0;
  for (let d = 1; d <= lastDayToCount; d++) {
    const dow = (startDow + d - 1) % 7;
    if (!routineMap[dow]?.rest) gymDaysPassed++;
  }
  const constancy = Math.round((completedCount / Math.max(1, gymDaysPassed)) * 100);

  return (
    <div className="cal-screen">
      <div className="cal-header">
        <button className="cal-nav" onClick={() => setCursor(c => {
          const m = c.m-1;
          return m < 0 ? { y: c.y-1, m: 11 } : { y: c.y, m };
        })}>‹</button>
        <div className="cal-title">
          <div className="cal-month">{window.MONTH_LONG[cursor.m]}</div>
          <div className="cal-year">{cursor.y}</div>
        </div>
        <button className="cal-nav" onClick={() => setCursor(c => {
          const m = c.m+1;
          return m > 11 ? { y: c.y+1, m: 0 } : { y: c.y, m };
        })}>›</button>
      </div>

      <div className="cal-stats">
        <div className="cal-stat"><span className="cal-stat-dot completed"></span>{completedCount} completos</div>
        <div className="cal-stat"><span className="cal-stat-dot partial"></span>{partialCount} parciales</div>
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
          const s = sessions[iso];
          const isRestDay = routineMap[dow]?.rest;
          let state = 'none';
          if (s?.completed) state = 'completed';
          else if (s) state = 'partial';
          else if (isRestDay) state = 'rest';
          else if (!isFuture) state = 'missed';

          return (
            <button key={i} className={`cal-cell state-${state} ${isToday ? 'is-today' : ''} ${isFuture?'is-future':''}`}
              onClick={() => s && onPickDate(iso)}>
              <div className="cal-day-num">{d}</div>
              {state === 'completed' && <div className="cal-dot completed"></div>}
              {state === 'partial' && <div className="cal-dot partial"></div>}
              {state === 'rest' && <div className="cal-dot rest"></div>}
              {state === 'missed' && <div className="cal-dot missed"></div>}
            </button>
          );
        })}
      </div>

      <div className="cal-footer-stats">
        <div className="mini-stat">
          <div className="mini-num">{completedCount}</div>
          <div className="mini-label">días al gym</div>
        </div>
        <div className="mini-stat">
          <div className="mini-num">{constancy}<span className="mini-unit">%</span></div>
          <div className="mini-label">constancia</div>
        </div>
        <div className="mini-stat">
          <div className="mini-num">{streak ?? window.GymStore.computeStreak()}</div>
          <div className="mini-label">racha 🔥</div>
        </div>
      </div>
    </div>
  );
};

window.CalendarScreen = CalendarScreen;
