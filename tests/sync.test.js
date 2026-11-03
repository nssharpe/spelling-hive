import test from 'node:test';
import assert from 'node:assert/strict';
import { merge3, syncDoc, applyDoc, isHubCode, HISTORY_MAX } from '../js/sync.js';
import { defaultDB, upsertCustomWord, deleteCustomWord, removeProfile, resetProgress, addProfile } from '../js/store.js';
import { newCard } from '../js/srs.js';

const clone = x => JSON.parse(JSON.stringify(x));
const hist = (wordId, ts, firstTry = true) => ({ wordId, grade: 5, firstTry, ts });

// Two devices that have synced once: both start from the same base.
function twoDevices() {
  const base = syncDoc(defaultDB());
  return { base: clone(base), a: clone(base), b: clone(base) };
}

test('first sync with an empty cloud uploads this device as-is', () => {
  const local = syncDoc(defaultDB());
  assert.deepEqual(merge3(null, local, null), local);
});

test('two devices practice different words and both cards merge', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.cards['w:g5-believe'] = { ...newCard(), state: 'learning', last: 100 };
  b.progress.zyler.cards['w:g5-library'] = { ...newCard(), state: 'review', ivl: 2, last: 150 };
  const m = merge3(base, a, b);
  assert.equal(m.progress.zyler.cards['w:g5-believe'].state, 'learning');
  assert.equal(m.progress.zyler.cards['w:g5-library'].ivl, 2);
  assert.equal(Object.keys(m.progress.zyler.cards).length, 2);
});

test('the most recent review of the same card wins, whichever side is local', () => {
  const { base, a, b } = twoDevices();
  a.progress.kadyn.cards['w:g5-believe'] = { ...newCard(), state: 'review', ivl: 3, last: 200 };
  b.progress.kadyn.cards['w:g5-believe'] = { ...newCard(), state: 'learning', last: 100 };
  assert.equal(merge3(base, b, a).progress.kadyn.cards['w:g5-believe'].ivl, 3);
  assert.equal(merge3(base, a, b).progress.kadyn.cards['w:g5-believe'].ivl, 3);
});

test('ticketUnits add up as remote + (local - base)', () => {
  const { base, a, b } = twoDevices();
  base.progress.zyler.ticketUnits = 2;
  a.progress.zyler.ticketUnits = 2 + 4; // A earned 4 more units
  b.progress.zyler.ticketUnits = 2 + 1; // B earned 1
  assert.equal(merge3(base, a, b).progress.zyler.ticketUnits, 7);
});

test('units turned into tickets on one device are not restored by the other', () => {
  const { base } = twoDevices();
  base.progress.kadyn.ticketUnits = 5;
  const a = clone(base), b = clone(base);
  a.progress.kadyn.ticketUnits = 2; // A turned 3 units into a ticket
  const m = merge3(base, a, b);
  assert.equal(m.progress.kadyn.ticketUnits, 2);
  assert.equal(merge3(m, clone(m), clone(m)).progress.kadyn.ticketUnits, 2);
});

test('stats and day counters add up', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.stats = { attempted: 10, firstTryRight: 8 };
  b.progress.zyler.stats = { attempted: 5, firstTryRight: 1 };
  a.progress.zyler.days['2026-11-03'] = { attempted: 10, firstTry: 8 };
  b.progress.zyler.days['2026-11-03'] = { attempted: 5, firstTry: 1 };
  const m = merge3(base, a, b).progress.zyler;
  assert.deepEqual(m.stats, { attempted: 15, firstTryRight: 9 });
  assert.deepEqual(m.days['2026-11-03'], { attempted: 15, firstTry: 9 });
});

test('history is the union by (wordId, ts), oldest dropped beyond 200', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.history = [hist('x', 1), hist('y', 2)];
  b.progress.zyler.history = [hist('y', 2), hist('z', 3)];
  const m = merge3(base, a, b).progress.zyler.history;
  assert.deepEqual(m.map(e => e.wordId + e.ts), ['x1', 'y2', 'z3']);

  assert.equal(HISTORY_MAX, 200);
  a.progress.zyler.history = Array.from({ length: 150 }, (_, i) => hist('a', 1000 + i));
  b.progress.zyler.history = Array.from({ length: 150 }, (_, i) => hist('b', 2000 + i));
  const big = merge3(base, a, b).progress.zyler.history;
  assert.equal(big.length, 200);
  assert.equal(big[0].ts, 1100); // the 100 oldest of A's 300 combined entries are gone
  assert.equal(big[big.length - 1].ts, 2149);
});

