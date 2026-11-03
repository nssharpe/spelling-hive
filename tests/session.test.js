import test from 'node:test';
import assert from 'node:assert/strict';
import { todayPlan, buildQueue, Session, cardId, wordIdOf, today } from '../js/session.js';
import { newProgress } from '../js/store.js';
import { schedule, GOOD, AGAIN, newCard } from '../js/srs.js';
import { MIN, DAY } from '../js/util.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime();
const words = Array.from({ length: 12 }, (_, i) => ({ id: `g5-w${i}`, word: `w${i}`, grade: 5 }));
const rng = () => 0.5;

test('one card per word, with id w:<wordId>', () => {
  assert.equal(cardId('g5-believe'), 'w:g5-believe');
  assert.equal(wordIdOf('w:g5-believe'), 'g5-believe');
  assert.equal(wordIdOf(cardId('c-ab:cd')), 'c-ab:cd');
});

test('a fresh kid gets the daily allowance of new cards and nothing due', () => {
  const plan = todayPlan(newProgress(), words, T0, { newPerDay: 5 });
  assert.equal(plan.due.length, 0);
  assert.deepEqual(plan.fresh, words.slice(0, 5).map(w => cardId(w.id)));
  assert.equal(plan.moreNew, 7);
});

test('the new-card allowance counts what was already introduced today', () => {
  const prog = newProgress();
  today(prog, T0).newW = 3;
  assert.equal(todayPlan(prog, words, T0, { newPerDay: 5 }).fresh.length, 2);
});

test('learning cards due now come before reviews; later-today learning cards are listed', () => {
  const prog = newProgress();
  prog.cards[cardId(words[0].id)] = { ...newCard(), state: 'review', ivl: 3, due: T0 - DAY, last: T0 - 4 * DAY };
  prog.cards[cardId(words[1].id)] = { ...newCard(), state: 'learning', step: 1, due: T0 - MIN, last: T0 - 11 * MIN };
  prog.cards[cardId(words[2].id)] = { ...newCard(), state: 'learning', step: 1, due: T0 + 60 * MIN, last: T0 };
  const plan = todayPlan(prog, words, T0);
  assert.deepEqual(plan.due, [cardId(words[1].id), cardId(words[0].id)]);
  assert.deepEqual(plan.later, [cardId(words[2].id)]);
  assert.ok(!plan.fresh.includes(cardId(words[0].id)));
});

test('no words, no plan', () => {
  const plan = todayPlan(newProgress(), [], T0);
  assert.equal(plan.fresh.length + plan.due.length, 0);
});

test('buildQueue keeps every card exactly once', () => {
  const q = buildQueue({ due: ['a', 'b', 'c', 'd', 'e', 'f'], fresh: ['n1', 'n2', 'n3'] }, rng);
  assert.equal(q.length, 9);
  assert.deepEqual([...q].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'n1', 'n2', 'n3']);
});

test('a session brings learning cards back until they graduate', () => {
  const prog = newProgress();
  const ids = [cardId('w1'), cardId('w2')];
  const s = new Session(ids);
  let now = T0;
  const shown = [];
  for (let guard = 0; guard < 20; guard++) {
    const id = s.next(now);
    if (!id) break;
    shown.push(id);
    const card = schedule(prog.cards[id] || newCard(), GOOD, now, undefined, rng);
    prog.cards[id] = card;
    s.answered(id, card, now);
    now += 15 * 1000;
  }
  assert.equal(shown.length, 4);
  assert.ok(ids.every(id => prog.cards[id].state === 'review'));
  for (let i = 1; i < shown.length - 1; i++) assert.notEqual(shown[i], shown[i - 1]);
});

test('a lapse in a session is relearned before the session ends', () => {
  const id = cardId('w1');
  const s = new Session([id]);
  let card = { ...newCard(), state: 'review', ivl: 5, due: T0 - DAY };
  assert.equal(s.next(T0), id);
  card = schedule(card, AGAIN, T0, undefined, rng);
  s.answered(id, card, T0);
  assert.equal(s.remaining, 1);
  assert.equal(s.next(T0 + 1000), id);
  card = schedule(card, GOOD, T0 + 1000, undefined, rng);
  s.answered(id, card, T0 + 1000);
  assert.equal(card.state, 'review');
  assert.equal(s.next(T0 + 2000), null);
});
