// Cloud sync against a fake Firestore (global fetch is stubbed): no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../js/cloud.js';
import { defaultDB, upsertCustomWord } from '../js/store.js';
import { syncDoc } from '../js/sync.js';

const CODE = 'hub-abcde-fghjk-23456-mnpqr';

function fakeFirestore() {
  const docs = new Map(); // path -> { data, updateTime }
  const calls = [];
  let n = 0;
  const fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET' });
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.split('/documents/')[1]);
    const cur = docs.get(path);
    if ((opts.method || 'GET') === 'GET') {
      if (!cur) return { status: 404, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ fields: { data: { stringValue: cur.data } }, updateTime: cur.updateTime }) };
    }
    const wantTime = u.searchParams.get('currentDocument.updateTime');
    const mustNotExist = u.searchParams.get('currentDocument.exists') === 'false';
    if ((mustNotExist && cur) || (wantTime && (!cur || cur.updateTime !== wantTime))) {
      return { status: 400, ok: false, json: async () => ({ error: { status: 'FAILED_PRECONDITION' } }) };
    }
    const updateTime = `2026-11-03T00:00:${String(++n).padStart(2, '0')}Z`;
    docs.set(path, { data: JSON.parse(opts.body).fields.data.stringValue, updateTime });
    return { status: 200, ok: true, json: async () => ({ updateTime }) };
  };
  return { fetch, docs, calls };
}

function memStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

test('sync talks to sharpe-family at spelling/<hubCode> and round-trips two devices', async () => {
  const fs = fakeFirestore();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fs.fetch;
  try {
    const a = defaultDB();
    a.sync = { code: CODE, base: null, last: null };
    a.progress.zyler.ticketUnits = 4;
    upsertCustomWord(a, { id: 'c-1', word: 'rhythm', grade: 'custom' });
    const resA = await syncNow(() => a, memStorage());
    assert.equal(resA.ok, true);
    assert.ok(fs.calls.every(c => c.url.startsWith('https://firestore.googleapis.com/v1/projects/sharpe-family/databases/(default)/documents/spelling/' + CODE)));
    assert.ok(fs.docs.has('spelling/' + CODE));
    assert.deepEqual(a.sync.base, syncDoc(a));

    const b = defaultDB();
    b.sync = { code: CODE, base: null, last: null };
    const resB = await syncNow(() => b, memStorage());
    assert.equal(resB.ok, true);
    assert.equal(resB.changed, true);
    assert.equal(b.progress.zyler.ticketUnits, 4);
    assert.equal(b.customWords[0].word, 'rhythm');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('with no sync code, nothing is sent', async () => {
  const fs = fakeFirestore();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fs.fetch;
  try {
    const res = await syncNow(() => defaultDB(), memStorage());
    assert.equal(res.ok, false);
    assert.equal(fs.calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