test('the same history entry on both sides is counted once', () => {
  const { base, a, b } = twoDevices();
  const e = hist('x', 5, false);
  a.progress.kadyn.history = [e, hist('y', 6)];
  b.progress.kadyn.history = [{ ...e }];
  assert.equal(merge3(base, a, b).progress.kadyn.history.length, 2);
});

test('grade: the side that changed wins; the family wins on first join', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.grade = 7;
  b.progress.kadyn.grade = 6;
  const m = merge3(base, a, b);
  assert.equal(m.progress.zyler.grade, 7);
  assert.equal(m.progress.kadyn.grade, 6);
  const j = merge3(null, syncDoc(defaultDB()), m);
  assert.equal(j.progress.zyler.grade, 7);
  assert.equal(j.progress.kadyn.grade, 6);
});

test('gradeChangedAt survives a merge (latest wins), so the grade window is not lost', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.gradeChangedAt = 500;
  b.progress.zyler.gradeChangedAt = 900;
  assert.equal(merge3(base, a, b).progress.zyler.gradeChangedAt, 900);
  assert.equal(merge3(base, a, clone(base)).progress.zyler.gradeChangedAt, 500);
});

test('placementDone is a single value: whoever changed it since the last sync wins, in both directions', () => {
  // finished on B (false -> true), A untouched: true, whichever side is "local"
  let { base, a, b } = twoDevices();
  b.progress.zyler.placementDone = true;
  assert.equal(merge3(base, a, b).progress.zyler.placementDone, true);
  assert.equal(merge3(base, b, a).progress.zyler.placementDone, true);
  // "Run placement again" on A (true -> false), B untouched: false, and sync doesn't revert it
  ({ base, a, b } = twoDevices());
  base.progress.zyler.placementDone = a.progress.zyler.placementDone = b.progress.zyler.placementDone = true;
  a.progress.zyler.placementDone = false;
  assert.equal(merge3(base, a, b).progress.zyler.placementDone, false);
  assert.equal(merge3(base, b, a).progress.zyler.placementDone, false);
});

test('placementDone with no base (first join): finished on either side counts', () => {
  const { a, b } = twoDevices();
  b.progress.zyler.placementDone = true;
  assert.equal(merge3(null, a, b).progress.zyler.placementDone, true);
  assert.equal(merge3(null, b, a).progress.zyler.placementDone, true);
});

test('a custom word deleted on A stays deleted, even though B still has it and its progress', () => {
  const dbA = defaultDB();
  upsertCustomWord(dbA, { id: 'c-1', word: 'rhythm', grade: 'custom' });
  const synced = syncDoc(dbA);
  const base = clone(synced);
  const dbB = applyDoc(defaultDB(), clone(synced));
  deleteCustomWord(dbA, 'c-1');
  dbB.progress.zyler.cards['w:c-1'] = { ...newCard(), state: 'review', last: Date.now() };
  const m = merge3(base, syncDoc(dbA), syncDoc(dbB));
  assert.equal(m.customWords.find(w => w.id === 'c-1'), undefined);
  assert.equal(m.progress.zyler.cards['w:c-1'], undefined);
  assert.ok(m.deleted['c-1']);
  // and it stays gone on the next round, from either side
  assert.equal(merge3(m, clone(m), syncDoc(dbB)).customWords.length, 0);
  assert.equal(merge3(m, syncDoc(dbB), clone(m)).customWords.length, 0);
});

