// Grade adaptation and the placement round. Pure (no DOM).

import { MIN_GRADE, MAX_GRADE } from './store.js';

export const UP_WINDOW = 20, UP_RATE = 0.9;
export const DOWN_WINDOW = 10, DOWN_RATE = 0.5;

/**
 * Should the kid move up or down a grade? Looks at the history entries at the
 * current grade (a word's own grade, so review words from other grades don't
 * count) made after the last grade change. "Right" means `firstTry` true.
 *   up:   the last 20 are at least 90% right (and grade < 12)
 *   down: the last 10 are under 50% right (and grade > 5)
 * The window resets on a change via `prog.gradeChangedAt` (a timestamp; only
 * attempts with a later `ts` count; missing means no cutoff). On a change this
 * updates `prog.grade` and `prog.gradeChangedAt` in place as well as returning them.
 */
export function updateGrade(prog, now) {
  const since = prog.gradeChangedAt || 0;
  const at = prog.history.filter(h => h.grade === prog.grade && h.ts > since);
  const rate = list => list.filter(h => h.firstTry).length / list.length;

  let changed = null;
  if (prog.grade < MAX_GRADE && at.length >= UP_WINDOW && rate(at.slice(-UP_WINDOW)) >= UP_RATE) changed = 'up';
  else if (prog.grade > MIN_GRADE && at.length >= DOWN_WINDOW && rate(at.slice(-DOWN_WINDOW)) < DOWN_RATE) changed = 'down';

  if (changed) {
    prog.grade += changed === 'up' ? 1 : -1;
    prog.gradeChangedAt = now;
  }
  return { grade: prog.grade, changed };
}

/**
 * Where to start after the placement round (3 words per grade from 5 upward).
 * Stops at the first grade with 2 or more misses; the start is the grade below it
 * (minimum 5). If no grade has 2 misses, the start is 12.
 */
export function placementStart(results) {
  for (let g = MIN_GRADE; g <= MAX_GRADE; g++) {
    const misses = results.filter(r => r.grade === g && !r.ok).length;
    if (misses >= 2) return Math.max(MIN_GRADE, g - 1);
  }
  return MAX_GRADE;
}
