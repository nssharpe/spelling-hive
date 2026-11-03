// Cloud sync: a three-way merge between the last synced copy (base), this
// device (local) and the cloud (remote). Pure functions, no network.
//
// Why three-way: a plain "take the max" merge lets units that were already turned
// into hub tickets come back by syncing with another device, and loses work done
// on two devices at once. With the base we know what each side *changed*:
//   counters (ticketUnits, stats, per-day numbers)   remote + (local − base)
//   single values (grade, kid names/avatars)         whichever side changed (local wins a tie)
//   flashcards                                       the most recent review (`last`) wins
//   history                                          union by (wordId, ts), newest 200
//   custom words                                     last writer (`u`) wins, tombstones in `deleted`
//
// The synced document is everything except per-device settings (sound, voice, rate)
// and the hub handoff.

import { newProgress, HISTORY_MAX } from './store.js';
import { wordIdOf } from './session.js';

export { HISTORY_MAX };
export const SYNC_VERSION = 1;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The part of the database that travels between devices.
export function syncDoc(db) {
  return {
    v: SYNC_VERSION,
    customWords: db.customWords,
    deleted: db.deleted || {},
    profiles: db.profiles,
    deletedProfiles: db.deletedProfiles || {},
    progress: db.progress,
  };
}

// Replace an object's contents but keep the object itself: open screens hold
// references to a kid's profile and progress and keep writing to them.
function refill(target, source) {
  for (const k of Object.keys(target)) delete target[k];
  return Object.assign(target, source);
}

// Put a merged document back into the database, keeping device settings.
export function applyDoc(db, doc) {
  db.customWords = doc.customWords;
  db.deleted = doc.deleted;
  db.deletedProfiles = doc.deletedProfiles;
  const oldProfiles = new Map((db.profiles || []).map(p => [p.id, p]));
  db.profiles = doc.profiles.map(p => (oldProfiles.has(p.id) ? refill(oldProfiles.get(p.id), p) : p));
  const oldProgress = db.progress || {};
  const progress = {};
  for (const [id, pr] of Object.entries(doc.progress)) progress[id] = oldProgress[id] ? refill(oldProgress[id], pr) : pr;
  db.progress = progress;
  return db;
}

// One value that either side may have changed. Without a base (first sync on
// a device) the family's copy wins.
function pick(hasBase, b, l, r) {
  if (!hasBase) return r === undefined ? l : r;
  return same(l, b) ? (r === undefined ? l : r) : l;
}

function count(b, l, r) {
  return (r || 0) + ((l || 0) - (b || 0));
}

const COUNTERS = ['attempted', 'firstTryRight'];

function mergeDays(b = {}, l = {}, r = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const bd = b[k] || {}, ld = l[k] || {}, rd = r[k] || {};
    const d = {};
    for (const f of new Set([...Object.keys(ld), ...Object.keys(rd)])) {
      const v = ld[f] ?? rd[f];
      if (typeof v === 'number') d[f] = Math.max(0, count(bd[f], ld[f], rd[f]));
      else if (typeof v === 'boolean') d[f] = !!ld[f] || !!rd[f];
      else d[f] = ld[f] ?? rd[f];
    }
    out[k] = d;
  }
  return out;
}

// Attempt log: union by (wordId, ts), oldest first, newest HISTORY_MAX kept.
function mergeHistory(l = [], r = []) {
  const seen = new Map();
  for (const e of [...r, ...l]) seen.set(`${e.wordId}\u0000${e.ts}`, e);
  return [...seen.values()].sort((a, b) => (a.ts - b.ts) || String(a.wordId).localeCompare(String(b.wordId))).slice(-HISTORY_MAX);
}

export function mergeProgress3(base, local, remote) {
  const l = local || newProgress();
  const r = remote || newProgress();
  // A reset starts a new "epoch": the newest reset wins outright.
  if ((l.epoch || 0) !== (r.epoch || 0)) return JSON.parse(JSON.stringify((l.epoch || 0) > (r.epoch || 0) ? l : r));
  const hasBase = !!base && (base.epoch || 0) === (l.epoch || 0);
  const b = hasBase ? base : newProgress();

  const out = newProgress();
  out.epoch = l.epoch || 0;

  // Flashcards: the most recent review wins.
  for (const id of new Set([...Object.keys(l.cards || {}), ...Object.keys(r.cards || {})])) {
    const lc = (l.cards || {})[id], rc = (r.cards || {})[id];
    out.cards[id] = !rc ? lc : !lc ? rc : ((lc.last || 0) >= (rc.last || 0) ? lc : rc);
  }

  out.grade = pick(hasBase, b.grade, l.grade, r.grade) ?? out.grade;
  // A single value, like grade: the side that changed it since the last sync wins, so a grown-up's
  // "Run placement again" (true -> false) isn't undone by the other device. With no base (first
  // join) neither side has "changed" anything, so finishing placement anywhere counts.
  out.placementDone = hasBase ? !!pick(true, !!b.placementDone, !!l.placementDone, !!r.placementDone) : !!(l.placementDone || r.placementDone);
  out.gradeChangedAt = Math.max(l.gradeChangedAt || 0, r.gradeChangedAt || 0); // keeps the adaptation window across syncs
  out.history = mergeHistory(l.history, r.history);
  out.ticketUnits = Math.max(0, count(b.ticketUnits, l.ticketUnits, r.ticketUnits));

  const bst = b.stats || {}, lst = l.stats || {}, rst = r.stats || {};
  for (const k of COUNTERS) out.stats[k] = Math.max(0, count(bst[k], lst[k], rst[k]));

  out.days = mergeDays(b.days, l.days, r.days);
  return out;
}

