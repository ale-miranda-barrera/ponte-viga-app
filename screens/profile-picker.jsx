const PICKER_EMOJIS = ['💪','🔥','⚡','🎯','🏅','👊','🦾','🏃','🚀','😤','💃','🦋','🌸','👸','🧘'];
const PICKER_COLORS = ['#ec6032','#3498DB','#27AE60','#9B59B6','#1ABC9C','#E67E22'];

// ─── Tabla de logros ──────────────────────────────────────────────────────────
const Leaderboard = ({ profiles }) => {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.all(profiles.map(p =>
      window.GymStore.getProfileStats(p.name).then(stats => ({ ...p, stats }))
    )).then(rows => {
      if (cancelled) return;
      const maxSessions = Math.max(0, ...rows.map(r => r.stats.weekSessions));
      setData(rows.map(r => ({
        ...r,
        isLeader: maxSessions > 0 && r.stats.weekSessions === maxSessions,
      })));
    });
    return () => { cancelled = true; };
  }, [profiles]);

  if (!data) return null;
  // No mostrar si nadie tiene datos aún
  const anyData = data.some(r => r.stats.weekSessions > 0 || r.stats.streak > 0);
  if (!anyData) return null;

  return (
    <div className="lb-wrap">
      <div className="lb-title">Esta semana</div>
      {data.map(r => {
        const { streak, weekSessions, maxCardioWeek, hasPR } = r.stats;
        const badges = [];
        if (r.isLeader)          badges.push({ key:'l', icon:'🏆', label:'Líder' });
        if (streak >= 5)         badges.push({ key:'s', icon:'🔥', label:`${streak} días` });
        else if (streak >= 3)    badges.push({ key:'s', icon:'🔥', label:`${streak} días` });
        if (weekSessions >= 3)   badges.push({ key:'w', icon:'💪', label:`${weekSessions}x sem` });
        if (maxCardioWeek >= 15) badges.push({ key:'c', icon:'🏃', label:`${maxCardioWeek} min` });
        if (hasPR)               badges.push({ key:'p', icon:'⬆️', label:'PR peso' });

        return (
          <div key={r.name} className="lb-row">
            <div className="lb-avatar" style={{ background: r.color }}>{r.emoji}</div>
            <div className="lb-name">{r.name}</div>
            <div className="lb-badges">
              {badges.length > 0
                ? badges.map(b => (
                    <span key={b.key} className="lb-badge">
                      {b.icon} {b.label}
                    </span>
                  ))
                : <span className="lb-empty">Sin actividad</span>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Sección de grupos / amigos ──────────────────────────────────────────────
const GroupsFriendsSection = ({ profiles }) => {
  const groups = React.useMemo(() => window.GymStore.getGroups(), []);
  const entries = Object.entries(groups).filter(([, g]) => g.members.length >= 2);
  if (entries.length === 0) return null;

  return (
    <div className="friends-section">
      <div className="friends-title">👥 Grupos conectados</div>
      {entries.map(([code, group]) => {
        const members = group.members.map(n => profiles.find(p => p.name === n)).filter(Boolean);
        if (members.length < 2) return null;
        return (
          <div key={code} className="friends-group">
            <div className="friends-code">{code}</div>
            <div className="friends-avatars">
              {members.map((p, i) => (
                <React.Fragment key={p.name}>
                  {i > 0 && <span className="friend-link">🤝</span>}
                  <div className="friend-avatar" style={{ background: p.color }} title={p.name}>
                    <span>{p.emoji}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div className="friends-names">{members.map(p => p.name).join(' · ')}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Profile Picker ───────────────────────────────────────────────────────────
const ProfilePicker = ({ onSelect }) => {
  const [profiles, setProfiles] = React.useState(() => window.GymStore.getProfiles());
  const [mode, setMode] = React.useState(profiles.length === 0 ? 'create' : 'pick');
  const [form, setForm] = React.useState({ name: '', emoji: '💪', color: '#ec6032', pin: '' });
  const [pinEntry, setPinEntry] = React.useState(null);
  const [pinValue, setPinValue] = React.useState('');
  const [pinError, setPinError] = React.useState(false);
  const [pendingProfile, setPendingProfile] = React.useState(null);
  const [groupInput, setGroupInput] = React.useState('');
  const [groupCreateName, setGroupCreateName] = React.useState('');
  const [groupSubmode, setGroupSubmode] = React.useState('join'); // 'join' | 'create'
  const [groupError, setGroupError] = React.useState('');

  const create = () => {
    const name = form.name.trim();
    if (!name) return;
    console.log('[ProfilePicker] Creando perfil:', name);
    const profileData = { name, emoji: form.emoji, color: form.color };
    if (form.pin.trim()) profileData.pin = form.pin.trim();
    const updated = window.GymStore.createProfile(profileData);
    console.log('[ProfilePicker] Perfil creado, total:', updated.length);
    setProfiles(updated);
    setPendingProfile(name);
    setMode('group');
  };

  const handleGroupJoin = () => {
    const code = groupInput.trim();
    if (!code) {
      console.log('[ProfilePicker] Skip grupo, onSelect:', pendingProfile);
      onSelect(pendingProfile);
      return;
    }
    const normalCode = code.startsWith('#') ? code.toLowerCase() : '#' + code.toLowerCase();
    const existing = window.GymStore.getGroups()[normalCode];
    if (!existing) { setGroupError('Código no encontrado. Revisa e intenta de nuevo.'); return; }
    window.GymStore.joinGroup(normalCode, pendingProfile);
    onSelect(pendingProfile);
  };

  const handleGroupCreate = () => {
    const name = groupCreateName.trim();
    if (!name) return;
    const code = '#' + name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    window.GymStore.createGroup(code, name);
    window.GymStore.joinGroup(code, pendingProfile);
    onSelect(pendingProfile);
  };

  const handleProfileClick = (p) => {
    if (p.pin) {
      setPinEntry(p);
      setPinValue('');
      setPinError(false);
    } else {
      onSelect(p.name);
    }
  };

  const submitPin = () => {
    if (pinValue === pinEntry.pin) {
      onSelect(pinEntry.name);
    } else {
      setPinError(true);
      setPinValue('');
    }
  };

  // Pantalla de PIN
  if (pinEntry) {
    return (
      <div className="picker-screen">
        <div className="picker-avatar" style={{ background: pinEntry.color, width: 72, height: 72, fontSize: 36, margin: '0 auto 12px' }}>
          <span>{pinEntry.emoji}</span>
        </div>
        <div className="picker-title">{pinEntry.name}</div>
        <div className="picker-create">
          <div className="picker-section-label">Ingresa tu PIN</div>
          <input
            className={`picker-input${pinError ? ' picker-input-error' : ''}`}
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pinValue}
            maxLength={8}
            onChange={e => { setPinValue(e.target.value); setPinError(false); }}
            onKeyDown={e => e.key === 'Enter' && submitPin()}
            autoFocus
          />
          {pinError && <div className="picker-pin-error">PIN incorrecto</div>}
          <div className="picker-actions">
            <button type="button" className="btn-primary" onClick={submitPin} disabled={!pinValue}>Entrar</button>
            <button type="button" className="btn-link" onClick={() => setPinEntry(null)}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla de grupo (post-creación de perfil)
  if (mode === 'group') {
    return (
      <div className="picker-screen">
        <button type="button" className="sheet-close" style={{position:'fixed', top:16, right:16}} onClick={() => onSelect(pendingProfile)}>✕</button>
        <div className="picker-logo">👥</div>
        <div className="picker-title">Únete a un grupo</div>
        <div className="picker-create">
          <div className="group-mode-tabs">
            <button type="button" className={`group-mode-tab ${groupSubmode === 'join' ? 'on' : ''}`} onClick={() => { setGroupSubmode('join'); setGroupError(''); }}>Unirse a grupo</button>
            <button type="button" className={`group-mode-tab ${groupSubmode === 'create' ? 'on' : ''}`} onClick={() => { setGroupSubmode('create'); setGroupError(''); }}>Crear grupo</button>
          </div>

          {groupSubmode === 'join' && (() => {
            const allGroups = Object.entries(window.GymStore.getGroups());
            const topGroups = allGroups
              .sort((a, b) => (b[1].members?.length || 0) - (a[1].members?.length || 0))
              .slice(0, 8);
            return (
              <>
                <div className="picker-section-label">Código del grupo (ej: #miranda)</div>
                <input
                  className={`picker-input${groupError ? ' picker-input-error' : ''}`}
                  placeholder="#codigo"
                  value={groupInput}
                  onChange={e => { setGroupInput(e.target.value); setGroupError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleGroupJoin()}
                  autoFocus
                />
                {groupError && <div className="picker-pin-error">{groupError}</div>}

                {topGroups.length > 0 && (
                  <div className="group-suggestions">
                    <div className="group-suggestions-label">Grupos disponibles</div>
                    <div className="group-suggestions-list">
                      {topGroups.map(([code, g]) => (
                        <button
                          key={code}
                          type="button"
                          className="group-suggestion-chip"
                          onClick={() => { setGroupInput(code); setGroupError(''); }}
                        >
                          <span className="gs-code">{code}</span>
                          <span className="gs-name">{g.name}</span>
                          <span className="gs-count">{g.members?.length || 0}👥</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="picker-actions">
                  <button type="button" className="btn-primary" onClick={handleGroupJoin} disabled={!groupInput.trim()}>Unirse</button>
                  <button type="button" className="btn-link" onClick={() => onSelect(pendingProfile)}>Saltar por ahora</button>
                </div>
              </>
            );
          })()}

          {groupSubmode === 'create' && (
            <>
              <div className="picker-section-label">Nombre del grupo</div>
              <input
                className="picker-input"
                placeholder="Ej: Miranda, Los Fuertes, Familia..."
                value={groupCreateName}
                onChange={e => setGroupCreateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGroupCreate()}
                autoFocus
              />
              {groupCreateName.trim() && (
                <div className="group-code-preview">
                  Código: <strong>#{groupCreateName.trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}</strong>
                </div>
              )}
              <div className="picker-actions">
                <button type="button" className="btn-primary" onClick={handleGroupCreate} disabled={!groupCreateName.trim()}>Crear grupo</button>
                <button type="button" className="btn-link" onClick={() => onSelect(pendingProfile)}>Saltar por ahora</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Pantalla de creación
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
          <div className="picker-section-label">PIN (opcional)</div>
          <input
            className="picker-input"
            type="password"
            inputMode="numeric"
            placeholder="PIN numérico — déjalo vacío si no quieres"
            value={form.pin}
            maxLength={8}
            onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
          />
          <div className="picker-create-preview">
            <div className="picker-avatar" style={{ background: form.color }}>
              <span>{form.emoji}</span>
            </div>
            <div className="picker-name" style={{ color: 'var(--text)' }}>{form.name || '…'}</div>
          </div>
          <div className="picker-actions">
            <button type="button" className="btn-primary" onClick={create} disabled={!form.name.trim()}>
              Crear perfil
            </button>
            {profiles.length > 0 && (
              <button type="button" className="btn-link" onClick={() => setMode('pick')}>Cancelar</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Pantalla principal de selección
  return (
    <div className="picker-screen">
      <div className="picker-logo">💪</div>
      <div className="picker-title">¿Quién va al gym hoy?</div>
      <div className="picker-grid">
        {profiles.map(p => (
          <button key={p.name} className="picker-profile" onClick={() => handleProfileClick(p)}>
            <div className="picker-avatar" style={{ background: p.color }}>
              <span>{p.emoji}</span>
            </div>
            <div className="picker-name">{p.name}{p.pin ? ' 🔒' : ''}</div>
          </button>
        ))}
        <button type="button" className="picker-profile" onClick={() => {
          setForm({ name: '', emoji: '💪', color: '#ec6032', pin: '' });
          setMode('create');
        }}>
          <div className="picker-avatar picker-add"><span>+</span></div>
          <div className="picker-name">Agregar</div>
        </button>
      </div>
      <Leaderboard profiles={profiles} />
      <GroupsFriendsSection profiles={profiles} />
    </div>
  );
};

window.ProfilePicker = ProfilePicker;
