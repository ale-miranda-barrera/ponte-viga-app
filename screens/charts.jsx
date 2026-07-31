// Gráficas SVG: peso corporal, kcal semanales, racha visual.
// Diseñadas para lucir bien en pantalla iPhone (viewBox fluido).

// Gráfica de peso corporal a lo largo del tiempo con banda saludable
const BodyWeightChart = ({ measures, heightCm, targetKg }) => {
  window.useStoreTopic('measures');
  // Si el caller pasó measures, usarlos; si no, leer del store
  const src = measures || window.GymStore.getMeasures();
  const points = [...src]
    .filter(m => m.peso != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => ({ date: m.date, weight: m.peso }));

  if (points.length < 1) {
    return (
      <div className="chart-empty">
        <div className="chart-empty-ic">⚖️</div>
        <div>Registra tu peso en Medidas para ver la evolución</div>
      </div>
    );
  }

  const W = 320, H = 140, PL = 26, PR = 8, PT = 12, PB = 22;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const weights = points.map(p => p.weight);
  const heightM = heightCm > 0 ? heightCm / 100 : 1.75;
  const healthyMin = 18.5 * heightM * heightM;
  const healthyMax = 25 * heightM * heightM;

  const scaleMin = Math.min(...weights, targetKg || Infinity, healthyMin - 3);
  const scaleMax = Math.max(...weights, targetKg || 0, healthyMax + 3);
  const range = (scaleMax - scaleMin) || 1;

  const cx = (i) => PL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  const cy = (w) => PT + (1 - (w - scaleMin) / range) * chartH;

  const pointStr = points.map((p, i) => `${cx(i).toFixed(1)},${cy(p.weight).toFixed(1)}`).join(' ');
  const areaStr = points.length > 1
    ? `${cx(0).toFixed(1)},${PT + chartH} ${pointStr} ${cx(points.length - 1).toFixed(1)},${PT + chartH}`
    : '';

  const healthyTop = cy(healthyMax);
  const healthyBot = cy(healthyMin);

  const yTicks = [scaleMin, (scaleMin + scaleMax) / 2, scaleMax].map(v => Math.round(v));
  const last = points[points.length - 1];
  const first = points[0];
  const delta = points.length >= 2 ? Math.round((last.weight - first.weight) * 10) / 10 : null;

  return (
    <div className="body-chart">
      <div className="body-chart-head">
        <div>
          <div className="body-chart-num">{last.weight}<span>kg</span></div>
          <div className="body-chart-sub">Peso actual</div>
        </div>
        {delta != null && (
          <div className={`body-chart-delta ${delta < 0 ? 'good' : delta > 0 ? 'warn' : ''}`}>
            {delta > 0 ? '+' : ''}{delta} kg
            <span>desde {first.date.slice(5)}</span>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="bw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Banda saludable */}
        <rect
          x={PL}
          y={healthyTop}
          width={chartW}
          height={healthyBot - healthyTop}
          fill="rgba(74,222,128,0.08)"
          stroke="rgba(74,222,128,0.2)"
          strokeDasharray="2,3"
        />
        {/* Y ticks */}
        {yTicks.map((v, i) => (
          <text key={i} x={PL - 4} y={cy(v) + 3} fontSize="9" fill="var(--text-3)" textAnchor="end">
            {v}
          </text>
        ))}
        {/* Target */}
        {targetKg && (
          <>
            <line x1={PL} y1={cy(targetKg)} x2={PL + chartW} y2={cy(targetKg)} stroke="var(--accent)" strokeDasharray="4,3" strokeWidth="1" />
            <text x={PL + chartW - 2} y={cy(targetKg) - 3} fontSize="9" fill="var(--accent)" textAnchor="end" fontWeight="700">
              Meta {targetKg}
            </text>
          </>
        )}
        {/* Área */}
        {points.length > 1 && <polygon points={areaStr} fill="url(#bw-grad)" />}
        {points.length > 1 && (
          <polyline
            points={pointStr}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={cx(i)} cy={cy(p.weight)} r="3" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
        ))}
        {/* X labels: first + last */}
        <text x={PL} y={H - 4} fontSize="9" fill="var(--text-3)" textAnchor="start">
          {first.date.slice(5)}
        </text>
        {points.length > 1 && (
          <text x={PL + chartW} y={H - 4} fontSize="9" fill="var(--text-3)" textAnchor="end">
            {last.date.slice(5)}
          </text>
        )}
      </svg>
      <div className="body-chart-legend">
        <span><span className="legend-dot legend-accent" />peso</span>
        <span><span className="legend-dot legend-good" />rango saludable</span>
        {targetKg && <span><span className="legend-line legend-accent" />meta</span>}
      </div>
    </div>
  );
};

// Gráfica de kcal quemadas por día (últimos 7-14 días)
const WeeklyKcalChart = ({ days = 14 }) => {
  window.useStoreTopic('sessions', 'profile');
  const bars = (() => {
    const today = new Date();
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = window.GymStore.iso(d);
      const kcal = window.GymStore.calcDayBurnedKcal(iso);
      const foodKcal = window.GymStore.getDayFoodKcal ? window.GymStore.getDayFoodKcal(iso) : 0;
      result.push({ iso, dow: d.getDay(), kcal, foodKcal, day: d.getDate() });
    }
    return result;
  })();

  const maxKcal = Math.max(300, ...bars.map(b => Math.max(b.kcal, b.foodKcal)));
  const totalBurned = bars.reduce((s, b) => s + b.kcal, 0);
  const totalConsumed = bars.reduce((s, b) => s + b.foodKcal, 0);

  return (
    <div className="wk-chart">
      <div className="wk-chart-head">
        <div>
          <div className="wk-chart-num">{totalBurned}</div>
          <div className="wk-chart-sub">🔥 {days}d quemadas</div>
        </div>
        {totalConsumed > 0 && (
          <div>
            <div className="wk-chart-num" style={{ color: 'var(--text-2)' }}>{totalConsumed}</div>
            <div className="wk-chart-sub">🍽 consumidas</div>
          </div>
        )}
      </div>
      <div className="wk-chart-bars">
        {bars.map((b, i) => {
          const bh = b.kcal > 0 ? Math.max(4, (b.kcal / maxKcal) * 100) : 0;
          const fh = b.foodKcal > 0 ? Math.max(4, (b.foodKcal / maxKcal) * 100) : 0;
          const dowLetter = window.DAY_LONG[b.dow][0];
          return (
            <div key={i} className="wk-bar-col">
              <div className="wk-bar-stack">
                {b.foodKcal > 0 && (
                  <div className="wk-bar wk-bar-food" style={{ height: fh + '%' }} title={`${b.foodKcal} kcal comidas`} />
                )}
                <div className="wk-bar wk-bar-burn" style={{ height: bh + '%' }} title={`${b.kcal} kcal quemadas`} />
              </div>
              <div className="wk-bar-lbl">{dowLetter}</div>
            </div>
          );
        })}
      </div>
      <div className="wk-chart-legend">
        <span><span className="legend-swatch legend-burn" />quemadas</span>
        <span><span className="legend-swatch legend-food" />consumidas</span>
      </div>
    </div>
  );
};

