// Which cards to study today, and the order to show them in a session.
// Spell Hive has one card per word, with id `w:<wordId>` (built-in bank words and
// grown-up custom words alike).

import { newCard } from './srs.js';
import { MIN, dayKey, dayStartPlus, shuffle } from './util.js';

// Like Anki's "learn ahead limit": with nothing else left, a learning card due
// within this window is shown early instead of ending the session.
export const MIN_LEARN_AHEAD = 20 * MIN;

export const DEFAULT_NEW_PER_DAY = 10;

export const cardId = wordId => `w:${wordId}`;
export const wordIdOf = id => id.slice(2);

const blankDay = () => ({ attempted: 0, firstTry: 0, newW: 0 });

export function today(prog, now) {
  const k = dayKey(now);
  if (!prog.days[k]) prog.days[k] = blankDay();
  return prog.days[k];
}

export function peekToday(prog, now) {
  return prog.days[dayKey(now)] || blankDay();
}

/**
 * Snapshot of today's study state for one kid, over the given words.
 *   due:     ids of cards to review now (learning first, then reviews by due date)
 *   later:   learning cards that come back later today
 *   fresh:   ids of brand-new cards allowed today (in word order)
 *   moreNew: how many more brand-new words exist beyond today's allowance
 */
export function todayPlan(prog, words, now, { newPerDay = DEFAULT_NEW_PER_DAY } = {}) {
  const d = peekToday(prog, now);
  const limit = Math.max(0, newPerDay - (d.newW || 0));
  const learning = [], reviews = [], later = [];
  const fresh = [];
  let moreNew = 0;

  for (const w of words) {
    const id = cardId(w.id);
    const c = prog.cards[id];
    if (!c || c.state === 'new') {
      if (fresh.length < limit) fresh.push(id); else moreNew++;
    } else if (c.due <= now) {
      (c.state === 'review' ? reviews : learning).push(id);
    } else if (c.state !== 'review' && c.due < dayStartPlus(now, 1)) {
      later.push(id);
    }
  }
  const byDue = (a, b) => prog.cards[a].due - prog.cards[b].due;
  learning.sort(byDue);
  reviews.sort(byDue);
  return { due: [...learning, ...reviews], later, fresh, moreNew, limit };
}

// Interleave new cards among reviews (roughly one new card every 3 reviews) so a
// session doesn't start with a wall of unknown words.
export function buildQueue(plan, rng = Math.random) {
  const due = plan.due.slice();
  const fresh = plan.fresh.slice();
  const out = [];
  const gap = fresh.length ? Math.max(1, Math.floor(due.length / (fresh.length + 1))) : 0;
  let i = 0;
  while (due.length || fresh.length) {
    if (fresh.length && (i % (gap + 1) === gap || !due.length)) out.push(fresh.shift());
    else out.push(due.shift());
    i++;
  }
  // Light shuffle inside windows of 4 keeps order mostly by priority but not predictable.
  const res = [];
  for (let k = 0; k < out.length; k += 4) res.push(...shuffle(out.slice(k, k + 4), rng));
  return res;
}

/**
 * Runs one study session. Cards still in learning steps (due within the
 * learn-ahead window) come back in the same session, like Anki.
 */
export class Session {
  constructor(queue) {
    this.pending = queue.slice();
    this.learning = new Map(); // id -> due
    this.lastId = null;
    this.total = queue.length;
    this.seen = new Set();
  }

  next(now) {
    const avoid = id => id === this.lastId && (this.pending.length + this.learning.size) > 1;
    const ready = [...this.learning].filter(([id, due]) => due <= now && !avoid(id)).sort((a, b) => a[1] - b[1]);
    let id = null;
    if (ready.length) id = ready[0][0];
    else if (this.pending.length) {
      const k = this.pending.findIndex(x => !avoid(x));
      id = this.pending.splice(k < 0 ? 0 : k, 1)[0];
    } else if (this.learning.size) {
      const ahead = [...this.learning].filter(([x, due]) => due <= now + MIN_LEARN_AHEAD).sort((a, b) => {
        if (avoid(a[0]) !== avoid(b[0])) return avoid(a[0]) ? 1 : -1;
        return a[1] - b[1];
      });
      if (ahead.length) id = ahead[0][0];
    }
    if (id) { this.learning.delete(id); this.lastId = id; this.seen.add(id); }
    return id;
  }

  // Call after grading with the card's new state.
  answered(id, card, now) {
    if ((card.state === 'learning' || card.state === 'relearning') && card.due <= now + MIN_LEARN_AHEAD) {
      this.learning.set(id, card.due);
    }
  }

  get remaining() {
    return this.pending.length + this.learning.size;
  }
}

export { newCard };
