// Editor de rutina del día
let _idCtr = Date.now();
const RoutineEditor = ({ dow, routine, onClose, onSave, onReset }) => {
  const [draft, setDraft] = React.useState(() => ({
    ...routine,
    exercises: (routine.exercises || []).map(e => ({ ...e })),
    activities: (routine.activities || []).map(a => ({ ...a })),
  }));
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);

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
  const addEx = () => {
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
      exercises: draft.exercises.map(e => ({
        ...e,
        target: `${e.sets}×${e.reps} @ ${e.weight} ${e.unit}`,
      })),
      activities: draft.activities || [],
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet editor-sheet" onClick={e=>e.stopPropagation()}>
        <div className="modal-handle"></div>
        <div className="editor-head">
          <div>
            <div className="detail-tag">EDITAR · {window.DAY_LONG[dow]}</div>
            <input className="editor-title-input" value={draft.title} onChange={e=>setDraft({...draft, title: e.target.value})} />
            <input className="editor-sub-input" value={draft.subtitle || ''} placeholder="Subtítulo" onChange={e=>setDraft({...draft, subtitle: e.target.value})} />
          </div>
        </div>

        <div className="detail-section-title">Ejercicios ({draft.exercises.length})</div>
        <div className="editor-list">
          {draft.exercises.map((ex, i) => (
            <div key={ex.id} className="editor-row">
              <div className="editor-row-top">
                <input className="editor-ex-name" value={ex.name} onChange={e=>updateEx(i, {name: e.target.value})} />
                <button type="button" className="editor-rm" onClick={()=>removeEx(i)}>✕</button>
              </div>
              <input className="editor-ex-sub" placeholder="Descripción (opcional)" value={ex.sub||''} onChange={e=>updateEx(i,{sub: e.target.value})} />
              <div className="editor-nums">
                <label><span>Sets</span><input type="number" value={ex.sets} min="1" onFocus={e=>e.target.select()} onChange={e=>updateEx(i,{sets: parseInt(e.target.value)||1})}/></label>
                <label><span>Reps</span><input type="number" value={ex.reps} min="1" onFocus={e=>e.target.select()} onChange={e=>updateEx(i,{reps: parseInt(e.target.value)||1})}/></label>
                <label><span>Peso</span><input type="number" value={ex.weight} step="2.5" min="0" onFocus={e=>e.target.select()} onChange={e=>updateEx(i,{weight: Math.max(0, parseFloat(e.target.value)||0)})}/></label>
                <label><span>Unid</span>
                  <select value={ex.unit} onChange={e=>updateEx(i,{unit: e.target.value})}>
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                    <option value="s">s</option>
                  </select>
                </label>
              </div>
              <div className="editor-move">
                <button onClick={()=>moveEx(i,-1)} disabled={i===0}>↑</button>
                <button onClick={()=>moveEx(i,1)} disabled={i===draft.exercises.length-1}>↓</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={addEx}>+ Agregar ejercicio</button>

        <div className="detail-section-title" style={{marginTop: 20}}>Actividades físicas ({(draft.activities || []).length})</div>
        <div className="editor-list">
          {(draft.activities || []).map((act, i) => (
            <div key={act.id} className="editor-row editor-act-row">
              <div className="editor-row-top">
                <span className="editor-act-icon">{act.icon || '🏃'}</span>
                <span className="editor-act-name">{act.name}</span>
                <button type="button" className="editor-rm" onClick={() => removeAct(i)}>✕</button>
              </div>
              <div className="editor-act-vals">
                <label>
                  <span>Valor por defecto</span>
                  <div className="editor-act-input-row">
                    <input type="number" value={act.defaultVal} min="1" onFocus={e=>e.target.select()} onChange={e=>updateAct(i,{defaultVal: parseInt(e.target.value)||1})} />
                    <span className="editor-act-unit">{act.unit}</span>
                  </div>
                </label>
                <label>
                  <span>Cal/10 min</span>
                  <input type="number" value={act.cal10 || 4} min="1" onFocus={e=>e.target.select()} onChange={e=>updateAct(i,{cal10: parseInt(e.target.value)||4})} />
                </label>
              </div>
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
      </div>
    </div>
  );
};

// Modal para elegir actividad del catálogo
const ActivityPickerModal = ({ onClose, onSelect }) => {
  const [customMode, setCustomMode] = React.useState(false);
  const [customForm, setCustomForm] = React.useState({ name: '', icon: '🏃', type: 'time', unit: 'min', cal10: 4, defaultVal: 20 });
  const catalog = window.GymStore.getActivities();

  const saveCustom = () => {
    if (!customForm.name.trim()) return;
    const act = { ...customForm, id: 'custom_' + (++_idCtr), name: customForm.name.trim() };
    window.GymStore.saveCustomActivity(act);
    onSelect(act);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
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
                    <div className="act-cat-meta">{act.defaultVal} {act.unit} · ~{act.cal10} kcal/10min</div>
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
              <input className="picker-input" placeholder="Ej: Aeróbicos, Box, Patines..." value={customForm.name} onChange={e => setCustomForm(f => ({...f, name: e.target.value}))} autoFocus />
              <div className="picker-section-label" style={{marginTop: 12}}>Tipo de valor</div>
              <div className="act-type-row">
                {(window.ACTIVITY_VALUE_TYPES || []).map(t => (
                  <button key={t.key} className={`act-type-btn ${customForm.type === t.key ? 'on' : ''}`} onClick={() => setCustomForm(f => ({...f, type: t.key, unit: t.unit}))}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="editor-nums" style={{marginTop: 12}}>
                <label><span>Valor defecto</span><input type="number" value={customForm.defaultVal} min="1" onFocus={e=>e.target.select()} onChange={e=>setCustomForm(f=>({...f, defaultVal: parseInt(e.target.value)||1}))}/></label>
                <label><span>Cal/10 min</span><input type="number" value={customForm.cal10} min="1" onFocus={e=>e.target.select()} onChange={e=>setCustomForm(f=>({...f, cal10: parseInt(e.target.value)||4}))}/></label>
              </div>
              <div className="picker-section-label" style={{marginTop: 8}}>Ícono</div>
              <div className="picker-emoji-row">
                {['🏃','💃','🏊','🚴','🧘','⚡','🥊','⛷️','🏄','🤸'].map(ic => (
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

window.RoutineEditor = RoutineEditor;
