import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/global.css';
import App from './App';
import { useStore } from './store';

if (import.meta.env.DEV) {
  import('./lib/sheet').then((sheet) => ((window as unknown as { __bunker: unknown }).__bunker = { useStore, sheet }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
