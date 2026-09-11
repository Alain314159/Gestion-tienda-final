import { loadState, saveState } from './core.js';
import { renderApp } from './ui.js';
import { registerPWA, revisarNotificaciones } from './pwa.js';

async function init() {
  const state = await loadState();

  if (!state.cfg.fechaInicioApp) {
    state.cfg.fechaInicioApp = new Date().toISOString();
  }

  await saveState(state);

  renderApp(state, saveState);
  registerPWA();

  if (state.cfg.notificaciones) {
    revisarNotificaciones(state);
  }
}

init();
