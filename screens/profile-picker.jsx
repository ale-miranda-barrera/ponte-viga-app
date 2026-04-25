const PICKER_EMOJIS = ['💪','🔥','⚡','🎯','🏅','👊','🦾','🏃','🚀','😤'];
const PICKER_COLORS = ['#ec6032','#3498DB','#27AE60','#9B59B6','#1ABC9C','#E67E22'];

const ProfilePicker = ({ onSelect }) => {
  const [profiles, setProfiles] = React.useState(() => window.GymStore.getProfiles());
  const [mode, setMode] = React.useState(profiles.length === 0 ? 'create' : 'pick');
  const [form, setForm] = React.useState({ name: '', emoji: '💪', color: '#ec6032' });

  const create = () => {
    const name = form.name.trim();
    if (!name) return;
    const updated = window.GymStore.createProfile({ name, emoji: form.emoji, color: form.color });
    setProfiles(updated);
    onSelect(name);
  };

  if (mode === 'create') {
    return (
      <div className="picker-screen">
        <div className="picker-logo">💪</div>
        <div className="picker-title">{profiles.length === 0 ? 'Crea tu perfil' : 'Nuevo perfil'}</div>
        <div className="picker-create">
          <input
            className="picker-input"
            placeholder="Tu nombre"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && create()}
            autoFocus
          />
          <div className="picker-section-label">Ícono</div>
          <div className="picker-emoji-row">
            {PICKER_EMOJIS.map(e => (
              <button key={e} className={`picker-emoji-btn ${form.emoji === e ? 'on' : ''}`}
                onClick={() => setForm(f => ({ ...f, emoji: e }))}>
                {e}
              </button>
            ))}
          </div>
          <div className="picker-section-label">Color</div>
          <div className="picker-color-row">
            {PICKER_COLORS.map(c => (
              <button key={c} className={`picker-color-btn ${form.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))} />
            ))}
          </div>
          <div className="picker-create-preview">
            <div className="picker-avatar" style={{ background: form.color }}>
              <span>{form.emoji}</span>
            </div>
            <div className="picker-name" style={{ color: 'var(--text)' }}>{form.name || '…'}</div>
          </div>
          <div className="picker-actions">
            <button className="btn-primary" onClick={create} disabled={!form.name.trim()}>
              Crear perfil
            </button>
            {profiles.length > 0 && (
              <button className="btn-link" onClick={() => setMode('pick')}>Cancelar</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="picker-screen">
      <div className="picker-logo">💪</div>
      <div className="picker-title">¿Quién va al gym hoy?</div>
      <div className="picker-grid">
        {profiles.map(p => (
          <button key={p.name} className="picker-profile" onClick={() => onSelect(p.name)}>
            <div className="picker-avatar" style={{ background: p.color }}>
              <span>{p.emoji}</span>
            </div>
            <div className="picker-name">{p.name}</div>
          </button>
        ))}
        <button className="picker-profile" onClick={() => {
          setForm({ name: '', emoji: '💪', color: '#ec6032' });
          setMode('create');
        }}>
          <div className="picker-avatar picker-add">
            <span>+</span>
          </div>
          <div className="picker-name">Agregar</div>
        </button>
      </div>
    </div>
  );
};

window.ProfilePicker = ProfilePicker;
