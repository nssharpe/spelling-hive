import test from 'node:test';
import assert from 'node:assert/strict';
import { newCard, schedule, isDue, previewIntervals, mastery, AGAIN, HARD, GOOD, EASY } from '../js/srs.js';
import { MIN, dayStart, dayStartPlus, dayKey, daysBetweenKeys } from '../js/util.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime(); // Nov 3, 4pm local
const rng = () => 0.5;

test('new card walks the learning steps then graduates to 1 day', () => {
  let c = schedule(newCard(), GOOD, T0, undefined, rng);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 1);
  assert.equal(c.due, T0 + 10 * MIN);
  c = schedule(c, GOOD, T0 + 10 * MIN, undefined, rng);
  assert.equal(c.state, 'review');
  assert.equal(c.ivl, 1);
  assert.equal(c.due, dayStartPlus(T0, 1));
  assert.equal(dayKey(c.due), '2026-11-04');
});

test('again on a learning card restarts at the 1-minute step', () => {
  let c = schedule(newCard(), GOOD, T0, undefined, rng);
  c = schedule(c, AGAIN, T0 + MIN, undefined, rng);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 0);
  assert.equal(c.due, T0 + 2 * MIN);
});

test('hard on the first step waits between the two steps', () => {
  const c = schedule(newCard(), HARD, T0, undefined, rng);
  assert.equal(c.due, T0 + 5.5 * MIN);
});

test('easy on a new card graduates straight to 4 days', () => {
  const c = schedule(newCard(), EASY, T0, undefined, rng);
  assert.equal(c.state, 'review');
  assert.equal(c.ivl, 4);
});

test('review intervals grow with ease, hard < good < easy', () => {
  const base = { ...newCard(), state: 'review', ivl: 10, ease: 2.5, due: dayStart(T0), last: T0 - 10 * 86400e3 };
  const h = schedule(base, HARD, T0, undefined, rng);
  const g = schedule(base, GOOD, T0, undefined, rng);
  const e = schedule(base, EASY, T0, undefined, rng);
  assert.equal(h.ivl, 12);
  assert.equal(g.ivl, 25);
  assert.ok(e.ivl > g.ivl);
  assert.ok(h.ease < 2.5 && e.ease > 2.5 && g.ease === 2.5);
});

test('forgetting a review card relearns, cuts the interval and lowers ease', () => {
  const base = { ...newCard(), state: 'review', ivl: 20, ease: 2.5, due: dayStart(T0), reps: 5 };
  let c = schedule(base, AGAIN, T0, undefined, rng);
  assert.equal(c.state, 'relearning');
  assert.equal(c.lapses, 1);
  assert.equal(c.ease, 2.3);
  assert.equal(c.ivl, 4);
  assert.equal(c.due, T0 + 10 * MIN);
  c = schedule(c, GOOD, T0 + 10 * MIN, undefined, rng);
  assert.equal(c.state, 'review');
  assert.equal(c.ivl, 4);
  assert.equal(c.due, dayStartPlus(T0, 4));
});

test('ease never drops below the minimum', () => {
  let c = { ...newCard(), state: 'review', ivl: 3, ease: 1.35, due: dayStart(T0) };
  c = schedule(c, AGAIN, T0, undefined, rng);
  assert.equal(c.ease, 1.3);
});

test('overdue reviews get credit for the extra days', () => {
  const due = dayStartPlus(T0, -6);
  const onTime = schedule({ ...newCard(), state: 'review', ivl: 4, ease: 2.5, due: dayStart(T0) }, GOOD, T0, undefined, rng);
  const late = schedule({ ...newCard(), state: 'review', ivl: 4, ease: 2.5, due }, GOOD, T0, undefined, rng);
  assert.ok(late.ivl > onTime.ivl);
});

test('the study day starts at 4am', () => {
  const lateNight = new Date(2026, 10, 4, 1, 30).getTime(); // 1:30am Nov 4
  assert.equal(dayKey(lateNight), '2026-11-03');
  const morning = new Date(2026, 10, 4, 4, 0).getTime();
  assert.equal(dayKey(morning), '2026-11-04');
  // A card graduated at 1:30am is due at 4am the same calendar morning.
  let c = schedule(newCard(), EASY, lateNight, undefined, rng);
  assert.equal(c.due, dayStartPlus(lateNight, 4));
  assert.equal(new Date(dayStartPlus(lateNight, 1)).getHours(), 4);
  assert.ok(!isDue(schedule(newCard(), EASY, T0), T0));
});

test('day math survives a daylight-saving change', () => {
  // US DST ended Nov 1 2026; whatever the local zone, keys stay one day apart.
  const a = new Date(2026, 9, 31, 12).getTime();
  const next = dayStartPlus(a, 1);
  assert.equal(new Date(next).getHours(), 4);
  assert.equal(daysBetweenKeys(dayKey(a), dayKey(next)), 1);
  assert.equal(daysBetweenKeys('2026-10-31', '2026-11-02'), 2);
});

test('interval previews for the flip buttons', () => {
  const p = previewIntervals(newCard(), T0);
  assert.equal(p[AGAIN], '1min');
  assert.equal(p[GOOD], '10min');
  assert.equal(p[EASY], '4j');
});

test('mastery stars', () => {
  assert.equal(mastery(undefined), 0);
  assert.equal(mastery({ state: 'learning' }), 1);
  assert.equal(mastery({ state: 'review', ivl: 1 }), 2);
  assert.equal(mastery({ state: 'review', ivl: 30 }), 5);
});
