// UI primitives globales: ConfirmHost (dialog) + ToastHost (snackbar con undo).
// Se montan una sola vez en el árbol; los componentes disparan vía
// window.useConfirm() o window.showToast().

const ConfirmHost = () => {
  const [current, setCurrent] = React.useState(null);
  React.useEffect(() => {
    window._confirmSetter = (item) => setCurrent(item);
    return () => { window._confirmSetter = null; };
  }, []);

  if (!current) return null;
  const { title, body, danger, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', resolve } = current;

  const close = (result) => {
    setCurrent(null);
    // Sacar de la cola y disparar el siguiente si hay
    window._confirmQueue = window._confirmQueue.filter(x => x.id !== current.id);
    resolve(result);
    if (window._confirmQueue.length > 0) {
      setTimeout(() => setCurrent(window._confirmQueue[0]), 150);
    }
  };

  return (
    <div className="pv-confirm-back" role="dialog" aria-modal="true" onClick={() => close(false)}>
      <div className="pv-confirm" onClick={e => e.stopPropagation()}>
        {title && <div className="pv-confirm-title">{title}</div>}
        {body && <div className="pv-confirm-body">{body}</div>}
        <div className="pv-confirm-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => close(false)}
            autoFocus
          >{cancelLabel}</button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { window.hapticTap && window.hapticTap(15); close(true); }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

const ToastHost = () => {
  const [toasts, setToasts] = React.useState([]);
  const timersRef = React.useRef({});

  React.useEffect(() => {
    window._toastSetter = (item) => {
      setToasts(prev => [...prev, item]);
      timersRef.current[item.id] = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id));
        delete timersRef.current[item.id];
      }, item.duration || 3500);
    };
    const timers = timersRef.current;
    return () => {
      window._toastSetter = null;
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  const runAction = (t) => {
    try { t.action && t.action(); } catch (e) { console.error(e); }
    // Limpiar timer y remover
    if (timersRef.current[t.id]) {
      clearTimeout(timersRef.current[t.id]);
      delete timersRef.current[t.id];
    }
    setToasts(prev => prev.filter(x => x.id !== t.id));
  };

  const dismiss = (id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(x => x.id !== id));
  };

  if (toasts.length === 0) return null;
  return (
    <div className="pv-toast-host" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`pv-toast kind-${t.kind || 'info'}`}>
          <div className="pv-toast-text">{t.text}</div>
          {t.action && (
            <button type="button" className="pv-toast-action" onClick={() => runAction(t)}>
              {t.actionLabel || 'Deshacer'}
            </button>
          )}
          <button
            type="button"
            className="pv-toast-dismiss"
            aria-label="Cerrar notificación"
            onClick={() => dismiss(t.id)}
            style={{background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:'4px 8px',fontSize:14}}
          >✕</button>
        </div>
      ))}
    </div>
  );
};

// ─── Skeleton primitives (para loading states de screens) ────────────
const SkeletonCard = ({ h = 92 }) => (
  <div className="skel skel-card" style={{ height: h }} aria-hidden="true" />
);
const SkeletonLine = ({ w = 'wide' }) => (
  <div className={`skel skel-line ${w}`} aria-hidden="true" />
);
const SkeletonList = ({ count = 3, height = 92 }) => (
  <div aria-busy="true" aria-label="Cargando">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} h={height} />)}
  </div>
);

// ─── EmptyState reutilizable ────────────────────────────────
const EmptyState = ({ icon = '📭', title, text, actionLabel, onAction }) => (
  <div className="empty-state">
    <span className="empty-state-icon" aria-hidden="true">{icon}</span>
    <div className="empty-state-title">{title}</div>
    {text && <div className="empty-state-text">{text}</div>}
    {actionLabel && onAction && (
      <button type="button" className="btn btn-primary btn-sm empty-state-action" onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);

window.SkeletonCard = SkeletonCard;
window.SkeletonLine = SkeletonLine;
window.SkeletonList = SkeletonList;
window.EmptyState = EmptyState;

// Boundary de recuperación local: si un chart o subcomponente falla,
// muestra un placeholder en vez de romper toda la app.
class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.warn('[SafeBoundary]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div className="safe-boundary">
          <span>⚠️</span>
          <div>
            <div>No se pudo mostrar este módulo.</div>
            <button type="button" onClick={() => this.setState({ err: null })}>Reintentar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

window.ConfirmHost = ConfirmHost;
window.ToastHost = ToastHost;
window.SafeBoundary = SafeBoundary;