// Racha visual: bloques de los últimos 30 días con status por día
const StreakGrid = ({ days = 30 }) => {
  window.useStoreTopic('sessions', 'routine');
  const cells = (() => {
    const today = new Date();
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = window.GymStore.iso(d);
      const dow = d.getDay();
      const sessions = window.GymStore.getDaySessions(iso);
      const routine = window.GymStore.getRoutineFor(dow);
      const rest = !!routine?.rest;
      let state = 'none';
      if (sessions.length > 0) {
        state = sessions.every(s => s.completed) ? 'done' : 'partial';
      } else if (rest) {
        state = 'rest';
      } else {
        state = 'missed';
      }
      result.push({ iso, day: d.getDate(), state });
    }
    return result;
  })();

  const doneCount = cells.filter(c => c.state === 'done').length;
  const partialCount = cells.filter(c => c.state === 'partial').length;
  const activeRate = Math.round(((doneCount + partialCount) / days) * 100);

  return (
    <div className="streak-grid-card">
      <div className="streak-grid-head">
        <div>
          <div className="streak-grid-num">{activeRate}<span>%</span></div>
          <div className="streak-grid-sub">últimos {days} días activo</div>
        </div>
        <div className="streak-grid-stats">
          <span><strong>{doneCount}</strong> completos</span>
          <span><strong>{partialCount}</strong> parciales</span>
        </div>
      </div>
      <div className="streak-grid">
        {cells.map((c, i) => (
          <div key={i} className={`streak-cell streak-${c.state}`} title={c.iso}>{c.state === 'done' ? '🔥' : c.state === 'partial' ? '·' : ''}</div>
        ))}
      </div>
    </div>
  );
};

window.BodyWeightChart = BodyWeightChart;
window.WeeklyKcalChart = WeeklyKcalChart;
window.StreakGrid = StreakGrid;
