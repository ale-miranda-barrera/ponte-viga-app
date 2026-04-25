// Vista semanal: muestra los 7 días con opción de editar cualquier día
const WeekScreen = ({ onEditDay }) => {
  const today = new Date();
  const todayDow = today.getDay();
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dom

  return (
    <div className="week-screen">
      <div className="week-eyebrow">Rutina Semanal</div>
      {WEEK_ORDER.map(dow => {
        const routine = window.GymStore.getRoutineFor(dow);
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
                <button className="icon-btn" onClick={() => onEditDay(dow)} title={`Editar ${window.DAY_LONG[dow]}`}>✎</button>
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
                      <span className="week-ex-spec">{ex.sets}×{ex.reps} · {ex.weight}{ex.unit !== 'lb' ? ex.unit : 'lb'}</span>
                    </div>
                  ))}
                  {routine.cardio && (
                    <div className="week-ex-row week-cardio-row">
                      <span className="week-ex-i">🏃</span>
                      <span className="week-ex-name">{routine.cardio.name}</span>
                      <span className="week-ex-spec">{routine.cardio.minutes} min</span>
                    </div>
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
    </div>
  );
};

window.WeekScreen = WeekScreen;
