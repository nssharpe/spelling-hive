import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, newSessionState } from '../js/practice-core.js';
import { newProgress } from '../js/store.js';
import { Session, cardId } from '../js/session.js';
import { buildSpellingQueue } from '../js/spell.js';
import { ALL_WORDS } from '../js/words.js';
import { hubKidOk, settleSession, DEFAULT_RATES } from '../js/hubtickets.js';
import { newCard } from '../js/srs.js';
import { DAY, HOUR } from '../js/util.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime();
const byCard = new Map(ALL_WORDS.map(w => [cardId(w.id), w]));

// Runs a whole Session the way practice.js does: one answer per showing until the session is empty.
// answer(w, showingNumber) -> true/false. Returns what happened.
function runSession(prog, size, answer, { canEarn = true, words = ALL_WORDS, start = T0 } = {}) {
  const queue = buildSpellingQueue(prog, words, start, size);
  const session = new Session(queue);
  const st = newSessionState(prog.grade);
  const showings = new Map();
  let now = start, total = 0;
  for (let guard = 0; guard < 200; guard++) {
    const id = session.next(now);
    if (!id) break;
    const w = byCard.get(id);
    const n = (showings.get(w.id) || 0) + 1;
    showings.set(w.id, n);
    applyAnswer({ prog, session, st, w, ok: answer(w, n), now, canEarn });
    total++;
    now += 5000; // five seconds per answer
  }
  return { queue, st, showings, total };
}

test('a 5-word all-correct session banks exactly 5 units and records 5 history entries, even though cards come back', () => {
  const prog = newProgress();
  const { queue, st, total, showings } = runSession(prog, 5, () => true);
  assert.equal(queue.length, 5);
  assert.ok(total > 5, 'learning cards were shown again within the session (that is what used to double-count)');
  assert.ok([...showings.values()].some(n => n > 1));
  assert.equal(prog.history.length, 5);
  assert.equal(new Set(prog.history.map(h => h.wordId)).size, 5);
  assert.ok(prog.history.every(h => h.firstTry));
  assert.equal(prog.stats.attempted, 5);
  assert.equal(prog.stats.firstTryRight, 5);
  assert.equal(prog.ticketUnits, 5);
  assert.equal(st.units, 5);
  assert.equal(st.right.size, 5);
});

test('a word missed then later right records exactly one (miss) entry; the others still one each', () => {
  const prog = newProgress();
  const queue = buildSpellingQueue(prog, ALL_WORDS, T0, 5);
  const missId = queue[2].slice(2);
  const { st, showings } = runSession(prog, 5, (w, n) => !(w.id === missId && n === 1));
  assert.ok(showings.get(missId) >= 2, 'the missed word came back');
  const mine = prog.history.filter(h => h.wordId === missId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].firstTry, false);
  assert.equal(prog.history.length, 5);
  assert.equal(prog.stats.attempted, 5);
  assert.equal(prog.stats.firstTryRight, 4);
  assert.equal(prog.ticketUnits, 4);
  assert.ok(st.missed.has(missId) && !st.right.has(missId));
  assert.equal(prog.cards[cardId(missId)].miss !== undefined, true, 'the miss is stamped for the same-day rule');
});

test('re-shows still schedule the card (a right answer moves it on, a wrong one resets it)', () => {
  const prog = newProgress();
  const { queue } = runSession(prog, 3, () => true);
  for (const id of queue) {
    assert.equal(prog.cards[id].state, 'review', 'graduated after its in-session re-show');
    assert.ok(prog.cards[id].reps >= 2);
  }
});

test('no banking without a hub kid, but history and stats still count once per word', () => {
  const prog = newProgress();
  runSession(prog, 4, () => true, { canEarn: false });
  assert.equal(prog.ticketUnits, 0);
  assert.equal(prog.history.length, 4);
});

test('a full 15-word session with 15 right turns into exactly 5 tickets at 3 per ticket', () => {
  const prog = newProgress();
  assert.equal(hubKidOk('zyler'), true);
  runSession(prog, 15, () => true);
  assert.equal(prog.history.length, 15);
  assert.equal(prog.ticketUnits, 15);
  const r = settleSession(prog, { kid: 'zyler', hub: 'hub-abcde-abcde-abcde-abcde', rates: DEFAULT_RATES, now: T0 });
  assert.equal(r.tickets, 5);
  assert.equal(r.event.detail, '15 words');
  assert.equal(prog.ticketUnits, 0);
});

