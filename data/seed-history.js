// Datos de ejemplo para ver progreso inmediato al abrir la app
// Se cargan en localStorage en el primer arranque si no hay datos
window.SEED_HISTORY = (() => {
  const today = new Date();
  const dayMs = 86400000;
  const iso = (d) => {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
  };

  const sessions = {};
  // Últimas 3 semanas de datos sintéticos en días entre semana pasados
  const routine = window.WEEK_ROUTINE;
  for (let back = 1; back <= 21; back++) {
    const d = new Date(today.getTime() - back*dayMs);
    const dow = d.getDay();
    if (dow === 0) continue; // domingo descanso
    const day = routine[dow];
    if (!day || day.rest) continue;
    // ~85% asistencia
    if (Math.random() > 0.85) continue;
    const mood = ['strong','normal','normal','strong','normal','sick'][Math.floor(Math.random()*6)];
    const exs = day.exercises.map(ex => {
      // pequeño drift en peso para ver tendencias
      const drift = (Math.random()*0.12 - 0.04);
      const w = Math.max(0, Math.round(ex.weight * (1 + drift) / 2.5) * 2.5);
      const completedSets = Math.random() > 0.15 ? ex.sets : Math.max(1, ex.sets-1);
      return {
        id: ex.id,
        weight: w,
        sets: completedSets,
        targetSets: ex.sets,
        reps: ex.reps,
        done: completedSets === ex.sets,
      };
    });
    sessions[iso(d)] = {
      date: iso(d),
      dow,
      title: day.title,
      mood,
      exercises: exs,
      cardioDone: Math.random() > 0.3,
      completed: exs.every(e => e.done),
    };
  }
  return sessions;
})();
