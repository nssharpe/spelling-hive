// Spaced repetition: Anki's SM-2 variant, kept pure so it can be unit-tested.
//
// A card is in one of four states:
//   new        – never seen
//   learning   – seen, working through short in-session steps (1 min, 10 min)
//   review     – graduated; comes back after `ivl` days
//   relearning – a review card that was forgotten; short steps, then back to review
//
// Grades: 1 = Again (forgot), 2 = Hard, 3 = Good, 4 = Easy.
// Learning-step cards are due at an exact timestamp. Review cards are due at the
// start of a study day (4am), so "due" simply means `card.due <= now`.

import { MIN, DAY, dayStart, dayStartPlus } from './util.js';

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

export const SRS_DEFAULTS = {
  learnSteps: [1, 10],      // minutes
  relearnSteps: [10],       // minutes
  graduatingIvl: 1,         // days
  easyIvl: 4,               // days
  startEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardFactor: 1.2,
  lapseFactor: 0.2,         // fraction of the old interval kept after forgetting
  maxIvl: 365,
};

export function newCard() {
  return { state: 'new', due: 0, ivl: 0, ease: SRS_DEFAULTS.startEase, step: 0, reps: 0, lapses: 0, last: 0 };
}

export function isDue(card, now) {
  return card.state !== 'new' && card.due <= now;
}

// ±5% jitter on longer intervals so cards learned together drift apart.
function fuzz(ivl, rng) {
  if (ivl < 3) return ivl;
  const spread = Math.max(1, Math.round(ivl * 0.05));
  return ivl + Math.round((rng() * 2 - 1) * spread);
}

function stepDelay(steps, step, grade) {
  if (grade === HARD) {
    // Anki: Hard on the first step waits halfway between step 1 and step 2.
    if (step === 0 && steps.length > 1) return ((steps[0] + steps[1]) / 2) * MIN;
    return steps[Math.min(step, steps.length - 1)] * MIN;
  }
  return steps[Math.min(step, steps.length - 1)] * MIN;
}

function graduate(card, ivl, now, cfg) {
  const days = Math.min(cfg.maxIvl, Math.max(1, Math.round(ivl)));
  return { ...card, state: 'review', ivl: days, step: 0, due: dayStartPlus(now, days) };
}

/**
 * Apply a grade to a card and return the updated card (the input is not mutated).
 * `rng` is injectable so tests are deterministic.
 */
export function schedule(card, grade, now, cfg = SRS_DEFAULTS, rng = Math.random) {
  const c = { ...card, reps: (card.reps || 0) + 1, last: now };

  if (c.state === 'new' || c.state === 'learning') {
    const steps = cfg.learnSteps;
    if (c.state === 'new') { c.state = 'learning'; c.step = 0; c.ease = cfg.startEase; }
    if (grade === EASY) return graduate(c, cfg.easyIvl, now, cfg);
    if (grade === AGAIN) { c.step = 0; c.due = now + stepDelay(steps, 0, AGAIN); return c; }
    if (grade === HARD) { c.due = now + stepDelay(steps, c.step, HARD); return c; }
    // GOOD
    c.step += 1;
    if (c.step >= steps.length) return graduate(c, cfg.graduatingIvl, now, cfg);
    c.due = now + stepDelay(steps, c.step, GOOD);
    return c;
  }

  if (c.state === 'relearning') {
    const steps = cfg.relearnSteps;
    if (grade === EASY) return graduate(c, c.ivl + 1, now, cfg);
    if (grade === AGAIN) { c.step = 0; c.due = now + stepDelay(steps, 0, AGAIN); return c; }
    if (grade === HARD) { c.due = now + stepDelay(steps, c.step, HARD); return c; }
    c.step += 1;
    if (c.step >= steps.length) return graduate(c, c.ivl, now, cfg);
    c.due = now + stepDelay(steps, c.step, GOOD);
    return c;
  }

  // review
  if (grade === AGAIN) {
    c.lapses = (c.lapses || 0) + 1;
    c.ease = Math.max(cfg.minEase, c.ease - 0.2);
    c.ivl = Math.max(1, Math.floor(c.ivl * cfg.lapseFactor));
    c.state = 'relearning';
    c.step = 0;
    c.due = now + cfg.relearnSteps[0] * MIN;
    return c;
  }

  // Days overdue earn partial credit: you remembered it even longer than planned.
  const late = Math.max(0, Math.round((dayStart(now) - card.due) / DAY));
  const hardIvl = Math.max(c.ivl + 1, c.ivl * cfg.hardFactor);
  const goodIvl = Math.max(hardIvl + 1, (c.ivl + late / 2) * c.ease);
  const easyIvl = Math.max(goodIvl + 1, (c.ivl + late) * c.ease * cfg.easyBonus);

  let ivl;
  if (grade === HARD) { ivl = hardIvl; c.ease = Math.max(cfg.minEase, c.ease - 0.15); }
  else if (grade === GOOD) { ivl = goodIvl; }
  else { ivl = easyIvl; c.ease += 0.15; }

  ivl = Math.min(cfg.maxIvl, Math.max(c.ivl + 1, fuzz(Math.round(ivl), rng)));
  return { ...c, ivl, due: dayStartPlus(now, ivl) };
}

// Human-readable time until the card would be due after each grade, for the
// flip-card buttons ("<1m", "10m", "1j", "4j" ...). Uses no fuzz.
export function previewIntervals(card, now, cfg = SRS_DEFAULTS) {
  const out = {};
  for (const g of [AGAIN, HARD, GOOD, EASY]) {
    const next = schedule(card, g, now, cfg, () => 0.5);
    out[g] = formatDelay(next, now);
  }
  return out;
}

export function formatDelay(card, now) {
  if (card.state === 'review') {
    const d = card.ivl;
    if (d < 30) return `${d}j`;
    if (d < 365) return `${Math.round(d / 30)}mois`;
    return `${Math.round(d / 365)}an`;
  }
  const m = Math.max(1, Math.round((card.due - now) / MIN));
  return m < 60 ? `${m}min` : `${Math.round(m / 60)}h`;
}

// 0–5 stars describing how well a card is known.
export function mastery(card) {
  if (!card || card.state === 'new') return 0;
  if (card.state !== 'review') return 1;
  if (card.ivl < 3) return 2;
  if (card.ivl < 7) return 3;
  if (card.ivl < 21) return 4;
  return 5;
}
