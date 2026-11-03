import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress } from '../js/store.js';
import {
  awardTickets, DEFAULT_RATES, ratesFrom, cachedRates, SETTINGS_KEY, OUTBOX_KEY,
  hubKidOk, settleSession,
} from '../js/hubtickets.js';

test('awardTickets: 2 units at 3 per ticket is 0 tickets; then 4 more is 2 tickets with 0 left', () => {
  const prog = newProgress();
  assert.equal(awardTickets(prog, 2, 3), 0);
  assert.equal(prog.ticketUnits, 2);
  assert.equal(awardTickets(prog, 4, 3), 2);
  assert.equal(prog.ticketUnits, 0);
});

test('awardTickets: whole multiples only, remainder kept, bad input is harmless', () => {
  const prog = newProgress();
  assert.equal(awardTickets(prog, 7, 3), 2);
  assert.equal(prog.ticketUnits, 1);
  assert.equal(awardTickets(prog, 0, 3), 0);
  assert.equal(awardTickets(prog, -5, 3), 0);
  assert.equal(awardTickets(prog, NaN, 3), 0);
  assert.equal(prog.ticketUnits, 1);
  assert.equal(awardTickets(prog, 2, 0), 1, 'a zero rate falls back to the default of 3');
  assert.equal(prog.ticketUnits, 0);
});

test('awardTickets: never more than 200 tickets in one event; the rest stays in progress', () => {
  const prog = newProgress();
  assert.equal(awardTickets(prog, 3 * 250, 3), 200);
  assert.equal(prog.ticketUnits, 50 * 3);
});

test('ratesFrom / cachedRates: defaults, validation, pending settings', () => {
  assert.deepEqual(DEFAULT_RATES, { spellingWordsPerTicket: 3 });
  assert.deepEqual(ratesFrom(null), DEFAULT_RATES);
  assert.deepEqual(ratesFrom({ rates: { spellingWordsPerTicket: 5 } }), { spellingWordsPerTicket: 5 });
  assert.deepEqual(ratesFrom({ rates: { spellingWordsPerTicket: -1 } }), DEFAULT_RATES);
  assert.deepEqual(ratesFrom({ rates: { spellingWordsPerTicket: 'x' } }), DEFAULT_RATES);
  const pending = { rates: { spellingWordsPerTicket: 3 }, pending: { effectiveFrom: '2000-01-01', settings: { rates: { spellingWordsPerTicket: 4 } } } };
  const mem = { getItem: k => (k === SETTINGS_KEY ? JSON.stringify(pending) : null) };
  assert.equal(cachedRates(mem, Date.now()).spellingWordsPerTicket, 4, 'pending settings apply once their day has started');
  assert.deepEqual(cachedRates({ getItem: () => 'not json' }, Date.now()), DEFAULT_RATES);
  assert.deepEqual(cachedRates({ getItem: () => null }, Date.now()), DEFAULT_RATES);
});

test('storage keys are namespaced to this app', () => {
  assert.equal(SETTINGS_KEY, 'spell-hive:hub-settings');
  assert.equal(OUTBOX_KEY, 'spell-hive:outbox');
});

test('hubKidOk: only the hub\'s kids can earn tickets', () => {
  assert.equal(hubKidOk('zyler'), true);
  assert.equal(hubKidOk('kadyn'), true);
  assert.equal(hubKidOk('p-abc123'), false);
  assert.equal(hubKidOk(null), false);
});

const ctx = { kid: 'zyler', hub: 'hub-abcde-abcde-abcde-abcde', rates: DEFAULT_RATES, now: 1762200000000 };

test('settleSession: banked units make whole tickets and an event; the remainder stays', () => {
  const prog = newProgress();
  prog.ticketUnits = 4; // banked word by word during the session
  const r = settleSession(prog, { ...ctx, units: 4 });
  assert.equal(r.tickets, 1);
  assert.equal(prog.ticketUnits, 1);
  assert.deepEqual(r.event, { id: 'spelling:zyler:1762200000000', kid: 'zyler', app: 'spelling', tickets: 1, ts: 1762200000000, detail: '4 words' });
});

test('settleSession: under one ticket means no event', () => {
  const prog = newProgress();
  prog.ticketUnits = 2;
  const r = settleSession(prog, { ...ctx, units: 2 });
  assert.equal(r.tickets, 0);
  assert.equal(r.event, null);
  assert.equal(prog.ticketUnits, 2);
});

test('settleSession: a single word is "1 word"; the detail stays within 80 characters', () => {
  const prog = newProgress();
  prog.ticketUnits = 3;
  const r = settleSession(prog, { ...ctx, units: 1 });
  assert.equal(r.event.detail, '1 word');
});

test('settleSession: without a hub code, or for a non-hub kid, nothing is awarded or kept', () => {
  const prog = newProgress();
  prog.ticketUnits = 5;
  assert.equal(settleSession(prog, { ...ctx, hub: null, units: 5 }).event, null);
  assert.equal(prog.ticketUnits, 5, 'untouched');
  assert.equal(settleSession(prog, { ...ctx, kid: 'p-xyz', units: 5 }).event, null);
  assert.equal(prog.ticketUnits, 5);
});

test('settleSession: honours the hub rate', () => {
  const prog = newProgress();
  prog.ticketUnits = 4;
  const r = settleSession(prog, { ...ctx, rates: { spellingWordsPerTicket: 2 }, units: 4 });
  assert.equal(r.tickets, 2);
  assert.equal(prog.ticketUnits, 0);
});
