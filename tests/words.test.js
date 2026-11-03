import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_WORDS, wordsForGrade, wordById } from '../js/words.js';

const GRADES = [5, 6, 7, 8, 9, 10, 11, 12];
const count = (s) => s.trim().split(/\s+/).length;
const escapeRe = (s) => [...s].map((c) => (/[A-Za-z]/.test(c) ? c : `\\${c}`)).join('');

test('every grade has 150 to 200 entries', () => {
  for (const g of GRADES) {
    const n = wordsForGrade(g).length;
    assert.ok(n >= 150 && n <= 200, `grade ${g} has ${n}`);
  }
  assert.equal(wordsForGrade(4).length, 0);
});

test('words are unique across all grades (case-insensitive)', () => {
  const seen = new Map();
  const dups = [];
  for (const w of ALL_WORDS) {
    const k = w.word.toLowerCase();
    if (seen.has(k)) dups.push(`${k} (g${seen.get(k)}, g${w.grade})`);
    else seen.set(k, w.grade);
  }
  assert.deepEqual(dups, []);
});

test('ids are unique and start with g<grade>-', () => {
  const ids = new Set();
  for (const w of ALL_WORDS) {
    assert.ok(!ids.has(w.id), `duplicate id ${w.id}`);
    ids.add(w.id);
    assert.ok(w.id.startsWith(`g${w.grade}-`), w.id);
  }
});

test('sentence contains the word as a whole word and has at most 16 words', () => {
  for (const w of ALL_WORDS) {
    const re = new RegExp(`(^|[^A-Za-z'-])${escapeRe(w.word)}($|[^A-Za-z'-])`, 'i');
    assert.ok(re.test(w.sentence), `${w.id}: sentence lacks word: ${w.sentence}`);
    assert.ok(count(w.sentence) <= 16, `${w.id}: sentence too long (${count(w.sentence)})`);
  }
});

test('definition does not contain the word and has at most 12 words', () => {
  for (const w of ALL_WORDS) {
    assert.ok(w.definition && w.definition.trim(), `${w.id}: empty definition`);
    assert.ok(!w.definition.toLowerCase().includes(w.word.toLowerCase()), `${w.id}: definition contains word: ${w.definition}`);
    assert.ok(count(w.definition) <= 12, `${w.id}: definition too long (${count(w.definition)})`);
  }
});

test('words are only letters, apostrophes or hyphens', () => {
  for (const w of ALL_WORDS) assert.match(w.word, /^[A-Za-z'-]+$/, w.id);
});

test('grade field matches its file and is a number', () => {
  for (const g of GRADES) {
    for (const w of wordsForGrade(g)) {
      assert.equal(w.grade, g, w.id);
      assert.ok(w.id.startsWith(`g${g}-`), w.id);
    }
  }
  assert.equal(ALL_WORDS.length, GRADES.reduce((n, g) => n + wordsForGrade(g).length, 0));
});

test('wordById finds words and returns undefined otherwise', () => {
  assert.equal(wordById('g5-believe').word, 'believe');
  assert.equal(wordById('nope'), undefined);
});
