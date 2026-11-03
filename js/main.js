// Entry point: load data and route between screens.

import { app, startSyncLoop } from './app.js';
import { readHandoff } from './hub-client.js';
import { refreshRates } from './hubtickets.js';
import { setAudioSettings, primeSpeech, sfx } from './audio.js';
import { resolve, redirectFor } from './routes.js';

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
  const r = resolve(hash);
  if (!r) { app.go('/'); return; }
  const { route: rt, m } = r;
  const pid = m[1];
  if (redirectFor(hash, id => !!app.profile(id))) { app.go('/'); return; }
  const mod = await rt.load();
  if (seq !== renderSeq) return;
  try {
    const c = (await mod[rt.entry || 'render']({ pid, arg: m[2], params: m })) || null;
    // A newer navigation started while this screen was rendering: it already ran (and missed)
    // the cleanup, so run it now and don't keep its listeners.
    if (seq !== renderSeq) { if (c) { try { c(); } catch (err) { console.error(err); } } return; }
    cleanup = c;
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return; // a newer screen is showing: don't overwrite it with this one's error
    document.getElementById('app').innerHTML = `<div class="panel"><h2>Something broke.</h2><p>${String(e.message || e).replace(/</g, '&lt;')}</p><a class="btn primary" href="#/">Back home</a></div>`;
  }
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
