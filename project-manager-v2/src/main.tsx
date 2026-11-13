import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

const DYNAMIC_MODULE_RELOAD_KEY = 'project-manager-v2:dynamic-module-reload';

function reloadAfterStaleModule(error?: unknown): void {
  if (typeof window === 'undefined') return;
  const message = error instanceof Error ? error.message : String(error || '');
  if (!/dynamically imported module|module script failed|imported module/i.test(message)) return;

  try {
    if (window.sessionStorage.getItem(DYNAMIC_MODULE_RELOAD_KEY)) return;
    window.sessionStorage.setItem(DYNAMIC_MODULE_RELOAD_KEY, '1');
  } catch {
    // Continue with a normal reload when session storage is unavailable.
  }
  window.location.replace(`${window.location.pathname}?reload=${Date.now()}${window.location.hash}`);
}

window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  reloadAfterStaleModule(event.payload);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="应用">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

window.setTimeout(() => {
  try {
    window.sessionStorage.removeItem(DYNAMIC_MODULE_RELOAD_KEY);
  } catch {
    // Ignore storage restrictions after the application has mounted.
  }
}, 3000);