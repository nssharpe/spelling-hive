import test from 'node:test';
import assert from 'node:assert/strict';
import { blankSentence, diffRowsHtml, promptHtml, answerInputHtml } from '../js/screens/common.js';
import { checkSpelling } from '../js/spell.js';
import { wordById } from '../js/words.js';

const text = html => html.replace(/<span class="sr">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');

test('blankSentence blanks the word, any case, and words it starts', () => {
  assert.match(blankSentence("It's necessary to bring a coat.", 'necessary'), /It&#39;s <span[^>]*>____<\/span> to bring a coat\./);
  assert.match(blankSentence('Necessary things first.', 'necessary'), /^<span[^>]*>____<\/span> things first\.$/);
  assert.match(blankSentence('She believes you.', 'believe'), /She <span[^>]*>____<\/span> you\./);
});

test('blankSentence does not blank the middle of another word, and escapes HTML', () => {
  assert.equal(blankSentence('The cat sat.', 'at'), 'The cat sat.');
  assert.equal(blankSentence('<b>x</b> & cat', 'dog'), '&lt;b&gt;x&lt;/b&gt; &amp; cat');
});

test('blankSentence handles an apostrophe in the word', () => {
  assert.match(blankSentence("I know you're right.", "you're"), /I know <span[^>]*>____<\/span> right\./);
});

test('diffRowsHtml: extra letters are struck through, the word row skips them', () => {
  const r = diffRowsHtml(checkSpelling('neccessary', 'necessary').diff, 'neccessary');
  assert.equal(text(r.word.replace(/<div[^>]*>|<\/div>/g, '')), 'necessary');
  assert.equal((r.typed.match(/class="l extra"/g) || []).length, 1);
  assert.equal(text(r.typed.replace(/<div[^>]*>|<\/div>/g, '')), 'neccessary');
  assert.ok(r.typed.includes('(extra letter)'), 'screen-reader text, so colour is never the only cue');
});

test('diffRowsHtml: a wrong letter shows her letter in her row and the right one in the word row', () => {
  const r = diffRowsHtml(checkSpelling('recieve', 'receive').diff, 'recieve');
  assert.equal(text(r.word.replace(/<div[^>]*>|<\/div>/g, '')), 'receive');
  assert.equal(text(r.typed.replace(/<div[^>]*>|<\/div>/g, '')), 'recieve');
  assert.equal((r.word.match(/class="l wrong"/g) || []).length, 2);
});

test('diffRowsHtml: missing letters are boxed in the word row and left as gaps in hers', () => {
  const r = diffRowsHtml(checkSpelling('definate', 'definite').diff, 'definate');
  assert.equal((r.word.match(/class="l (wrong|missing)"/g) || []).length >= 1, true);
  const r2 = diffRowsHtml(checkSpelling('acomodate', 'accommodate').diff, 'acomodate');
  assert.equal((r2.word.match(/class="l missing"/g) || []).length, 2);
  assert.equal((r2.typed.match(/class="l gap"/g) || []).length, 2);
});

test('diffRowsHtml: skipping (empty answer) shows every letter as missing', () => {
  const r = diffRowsHtml(checkSpelling('', 'cat').diff, '');
  assert.equal((r.word.match(/class="l missing"/g) || []).length, 3);
});

test('promptHtml: with a voice there are replay buttons; without one, a blanked sentence and the meaning', () => {
  const w = { word: 'necessary', sentence: 'It is necessary to bring a coat.', definition: 'needed' };
  const v = promptHtml(w, { voice: true });
  assert.ok(v.includes('id="hearWord"') && v.includes('id="hearSent"'));
  assert.ok(!v.includes('necessary'), 'the word is never printed when there is a voice');
  const t = promptHtml(w, { voice: false });
  assert.ok(!t.includes('hearWord') && !t.includes('hearSent'), 'replay is hidden without a voice');
  assert.ok(!t.includes('necessary'), 'the word is blanked out of the sentence');
  assert.ok(t.includes('Meaning:') && t.includes('needed'));
});

test('promptHtml: a custom word with no sentence has no sentence button, and no clue without a voice says so', () => {
  const w = { word: 'gnome', grade: 'custom' };
  assert.ok(!promptHtml(w, { voice: true }).includes('hearSent'));
  assert.ok(promptHtml(w, { voice: false }).includes('No sound on this device'));
});

test('the answer input is not auto-corrected, auto-capitalised or spell-checked', () => {
  const h = answerInputHtml('ans');
  for (const a of ['autocomplete="off"', 'autocorrect="off"', 'autocapitalize="off"', 'spellcheck="false"']) assert.ok(h.includes(a), a);
});

test('February is a proper noun: matching ignores case, the correct spelling shows the capital', () => {
  const feb = wordById('g5-february');
  assert.equal(feb.word, 'February');
  for (const typed of ['february', 'FEBRUARY', ' February ']) assert.equal(checkSpelling(typed, feb.word).ok, true, typed);
  assert.equal(checkSpelling('febuary', feb.word).ok, false);
  const r = diffRowsHtml(checkSpelling('febuary', feb.word).diff, 'febuary', feb.word);
  assert.equal(text(r.word.replace(/<div[^>]*>|<\/div>/g, '')), 'February');
  assert.ok(r.word.includes('>F<'), 'capital F in the correct-spelling row');
  assert.equal(text(r.typed.replace(/<div[^>]*>|<\/div>/g, '')).replace(/&nbsp;/g, ''), 'febuary');
  // a miss on the very first letter still shows the word's own capital
  const r2 = diffRowsHtml(checkSpelling('xebruary', feb.word).diff, 'xebruary', feb.word);
  assert.ok(r2.word.includes('>F<'));
});