test('custom word edits are last-writer-wins by u; new words travel; built-in word cards are kept', () => {
  const db0 = defaultDB();
  upsertCustomWord(db0, { id: 'c-1', word: 'rhythm', grade: 'custom' });
  const base = clone(syncDoc(db0));
  const a = clone(base), b = clone(base);
  a.customWords[0] = { ...a.customWords[0], sentence: 'Old.', u: 100 };
  b.customWords[0] = { ...b.customWords[0], sentence: 'Newer.', u: 500 };
  b.customWords.push({ id: 'c-2', word: 'queue', grade: 'custom', u: 600 });
  b.progress.kadyn.cards['w:g8-queue'] = { ...newCard(), state: 'review', last: 5 }; // a built-in word has no entry in customWords
  const m = merge3(base, a, b);
  assert.equal(m.customWords.find(x => x.id === 'c-1').sentence, 'Newer.');
  assert.ok(m.customWords.find(x => x.id === 'c-2'));
  assert.ok(m.progress.kadyn.cards['w:g8-queue'], 'cards for built-in words are not dropped');
});

test('a removed player stays removed; a new player appears everywhere', () => {
  const { base, a, b } = twoDevices();
  const dbA = applyDoc(defaultDB(), a);
  removeProfile(dbA, 'kadyn');
  const dbB = applyDoc(defaultDB(), b);
  const p = addProfile(dbB, 'Mamou', '🦉');
  dbB.progress[p.id].ticketUnits = 3;
  const m = merge3(base, syncDoc(dbA), syncDoc(dbB));
  assert.deepEqual(m.profiles.map(x => x.name), ['Zyler', 'Mamou']);
  assert.equal(m.progress[p.id].ticketUnits, 3);
  assert.equal(m.progress.kadyn, undefined);
});

test('a progress reset on one device wins over old progress elsewhere', () => {
  const { base, a, b } = twoDevices();
  b.progress.zyler.ticketUnits = 9;
  b.progress.zyler.grade = 10;
  const dbA = applyDoc(defaultDB(), a);
  resetProgress(dbA, 'zyler');
  const m = merge3(base, syncDoc(dbA), b);
  assert.equal(m.progress.zyler.ticketUnits, 0);
  assert.equal(m.progress.zyler.grade, 5);
  assert.ok(m.progress.zyler.epoch > 0);
});

test('a fresh device joining takes the family progress without doubling it', () => {
  const fam = syncDoc(defaultDB());
  fam.progress.zyler.ticketUnits = 7;
  fam.progress.zyler.stats = { attempted: 300, firstTryRight: 250 };
  const j = merge3(null, syncDoc(defaultDB()), fam);
  assert.equal(j.progress.zyler.ticketUnits, 7);
  assert.deepEqual(j.progress.zyler.stats, { attempted: 300, firstTryRight: 250 });
});

test('syncing is idempotent', () => {
  const { base, a, b } = twoDevices();
  a.progress.zyler.ticketUnits = 5;
  b.progress.kadyn.stats.attempted = 7;
  a.progress.zyler.history = [hist('q', 9)];
  const m = merge3(base, a, b);
  assert.deepEqual(merge3(m, clone(m), clone(m)), m);
});

test('hub family codes are recognized', () => {
  assert.ok(isHubCode('hub-abcde-fghjk-23456-mnpqr'));
  assert.ok(isHubCode(' hub-abcde-fghjk-23456-mnpqr '));
  assert.ok(!isHubCode('hub-abc'));
  assert.ok(!isHubCode('mamou-abcde-fghjk-23456-mnpqr'));
  assert.ok(!isHubCode(null));
});

test('the synced document leaves out per-device settings and the hub handoff', () => {
  const db = defaultDB();
  db.settings.voice = 'Samantha';
  db.hub = { code: 'hub-abcde-fghjk-23456-mnpqr', kid: 'zyler' };
  const doc = syncDoc(db);
  assert.equal(JSON.stringify(doc).includes('Samantha'), false);
  assert.equal('settings' in doc, false);
  assert.equal('hub' in doc, false);
});

test('applying a sync keeps the same progress and profile objects screens are holding', () => {
  const db = defaultDB();
  const held = db.progress.zyler;
  const heldProfile = db.profiles[0];
  const doc = syncDoc(defaultDB());
  doc.progress.zyler.ticketUnits = 4;
  doc.profiles[0].avatar = '🦄';
  applyDoc(db, clone(doc));
  assert.equal(db.progress.zyler, held);
  assert.equal(held.ticketUnits, 4);
  assert.equal(db.profiles[0], heldProfile);
  assert.equal(heldProfile.avatar, '🦄');
  held.ticketUnits += 1; // a screen writing after the sync
  assert.equal(db.progress.zyler.ticketUnits, 5);
});
