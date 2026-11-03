// Entry point: load data and route between screens.

import { app, startSyncLoop } from './app.js';
import { readHandoff } from './hub-client.js';
import { refreshRates } from './hubtickets.js';
import { setAudioSettings, primeSpeech, sfx } from './audio.js';

// [pattern, loader, exported function name]. Each screen module exports
// render({pid, arg, params}) and may return a cleanup function.
const routes = [
  [/^\/?$/, () => import('./screens/home.js')],
  [/^\/p\/([\w-]+)$/, () => import('./screens/home.js'), 'renderKid'],
  [/^\/p\/([\w-]+)\/practice$/, () => import('./screens/practice.js')],
  [/^\/p\/([\w-]+)\/placement$/, () => import('./screens/placement.js')],
  [/^\/grown-ups$/, () => import('./screens/grownups.js')],
];

let cleanup = null;
let renderSeq = 0;

// '#hub=<code>&kid=<kid>' is how the family hub opens this app. It has to be read before the
// router sees the hash (an unknown hash is sent to '/'). It joins the hub, remembers the kid,
// and opens that kid's page.
function takeHandoff() {
  const h = readHandoff(location.hash);
  if (!h) return false;
  const kid = h.kid && app.profile(h.kid) ? h.kid : null;
  app.db.hub = { code: h.code, kid: kid || (app.db.hub && app.db.hub.code === h.code ? app.db.hub.kid : null) };
  if (!app.db.sync || app.db.sync.code !== h.code) app.db.sync = { code: h.code, base: null, last: null };
  app.save();
  history.replaceState(null, '', location.pathname + location.search + '#/' + (kid ? 'p/' + kid : ''));
  // Pull the family's progress and the hub's rates, and send any tickets waiting from before.
  app.sync();
  refreshRates(h.code, app.storage);
  app.flushTickets();
  return true;
}

async function route() {
  takeHandoff();
  let hash;
  try { hash = decodeURIComponent(location.hash.replace(/^#/, '')); }
  catch { hash = ''; } // a malformed hash (stray %) goes home instead of hanging on Loading
  const seq = ++renderSeq;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  for (const [re, load, entry = 'render'] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    const pid = m[1];
    if (re.source.startsWith('^\/p\/') && !app.profile(pid)) { app.go('/'); return; }
    const mod = await load();
    if (seq !== renderSeq) return;
    try {
      cleanup = (await mod[entry]({ pid, arg: m[2], params: m })) || null;
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = `<div class="panel"><h2>Something broke.</h2><p>${String(e.message || e).replace(/</g, '&lt;')}</p><a class="btn primary" href="#/">Back home</a></div>`;
    }
    return;
  }
  app.go('/');
}

app.init();
setAudioSettings(app.db.settings);
// Ask the browser not to evict progress (Safari can clear unused sites' storage).
try { navigator.storage?.persist?.(); } catch { /* unsupported */ }
window.__spellHiveStarted = true;
window.addEventListener('hashchange', route);
// Unlock audio on the first touch (iOS needs a user gesture).
window.addEventListener('pointerdown', () => { sfx.unlock(); primeSpeech(); }, { once: true });
route();
startSyncLoop();
// Tickets earned earlier but not yet sent (closed tab, no network) go out now.
if (app.db.hub && app.db.hub.code) {
  refreshRates(app.db.hub.code, app.storage);
  app.flushTickets();
}
