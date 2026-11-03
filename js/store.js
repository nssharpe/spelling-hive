// Persistence and the data model. Everything lives in one localStorage key.
// All Pages apps on nssharpe.github.io share an origin, so the key is namespaced.
//
// db = {
//   v, profiles: [{id, name, avatar, u}], customWords: [Word], deleted: {wordId: ts},
//   deletedProfiles: {profileId: ts}, progress: {profileId: Progress},
//   settings: {sound, voice, rate},          // per device, never synced
//   sync: null | {code, base, last},         // cloud sync state (code = hub family code)
//   hub: null | {code, kid}                  // hub handoff (set by the app, per device)
// }
// Word     = { id, word, sentence?, definition?, grade: 5..12 | 'custom', u? }
//            (the built-in word bank is code, not data in db; only grown-up words live here)
// Progress = { cards: {cardId: Card}, grade: 5..12, placementDone, history: [{wordId, grade, firstTry, ts}]
//              (last 200), gradeChangedAt (ts of the last grade up/down), ticketUnits, stats: {attempted, firstTryRight}, days: {}, epoch }
// Card ids are `w:<wordId>`: one card per word (see session.js).

import { uid } from './util.js';
import { cardId } from './session.js';

export const STORAGE_KEY = 'spell-hive:v1';
export const DB_VERSION = 1;

export const MIN_GRADE = 5;
export const MAX_GRADE = 12;
export const HISTORY_MAX = 200;

export function clampGrade(g) {
  const n = Math.round(Number(g));
  if (!Number.isFinite(n)) return MIN_GRADE;
  return Math.max(MIN_GRADE, Math.min(MAX_GRADE, n));
}

export function newProgress() {
  return {
    cards: {},
    grade: MIN_GRADE,
    placementDone: false,
    gradeChangedAt: 0, // when the grade last moved; the grade-adaptation window starts after it
    history: [],
    ticketUnits: 0, // first-try-correct words not yet turned into hub tickets
    stats: { attempted: 0, firstTryRight: 0 },
    days: {},
    epoch: 0, // set when progress is reset, so sync knows the old progress is gone
  };
}

export function newProfile(name, avatar = '🐝') {
  return { id: uid('p-'), name: name.trim(), avatar, u: Date.now() };
}

export function defaultDB() {
  // Fixed ids (the hub's canonical kid ids) so the same kid on two devices merges cleanly.
  const profiles = [
    { id: 'zyler', name: 'Zyler', avatar: '🐝', u: 0 },
    { id: 'kadyn', name: 'Kadyn', avatar: '🍯', u: 0 },
  ];
  const progress = {};
  for (const p of profiles) progress[p.id] = newProgress();
  return {
    v: DB_VERSION,
    profiles,
    customWords: [],
    deleted: {},
    deletedProfiles: {},
    progress,
    settings: { sound: true, voice: null, rate: 0.9 },
    sync: null,
    hub: null,
    created: Date.now(),
  };
}

// Fill in anything missing from older saves so the rest of the app can assume
// the full shape.
export function migrate(db) {
  const base = defaultDB();
  const out = { ...base, ...db };
  out.v = DB_VERSION;
  out.customWords = Array.isArray(db.customWords) ? db.customWords : [];
  out.deleted = db.deleted || {};
  out.deletedProfiles = db.deletedProfiles || {};
  out.sync = db.sync || null;
  out.hub = db.hub || null;
  out.settings = { ...base.settings, ...(db.settings || {}) };
  out.profiles = (Array.isArray(db.profiles) ? db.profiles : base.profiles)
    .map(p => ({ avatar: '🐝', u: 0, ...p }));
  out.progress = {};
  for (const p of out.profiles) {
    const fresh = newProgress();
    const old = (db.progress || {})[p.id] || {};
    out.progress[p.id] = {
      ...fresh, ...old,
      cards: old.cards || {},
      grade: clampGrade(old.grade ?? fresh.grade),
      history: Array.isArray(old.history) ? old.history : [],
      days: old.days || {},
      stats: { ...fresh.stats, ...(old.stats || {}) },
    };
  }
  return out;
}

export function loadDB(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return defaultDB();
}

export function saveDB(db, storage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}

// ---------- kids ----------

export function addProfile(db, name, avatar) {
  const p = newProfile(name, avatar);
  db.profiles.push(p);
  db.progress[p.id] = newProgress();
  return p;
}

export function removeProfile(db, id) {
  db.profiles = db.profiles.filter(p => p.id !== id);
  db.deletedProfiles = { ...(db.deletedProfiles || {}), [id]: Date.now() };
  delete db.progress[id];
}

export function resetProgress(db, id) {
  db.progress[id] = { ...newProgress(), epoch: Date.now() };
}

// ---------- grown-up (custom) words ----------

export function upsertCustomWord(db, word) {
  const i = db.customWords.findIndex(w => w.id === word.id);
  const w = { ...word, u: Date.now() };
  if (i >= 0) db.customWords[i] = w; else db.customWords.push(w);
  delete db.deleted[w.id];
  return w;
}

export function deleteCustomWord(db, id) {
  db.customWords = db.customWords.filter(w => w.id !== id);
  db.deleted[id] = Date.now();
  for (const pid of Object.keys(db.progress)) delete db.progress[pid].cards[cardId(id)];
}
