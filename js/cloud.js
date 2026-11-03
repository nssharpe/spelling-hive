// Progress sync over Firestore's REST API (no SDK, no sign-in), in the family
// hub's `sharpe-family` project. The document is `spelling/<hubCode>`: the hub's
// family code is the document id and the secret, and the Firestore rules (owned by
// the hub) only allow reading a document whose id you already know, never listing.
//
// A sync is read → three-way merge → conditional write (only if nobody wrote
// in between, using the document's updateTime). Changes made on this device
// while a sync is in flight are folded in afterwards, so nothing is lost.

import { syncDoc, applyDoc, merge3 } from './sync.js';
import { saveDB } from './store.js';

export const PROJECT = 'sharpe-family';
export const URL_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/spelling/`;

const clone = x => JSON.parse(JSON.stringify(x));
const listeners = new Set();
let state = { status: 'off', last: null, error: null };

export function onSyncStatus(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function syncStatus() { return state; }
function setState(patch) { state = { ...state, ...patch }; listeners.forEach(fn => { try { fn(state); } catch { /* ignore */ } }); }

async function pull(code) {
  const res = await fetch(URL_BASE + encodeURIComponent(code), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const j = await res.json();
  return { doc: JSON.parse(j.fields.data.stringValue), updateTime: j.updateTime };
}

class Conflict extends Error {}

async function push(code, doc, updateTime) {
  const pre = updateTime ? `currentDocument.updateTime=${encodeURIComponent(updateTime)}` : 'currentDocument.exists=false';
  const body = { fields: { data: { stringValue: JSON.stringify(doc) }, v: { integerValue: String(doc.v || 1) }, updated: { integerValue: String(Date.now()) } } };
  const res = await fetch(`${URL_BASE}${encodeURIComponent(code)}?${pre}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.status === 400 || res.status === 409) {
    const j = await res.json().catch(() => ({}));
    if (j.error && (j.error.status === 'FAILED_PRECONDITION' || j.error.status === 'ALREADY_EXISTS')) throw new Conflict();
  }
  if (!res.ok) throw new Error(`push ${res.status}`);
  return (await res.json()).updateTime;
}

let inFlight = null;

/**
 * Sync now. `getDb` returns the live database (it can be
 * replaced wholesale by a backup restore while we wait). Resolves to
 * { ok, changed } — changed means something arrived from another device.
 */
export function syncNow(getDb, storage) {
  if (inFlight) return inFlight;
  inFlight = run(getDb, storage).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(getDb, storage) {
  const db0 = getDb();
  const code = db0.sync && db0.sync.code;
  if (!code) { setState({ status: 'off' }); return { ok: false }; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState({ status: 'offline' }); return { ok: false }; }
  setState({ status: 'syncing', error: null });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const db = getDb();
      const snapshot = clone(syncDoc(db));
      const base = db.sync.base || null;
      const remote = await pull(code);
      const merged = merge3(base, snapshot, remote ? remote.doc : null);
      const remoteSame = remote && JSON.stringify(remote.doc) === JSON.stringify(merged);
      try {
        if (!remoteSame) await push(code, merged, remote ? remote.updateTime : null);
      } catch (e) {
        if (e instanceof Conflict) continue; // someone else wrote first: merge again
        throw e;
      }
      // Fold in anything this device changed while we were talking to the cloud.
      const live = getDb();
      if (!live.sync || live.sync.code !== code) return { ok: false };
      const current = syncDoc(live);
      const final = JSON.stringify(current) === JSON.stringify(snapshot) ? merged : merge3(snapshot, current, merged);
      const changed = JSON.stringify(final) !== JSON.stringify(current);
      applyDoc(live, clone(final));
      live.sync = { ...live.sync, base: clone(merged), last: Date.now() };
      saveDB(live, storage);
      setState({ status: 'ok', last: live.sync.last });
      return { ok: true, changed };
    }
    throw new Error('Too many conflicts');
  } catch (e) {
    console.warn('sync failed', e);
    setState({ status: navigator.onLine === false ? 'offline' : 'error', error: String(e.message || e) });
    return { ok: false };
  }
}

// Does a family with this code exist in the cloud?
export async function familyExists(code) {
  return !!(await pull(code));
}