// Custom words: the newest edit (`u`) wins, a tombstone beats anything older than it.
function mergeWords(b, l, r, deleted) {
  const byId = new Map();
  for (const w of [...r.customWords, ...l.customWords]) {
    const cur = byId.get(w.id);
    if (!cur || (w.u || 0) > (cur.u || 0) || ((w.u || 0) === (cur.u || 0) && l.customWords.includes(w))) byId.set(w.id, w);
  }
  const alive = w => !(w.id in deleted) || (w.u || 0) > deleted[w.id];
  // Order: if this device reordered since the last sync, keep its order.
  const ids = list => list.map(w => w.id);
  const order = b && !same(ids(l.customWords), ids(b.customWords)) ? ids(l.customWords) : ids(r.customWords);
  const out = [];
  const seen = new Set();
  for (const id of [...order, ...ids(r.customWords), ...ids(l.customWords)]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const w = byId.get(id);
    if (w && alive(w)) out.push(w);
  }
  return out;
}

/**
 * Merge three copies of the synced document. `base` may be null (this device
 * has never synced). Returns a new document.
 */
export function merge3(base, local, remote) {
  if (!remote) return JSON.parse(JSON.stringify(local));
  const hasBase = !!base;
  const b = base || { customWords: [], deleted: {}, profiles: [], deletedProfiles: {}, progress: {} };

  const deleted = { ...remote.deleted };
  for (const [id, t] of Object.entries(local.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const deletedProfiles = { ...remote.deletedProfiles };
  for (const [id, t] of Object.entries(local.deletedProfiles || {})) deletedProfiles[id] = Math.max(deletedProfiles[id] || 0, t);

  const customWords = mergeWords(hasBase ? b : null, local, remote, deleted);
  const wordIds = new Set(customWords.map(w => w.id));

  // Kids. One created separately on two devices with the same name is one kid.
  const localProfiles = local.profiles.map(p => ({ ...p }));
  const localProgress = { ...local.progress };
  for (const p of localProfiles) {
    if (remote.profiles.some(q => q.id === p.id)) continue;
    const twin = remote.profiles.find(q => q.name.trim().toLowerCase() === p.name.trim().toLowerCase() && !local.profiles.some(x => x.id === q.id));
    if (twin && !b.profiles.some(q => q.id === p.id)) {
      localProgress[twin.id] = localProgress[p.id];
      delete localProgress[p.id];
      p.id = twin.id;
    }
  }
  const profiles = [];
  const progress = {};
  const order = [...remote.profiles.map(p => p.id), ...localProfiles.map(p => p.id)];
  for (const id of new Set(order)) {
    if (id in deletedProfiles) continue;
    const lp = localProfiles.find(p => p.id === id), rp = remote.profiles.find(p => p.id === id), bp = b.profiles.find(p => p.id === id);
    if (!lp || !rp) {
      // Only on one side. Removals leave a tombstone, so a missing kid here is simply new.
      profiles.push({ ...(lp || rp) });
      progress[id] = JSON.parse(JSON.stringify((lp ? localProgress : remote.progress)[id] || newProgress()));
      continue;
    }
    const pHas = hasBase && !!bp;
    profiles.push({
      ...rp, ...lp,
      name: pick(pHas, bp && bp.name, lp.name, rp.name),
      avatar: pick(pHas, bp && bp.avatar, lp.avatar, rp.avatar),
    });
    progress[id] = mergeProgress3(pHas ? b.progress[id] : null, localProgress[id], remote.progress[id]);
  }

  // Drop progress on custom words that were deleted. (Built-in bank words are not in
  // customWords, so only ids with a tombstone are dropped — never "ids we don't know".)
  for (const prog of Object.values(progress)) {
    for (const cid of Object.keys(prog.cards || {})) {
      const wid = wordIdOf(cid);
      if (wid in deleted && !wordIds.has(wid)) delete prog.cards[cid];
    }
  }

  return { v: SYNC_VERSION, customWords, deleted, profiles, deletedProfiles, progress };
}

// The hub's family code (hub-xxxxx-xxxxx-xxxxx-xxxxx) is the Firestore document id
// and the only secret, so it has to be the long random one the hub made.
export function isHubCode(s) {
  return /^hub-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/.test(String(s || '').trim());
}
