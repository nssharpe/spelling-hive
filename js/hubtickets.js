// TV tickets for the family hub. Pure: no DOM at import time (npm test imports it in node).
//
// Ticket event (shared contract with the hub, sent with hub-client.js's outbox):
//   { id: 'spelling:<kid>:<ts>', kid, app: 'spelling', tickets: int >= 1, ts, detail: 'N words' }
// Units = first-try-correct words (spell.js recordAttempt().firstTry). The practice screen banks each
// unit into prog.ticketUnits as it happens (so closing the tab mid-session loses nothing), and
// settleSession turns whole multiples of `spellingWordsPerTicket` into an event at the end. The
// remainder stays in prog.ticketUnits.

import { getHub, effectiveSettings } from './hub-client.js';

export const SETTINGS_KEY = 'spell-hive:hub-settings';
export const OUTBOX_KEY = 'spell-hive:outbox';
export const DEFAULT_RATES = { spellingWordsPerTicket: 3 };
const MAX_TICKETS_PER_EVENT = 200; // the hub's rules reject more
const HUB_KIDS = ['zyler', 'kadyn']; // the outbox only accepts the hub's own kid ids

const okNum = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

// The rate this app uses, taken from hub settings (or the default when missing or odd).
export function ratesFrom(settings) {
  const r = (settings && settings.rates) || {};
  return {
    spellingWordsPerTicket: okNum(r.spellingWordsPerTicket, 1e-9, 1e6) ? r.spellingWordsPerTicket : DEFAULT_RATES.spellingWordsPerTicket,
  };
}

// Rates from the cached hub settings document (pending settings apply once their day starts).
export function cachedRates(storage, now) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_RATES };
    return ratesFrom(effectiveSettings(JSON.parse(raw), now));
  } catch {
    return { ...DEFAULT_RATES };
  }
}

// Fetch the hub's settings and cache them. Never throws: offline just keeps the old cache.
export async function refreshRates(code, storage) {
  try {
    const hub = await getHub(code);
    if (hub && hub.settings) storage.setItem(SETTINGS_KEY, JSON.stringify(hub.settings));
  } catch { /* offline or blocked: keep what we had */ }
  return cachedRates(storage, Date.now());
}

// Adds `units` to prog.ticketUnits and returns the whole tickets they make; the rest stays.
export function awardTickets(prog, units, perTicket) {
  const per = okNum(perTicket, 1e-9, 1e6) ? perTicket : DEFAULT_RATES.spellingWordsPerTicket;
  const add = typeof units === 'number' && Number.isFinite(units) && units > 0 ? units : 0;
  const total = (Number(prog.ticketUnits) || 0) + add;
  const n = Math.min(MAX_TICKETS_PER_EVENT, Math.floor(total / per));
  prog.ticketUnits = total - n * per;
  return n;
}

// Can this kid earn hub tickets? (Kids a grown-up adds on this device are not hub kids.)
export function hubKidOk(kid) {
  return HUB_KIDS.includes(kid);
}

/**
 * End of a session: turn the banked units into tickets.
 *   ctx = { kid, hub (hub code or null), rates, now }
 * Returns { tickets, event } where event is null when there is nothing to send. With no hub code
 * (or a kid the hub doesn't know) nothing is awarded and prog is left alone.
 */
export function settleSession(prog, ctx) {
  if (!ctx.hub || !hubKidOk(ctx.kid)) return { tickets: 0, event: null };
  const tickets = awardTickets(prog, 0, ctx.rates.spellingWordsPerTicket);
  if (tickets < 1) return { tickets: 0, event: null };
  // The event says how many words were actually converted into these tickets (not how many were
  // answered this session: some units were carried over, some are carried forward).
  const n = Math.max(1, Math.round(tickets * ctx.rates.spellingWordsPerTicket));
  return {
    tickets,
    event: {
      id: `spelling:${ctx.kid}:${ctx.now}`, kid: ctx.kid, app: 'spelling', tickets, ts: ctx.now,
      detail: `${n} word${n === 1 ? '' : 's'}`.slice(0, 80),
    },
  };
}
