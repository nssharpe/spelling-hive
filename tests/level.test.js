import test from 'node:test';
import assert from 'node:assert/strict';
import { updateGrade, placementStart } from '../js/level.js';
import { newProgress } from '../js/store.js';

const T0 = new Date(2026, 10, 3, 16, 0).getTime();

// n first-try attempts at `grade`, `right` of them correct, spread out in time before T0.
function attempts(grade, n, right, start = T0 - 1000000) {
  return Array.from({ length: n }, (_, i) => ({ wordId: `x${grade}-${i}`, grade, firstTry: i < right, ts: start + i * 1000 }));
}
function prog(grade, history) {
  const p = newProgress();
  p.grade = grade;
  p.history = history;
  return p;
}

test('up: 18 of the last 20 right at grade 6 moves to 7', () => {
  const p = prog(6, attempts(6, 20, 18));
  assert.deepEqual(updateGrade(p, T0), { grade: 7, changed: 'up' });
  assert.equal(p.grade, 7);
  assert.equal(p.gradeChangedAt, T0);
});

test('no change: 17 of 20 right, or fewer than 20 attempts', () => {
  assert.deepEqual(updateGrade(prog(6, attempts(6, 20, 17)), T0), { grade: 6, changed: null });
  assert.deepEqual(updateGrade(prog(6, attempts(6, 19, 19)), T0), { grade: 6, changed: null });
});

test('up uses the last 20 attempts at the grade (older misses fall off)', () => {
  const p = prog(6, [...attempts(6, 10, 0, T0 - 5e6), ...attempts(6, 20, 20)]);
  assert.equal(updateGrade(p, T0).changed, 'up');
});

test('down: 4 of the last 10 right at grade 6 moves to 5', () => {
  const p = prog(6, attempts(6, 10, 4));
  assert.deepEqual(updateGrade(p, T0), { grade: 5, changed: 'down' });
  assert.equal(p.grade, 5);
});

test('down needs 10 attempts and a rate below 50%; 5 of 10 holds', () => {
  assert.equal(updateGrade(prog(6, attempts(6, 9, 0)), T0).changed, null);
  assert.equal(updateGrade(prog(6, attempts(6, 10, 5)), T0).changed, null);
});

test('down uses the last 10 only', () => {
  const p = prog(8, [...attempts(8, 30, 30, T0 - 5e6), ...attempts(8, 10, 2)]);
  assert.equal(updateGrade(p, T0).changed, 'down');
});

test('grade 12 stays at 12, grade 5 stays at 5', () => {
  assert.deepEqual(updateGrade(prog(12, attempts(12, 20, 20)), T0), { grade: 12, changed: null });
  assert.deepEqual(updateGrade(prog(5, attempts(5, 10, 0)), T0), { grade: 5, changed: null });
});

test('attempts at other grades do not count', () => {
  const p = prog(6, [...attempts(5, 20, 20), ...attempts(7, 10, 0, T0 - 5e5)]);
  assert.equal(updateGrade(p, T0).changed, null);
});

test('only first-try correct counts as right', () => {
  // 20 attempts, all eventually spelled, but 4 of them needed a retry => 16/20 = 80%.
  assert.equal(updateGrade(prog(6, attempts(6, 20, 16)), T0).changed, null);
});

test('the window resets after a change: old attempts at the grade no longer count', () => {
  const p = prog(6, attempts(6, 20, 20));
  assert.equal(updateGrade(p, T0).changed, 'up'); // -> 7
  // Later the kid drops back to 6 (e.g. by struggling at 7). The earlier grade-6 attempts predate the change.
  p.grade = 6;
  p.gradeChangedAt = T0 + 1000;
  assert.deepEqual(updateGrade(p, T0 + 2000), { grade: 6, changed: null });
  p.history.push(...attempts(6, 20, 19, T0 + 5000));
  assert.equal(updateGrade(p, T0 + 1e6).changed, 'up');
});

test('the attempt that triggered a change is excluded from the next window', () => {
  const p = prog(6, attempts(6, 10, 0));
  assert.equal(updateGrade(p, T0).changed, 'down'); // grade 5, gradeChangedAt = T0
  p.history.push({ wordId: 'z', grade: 5, firstTry: false, ts: T0 }); // same ms as the change
  assert.equal(updateGrade(p, T0).changed, null);
});

test('updateGrade works without gradeChangedAt (older saves)', () => {
  const p = prog(6, attempts(6, 20, 20));
  delete p.gradeChangedAt;
  assert.equal(updateGrade(p, T0).changed, 'up');
});

// ---------- placement ----------

const round = (grade, misses) => Array.from({ length: 3 }, (_, i) => ({ grade, ok: i >= misses }));
const run = missesByGrade => [5, 6, 7, 8, 9, 10, 11, 12].flatMap(g => round(g, missesByGrade[g] || 0));

test('placement: grade 5 clean, grade 6 with 2 misses starts at 5', () => {
  assert.equal(placementStart(run({ 6: 2 })), 5);
});

test('placement: clean through 12 starts at 12', () => {
  assert.equal(placementStart(run({})), 12);
});

test('placement: 2 misses at grade 5 starts at 5 (minimum)', () => {
  assert.equal(placementStart(run({ 5: 2 })), 5);
});

test('placement: stops at the first grade with 2+ misses, one miss is fine', () => {
  assert.equal(placementStart(run({ 5: 1, 6: 1, 7: 1, 8: 3, 9: 3 })), 7);
  assert.equal(placementStart(run({ 12: 2 })), 11);
});

test('placement: results after the stop grade are ignored; order does not matter', () => {
  assert.equal(placementStart(run({ 8: 2 }).reverse()), 7);
  assert.equal(placementStart(run({ 7: 2 }).slice(0, 9)), 6);
});

test('placement: no results starts at 12 only if nothing was missed', () => {
  assert.equal(placementStart([]), 12);
});

test('custom-word history entries never count toward a grade move', () => {
  const p = prog(6, [...attempts('custom', 25, 25), ...attempts(6, 5, 5, T0 - 500000)]);
  assert.equal(updateGrade(p, T0).changed, null);
  const q = prog(6, [...attempts(6, 10, 10, T0 - 900000), ...attempts('custom', 30, 0)]);
  assert.equal(updateGrade(q, T0).changed, null, 'a pile of missed custom words does not move a kid down either');
  assert.equal(q.grade, 6);
});
