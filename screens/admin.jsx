const ADMIN_PIN = '1236';

// ── PIN screen ──────────────────────────────────────────────────────────────
const AdminPin = ({ onUnlock }) => {
  const [digits, setDigits] = React.useState('');
  const [shake, setShake] = React.useState(false);

  const addDigit = (d) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      if (next === ADMIN_PIN) {
        setTimeout(() => onUnlock(), 150);
      } else {
        setShake(true);
        setTimeout(() => { setDigits(''); setShake(false); }, 620);
      }
    }
  };

  const KEYS = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];

  return (
    <div className="admin-pin-wrap">
      <div className="admin-pin-topbar">
        <a href="/" className="admin-back-link">← Volver al app</a>
      </div>
      <div className="admin-pin-body">
        <div className="admin-pin-logo">🏋️</div>
        <div className="admin-pin-title">Ponte Viga</div>
        <div className="admin-pin-sub">Panel de administración</div>
        <div className={`admin-pin-dots${shake ? ' shake' : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`admin-dot${i < digits.length ? ' on' : ''}`} />
          ))}
        </div>
        <div className="admin-numpad">
          {KEYS.map((k, i) => (
            <button key={i}
              className={`numpad-key${k === '' ? ' invisible' : ''}`}
              onClick={() => {
                if (k === '⌫') setDigits(p => p.slice(0, -1));
                else if (k !== '') addDigit(String(k));
              }}
            >{k}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Admin Panel ─────────────────────────────────────────────────────────────
const AdminPanel = () => {
  const [profiles, setProfiles] = React.useState([]);
  const [groups, setGroups] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState('profiles');
  const [syncing, setSyncing] = React.useState(false);
  const [toast, setToast] = React.useState('');

  // Edit states
  const [editingProfile, setEditingProfile] = React.useState(null); // { name, emoji, color }
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [editingGroup, setEditingGroup] = React.useState(null); // { code, name }
  const [newGroup, setNewGroup] = React.useState({ code: '', name: '' });
  const [confirmDeleteGroup, setConfirmDeleteGroup] = React.useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const load = async () => {
    setLoading(true);
    await Promise.all([
      window.GymStore.hydrateProfiles(),
      window.GymStore.hydrateGroups(),
    ]);
    setProfiles(window.GymStore.getProfiles());
    setGroups(window.GymStore.getGroups());
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    await load();
    setSyncing(false);
    showToast('Sincronizado ✓');
  };

  // ── Profile actions ──
  const deleteProfile = (name) => {
    window.GymStore.deleteProfile(name);
    setProfiles(window.GymStore.getProfiles());
    setGroups(window.GymStore.getGroups());
    setConfirmDelete(null);
    showToast(`"${name}" eliminado`);
  };

  const saveProfileEdit = () => {
    if (!editingProfile) return;
    const list = profiles.map(p =>
      p.name === editingProfile.original
        ? { ...p, name: editingProfile.name, emoji: editingProfile.emoji }
        : p
    );
    // If name changed, update group memberships too
    if (editingProfile.original !== editingProfile.name) {
      const g = { ...groups };
      Object.keys(g).forEach(k => {
        g[k] = { ...g[k], members: g[k].members.map(m => m === editingProfile.original ? editingProfile.name : m) };
      });
      window.GymStore.saveGroups(g);
      setGroups(window.GymStore.getGroups());
    }
    // Update active profile key if it was the current one
    const activeKey = localStorage.getItem('gym_active_profile_v1');
    if (activeKey === editingProfile.original && editingProfile.original !== editingProfile.name) {
      localStorage.setItem('gym_active_profile_v1', editingProfile.name);
    }
    const S3 = window.S3Store;
    localStorage.setItem('gym_profiles_list_v1', JSON.stringify(list));
    if (S3) S3.set('profiles', list);
    setProfiles(list);
    setEditingProfile(null);
    showToast('Perfil actualizado ✓');
  };

  // ── Group actions ──
  const createGroup = () => {
    if (!newGroup.name.trim()) return;
    const raw = newGroup.code.trim() || newGroup.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const code = raw.startsWith('#') ? raw : '#' + raw;
    window.GymStore.createGroup(code, newGroup.name.trim());
    setGroups(window.GymStore.getGroups());
    setNewGroup({ code: '', name: '' });
    showToast(`Grupo ${code} creado ✓`);
  };

  const saveGroupEdit = () => {
    if (!editingGroup) return;
    const g = { ...groups };
    if (!g[editingGroup.code]) return;
    // Rename group display name only (code stays)
    g[editingGroup.code] = { ...g[editingGroup.code], name: editingGroup.name };
    window.GymStore.saveGroups(g);
    setGroups(g);
    setEditingGroup(null);
    showToast('Grupo actualizado ✓');
  };

  const deleteGroup = (code) => {
    const g = { ...groups };
    delete g[code];
    window.GymStore.saveGroups(g);
    setGroups(g);
    setConfirmDeleteGroup(null);
    showToast(`Grupo ${code} eliminado`);
  };

  const toggleMember = (code, profileName) => {
    const isMember = (groups[code]?.members || []).includes(profileName);
    if (isMember) window.GymStore.leaveGroup(code, profileName);
    else window.GymStore.joinGroup(code, profileName);
    setGroups(window.GymStore.getGroups());
  };

  const getProfileGroups = (name) =>
    Object.entries(groups).filter(([,g]) => (g.members||[]).includes(name)).map(([c]) => c);

  return (
    <div className="admin-panel">
      {toast && <div className="admin-toast">{toast}</div>}

      <div className="admin-header">
        <a href="/" className="admin-back-link">← App</a>
        <div className="admin-header-title">Panel Admin</div>
        <button className="admin-sync-btn" onClick={sync} disabled={syncing}>
          {syncing ? '⟳' : '↻'}
        </button>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab${tab==='profiles'?' on':''}`} onClick={() => setTab('profiles')}>
          Perfiles {loading ? '' : `(${profiles.length})`}
        </button>
        <button className={`admin-tab${tab==='groups'?' on':''}`} onClick={() => setTab('groups')}>
          Grupos {loading ? '' : `(${Object.keys(groups).length})`}
        </button>
      </div>

      <div className="admin-scroll">
        {loading && (
          <div className="admin-loading">
            <div className="loading-dots"><span /><span /><span /></div>
            <div style={{color:'#555',fontSize:13,marginTop:12}}>Cargando desde servidor...</div>
          </div>
        )}

        {/* ── PROFILES tab ── */}
        {!loading && tab === 'profiles' && (
          <div className="admin-section">
            {profiles.length === 0 && (
              <div className="admin-empty">No hay perfiles registrados en el servidor.</div>
            )}
            {profiles.map(p => {
              const pGroups = getProfileGroups(p.name);
              const isEditing = editingProfile?.original === p.name;
              return (
                <div key={p.name} className={`admin-profile-row${isEditing ? ' editing' : ''}`}>
                  {isEditing ? (
                    <div className="admin-edit-form">
                      <div className="admin-edit-row">
                        <input
                          className="admin-input emoji-input"
                          value={editingProfile.emoji}
                          maxLength={2}
                          onChange={e => setEditingProfile(x => ({ ...x, emoji: e.target.value }))}
                        />
                        <input
                          className="admin-input flex-1"
                          value={editingProfile.name}
                          onChange={e => setEditingProfile(x => ({ ...x, name: e.target.value }))}
                          placeholder="Nombre del perfil"
                        />
                      </div>
                      <div className="admin-edit-actions">
                        <button className="admin-btn-save" onClick={saveProfileEdit}>Guardar</button>
                        <button className="admin-btn-cancel" onClick={() => setEditingProfile(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-avatar" style={{ background: p.color || '#555' }}>{p.emoji}</div>
                      <div className="admin-profile-info">
                        <div className="admin-profile-name">{p.name}</div>
                        <div className="admin-profile-groups">
                          {pGroups.length > 0
                            ? pGroups.map(c => <span key={c} className="admin-group-tag">{c}</span>)
                            : <span className="admin-dim">Sin grupo</span>}
                        </div>
                      </div>
                      <div className="admin-row-actions">
                        <button className="admin-btn-edit" onClick={() => setEditingProfile({ original: p.name, name: p.name, emoji: p.emoji })}>✎</button>
                        {confirmDelete === p.name ? (
                          <>
                            <button className="admin-btn-danger" onClick={() => deleteProfile(p.name)}>Borrar</button>
                            <button className="admin-btn-cancel sm" onClick={() => setConfirmDelete(null)}>No</button>
                          </>
                        ) : (
                          <button className="admin-btn-del" onClick={() => setConfirmDelete(p.name)}>✕</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── GROUPS tab ── */}
        {!loading && tab === 'groups' && (
          <div className="admin-section">
            {Object.keys(groups).length === 0 && (
              <div className="admin-empty">No hay grupos creados aún.</div>
            )}
            {Object.entries(groups).map(([code, g]) => (
              <div key={code} className="admin-group-card">
                {editingGroup?.code === code ? (
                  <div className="admin-edit-form">
                    <div className="admin-edit-row">
                      <span className="admin-group-code-badge">{code}</span>
                      <input
                        className="admin-input flex-1"
                        value={editingGroup.name}
                        onChange={e => setEditingGroup(x => ({ ...x, name: e.target.value }))}
                        placeholder="Nombre del grupo"
                      />
                    </div>
                    <div className="admin-edit-actions">
                      <button className="admin-btn-save" onClick={saveGroupEdit}>Guardar</button>
                      <button className="admin-btn-cancel" onClick={() => setEditingGroup(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-group-head">
                    <div>
                      <div className="admin-group-code-badge">{code}</div>
                      <div className="admin-group-display-name">{g.name}</div>
                    </div>
                    <div className="admin-row-actions">
                      <button className="admin-btn-edit" onClick={() => setEditingGroup({ code, name: g.name })}>✎</button>
                      {confirmDeleteGroup === code ? (
                        <>
                          <button className="admin-btn-danger" onClick={() => deleteGroup(code)}>Borrar</button>
                          <button className="admin-btn-cancel sm" onClick={() => setConfirmDeleteGroup(null)}>No</button>
                        </>
                      ) : (
                        <button className="admin-btn-del" onClick={() => setConfirmDeleteGroup(code)}>✕</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="admin-group-members">
                  <div className="admin-members-label">Miembros:</div>
                  <div className="admin-members-chips">
                    {profiles.map(p => {
                      const isMember = (g.members||[]).includes(p.name);
                      return (
                        <button key={p.name}
                          className={`admin-member-chip${isMember ? ' on' : ''}`}
                          onClick={() => toggleMember(code, p.name)}
                        >
                          {p.emoji} {p.name}
                        </button>
                      );
                    })}
                    {profiles.length === 0 && <span className="admin-dim">No hay perfiles</span>}
                  </div>
                </div>
              </div>
            ))}

            <div className="admin-new-group-form">
              <div className="admin-section-title">Crear nuevo grupo</div>
              <input
                className="admin-input"
                placeholder="Nombre (ej: Miranda)"
                value={newGroup.name}
                onChange={e => setNewGroup(g => ({ ...g, name: e.target.value }))}
              />
              <input
                className="admin-input"
                placeholder="Código (ej: #miranda — opcional)"
                value={newGroup.code}
                onChange={e => setNewGroup(g => ({ ...g, code: e.target.value }))}
              />
              <button className="admin-btn-primary" onClick={createGroup} disabled={!newGroup.name.trim()}>
                Crear grupo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Root admin app ──────────────────────────────────────────────────────────
const AdminApp = () => {
  const [unlocked, setUnlocked] = React.useState(false);
  if (!unlocked) return <AdminPin onUnlock={() => setUnlocked(true)} />;
  return <AdminPanel />;
};

window.AdminApp = AdminApp;
