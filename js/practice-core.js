// The per-answer bookkeeping of a practice session, kept pure (no DOM) so `npm test` can run a
// whole Session in node.
//
// Rule (ruling R13): a word's history entry, stats, ticket unit and grade check count only on its
// FIRST showing within a session. A card still in learning steps comes back later in the same
// session (Session's learn-ahead), and those re-shows only schedule the SRS card.

import { cardId } from './session.js';
import { recordAttempt } from './spell.js';
import { updateGrade } from './level.js';
import { schedule, newCard, AGAIN, GOOD } from './srs.js';

export function newSessionState(startGrade) {
  return {
    presented: new Set(),    // word ids shown at least once (recordAttempt has run for these)
    right: new Map(),        // words right on their first showing and not missed earlier today
    missed: new Map(),       // words missed at any showing this session
    gradeChanges: [],
    units: 0,                // first-try words banked into prog.ticketUnits this session
    startGrade,
  };
}

/**
 * Apply one typed answer to a presented word. Never call this for the forced retype after a miss.
 *   ok       – was the answer right
 *   canEarn  – bank a ticket unit for a first-try-correct word (hub code and a hub kid)
 * Returns { first, firstTry, gradeChange }.
 */
export function applyAnswer({ prog, session, st, w, ok, now, canEarn }) {
  const id = cardId(w.id);
  const first = !st.presented.has(w.id);
  let firstTry = false;
  let gradeChange = null;

  if (first) {
    st.presented.add(w.id);
    firstTry = recordAttempt(prog, w.id, ok, now).firstTry;
    if (ok && firstTry) {
      st.right.set(w.id, w);
      if (canEarn) { prog.ticketUnits = (Number(prog.ticketUnits) || 0) + 1; st.units++; }
    }
    const before = prog.grade;
    const g = updateGrade(prog, now);
    if (g.changed) { gradeChange = { from: before, to: g.grade, dir: g.changed }; st.gradeChanges.push(gradeChange); }
  }
  if (!ok) st.missed.set(w.id, w);

  // The SRS card is scheduled on every showing: AGAIN on a miss, GOOD on a right answer.
  prog.cards[id] = schedule(prog.cards[id] || newCard(), ok ? GOOD : AGAIN, now);
  session.answered(id, prog.cards[id], now);
  return { first, firstTry, gradeChange };
}
