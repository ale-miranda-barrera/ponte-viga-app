// React hooks para consumir el store de forma reactiva.
// Uso: useStoreTopic('sessions') → fuerza re-render cuando cambia sessions.
window.useStoreTopic = function useStoreTopic(...topics) {
  const [, setV] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setV(v => v + 1);
    const unsubs = topics.map(t => window.GymStore.subscribe(t, bump));
    return () => unsubs.forEach(u => { try { u(); } catch (e) {} });
  }, [topics.join(',')]);
};

// Helper para leer y suscribirse. selector: función que devuelve valor derivado.
// deps: topics a los que suscribirse.
window.useStoreSelector = function useStoreSelector(selector, topics) {
  const [val, setVal] = React.useState(() => selector());
  React.useEffect(() => {
    const bump = () => setVal(selector());
    const list = topics || ['all'];
    const unsubs = list.map(t => window.GymStore.subscribe(t, bump));
    // Sincronizar al montar por si cambió entre create y effect
    bump();
    return () => unsubs.forEach(u => { try { u(); } catch (e) {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return val;
};

// Confirmación in-app: reemplaza window.confirm.
// Uso: const confirm = useConfirm(); await confirm({ title, body, danger }).
// Necesita <ConfirmHost /> montado una vez en el árbol.
window._confirmQueue = [];
window._confirmSetter = null;
window.useConfirm = function useConfirm() {
  return (opts) => new Promise((resolve) => {
    const item = { ...opts, id: 'c_' + Date.now() + Math.random().toString(36).slice(2, 5), resolve };
    window._confirmQueue.push(item);
    if (window._confirmSetter) window._confirmSetter(item);
  });
};

// Toasts globales
window._toastQueue = [];
window._toastSetter = null;
window.showToast = function showToast({ text, action, actionLabel, kind = 'info', duration = 3500 }) {
  const item = { text, action, actionLabel, kind, duration, id: 't_' + Date.now() + Math.random().toString(36).slice(2, 5) };
  if (window._toastSetter) window._toastSetter(item);
  return item.id;
};

// Vibración táctil (iOS PWA silencia esto, pero Android + Web se benefician)
window.hapticTap = function hapticTap(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern || 10); } catch (e) {}
  }
};
