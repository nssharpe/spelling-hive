import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDB, newProgress, migrate, loadDB, saveDB, upsertCustomWord, deleteCustomWord,
  addProfile, removeProfile, resetProgress, STORAGE_KEY,
} from '../js/store.js';
import { newCard } from '../js/srs.js';

function memStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m };
}

test('default data has Zyler and Kadyn at grade 5, no custom words, and a namespaced key', () => {
  const db = defaultDB();
  assert.equal(STORAGE_KEY, 'spelling-hive:v1');
  assert.deepEqual(db.profiles.map(p => p.id), ['zyler', 'kadyn']);
  assert.deepEqual(db.profiles.map(p => p.name), ['Zyler', 'Kadyn']);
  for (const p of db.profiles) {
    const pr = db.progress[p.id];
    assert.equal(pr.grade, 5);
    assert.equal(pr.placementDone, false);
    assert.deepEqual(pr.history, []);
    assert.equal(pr.ticketUnits, 0);
    assert.deepEqual(pr.stats, { attempted: 0, firstTryRight: 0 });
    assert.deepEqual(pr.cards, {});
  }
  assert.deepEqual(db.customWords, []);
  assert.deepEqual(db.deleted, {});
  assert.equal(db.sync, null);
  assert.equal(db.hub, null);
  assert.deepEqual(Object.keys(db.settings).sort(), ['rate', 'sound', 'voice']);
});

test('save and load round-trip; garbage falls back to defaults', () => {
  const s = memStorage();
  const db = defaultDB();
  db.progress.zyler.grade = 8;
  assert.equal(saveDB(db, s), true);
  assert.ok(s._m.has('spelling-hive:v1'));
  assert.equal(loadDB(s).progress.zyler.grade, 8);
  s.setItem(STORAGE_KEY, '{not json');
  assert.equal(loadDB(s).progress.zyler.grade, 5);
});

test('migrate fills in fields missing from older saves and clamps a bad grade', () => {
  const db = migrate({ profiles: [{ id: 'x1', name: 'A' }], progress: { x1: { grade: 99, stats: { attempted: 4 } } } });
  assert.equal(db.progress.x1.stats.attempted, 4);
  assert.equal(db.progress.x1.stats.firstTryRight, 0);
  assert.equal(db.progress.x1.grade, 12);
  assert.deepEqual(db.progress.x1.history, []);
  assert.deepEqual(db.customWords, []);
  assert.equal(typeof db.profiles[0].avatar, 'string');
  assert.equal(migrate({ profiles: [{ id: 'y', name: 'Y' }], progress: { y: { grade: 'abc' } } }).progress.y.grade, 5);
});

test('custom words: edit keeps progress, delete removes its card and leaves a tombstone', () => {
  const db = defaultDB();
  const w = upsertCustomWord(db, { id: 'c-1', word: 'rhythm', grade: 'custom' });
  assert.equal(db.customWords.length, 1);
  assert.ok(w.u > 0);
  db.progress.zyler.cards['w:c-1'] = { ...newCard(), state: 'review', ivl: 4 };
  upsertCustomWord(db, { ...w, sentence: 'The drum set the rhythm.' });
  assert.equal(db.customWords.length, 1);
  assert.equal(db.customWords[0].sentence, 'The drum set the rhythm.');
  assert.equal(db.progress.zyler.cards['w:c-1'].ivl, 4);
  deleteCustomWord(db, 'c-1');
  assert.equal(db.customWords.length, 0);
  assert.equal(db.progress.zyler.cards['w:c-1'], undefined);
  assert.ok(db.deleted['c-1'] > 0);
  upsertCustomWord(db, { id: 'c-1', word: 'rhythm', grade: 'custom' }); // re-adding clears the tombstone
  assert.equal(db.deleted['c-1'], undefined);
});

test('profiles: add, remove (tombstone) and reset progress (new epoch)', () => {
  const db = defaultDB();
  const p = addProfile(db, '  Mamou ', '🦉');
  assert.equal(p.name, 'Mamou');
  assert.equal(db.progress[p.id].grade, 5);
  removeProfile(db, 'kadyn');
  assert.deepEqual(db.profiles.map(x => x.id), ['zyler', p.id]);
  assert.ok(db.deletedProfiles.kadyn > 0);
  assert.equal(db.progress.kadyn, undefined);
  db.progress.zyler.grade = 9;
  resetProgress(db, 'zyler');
  assert.equal(db.progress.zyler.grade, 5);
  assert.ok(db.progress.zyler.epoch > 0);
  assert.equal(newProgress().epoch, 0);
});
