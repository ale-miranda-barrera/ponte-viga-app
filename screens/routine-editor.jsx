// Editor de rutina del día
let _idCtr = Date.now();

// Input numérico con select-all en focus y parse en blur (pattern del peso editable)
// Evita el bug de iOS donde type="number" no hace select-all correctamente.
const NumInput = ({ value, min = 0, step = 1, onChange, className }) => {
  const [str, setStr] = React.useState(() => String(value));
  React.useEffect(() => { setStr(String(value)); }, [value]);
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={str}
      onFocus={e => e.target.select()}
      onChange={e => setStr(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={() => {
        const v = parseFloat(str);
        const result = (!isNaN(v) && v >= min) ? (step < 1 ? Math.round(v * 10) / 10 : Math.round(v)) : value;
        onChange(result);
        setStr(String(result));
      }}
    />
  );
};

const RoutineEditor = ({ dow, routine, onClose, onSave, onReset }) => {
  const [draft, setDraft] = React.useState(() => ({
    ...routine,
    muscles: [...(routine.muscles || [])],
    exercises: (routine.exercises || []).map(e => ({ ...e })),
    activities: (routine.activities || []).map(a => ({ ...a })),
  }));
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);
  // null = cerrado, 'pool' = picker de pool, 'new' = crear nuevo inline
  const [addExMode, setAddExMode] = React.useState(null);
  const [muscleInput, setMuscleInput] = React.useState('');

  const addMuscle = () => {
    const m = muscleInput.trim();
    if (!m) return;
    setDraft(d => (d.muscles || []).includes(m) ? d : { ...d, muscles: [...(d.muscles || []), m] });
    setMuscleInput('');
  };
  const removeMuscle = (m) => setDraft(d => ({ ...d, muscles: (d.muscles || []).filter(x => x !== m) }));
  const removeCardio = () => setDraft(d => ({ ...d, cardio: null }));

  const updateEx = (idx, patch) => {
    setDraft(d => ({
      ...d,
      exercises: d.exercises.map((e, i) => i === idx ? { ...e, ...patch } : e),
    }));
  };
  const removeEx = (idx) => setDraft(d => ({ ...d, exercises: d.exercises.filter((_, i) => i !== idx) }));
  const moveEx = (idx, dir) => setDraft(d => {
    const next = [...d.exercises];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return d;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...d, exercises: next };
  });
  const addExBlank = () => {
    setDraft(d => ({
      ...d,
      exercises: [...d.exercises, {
        id: 'ex_' + (++_idCtr),
        name: 'Nuevo ejercicio',
        sub: '',
        sets: 3, reps: 10, weight: 0, unit: 'lb',
        tag: 'fire',
        target: '3×10',
      }],
    }));
    setAddExMode(null);
  };

  const addExFromPool = (ex) => {
    // Deep copy con nuevo id para no compartir referencia con otro perfil
    setDraft(d => ({
      ...d,
      exercises: [...d.exercises, {
        ...ex,
        id: 'ex_' + (++_idCtr),
        _source: undefined,
        sourceProfile: undefined,
      }],
    }));
    setAddExMode(null);
  };

  const addActivity = (activity) => {
    setDraft(d => ({
      ...d,
      activities: [...(d.activities || []), {
        ...activity,
        id: activity.id + '_' + Date.now(),
        defaultVal: activity.defaultVal || 20,
      }],
    }));
  };

  const updateAct = (idx, patch) => {
    setDraft(d => ({
      ...d,
      activities: d.activities.map((a, i) => i === idx ? { ...a, ...patch } : a),
    }));
  };

  const removeAct = (idx) => setDraft(d => ({ ...d, activities: d.activities.filter((_, i) => i !== idx) }));

  const save = () => {
    onSave({
      ...draft,
      muscles: draft.muscles || [],
      exercises: draft.exercises.map(e => ({
        ...e,
        target: `${e.sets}×${e.reps} @ ${e.weight > 0 ? e.weight + ' ' + e.unit : 'Peso corporal'}`,
      })),
      activities: draft.activities || [],
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet editor-sheet" onClick={e=>e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle"></div>
        <div className="editor-head">
          <div>
            <div className="detail-tag">EDITAR · {window.DAY_LONG[dow]}</div>
            <input
              className="editor-title-input"
              value={draft.title}
              onFocus={e => e.target.select()}
              onChange={e=>setDraft({...draft, title: e.target.value})}
            />
            <input
              className="editor-sub-input"
              value={draft.subtitle || ''}
              placeholder="Subtítulo"
              onFocus={e => e.target.select()}
              onChange={e=>setDraft({...draft, subtitle: e.target.value})}
            />
          </div>
        </div>

        <div className="detail-section-title">Músculos ({(draft.muscles || []).length})</div>
        <div className="editor-muscles-row">
          {(draft.muscles || []).map(m => (
            <span key={m} className="muscle-chip editor-muscle-chip">
              {m}
              <button type="button" className="muscle-chip-rm" onClick={() => removeMuscle(m)}>×</button>
            </span>
          ))}
        </div>
        <div className="editor-muscle-add">
          <input
            className="editor-ex-name"
            placeholder="Agregar músculo (ej: Pecho, Tríceps)"
            value={muscleInput}
            onFocus={e => e.target.select()}
            onChange={e => setMuscleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMuscle())}
          />
          <button type="button" className="btn-secondary" onClick={addMuscle} disabled={!muscleInput.trim()}>+</button>
        </div>

        {draft.cardio && (
          <>
            <div className="detail-section-title" style={{marginTop: 20}}>Cardio</div>
            <div className="editor-row">
              <div className="editor-row-top">
                <span className="editor-act-icon">🏃</span>
                <span className="editor-act-name">{draft.cardio.name} · {draft.cardio.minutes} min</span>
                <button type="button" className="editor-rm" onClick={removeCardio}>✕</button>
              </div>
            </div>
          </>
        )}

        <div className="detail-section-title" style={{marginTop: 20}}>Ejercicios ({draft.exercises.length})</div>
        <div className="editor-list">
          {draft.exercises.map((ex, i) => (
            <ExerciseEditorRow
              key={ex.id}
              ex={ex}
              isFirst={i === 0}
              isLast={i === draft.exercises.length - 1}
              onUpdate={patch => updateEx(i, patch)}
              onRemove={() => removeEx(i)}
              onMove={dir => moveEx(i, dir)}
            />
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAddExMode('pick')}>+ Agregar ejercicio</button>

        <div className="detail-section-title" style={{marginTop: 20}}>Actividades físicas ({(draft.activities || []).length})</div>
        <div className="editor-list">
          {(draft.activities || []).map((act, i) => (
            <div key={act.id} className="editor-row editor-act-row">
              <div className="editor-row-top">
                <span className="editor-act-icon">{act.icon || '🏃'}</span>
                <span className="editor-act-name">{act.name}</span>
                <button type="button" className="editor-rm" onClick={() => removeAct(i)}>✕</button>
              </div>
              {/* Actividades de tipo bodyweight no tienen valor editable */}
              {act.type !== 'bodyweight' && (
                <div className="editor-act-vals">
                  <label>
                    <span>Valor por defecto</span>
                    <div className="editor-act-input-row">
                      <NumInput
                        value={act.defaultVal}
                        min={1}
                        onChange={v => updateAct(i, { defaultVal: v })}
                      />
                      <span className="editor-act-unit">{act.unit}</span>
                    </div>
                  </label>
                  <label>
                    <span>kcal/min</span>
                    <NumInput
                      value={act.kcalPerMin ?? (act.cal10 ? act.cal10 / 10 : 5)}
                      min={1}
                      onChange={v => updateAct(i, { kcalPerMin: v })}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={() => setShowActivityPicker(true)}>+ Agregar actividad</button>

        <div style={{height: 10}}></div>
        <button type="button" className="btn-primary" onClick={save}>Guardar rutina del {window.DAY_LONG[dow].toLowerCase()}</button>
        <button type="button" className="btn-link" onClick={()=>{
          window.GymStore.resetRoutineFor(dow);
          onReset();
          onClose();
        }}>Restablecer al original</button>

        {showActivityPicker && (
          <ActivityPickerModal
            onClose={() => setShowActivityPicker(false)}
            onSelect={(act) => { addActivity(act); setShowActivityPicker(false); }}
          />
        )}
        {addExMode && (
          <AddExercisePickerSheet
            currentExIds={new Set(draft.exercises.map(e => e.id))}
            onCreateNew={addExBlank}
            onSelectFromPool={addExFromPool}
            onClose={() => setAddExMode(null)}
          />
        )}
      </div>
    </div>
  );
};

// Sub-componente para editar un ejercicio. Usa NumInput para evitar bug iOS select-all.
const ExerciseEditorRow = React.memo(({ ex, isFirst, isLast, onUpdate, onRemove, onMove }) => {
  const isBodyweight = ex.weight === 0 && ex.unit === 'lb';
  const [bwToggle, setBwToggle] = React.useState(() => ex.weight === 0 && ex.unit === 'lb' && !ex._hasWeight);

  // Actualizar toggle si el peso se edita externamente
  React.useEffect(() => {
    setBwToggle(ex.weight === 0 && !ex._hasWeight);
  }, [ex.weight, ex._hasWeight]);

  const toggleBodyweight = () => {
    if (bwToggle) {
      // Desactivar peso corporal: poner peso 0 pero marcar que tiene peso
      onUpdate({ weight: 0, unit: 'lb', _hasWeight: true });
      setBwToggle(false);
    } else {
      // Activar peso corporal
      onUpdate({ weight: 0, unit: 'lb', _hasWeight: false });
      setBwToggle(true);
    }
  };

  return (
    <div className="editor-row">
      <div className="editor-row-top">
        <input
          className="editor-ex-name"
          value={ex.name}
          onFocus={e => e.target.select()}
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <button type="button" className="editor-rm" onClick={onRemove}>✕</button>
      </div>
      <input
        className="editor-ex-sub"
        placeholder="Descripción (opcional)"
        value={ex.sub || ''}
        onFocus={e => e.target.select()}
        onChange={e => onUpdate({ sub: e.target.value })}
      />
      <div className="editor-nums">
        <label>
          <span>Sets</span>
          <NumInput value={ex.sets} min={1} onChange={v => onUpdate({ sets: v })} />
        </label>
        <label>
          <span>Reps</span>
          <NumInput value={ex.reps} min={1} onChange={v => onUpdate({ reps: v })} />
        </label>
        <label>
          <span>Peso</span>
          {bwToggle
            ? <div className="editor-bw-badge">Corporal</div>
            : <NumInput value={ex.weight} min={0} step={0.5} onChange={v => onUpdate({ weight: v, _hasWeight: v > 0 })} />
          }
        </label>
        <label>
          <span>Unid</span>
          <select value={ex.unit} onChange={e => onUpdate({ unit: e.target.value })}>
            <option value="lb">lb</option>
            <option value="kg">kg</option>
            <option value="s">s</option>
          </select>
        </label>
      </div>
      {/* Toggle peso corporal */}
      <button type="button" className={`editor-bw-toggle ${bwToggle ? 'on' : ''}`} onClick={toggleBodyweight}>
        {bwToggle ? '💪 Peso corporal activado' : 'Usar peso corporal'}
      </button>
      <div className="editor-move">
        <button onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
        <button onClick={() => onMove(1)} disabled={isLast}>↓</button>
      </div>
    </div>
  );
});

// Modal para elegir actividad del catálogo
const ActivityPickerModal = ({ onClose, onSelect }) => {
  const [customMode, setCustomMode] = React.useState(false);
  const [customForm, setCustomForm] = React.useState({ name: '', icon: '🏃', type: 'time', unit: 'min', kcalPerMin: 5, defaultVal: 20 });
  const catalog = window.GymStore.getActivities();

  const saveCustom = () => {
    if (!customForm.name.trim()) return;
    const act = { ...customForm, id: 'custom_' + (++_idCtr), name: customForm.name.trim() };
    window.GymStore.saveCustomActivity(act);
    onSelect(act);
  };

  const handleTypeChange = (t) => {
    // bodyweight no tiene valor numérico
    if (t.key === 'bodyweight') {
      setCustomForm(f => ({ ...f, type: t.key, unit: t.unit, defaultVal: 0, kcalPerMin: 5 }));
    } else {
      setCustomForm(f => ({ ...f, type: t.key, unit: t.unit }));
    }
  };

  const actMetaLabel = (act) => {
    if (act.type === 'bodyweight') return 'Peso corporal';
    // Soporta tanto campo nuevo (kcalPerMin) como el viejo (cal10) para compatibilidad
    const kpm = act.kcalPerMin ?? (act.cal10 ? act.cal10 / 10 : null);
    return `${act.defaultVal} ${act.unit}${kpm ? ` · ~${kpm} kcal/min` : ''}`;
  };

  return (
    <div className="modal-backdrop-fixed" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle" />
        <div className="detail-head">
          <div className="detail-name">Agregar actividad</div>
          <div className="detail-sub">Elige del catálogo o crea una nueva</div>
        </div>

        {!customMode ? (
          <>
            <div className="activity-catalog">
              {catalog.map(act => (
                <button key={act.id} className="activity-catalog-item" onClick={() => onSelect(act)}>
                  <span className="act-cat-icon">{act.icon || '🏃'}</span>
                  <div className="act-cat-info">
                    <div className="act-cat-name">{act.name}</div>
                    <div className="act-cat-meta">{actMetaLabel(act)}</div>
                  </div>
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary" onClick={() => setCustomMode(true)}>+ Crear actividad nueva</button>
          </>
        ) : (
          <div className="editor-list">
            <div style={{paddingBottom: 10}}>
              <div className="picker-section-label">Nombre</div>
              <input
                className="picker-input"
                placeholder="Ej: Aeróbicos, Box, Patines..."
                value={customForm.name}
                onFocus={e => e.target.select()}
                onChange={e => setCustomForm(f => ({...f, name: e.target.value}))}
                autoFocus
              />
              <div className="picker-section-label" style={{marginTop: 12}}>Tipo de valor</div>
              <div className="act-type-row">
                {(window.ACTIVITY_VALUE_TYPES || []).map(t => (
                  <button key={t.key} className={`act-type-btn ${customForm.type === t.key ? 'on' : ''}`} onClick={() => handleTypeChange(t)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Solo mostrar inputs de valor si NO es peso corporal */}
              {customForm.type !== 'bodyweight' && (
                <div className="editor-nums" style={{marginTop: 12}}>
                  <label>
                    <span>Valor defecto</span>
                    <NumInput value={customForm.defaultVal} min={1} onChange={v => setCustomForm(f => ({...f, defaultVal: v}))} />
                  </label>
                  <label>
                    <span>kcal/min</span>
                    <NumInput value={customForm.kcalPerMin} min={1} onChange={v => setCustomForm(f => ({...f, kcalPerMin: v}))} />
                  </label>
                </div>
              )}
              <div className="picker-section-label" style={{marginTop: 8}}>Ícono</div>
              <div className="picker-emoji-row">
                {['🏃','💃','🏊','🚴','🧘','⚡','🛼','🥊','⛷️','🏄','🤸'].map(ic => (
                  <button key={ic} className={`picker-emoji-btn ${customForm.icon === ic ? 'on' : ''}`} onClick={() => setCustomForm(f=>({...f, icon: ic}))}>{ic}</button>
                ))}
              </div>
              <div className="picker-actions" style={{marginTop: 12}}>
                <button type="button" className="btn-primary" onClick={saveCustom} disabled={!customForm.name.trim()}>Crear y agregar</button>
                <button type="button" className="btn-link" onClick={() => setCustomMode(false)}>← Volver al catálogo</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Sheet para agregar ejercicio al editor: elige del pool global o crea uno nuevo
const AddExercisePickerSheet = ({ currentExIds, onCreateNew, onSelectFromPool, onClose }) => {
  const [tab, setTab] = React.useState('pool'); // 'pool' | 'new'
  const [search, setSearch] = React.useState('');

  const pool = React.useMemo(() =>
    window.GymStore.getGlobalExercisePool(currentExIds),
  [currentExIds]);

  const filtered = pool.filter(ex =>
    search === '' ||
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    (ex.sub || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-backdrop-fixed" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        <div className="modal-handle" />
        <div className="detail-head">
          <div className="detail-name">Agregar ejercicio</div>
        </div>

        {/* Tabs */}
        <div className="picker-tabs">
          <button className={`picker-tab ${tab === 'pool' ? 'on' : ''}`} onClick={() => setTab('pool')}>
            Pool de ejercicios
          </button>
          <button className={`picker-tab ${tab === 'new' ? 'on' : ''}`} onClick={() => setTab('new')}>
            Crear nuevo
          </button>
        </div>

        {tab === 'pool' ? (
          <>
            <input
              className="add-search-input"
              placeholder="Buscar ejercicio..."
              value={search}
              onFocus={e => e.target.select()}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="swap-list">
              {filtered.length === 0 && (
                <div className="empty">
                  {pool.length === 0
                    ? 'No hay ejercicios de otros perfiles disponibles.'
                    : 'Sin resultados para esa búsqueda.'}
                </div>
              )}
              {filtered.map((ex, i) => (
                <button key={ex.id + '_' + i} className="swap-option" onClick={() => onSelectFromPool(ex)}>
                  <div className="swap-option-info">
                    <div className="swap-option-title">{ex.name}</div>
                    <div className="swap-option-sub">
                      {ex.sub ? ex.sub + ' · ' : ''}
                      {ex.sets}×{ex.reps} · {ex.weight > 0 ? ex.weight + ' lb' : 'Peso corporal'}
                      {ex.sourceProfile ? <span className="pool-source"> de {ex.sourceProfile}</span> : null}
                    </div>
                  </div>
                  <div className="swap-arrow" style={{color:'var(--accent)', fontWeight:700}}>+</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{padding:'16px 0'}}>
            <div className="detail-sub">Se añadirá un ejercicio en blanco al final de la lista.</div>
            <button type="button" className="btn-primary" style={{marginTop:12}} onClick={onCreateNew}>
              Crear ejercicio en blanco
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

window.RoutineEditor = RoutineEditor;
window.ActivityPickerModal = ActivityPickerModal;
