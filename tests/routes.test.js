import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, redirectFor } from '../js/routes.js';

const has = id => id === 'zyler' || id === 'kadyn';

test('resolve finds each screen and the kid routes carry the kid id', () => {
  assert.equal(resolve('/').route.kid, undefined);
  assert.equal(resolve('').route.kid, undefined);
  assert.equal(resolve('/grown-ups').route.kid, undefined);
  const k = resolve('/p/zyler');
  assert.equal(k.route.entry, 'renderKid');
  assert.equal(k.m[1], 'zyler');
  assert.equal(resolve('/p/zyler/practice').m[1], 'zyler');
  assert.equal(resolve('/p/zyler/placement').route.kid, true);
  assert.equal(resolve('/nowhere'), null);
});

test('an unknown kid on any kid route goes home; a known kid and other routes do not', () => {
  for (const h of ['/p/nobody', '/p/nobody/practice', '/p/nobody/placement']) assert.equal(redirectFor(h, has), '/', h);
  for (const h of ['/p/zyler', '/p/kadyn/practice', '/p/zyler/placement', '/', '/grown-ups', '/nowhere']) assert.equal(redirectFor(h, has), null, h);
});
