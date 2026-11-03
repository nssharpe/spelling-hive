import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, checkSpelling, recordAttempt, buildSpellingQueue } from '../js/spell.js';
import { newProgress, HISTORY_MAX } from '../js/store.js';
import { newCard } from '../js/srs.js';
import { cardId } from '../js/session.js';
import { DAY, HOUR } from '../js/util.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime();
const kinds = d => d.map(x => x.kind);

test('normalize lowercases, trims, and maps curly apostrophes and hyphen variants', () => {
  assert.equal(normalize('  Don’t  '), "don't");
  assert.equal(normalize('‘a’'), "'a'");
  assert.equal(normalize('well‐known'), 'well-known');
  assert.equal(normalize('well–known'), 'well-known');
  assert.equal(normalize('well—known'), 'well-known');
  assert.equal(normalize('well‑known'), 'well-known');
});

test('normalize forgives nothing else', () => {
  assert.notEqual(normalize('cafe'), normalize('café'));
  assert.notEqual(normalize('a b'), normalize('ab'));
});

test('checkSpelling ignores case and surrounding spaces', () => {
  const r = checkSpelling(' Necessary ', 'necessary');
  assert.equal(r.ok, true);
  assert.ok(r.diff.every(d => d.kind === 'same'));
  assert.equal(r.diff.map(d => d.ch).join(''), 'necessary');
});

test('checkSpelling: one extra letter is a single extra entry', () => {
  const r = checkSpelling('neccessary', 'necessary');
  assert.equal(r.ok, false);
  const extra = r.diff.filter(d => d.kind === 'extra');
  assert.equal(extra.length, 1);
  assert.equal(extra[0].ch, 'c');
  assert.equal(r.diff.filter(d => d.kind !== 'same' && d.kind !== 'extra').length, 0);
});

test('checkSpelling: transposed letters are both marked wrong', () => {
  const r = checkSpelling('recieve', 'receive');
  assert.equal(r.ok, false);
  assert.deepEqual(kinds(r.diff), ['same', 'same', 'same', 'wrong', 'wrong', 'same', 'same']);
  assert.deepEqual(r.diff.filter(d => d.kind === 'wrong').map(d => d.ch), ['e', 'i']); // the target's letters
});

test('checkSpelling: a missing letter is marked missing, in order', () => {
  const r = checkSpelling('necesary', 'necessary');
  assert.equal(r.ok, false);
  assert.equal(r.diff.filter(d => d.kind === 'missing').length, 1);
  assert.equal(r.diff.filter(d => d.kind === 'missing')[0].ch, 's');
  // Walking the diff without 'extra' entries spells the target.
  assert.equal(r.diff.filter(d => d.kind !== 'extra').map(d => d.ch).join(''), 'necessary');
});

test('checkSpelling: empty input is all missing', () => {
  const r = checkSpelling('', 'cat');
  assert.equal(r.ok, false);
  assert.deepEqual(kinds(r.diff), ['missing', 'missing', 'missing']);
});

test('checkSpelling: curly apostrophe and hyphen variants are accepted', () => {
  assert.equal(checkSpelling('don’t', "don't").ok, true);
  assert.equal(checkSpelling('well‐known', 'well-known').ok, true);
  assert.equal(checkSpelling('well–known', 'well-known').ok, true);
});

test('checkSpelling: accents and inner spaces are not forgiven', () => {
  assert.equal(checkSpelling('cafe', 'café').ok, false);
  assert.equal(checkSpelling('ice cream', 'icecream').ok, false);
});

test('recordAttempt: a miss, then a correct answer the same day, is not first-try', () => {
  const prog = newProgress();
  assert.equal(recordAttempt(prog, 'g5-believe', false, T0).firstTry, false);
  assert.equal(recordAttempt(prog, 'g5-believe', true, T0 + HOUR).firstTry, false);
  assert.equal(prog.history.length, 2);
  assert.equal(prog.history[1].firstTry, false);
});

test('recordAttempt: a correct answer the next day is first-try again', () => {
  const prog = newProgress();
  recordAttempt(prog, 'g5-believe', false, T0);
  assert.equal(recordAttempt(prog, 'g5-believe', true, T0 + DAY).firstTry, true);
});

test('recordAttempt: a correct first attempt is first-try; other words are unaffected by a miss', () => {
  const prog = newProgress();
  recordAttempt(prog, 'g5-believe', false, T0);
  assert.equal(recordAttempt(prog, 'g5-library', true, T0 + 1).firstTry, true);
});

