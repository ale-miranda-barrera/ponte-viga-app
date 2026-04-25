// Medidas corporales + perfil + IMC + calorías
const MeasuresScreen = () => {
  const [measures, setMeasures] = React.useState(() => window.GymStore.getMeasures());
  const [profile, setProfile] = React.useState(() => window.GymStore.getProfile());
  const [form, setForm] = React.useState({ barriga: '', brazo: '', peso: '' });
  const [editProfile, setEditProfile] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const saveProfile = (patch) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      window.GymStore.saveProfile(next);
      return next;
    });
  };

  const add = () => {
    const hasPeso = form.peso && !isNaN(parseFloat(form.peso));
    const hasBarriga = form.barriga && !isNaN(parseFloat(form.barriga));
    const hasBrazo = form.brazo && !isNaN(parseFloat(form.brazo));
    if (!hasPeso && !hasBarriga && !hasBrazo) return;
    const m = {
      date: window.GymStore.iso(new Date()),
      peso: hasPeso ? parseFloat(form.peso) : null,
      barriga: hasBarriga ? parseFloat(form.barriga) : null,
      brazo: hasBrazo ? parseFloat(form.brazo) : null,
    };
    window.GymStore.saveMeasure(m);
    setMeasures(window.GymStore.getMeasures());
    setForm({ barriga: '', brazo: '', peso: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const sorted = React.useMemo(
    () => [...measures].sort((a, b) => b.date.localeCompare(a.date)),
    [measures]
  );
  const latest = sorted[0];
  const first = sorted[sorted.length-1];
  const delta = (key) => {
    if (!latest || !first || latest === first || latest[key] == null || first[key] == null) return null;
    return latest[key] - first[key];
  };

  // Última medida con peso
  const latestWithPeso = sorted.find(m => m.peso != null);
  const firstWithPeso = sorted.findLast(m => m.peso != null);
  const pesoActual = latestWithPeso?.peso;
  const pesoDelta = (latestWithPeso && firstWithPeso && latestWithPeso !== firstWithPeso) ? (latestWithPeso.peso - firstWithPeso.peso) : null;

  // IMC
  const heightM = profile.height / 100;
  const bmi = (pesoActual && profile.height > 0) ? pesoActual / (heightM * heightM) : null;
  const bmiCat = bmiCategory(bmi);

  // BMR Mifflin-St Jeor (requiere altura y edad válidas)
  const bmr = (pesoActual && profile.height > 0 && profile.age > 0)
    ? Math.round(mifflin(pesoActual, profile.height, profile.age, profile.sex))
    : null;
  const tdee = bmr ? Math.round(bmr * profile.activity) : null;
  const deficit = tdee ? tdee - 500 : null;
  const surplus = tdee ? tdee + 500 : null;

  return (
    <div className="meas-screen">
      {/* Perfil */}
      <div className="profile-card" onClick={() => setEditProfile(v => !v)}>
        <div className="profile-row">
          <div className="profile-item"><div className="profile-label">Altura</div><div className="profile-val">{profile.height}<span>cm</span></div></div>
          <div className="profile-item"><div className="profile-label">Edad</div><div className="profile-val">{profile.age}<span>años</span></div></div>
          <div className="profile-item"><div className="profile-label">Sexo</div><div className="profile-val">{profile.sex === 'm' ? '♂' : '♀'}</div></div>
          <div className="profile-edit">{editProfile ? '✕' : '✎'}</div>
        </div>
        {editProfile && (
          <div className="profile-editor" onClick={e=>e.stopPropagation()}>
            <label><span>Altura (cm)</span><input inputMode="decimal" value={profile.height} onChange={e=>saveProfile({ height: parseFloat(e.target.value)||0 })}/></label>
            <label><span>Edad</span><input inputMode="numeric" value={profile.age} onChange={e=>saveProfile({ age: parseInt(e.target.value)||0 })}/></label>
            <div className="profile-editor-row">
              <label className="seg"><span>Sexo</span>
                <div className="seg-ctrl">
                  <button className={profile.sex==='m'?'on':''} onClick={()=>saveProfile({sex:'m'})}>♂ Hombre</button>
                  <button className={profile.sex==='f'?'on':''} onClick={()=>saveProfile({sex:'f'})}>♀ Mujer</button>
                </div>
              </label>
            </div>
            <label className="seg"><span>Actividad</span>
              <div className="seg-ctrl seg-sm">
                {[
                  {v:1.2,  l:'Sedentario'},
                  {v:1.35, l:'Ligero'},
                  {v:1.45, l:'Moderado'},
                  {v:1.60, l:'Intenso'},
                ].map(a => <button key={a.v} className={Math.abs(profile.activity-a.v)<0.01?'on':''} onClick={()=>saveProfile({activity:a.v})}>{a.l}</button>)}
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Métricas principales */}
      <div className="meas-cards">
        <div className="meas-card">
          <div className="meas-label">Peso</div>
          <div className="meas-num">{pesoActual ?? '—'}<span className="meas-unit">kg</span></div>
          {pesoDelta != null && (
            <div className={`meas-delta ${pesoDelta < 0 ? 'good' : pesoDelta > 0 ? 'warn' : ''}`}>
              {pesoDelta > 0 ? '+' : ''}{pesoDelta.toFixed(1)} kg
            </div>
          )}
  </div>
        <div className="meas-card">
          <div className="meas-label">IMC</div>
          <div className="meas-num">{bmi ? bmi.toFixed(1) : '—'}</div>
          {bmiCat && <div className={`imc-badge imc-${bmiCat.key}`}>{bmiCat.label}</div>}
        </div>
      </div>

      {/* Rango de peso saludable */}
      {pesoActual && <WeightRangeBar peso={pesoActual} heightCm={profile.height} />}

      {/* Barra IMC */}
      {bmi && <BmiBar bmi={bmi} />}

      {/* Calorías */}
      {tdee && (
        <div className="cal-card">
          <div className="cal-head">
            <div className="cal-head-title">Calorías diarias</div>
            <div className="cal-head-sub">Mifflin-St Jeor × actividad</div>
          </div>
          <div className="cal-main">
            <div className="cal-main-num">{tdee}</div>
            <div className="cal-main-unit">kcal · mantener</div>
          </div>
          <div className="cal-sub">
            <div className="cal-bmr">BMR <strong>{bmr}</strong> kcal · solo existir</div>
          </div>
          <div className="cal-goals">
            <div className="cal-goal deficit">
              <div className="cal-goal-label">Déficit <span>−500</span></div>
              <div className="cal-goal-num">{deficit}<span>kcal</span></div>
            </div>
            <div className="cal-goal surplus">
              <div className="cal-goal-label">Superávit <span>+500</span></div>
              <div className="cal-goal-num">{surplus}<span>kcal</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Medidas secundarias */}
      <div className="meas-cards">
        <div className="meas-card sm">
          <div className="meas-label">Barriga</div>
          <div className="meas-num sm">{latest?.barriga ?? '—'}<span className="meas-unit">cm</span></div>
          {delta('barriga') != null && (
            <div className={`meas-delta ${delta('barriga') < 0 ? 'good' : delta('barriga') > 0 ? 'warn' : ''}`}>
              {delta('barriga') > 0 ? '+' : ''}{delta('barriga').toFixed(1)} cm
            </div>
          )}
        </div>
        <div className="meas-card sm">
          <div className="meas-label">Brazo</div>
          <div className="meas-num sm">{latest?.brazo ?? '—'}<span className="meas-unit">cm</span></div>
          {delta('brazo') != null && (
            <div className={`meas-delta ${delta('brazo') > 0 ? 'good' : delta('brazo') < 0 ? 'warn' : ''}`}>
              {delta('brazo') > 0 ? '+' : ''}{delta('brazo').toFixed(1)} cm
            </div>
          )}
        </div>
      </div>

      {/* Form nueva medición */}
      <div className="meas-form">
        <div className="meas-form-title">Nueva medición · hoy</div>
        <div className="meas-form-row tri">
          <label>
            <span>Peso (kg)</span>
            <input inputMode="decimal" value={form.peso} onChange={e=>setForm({...form, peso:e.target.value})} placeholder="85" />
          </label>
          <label>
            <span>Barriga (cm)</span>
            <input inputMode="decimal" value={form.barriga} onChange={e=>setForm({...form, barriga:e.target.value})} placeholder="103" />
          </label>
          <label>
            <span>Brazo (cm)</span>
            <input inputMode="decimal" value={form.brazo} onChange={e=>setForm({...form, brazo:e.target.value})} placeholder="38" />
          </label>
        </div>
        <button className={`btn-primary sm ${saved ? 'btn-saved' : ''}`} onClick={add}>
          {saved ? '¡Guardado! ✓' : 'Guardar medición'}
        </button>
      </div>

      {/* Historial */}
      <div className="meas-hist">
        <div className="meas-hist-title">Historial</div>
        {sorted.map((m,i) => (
          <div key={i} className="meas-hist-row">
            <div className="meas-hist-date">{m.date}</div>
            <div className="meas-hist-vals">
              {m.peso != null && <span>P <strong>{m.peso}</strong>kg</span>}
              {m.barriga != null && <span>B <strong>{m.barriga}</strong>cm</span>}
              {m.brazo != null && <span>Br <strong>{m.brazo}</strong>cm</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function mifflin(kg, cm, age, sex) {
  const base = 10*kg + 6.25*cm - 5*age;
  return sex === 'm' ? base + 5 : base - 161;
}

// Rango saludable por altura usando IMC 18.5–25
function healthyRangeKg(heightCm) {
  const m = heightCm / 100;
  return { min: +(18.5 * m * m).toFixed(1), max: +(25 * m * m).toFixed(1) };
}

const WeightRangeBar = ({ peso, heightCm }) => {
  const { min, max } = healthyRangeKg(heightCm);
  // Ventanas amarillas de 5 kg a cada lado del rango sano
  const lo = min - 5;
  const hi = max + 5;
  // escala visible 10 kg antes de lo y 10 kg después de hi
  const scaleMin = Math.floor(lo - 10);
  const scaleMax = Math.ceil(hi + 10);
  const pct = (v) => Math.max(0, Math.min(100, ((v - scaleMin) / (scaleMax - scaleMin)) * 100));
  const pesoPct = pct(peso);

  // clasificación semafórica
  let cls, label;
  if (peso < lo)       { cls = 'danger'; label = 'Muy flaco'; }
  else if (peso < min) { cls = 'warn';   label = 'Bajo peso'; }
  else if (peso <= max){ cls = 'good';   label = 'Saludable'; }
  else if (peso <= hi) { cls = 'warn';   label = 'Sobrepeso leve'; }
  else                 { cls = 'danger'; label = 'Sobrepeso'; }

  return (
    <div className="wrange">
      <div className="wrange-head">
        <div className="wrange-title">Rango saludable</div>
        <div className={`wrange-badge wrange-${cls}`}>{label}</div>
      </div>
      <div className="wrange-sub">
        Para tu altura <strong>{heightCm} cm</strong>, lo normal es
        entre <strong>{min} kg</strong> y <strong>{max} kg</strong>.
      </div>
      <div className="wrange-bar">
        <div className="wrange-seg wrange-seg-danger" style={{left: pct(scaleMin)+'%', width: (pct(lo)-pct(scaleMin))+'%'}} />
        <div className="wrange-seg wrange-seg-warn"   style={{left: pct(lo)+'%',       width: (pct(min)-pct(lo))+'%'}} />
        <div className="wrange-seg wrange-seg-good"   style={{left: pct(min)+'%',      width: (pct(max)-pct(min))+'%'}} />
        <div className="wrange-seg wrange-seg-warn"   style={{left: pct(max)+'%',      width: (pct(hi)-pct(max))+'%'}} />
        <div className="wrange-seg wrange-seg-danger" style={{left: pct(hi)+'%',       width: (pct(scaleMax)-pct(hi))+'%'}} />
        <div className="wrange-marker" style={{left: pesoPct+'%'}}>
          <div className="wrange-marker-num">{peso} kg</div>
          <div className="wrange-marker-pin"></div>
        </div>
      </div>
      <div className="wrange-ticks">
        <span>{scaleMin}</span>
        <span className="tick-key" style={{left: pct(min)+'%'}}>{min}</span>
        <span className="tick-key" style={{left: pct(max)+'%'}}>{max}</span>
        <span>{scaleMax}</span>
      </div>
    </div>
  );
};

function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { key: 'under', label: 'Bajo peso' };
  if (bmi < 25)   return { key: 'normal', label: 'Normal' };
  if (bmi < 30)   return { key: 'over', label: 'Sobrepeso' };
  if (bmi < 35)   return { key: 'ob1', label: 'Obesidad I' };
  if (bmi < 40)   return { key: 'ob2', label: 'Obesidad II' };
  return { key: 'ob3', label: 'Obesidad III' };
}

const BmiBar = ({ bmi }) => {
  // rangos visibles de 15 a 40
  const min = 15, max = 40;
  const pct = Math.max(0, Math.min(100, ((bmi - min) / (max - min)) * 100));
  const stops = [
    { to: 18.5, cls: 'under' },
    { to: 25,   cls: 'normal' },
    { to: 30,   cls: 'over' },
    { to: 35,   cls: 'ob1' },
    { to: 40,   cls: 'ob2' },
  ];
  return (
    <div className="bmi-bar-wrap">
      <div className="bmi-bar">
        {stops.map((s, i) => {
          const prev = i === 0 ? min : stops[i-1].to;
          const w = ((s.to - prev) / (max - min)) * 100;
          return <div key={i} className={`bmi-seg bmi-${s.cls}`} style={{width: w + '%'}}/>;
        })}
        <div className="bmi-marker" style={{left: pct + '%'}}>
          <div className="bmi-marker-num">{bmi.toFixed(1)}</div>
          <div className="bmi-marker-pin"></div>
        </div>
      </div>
      <div className="bmi-ticks">
        <span>18.5</span><span>25</span><span>30</span><span>35</span>
      </div>
    </div>
  );
};

window.MeasuresScreen = MeasuresScreen;
