// Card ids and the in-session loop. Which words to study is chosen by
// buildSpellingQueue in spell.js.
// Spelling Hive has one card per word, with id `w:<wordId>` (built-in bank words and
// grown-up custom words alike).

import { MIN } from './util.js';

// Like Anki's "learn ahead limit": with nothing else left, a learning card due
// within this window is shown early instead of ending the session.
export const MIN_LEARN_AHEAD = 20 * MIN;

export const cardId = wordId => `w:${wordId}`;
export const wordIdOf = id => id.slice(2);

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
