// The spelling engine: checking an answer, recording an attempt, and picking
// which words to study. Pure (no DOM), so `npm test` can import it in node.

import { HISTORY_MAX } from './store.js';
import { cardId } from './session.js';
import { newCard } from './srs.js';
import { dayKey } from './util.js';
import { wordById } from './words.js';

// ---------- checking ----------

const APOSTROPHES = /[‘’‛ʼ]/g;               // ‘ ’ ‛ ʼ
const HYPHENS = /[‐‑‒–—−]/g;       // ‐ ‑ ‒ – — −

/**
 * The only forgiveness the app gives: case, surrounding spaces, curly apostrophes
 * and hyphen variants. Accents, inner spaces and letters are never forgiven.
 */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(HYPHENS, '-');
}

/**
 * Is `input` the word, and if not, where does it differ? The diff aligns the input
 * to the word with a Levenshtein backtrace and lists, in order along the alignment:
 *   same     – a letter both have
 *   wrong    – the input has a different letter here (ch = the word's letter)
 *   missing  – the word's letter that the input left out (ch = the word's letter)
 *   extra    – an input letter the word doesn't have (ch = the input's letter)
 * Ties prefer substitution, so a swapped pair ("recieve") shows as two `wrong`.
 */
export function checkSpelling(input, word) {
  const a = [...normalize(input)];   // input
  const b = [...normalize(word)];    // target
  const n = a.length, m = b.length;

  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      );
    }
  }

  const diff = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = a[i - 1] === b[j - 1];
      if (d[i][j] === d[i - 1][j - 1] + (same ? 0 : 1)) {
        diff.push({ ch: b[j - 1], kind: same ? 'same' : 'wrong' });
        i--; j--;
        continue;
      }
    }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      diff.push({ ch: a[i - 1], kind: 'extra' });
      i--;
    } else {
      diff.push({ ch: b[j - 1], kind: 'missing' });
      j--;
    }
  }
  diff.reverse();
  return { ok: d[n][m] === 0, diff };
}

// ---------- recording ----------

/**
 * Log one typed attempt at a word. `firstTry` is true only when the answer was
 * right AND the word wasn't missed earlier the same study day (so retyping after a
 * miss, or a later same-day success, earns nothing). Only first-try answers count
 * toward tickets.
 *
 * This does NOT schedule the SRS card: the UI calls `schedule()` from srs.js
 * separately. On a miss it only stamps `card.miss` with today's day key (creating
 * a blank card if the word has none yet).
 *
 * "Same day" uses the app's `dayKey` (4am day start), like srs.js.
 */
export function recordAttempt(prog, wordId, ok, now) {
  const id = cardId(wordId);
  const today = dayKey(now);
  const firstTry = !!ok && !(prog.cards[id] && prog.cards[id].miss === today);

  // Built-in words carry their grade. Grown-up words are logged as 'custom', so they never move the
  // kid's grade (updateGrade only counts entries at the current numeric grade).
  const w = wordById(wordId);
  const grade = w ? w.grade : 'custom';
  prog.history.push({ wordId, grade, firstTry, ts: now });
  if (prog.history.length > HISTORY_MAX) prog.history.splice(0, prog.history.length - HISTORY_MAX);

  if (!ok) {
    if (!prog.cards[id]) prog.cards[id] = newCard();
    prog.cards[id].miss = today;
  }

  prog.stats.attempted = (prog.stats.attempted || 0) + 1;
  if (firstTry) prog.stats.firstTryRight = (prog.stats.firstTryRight || 0) + 1;
  return { firstTry };
}

// ---------- queue ----------

const isSeen = c => !!c && c.state !== 'new';

/**
 * Card ids for one session, at most `size`, no duplicates, only for words in
 * `words` (built-in + grown-up words available to this kid). Order:
 *   1. reviews/learning cards due now, earliest due first
 *   2. grown-up (custom) words never seen
 *   3. never-seen words of the kid's current grade, in bank order
 *   4. once those run out, the oldest-due cards of any grade
 */
export function buildSpellingQueue(prog, words, now, size = 15) {
  const out = [];
  const used = new Set();
  const add = id => { if (out.length < size && !used.has(id)) { used.add(id); out.push(id); } };

  const known = words.map(w => cardId(w.id)).filter(id => isSeen(prog.cards[id]));
  const byDue = (x, y) => prog.cards[x].due - prog.cards[y].due;

  known.filter(id => prog.cards[id].due <= now).sort(byDue).forEach(add);
  for (const w of words) if (w.grade === 'custom' && !isSeen(prog.cards[cardId(w.id)])) add(cardId(w.id));
  for (const w of words) if (w.grade === prog.grade && !isSeen(prog.cards[cardId(w.id)])) add(cardId(w.id));
  known.slice().sort(byDue).forEach(add);
  return out;
}