test('re-shows do not feed updateGrade: 19 right at the grade plus one session word moves up once, not on duplicates', () => {
  const prog = newProgress();
  prog.grade = 5;
  prog.gradeChangedAt = 1;
  prog.history = Array.from({ length: 18 }, (_, i) => ({ wordId: `x${i}`, grade: 5, firstTry: true, ts: T0 - 100000 + i }));
  const { st } = runSession(prog, 3, () => true);
  assert.equal(prog.history.length, 21);
  assert.equal(st.gradeChanges.length, 1);
  assert.equal(st.gradeChanges[0].dir, 'up');
});

const known = (due, extra = {}) => ({ ...newCard(), state: 'review', ivl: 5, due, last: T0 - DAY, ...extra });

test('R17: a session made entirely of known, not-yet-due cards banks 0 units (history and SRS still update)', () => {
  const prog = newProgress();
  const words = ALL_WORDS.slice(0, 5);
  for (const w of words) prog.cards[cardId(w.id)] = known(T0 + 3 * DAY);
  const { queue } = runSession(prog, 5, () => true, { words });
  assert.equal(queue.length, 5, 'the queue padded the session with not-due cards');
  assert.equal(prog.ticketUnits, 0);
  assert.equal(prog.history.length, 5);
  assert.ok(prog.history.every(h => h.firstTry), 'still first-try right for grade stats');
  assert.ok(prog.cards[cardId(words[0].id)].reps >= 1);
});

test('R17: due and new words still pay; not-due padding does not', () => {
  const prog = newProgress();
  const words = ALL_WORDS.slice(0, 4);
  prog.cards[cardId(words[0].id)] = known(T0 - HOUR);          // due
  prog.cards[cardId(words[1].id)] = known(T0 + 2 * DAY);       // not due
  prog.cards[cardId(words[2].id)] = known(T0 + 2 * DAY);       // not due
  // words[3] is new (grade 5 words are the current grade, so it is also queued)
  runSession(prog, 4, () => true, { words });
  assert.equal(prog.history.length, 4);
  assert.equal(prog.ticketUnits, 2);
});

test('a miss on a re-show stamps the card and drops the word from "right", so a new session the same day pays nothing', () => {
  const prog = newProgress();
  const words = ALL_WORDS.slice(0, 1);
  const r1 = runSession(prog, 1, (w, n) => n === 1, { words });          // right first, wrong on the re-show
  assert.ok(r1.showings.get(words[0].id) >= 2);
  assert.equal(prog.ticketUnits, 1, 'the first showing was a real first-try right and paid');
  assert.equal(r1.st.right.has(words[0].id), false);
  assert.equal(prog.history.length, 1);
  assert.match(prog.cards[cardId(words[0].id)].miss, /^\d{4}-\d{2}-\d{2}$/);
  // Same study day, a few hours later, a new session: the card is due again and is answered right.
  const later = T0 + 3 * HOUR;
  runSession(prog, 1, () => true, { words, start: later });
  assert.equal(prog.history.length, 2);
  assert.equal(prog.history[1].firstTry, false, 'missed earlier today');
  assert.equal(prog.ticketUnits, 1, 'no second unit');
});

test('custom words are logged as "custom" and never move the grade', () => {
  const prog = newProgress();
  prog.grade = 6; prog.gradeChangedAt = 1;
  const custom = Array.from({ length: 25 }, (_, i) => ({ id: `c-${i}`, word: `word${i}`, grade: 'custom' }));
  const queue = buildSpellingQueue(prog, custom, T0, 25);
  const session = new Session(queue);
  const st = newSessionState(prog.grade);
  for (const id of queue) applyAnswer({ prog, session, st, w: custom.find(w => cardId(w.id) === id), ok: true, now: T0, canEarn: true });
  assert.equal(prog.history.length, 25);
  assert.ok(prog.history.every(h => h.grade === 'custom'));
  assert.equal(prog.grade, 6, '25 right custom words (over the 20-word window) did not level the kid up');
  assert.equal(st.gradeChanges.length, 0);
  assert.equal(prog.ticketUnits, 25, 'custom words still earn tickets');
});
