import { detectarAnomalias } from './core.js';

export async function registerPWA() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
    } catch {
      // sin servicio
    }
  }
}

export async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return false;

  const permiso = await Notification.requestPermission();
  return permiso === 'granted';
}

export async function notificar(titulo, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);

  if (reg?.showNotification) {
    await reg.showNotification(titulo, { body });
  } else {
    new Notification(titulo, { body });
  }
}

export async function revisarNotificaciones(state) {
  if (!state.cfg.notificaciones) return;

  const anomalias = detectarAnomalias(state).filter((a) => a.nivel === 'alta');
  if (!anomalias.length) return;

  const key = 'tienda-pro-notified';
  const now = Date.now();

  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    seen = [];
  }

  const fresh = anomalias.filter((a) => {
    const prev = seen.find((s) => s.id === a.id);
    return !prev || now - prev.t > 86400000;
  });

  if (!fresh.length) return;

  await notificar('Tienda Pro', fresh[0].mensaje);

  for (const a of fresh.slice(0, 3)) {
    seen.push({ id: a.id, t: now });
  }

  localStorage.setItem(key, JSON.stringify(seen.slice(-50)));
}