test('recordAttempt: sets card.miss on a miss (creating the card), keeps existing card fields', () => {
  const prog = newProgress();
  recordAttempt(prog, 'g5-believe', false, T0);
  const c = prog.cards[cardId('g5-believe')];
  assert.equal(c.state, 'new');
  assert.match(c.miss, /^\d{4}-\d{2}-\d{2}$/);
  prog.cards[cardId('g5-library')] = { ...newCard(), state: 'review', ivl: 6, due: T0 };
  recordAttempt(prog, 'g5-library', false, T0);
  assert.equal(prog.cards[cardId('g5-library')].state, 'review');
  assert.equal(prog.cards[cardId('g5-library')].ivl, 6);
  assert.ok(prog.cards[cardId('g5-library')].miss);
});

test('recordAttempt: history entry has the word grade (built-in) or prog.grade (custom), and stats update', () => {
  const prog = newProgress();
  prog.grade = 7;
  recordAttempt(prog, 'g5-believe', true, T0);
  recordAttempt(prog, 'c-custom1', true, T0 + 1);
  recordAttempt(prog, 'c-custom1', false, T0 + 2);
  assert.deepEqual(prog.history[0], { wordId: 'g5-believe', grade: 5, firstTry: true, ts: T0 });
  assert.equal(prog.history[1].grade, 7);
  assert.deepEqual(prog.stats, { attempted: 3, firstTryRight: 2 });
});

test('recordAttempt: history is capped at the last 200', () => {
  const prog = newProgress();
  for (let i = 0; i < HISTORY_MAX + 15; i++) recordAttempt(prog, 'c-x' + i, true, T0 + i);
  assert.equal(prog.history.length, HISTORY_MAX);
  assert.equal(prog.history[0].wordId, 'c-x15');
});

test('recordAttempt does not schedule the card', () => {
  const prog = newProgress();
  recordAttempt(prog, 'g5-believe', true, T0);
  assert.equal(prog.cards[cardId('g5-believe')], undefined);
});

// ---------- queue ----------

const words = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `g5-w${i}`, word: `w${i}`, grade: 5 })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `g6-w${i}`, word: `v${i}`, grade: 6 })),
  { id: 'c-1', word: 'custom1', grade: 'custom' },
  { id: 'c-2', word: 'custom2', grade: 'custom' },
];
const rev = (due, extra = {}) => ({ ...newCard(), state: 'review', ivl: 3, due, ...extra });

test('queue: due reviews first (by due), then custom unseen, then new words of the grade', () => {
  const prog = newProgress();
  prog.grade = 5;
  prog.cards[cardId('g5-w3')] = rev(T0 - DAY);
  prog.cards[cardId('g5-w1')] = rev(T0 - 3 * DAY);
  prog.cards[cardId('g6-w0')] = { ...newCard(), state: 'learning', due: T0 - 1000 };
  prog.cards[cardId('g5-w2')] = rev(T0 + DAY); // not due yet
  const q = buildSpellingQueue(prog, words, T0, 100);
  assert.deepEqual(q.slice(0, 5), ['w:g5-w1', 'w:g5-w3', 'w:g6-w0', 'w:c-1', 'w:c-2']);
  assert.deepEqual(q.slice(5, 8), ['w:g5-w0', 'w:g5-w4', 'w:g5-w5']); // grade 5 new, bank order, seen ones skipped
  assert.ok(!q.slice(0, 8).includes('w:g6-w1')); // other grades' new words never appear
  assert.equal(q[q.length - 1], 'w:g5-w2'); // then the not-yet-due card, oldest-due first
  assert.equal(new Set(q).size, q.length);
  assert.equal(q.length, 9);
});

test('queue: size is respected and defaults to 15', () => {
  const prog = newProgress();
  for (let i = 0; i < 4; i++) prog.cards[cardId(`g5-w${i}`)] = rev(T0 - DAY);
  assert.equal(buildSpellingQueue(prog, words, T0, 5).length, 5);
  assert.deepEqual(buildSpellingQueue(prog, words, T0, 2), ['w:g5-w0', 'w:g5-w1']);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `g5-m${i}`, word: `m${i}`, grade: 5 }));
  assert.equal(buildSpellingQueue(newProgress(), many, T0).length, 15);
});

test('queue: when new words run out, the oldest-due reviews of any grade fill in', () => {
  const prog = newProgress();
  prog.grade = 6;
  for (const w of words) prog.cards[cardId(w.id)] = rev(T0 + (w.id === 'g5-w0' ? 5 : 1) * DAY);
  prog.cards[cardId('g5-w1')] = rev(T0 + 2 * HOUR);
  const q = buildSpellingQueue(prog, words, T0, 4);
  assert.equal(q.length, 4);
  assert.equal(q[0], 'w:g5-w1');
  assert.ok(!q.includes('w:g5-w0')); // furthest-out card is last
});

test('queue: only offers words that are in the available list', () => {
  const prog = newProgress();
  prog.cards['w:c-deleted'] = rev(T0 - DAY);
  assert.ok(!buildSpellingQueue(prog, words, T0).includes('w:c-deleted'));
});

test('queue: empty word list gives an empty queue', () => {
  assert.deepEqual(buildSpellingQueue(newProgress(), [], T0), []);
});
