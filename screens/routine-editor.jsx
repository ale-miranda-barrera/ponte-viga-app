// Editor de rutina del día
const RoutineEditor = ({ dow, routine, onClose, onSave, onReset }) => {
  const [draft, setDraft] = React.useState(() => ({
    ...routine,
    exercises: (routine.exercises || []).map(e => ({ ...e })),
  }));

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
        id: 'ex_' + Date.now(),
        name: 'Nuevo ejercicio',
        sub: '',
        sets: 3, reps: 10, weight: 0, unit: 'lb',
        tag: 'fire',
        target: '3×10',
      }],
    }));
  };

  const save = () => {
    onSave({
      ...draft,
      exercises: draft.exercises.map(e => ({
        ...e,
        target: `${e.sets}×${e.reps} @ ${e.weight} ${e.unit}`,
      })),
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
                <button className="editor-rm" onClick={()=>removeEx(i)}>✕</button>
              </div>
              <input className="editor-ex-sub" placeholder="Descripción (opcional)" value={ex.sub||''} onChange={e=>updateEx(i,{sub: e.target.value})} />
              <div className="editor-nums">
                <label><span>Sets</span><input type="number" value={ex.sets} min="1" onChange={e=>updateEx(i,{sets: parseInt(e.target.value)||1})}/></label>
                <label><span>Reps</span><input type="number" value={ex.reps} min="1" onChange={e=>updateEx(i,{reps: parseInt(e.target.value)||1})}/></label>
                <label><span>Peso</span><input type="number" value={ex.weight} step="2.5" onChange={e=>updateEx(i,{weight: parseFloat(e.target.value)||0})}/></label>
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

        <button className="btn-secondary" onClick={addEx}>+ Agregar ejercicio</button>
        <div style={{height: 10}}></div>
        <button className="btn-primary" onClick={save}>Guardar rutina del {window.DAY_LONG[dow].toLowerCase()}</button>
        <button className="btn-link" onClick={()=>{
          window.GymStore.resetRoutineFor(dow);
          onReset();
          onClose();
        }}>Restablecer al original</button>
      </div>
    </div>
  );
};

window.RoutineEditor = RoutineEditor;
