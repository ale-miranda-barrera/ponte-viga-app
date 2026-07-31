// Módulo "Resumen del día": kcal quemadas + consumidas + net + registro rápido
// Se muestra en la pantalla Hoy encima del intro/activo (colapsable).

const QUICK_FOODS = [
  { name: 'Desayuno estándar', kcal: 450 },
  { name: 'Almuerzo estándar', kcal: 650 },
  { name: 'Cena estándar', kcal: 550 },
  { name: 'Snack', kcal: 200 },
  { name: 'Batido proteína', kcal: 250 },
  { name: 'Fruta', kcal: 90 },
];

// Wrapper para compatibilidad; delega al store (fuente única de verdad).
const calcDayBurnedKcal = (dateIso) => window.GymStore.calcDayBurnedKcal(dateIso);

const DailySummary = ({ dateIso, refreshKey }) => {
  const [open, setOpen] = React.useState(false);
  // Reactividad: re-render cuando cambian profile (incluye foodLog), sessions, o measures.
  window.useStoreTopic('profile', 'sessions', 'measures');

  const profile = window.GymStore.getProfile();
  const measures = window.GymStore.getMeasures();

  const latestPeso = (() => {
    const sorted = [...measures].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.find(m => m.peso != null)?.peso || null;
  })();

  // Meta calórica: TDEE con déficit/superávit según goal
  const tdee = (() => {
    if (!latestPeso || !profile.height || !profile.age) return null;
    const base = 10 * latestPeso + 6.25 * profile.height - 5 * profile.age;
    const bmr = profile.sex === 'm' ? base + 5 : base - 161;
    return Math.round(bmr * (profile.activity || 1.45));
  })();

  const kcalTarget = (() => {
    if (!tdee) return null;
    const delta = Math.max(0, Math.min(1500, Number(profile.deficitKcal) || 500));
    if (profile.goal === 'deficit') return Math.max(1000, tdee - delta);
    if (profile.goal === 'surplus') return tdee + delta;
    return tdee;
  })();

  const burned = Number.isFinite(calcDayBurnedKcal(dateIso)) ? calcDayBurnedKcal(dateIso) : 0;
  const foodLog = window.GymStore.getFoodLog(dateIso);
  const consumed = foodLog.reduce((s, e) => {
    const k = Number(e.kcal);
    return s + (Number.isFinite(k) && k > 0 ? k : 0);
  }, 0);

  const net = consumed - burned;
  const remaining = kcalTarget != null ? kcalTarget - net : null;
  const progressPct = kcalTarget != null && kcalTarget > 0
    ? Math.min(100, Math.max(0, Math.round((consumed / kcalTarget) * 100)))
    : null;

  const addFood = (entry) => {
    const item = window.GymStore.addFoodEntry(dateIso, entry);
    if (item && window.showToast) window.showToast({ text: `+${item.kcal} kcal · ${item.name}`, kind: 'info', duration: 1800 });
    window.hapticTap && window.hapticTap(10);
  };

  const removeFood = (id) => {
    const item = foodLog.find(e => e.id === id);
    window.GymStore.removeFoodEntry(dateIso, id);
    if (item && window.showToast) {
      window.showToast({
        text: `Quitaste "${item.name}"`,
        actionLabel: 'Deshacer',
        action: () => window.GymStore.restoreFoodEntry(dateIso, item),
        kind: 'info',
        duration: 4000,
      });
    }
  };

  return (
    <div className={`daily-summary ${open ? 'is-open' : ''}`}>
      <button type="button" className="daily-summary-head" onClick={() => setOpen(o => !o)}>
        <div className="ds-head-block">
          <div className="ds-head-num">{burned}</div>
          <div className="ds-head-lbl">🔥 quemadas</div>
        </div>
        <div className="ds-head-block">
          <div className="ds-head-num">{consumed || '—'}</div>
          <div className="ds-head-lbl">🍽 consumidas</div>
        </div>
        <div className="ds-head-block">
          <div className={`ds-head-num ${net > 0 ? 'ds-warn' : 'ds-good'}`}>{net > 0 ? '+' : ''}{net}</div>
          <div className="ds-head-lbl">balance</div>
        </div>
        <div className="ds-arrow">{open ? '∧' : '∨'}</div>
      </button>

      {open && (
        <div className="daily-summary-body">
          {kcalTarget != null && (
            <div className="ds-target">
              <div className="ds-target-row">
                <span>
                  Meta {profile.goal === 'deficit' ? `(−${profile.deficitKcal || 500})` :
                        profile.goal === 'surplus' ? `(+${profile.deficitKcal || 500})` :
                        '(mantener)'}
                </span>
                <strong>{kcalTarget} kcal</strong>
              </div>
              {progressPct != null && (
                <div className="ds-progress-track">
                  <div
                    className={`ds-progress-fill ${consumed > kcalTarget ? 'over' : ''}`}
                    style={{ width: progressPct + '%' }}
                  />
                </div>
              )}
              <div className="ds-target-row small">
                <span>{consumed > kcalTarget ? 'Excedido' : 'Restante'}</span>
                <strong>{Math.abs(remaining || 0)} kcal</strong>
              </div>
            </div>
          )}

          {kcalTarget == null && (
            <div className="ds-hint">
              Agrega tu peso en <em>Medidas</em> para ver tu meta calórica.
            </div>
          )}

          <div className="ds-section-title">Registro rápido</div>
          <div className="ds-quick-row">
            {QUICK_FOODS.map(f => (
              <button
                key={f.name}
                className="ds-quick-btn"
                onClick={() => addFood({ name: f.name, kcal: f.kcal })}
              >
                <div className="ds-quick-name">{f.name}</div>
                <div className="ds-quick-kcal">+{f.kcal}</div>
              </button>
            ))}
          </div>

          <DailyCustomFood onAdd={addFood} />

          {foodLog.length > 0 && (
            <>
              <div className="ds-section-title">Hoy comiste</div>
              <div className="ds-food-list">
                {foodLog.map(e => (
                  <div key={e.id} className="ds-food-row">
                    <div className="ds-food-name">{e.name}</div>
                    <div className="ds-food-kcal">{e.kcal} kcal</div>
                    <button type="button" className="ds-food-rm" onClick={() => removeFood(e.id)}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const DailyCustomFood = ({ onAdd }) => {
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const submit = () => {
    const k = parseInt(kcal, 10);
    if (!name.trim() || !k || k <= 0) return;
    onAdd({ name: name.trim(), kcal: k });
    setName('');
    setKcal('');
  };
  return (
    <div className="ds-custom-form">
      <input
        className="ds-custom-input"
        placeholder="Comida (ej: pollo con arroz)"
        value={name}
        onFocus={e => e.target.select()}
        onChange={e => setName(e.target.value)}
      />
      <input
        className="ds-custom-input ds-custom-kcal"
        type="text"
        inputMode="numeric"
        placeholder="kcal"
        value={kcal}
        onFocus={e => e.target.select()}
        onChange={e => setKcal(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <button type="button" className="ds-custom-add" onClick={submit} disabled={!name.trim() || !kcal}>+</button>
    </div>
  );
};

window.DailySummary = DailySummary;
window.calcDayBurnedKcal = calcDayBurnedKcal;
