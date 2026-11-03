import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, cardId, wordIdOf } from '../js/session.js';
import { newProgress } from '../js/store.js';
import { schedule, GOOD, AGAIN, newCard } from '../js/srs.js';
import { DAY } from '../js/util.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime();
const rng = () => 0.5;

test('one card per word, with id w:<wordId>', () => {
  assert.equal(cardId('g5-believe'), 'w:g5-believe');
  assert.equal(wordIdOf('w:g5-believe'), 'g5-believe');
  assert.equal(wordIdOf(cardId('c-ab:cd')), 'c-ab:cd');
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
