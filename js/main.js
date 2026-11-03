// Entry point: load data and route between screens.

import { app, startSyncLoop } from './app.js';

// [pattern, loader, exported function name]. Each screen module exports
// render({pid, arg, params}) and may return a cleanup function.
const routes = [
  [/^\/?$/, () => import('./screens/home.js')],
];

let cleanup = null;
let renderSeq = 0;

async function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  const seq = ++renderSeq;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  for (const [re, load, entry = 'render'] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    const pid = m[1];
    if (re.source.startsWith('^\\/p\\/') && !app.profile(pid)) { app.go('/'); return; }
    const mod = await load();
    if (seq !== renderSeq) return;
    try {
      cleanup = (await mod[entry]({ pid, arg: m[2], params: m })) || null;
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = `<div class="panel"><h2>Something broke.</h2><p>${String(e.message || e).replace(/</g, '&lt;')}</p><a class="btn" href="#/">Back home</a></div>`;
    }
    return;
  }
  app.go('/');
}

app.init();
// Ask the browser not to evict progress (Safari can clear unused sites' storage).
try { navigator.storage?.persist?.(); } catch { /* unsupported */ }
window.__spellHiveStarted = true;
window.addEventListener('hashchange', route);
route();
startSyncLoop();
