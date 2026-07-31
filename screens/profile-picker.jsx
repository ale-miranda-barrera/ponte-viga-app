const PICKER_EMOJIS = ['💪','🔥','⚡','🎯','🏅','👊','🦾','🏃','🚀','😤','💃','🦋','🌸','👸','🧘'];
const PICKER_COLORS = ['#ec6032','#3498DB','#27AE60','#9B59B6','#1ABC9C','#E67E22'];

// ─── Leaderboard ─────────────────────────────────────────────────────────────
const Leaderboard = ({ profiles }) => {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    const ac = new AbortController();
    Promise.all(profiles.map(p =>
      window.GymStore.getProfileStats(p.name).then(stats => ({ ...p, stats }))
    )).then(rows => {
      if (ac.signal.aborted) return;
      const maxSessions = Math.max(0, ...rows.map(r => r.stats.weekSessions));
      setData(rows.map(r => ({
        ...r,
        isLeader: maxSessions > 0 && r.stats.weekSessions === maxSessions,
      })));
    }).catch(() => {});
    return () => { ac.abort(); };
  }, [profiles]);

  if (!data) return null;
  const anyData = data.some(r => r.stats.weekSessions > 0 || r.stats.streak > 0);
  if (!anyData) return null;

  return (
    <div className="lb-wrap">
      <div className="lb-title">Esta semana</div>
      {data.map(r => {
        const { streak, weekSessions, maxCardioWeek, hasPR } = r.stats;
        const badges = [];
        if (r.isLeader)          badges.push({ key:'l', icon:'🏆', label:'Líder' });
        if (streak >= 3)         badges.push({ key:'s', icon:'🔥', label:`${streak} días` });
        if (weekSessions >= 3)   badges.push({ key:'w', icon:'💪', label:`${weekSessions}x sem` });
        if (maxCardioWeek >= 15) badges.push({ key:'c', icon:'🏃', label:`${maxCardioWeek} min` });
        if (hasPR)               badges.push({ key:'p', icon:'⬆️', label:'PR peso' });

        return (
          <div key={r.name} className="lb-row">
            <div className="lb-avatar" style={{ background: r.color }} aria-hidden="true">{r.emoji}</div>
            <div className="lb-name">{r.name}</div>
            <div className="lb-badges">
              {badges.length > 0
                ? badges.map(b => (
                    <span key={b.key} className="lb-badge">
                      <span aria-hidden="true">{b.icon}</span> {b.label}
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

// ─── Grupos / amigos ─────────────────────────────────────────────────────────
const GroupsFriendsSection = ({ profiles }) => {
  const groups = React.useMemo(() => window.GymStore.getGroups(), []);
  const entries = Object.entries(groups).filter(([, g]) => g.members.length >= 2);
  if (entries.length === 0) return null;

  return (
    <div className="friends-section">
      <div className="friends-title"><span aria-hidden="true">👥</span> Grupos conectados</div>
      {entries.map(([code, group]) => {
        const members = group.members.map(n => profiles.find(p => p.name === n)).filter(Boolean);
        if (members.length < 2) return null;
        return (
          <div key={code} className="friends-group">
            <div className="friends-code">{code}</div>
            <div className="friends-avatars">
              {members.map((p, i) => (
                <React.Fragment key={p.name}>
                  {i > 0 && <span className="friend-link" aria-hidden="true">🤝</span>}
                  <div className="friend-avatar" style={{ background: p.color }} title={p.name}>
                    <span aria-hidden="true">{p.emoji}</span>
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

// ─── Profile Picker ──────────────────────────────────────────────────────────
const ProfilePicker = ({ onSelect }) => {
  const [profiles, setProfiles] = React.useState(() => window.GymStore.getProfiles());
  const [mode, setMode] = React.useState(profiles.length === 0 ? 'create' : 'pick');
  const [form, setForm] = React.useState({ name: '', emoji: '💪', color: '#ec6032', pin: '' });
  const [pinEntry, setPinEntry] = React.useState(null);
  const [pinValue, setPinValue] = React.useState('');
  const [pinError, setPinError] = React.useState('');
  const [pinLoading, setPinLoading] = React.useState(false);
  const [pendingProfile, setPendingProfile] = React.useState(null);
  const [groupInput, setGroupInput] = React.useState('');
  const [groupCreateName, setGroupCreateName] = React.useState('');
  const [groupSubmode, setGroupSubmode] = React.useState('join');
  const [groupError, setGroupError] = React.useState('');
  const [createError, setCreateError] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const create = async () => {
    const name = form.name.trim();
    if (!name || creating) return;
    if (!/^[a-zA-Z0-9_\- ]{2,30}$/.test(name)) {
      setCreateError('Nombre: 2-30 letras/números/espacios.');
      return;
    }
    const pin = form.pin.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setCreateError('PIN: 4-8 dígitos numéricos.');
      return;
    }
    if (profiles.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      setCreateError('Ya existe un perfil con ese nombre.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await window.S3Store.register({
        name, emoji: form.emoji, color: form.color, pin,
      });
      if (!res.ok) {
        if (res.error === 'profile_exists_with_pin') {
          setCreateError('Ya existe con PIN. Vuelve a la selección y usa tu PIN para entrar.');
        } else if (res.status === 429) {
          setCreateError(`Demasiados intentos. Espera ${Math.ceil((res.retryAfterMs || 60000)/60000)} min.`);
        } else {
          setCreateError('No pude crear el perfil. Reintenta en un momento.');
        }
        setCreating(false);
        return;
      }
      // Token ya establecido por S3Store.register. Refresca la lista local desde server.
      await window.GymStore.hydrateProfiles();
      setProfiles(window.GymStore.getProfiles());
      setPendingProfile(name);
      setMode('group');
    } catch (e) {
      console.warn('[picker] error creando perfil', e);
      setCreateError('Error de conexión. Reintenta.');
    } finally {
      setCreating(false);
    }
  };

  const handleGroupJoin = () => {
    const code = groupInput.trim();
    if (!code) { onSelect(pendingProfile); return; }
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
    if (code === '#') { setGroupError('Nombre de grupo inválido.'); return; }
    window.GymStore.createGroup(code, name);
    window.GymStore.joinGroup(code, pendingProfile);
    onSelect(pendingProfile);
  };

  const handleProfileClick = async (p) => {
    // Login sin PIN primero — si el server dice pin_required, mostramos el picker
    setPinError('');
    setPinLoading(true);
    try {
      const res = await window.S3Store.login(p.name, '');
      if (res.ok) {
        window.GymStore.setToken(res.token);
        onSelect(p.name);
        return;
      }
      if (res.error === 'pin_required') {
        setPinEntry(p);
        setPinValue('');
      } else if (res.status === 429) {
        setPinError(`Demasiados intentos. Espera ${Math.ceil((res.retryAfterMs || 60000)/60000)} min.`);
      } else {
        setPinError('No pude iniciar sesión. Intenta de nuevo.');
      }
    } catch (e) {
      setPinError('Error de conexión. Reintenta.');
    } finally {
      setPinLoading(false);
    }
  };

  const submitPin = async () => {
    if (!pinValue || pinLoading) return;
    setPinLoading(true);
    setPinError('');
    try {
      const res = await window.S3Store.login(pinEntry.name, pinValue);
      if (res.ok) {
        window.GymStore.setToken(res.token);
        onSelect(pinEntry.name);
      } else if (res.status === 429) {
        setPinError(`Demasiados intentos. Espera ${Math.ceil((res.retryAfterMs || 60000)/60000)} min.`);
        setPinValue('');
      } else {
        setPinError('PIN incorrecto');
        setPinValue('');
        window.hapticTap && window.hapticTap([40,40,40]);
      }
    } catch (e) {
      setPinError('Error de conexión');
    } finally {
      setPinLoading(false);
    }
  };

  // ── Pantalla de PIN ──
  if (pinEntry) {
    return (
      <div className="picker-screen">
        <div className="picker-avatar picker-avatar-lg" style={{ background: pinEntry.color }}>
          <span aria-hidden="true">{pinEntry.emoji}</span>
        </div>
        <div className="picker-title">{pinEntry.name}</div>
        <div className="picker-create">
          <label className="picker-section-label" htmlFor="pin-input">Ingresa tu PIN</label>
          <input
            id="pin-input"
            className={`picker-input picker-input-center${pinError ? ' picker-input-error' : ''}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={pinValue}
            maxLength={8}
            disabled={pinLoading}
            onChange={e => { setPinValue(e.target.value.replace(/\D/g, '')); setPinError(''); }}
            onKeyDown={e => e.key === 'Enter' && submitPin()}
            autoFocus
          />
          {pinError && <div className="picker-pin-error" role="alert">{pinError}</div>}
          <div className="picker-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={submitPin} disabled={!pinValue || pinLoading}>
              {pinLoading ? 'Verificando…' : 'Entrar'}
            </button>
            <button type="button" className="btn btn-link" onClick={() => { setPinEntry(null); setPinError(''); }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pantalla de grupo ──
  if (mode === 'group') {
    return (
      <div className="picker-screen">
        <button
          type="button"
          className="sheet-close"
          style={{position:'fixed', top:'calc(env(safe-area-inset-top) + 16px)', right:16}}
          aria-label="Saltar unirse a grupo"
          onClick={() => onSelect(pendingProfile)}
        >✕</button>
        <div className="picker-logo" aria-hidden="true">👥</div>
        <div className="picker-title">Únete a un grupo</div>
        <div className="picker-subtitle">Opcional — comparte tu progreso con amigos</div>
        <div className="picker-create">
          <div className="group-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={groupSubmode === 'join'}
              className={`group-mode-tab ${groupSubmode === 'join' ? 'on' : ''}`}
              onClick={() => { setGroupSubmode('join'); setGroupError(''); }}
            >Unirse</button>
            <button
              type="button"
              role="tab"
              aria-selected={groupSubmode === 'create'}
              className={`group-mode-tab ${groupSubmode === 'create' ? 'on' : ''}`}
              onClick={() => { setGroupSubmode('create'); setGroupError(''); }}
            >Crear grupo</button>
          </div>

          {groupSubmode === 'join' && (() => {
            const allGroups = Object.entries(window.GymStore.getGroups());
            const topGroups = allGroups
              .sort((a, b) => (b[1].members?.length || 0) - (a[1].members?.length || 0))
              .slice(0, 8);
            return (
              <>
                <label className="picker-section-label" htmlFor="group-code-input">Código del grupo</label>
                <input
                  id="group-code-input"
                  className={`picker-input${groupError ? ' picker-input-error' : ''}`}
                  placeholder="#codigo"
                  value={groupInput}
                  onChange={e => { setGroupInput(e.target.value); setGroupError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleGroupJoin()}
                  autoFocus
                />
                {groupError && <div className="picker-pin-error" role="alert">{groupError}</div>}

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
                          <span className="gs-count">{g.members?.length || 0}<span aria-hidden="true">👥</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="picker-actions">
                  <button type="button" className="btn btn-primary btn-lg" onClick={handleGroupJoin} disabled={!groupInput.trim()}>Unirse</button>
                  <button type="button" className="btn btn-link" onClick={() => onSelect(pendingProfile)}>Saltar por ahora</button>
                </div>
              </>
            );
          })()}

          {groupSubmode === 'create' && (
            <>
              <label className="picker-section-label" htmlFor="group-create-input">Nombre del grupo</label>
              <input
                id="group-create-input"
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
                <button type="button" className="btn btn-primary btn-lg" onClick={handleGroupCreate} disabled={!groupCreateName.trim()}>Crear grupo</button>
                <button type="button" className="btn btn-link" onClick={() => onSelect(pendingProfile)}>Saltar por ahora</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Pantalla de creación ──
  if (mode === 'create') {
    return (
      <div className="picker-screen">
        <div className="picker-logo" aria-hidden="true">💪</div>
        <div className="picker-title">{profiles.length === 0 ? 'Crea tu perfil' : 'Nuevo perfil'}</div>
        <div className="picker-subtitle">Cada perfil tiene sus propios datos, sesiones y medidas.</div>
        <div className="picker-create">
          <label className="picker-section-label" htmlFor="name-input">Nombre</label>
          <input
            id="name-input"
            className={`picker-input${createError ? ' picker-input-error' : ''}`}
            placeholder="Tu nombre"
            value={form.name}
            maxLength={30}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setCreateError(''); }}
            onKeyDown={e => e.key === 'Enter' && create()}
            autoFocus
          />
          <div className="picker-section-label">Ícono</div>
          <div className="picker-emoji-row" role="group" aria-label="Elige un ícono">
            {PICKER_EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                aria-pressed={form.emoji === e}
                className={`picker-emoji-btn ${form.emoji === e ? 'on' : ''}`}
                onClick={() => setForm(f => ({ ...f, emoji: e }))}
              ><span aria-hidden="true">{e}</span></button>
            ))}
          </div>
          <div className="picker-section-label">Color</div>
          <div className="picker-color-row" role="group" aria-label="Elige un color">
            {PICKER_COLORS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                className={`picker-color-btn ${form.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))}
              />
            ))}
          </div>
          <label className="picker-section-label" htmlFor="pin-create-input">PIN (opcional)</label>
          <input
            id="pin-create-input"
            className="picker-input"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="4-8 dígitos — déjalo vacío para no usar PIN"
            value={form.pin}
            maxLength={8}
            onChange={e => { setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') })); setCreateError(''); }}
          />
          {createError && <div className="picker-pin-error" role="alert">{createError}</div>}
          <div className="picker-create-preview">
            <div className="picker-avatar" style={{ background: form.color }}>
              <span aria-hidden="true">{form.emoji}</span>
            </div>
            <div className="picker-name" style={{ color: 'var(--text)' }}>{form.name || '…'}</div>
          </div>
          <div className="picker-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={create} disabled={!form.name.trim() || creating}>
              {creating ? 'Creando…' : 'Crear perfil'}
            </button>
            {profiles.length > 0 && (
              <button type="button" className="btn btn-link" onClick={() => { setMode('pick'); setCreateError(''); }}>Cancelar</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Pantalla principal de selección ──
  return (
    <div className="picker-screen">
      <div className="picker-logo" aria-hidden="true">💪</div>
      <div className="picker-title">¿Quién va al gym hoy?</div>
      {pinError && <div className="picker-pin-error" role="alert" style={{marginTop:8}}>{pinError}</div>}
      <div className="picker-grid" role="list">
        {profiles.map(p => (
          <button
            key={p.name}
            type="button"
            role="listitem"
            className="picker-profile"
            disabled={pinLoading}
            onClick={() => handleProfileClick(p)}
          >
            <div className="picker-avatar" style={{ background: p.color }}>
              <span aria-hidden="true">{p.emoji}</span>
            </div>
            <div className="picker-name">
              {p.name}
              {(p.hasPin || p.pin || p.pinHash) ? <span className="picker-lock" aria-label="Requiere PIN"> 🔒</span> : null}
            </div>
          </button>
        ))}
        <button
          type="button"
          className="picker-profile picker-profile-add"
          onClick={() => {
            setForm({ name: '', emoji: '💪', color: '#ec6032', pin: '' });
            setMode('create');
          }}
        >
          <div className="picker-avatar picker-add"><span aria-hidden="true">+</span></div>
          <div className="picker-name">Agregar</div>
        </button>
      </div>
      <Leaderboard profiles={profiles} />
      <GroupsFriendsSection profiles={profiles} />
    </div>
  );
};

window.ProfilePicker = ProfilePicker;
