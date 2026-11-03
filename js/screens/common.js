// Shared pieces of the practice and placement screens: the "hear it" prompt (or the text clue
// when this device has no English voice), the answer form, and the miss diff.

import { e } from '../ui.js';
import { normalize } from '../spell.js';
import { canSpeak, sayWord, speak } from '../audio.js';

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The sentence with the word (and anything the word starts, like "believes") blanked out.
// Returns safe HTML.
export function blankSentence(sentence, word) {
  const w = String(word || '').trim();
  if (!w) return e(sentence);
  const re = new RegExp('(?<![A-Za-z])' + escRe(e(w)) + '[A-Za-z]*', 'gi');
  return e(sentence).replace(re, '<span class="blank" role="img" aria-label="blank">____</span>');
}

// What the prompt shows. With a voice: Hear it / Hear the sentence. Without one: the blanked
// sentence and the definition as text clues, with no replay buttons.
export function promptHtml(w, { voice }) {
  if (voice) {
    return `<div class="hear">
      <button type="button" class="btn big primary" id="hearWord" aria-label="Hear the word"><span class="ic" aria-hidden="true">🔊</span> Hear it</button>
      ${w.sentence ? '<button type="button" class="btn big" id="hearSent" aria-label="Hear the sentence"><span class="ic" aria-hidden="true">🔊</span> Hear the sentence</button>' : ''}
    </div>`;
  }
  const bits = [];
  if (w.sentence) bits.push(`<p class="clue">${blankSentence(w.sentence, w.word)}</p>`);
  if (w.definition) bits.push(`<p class="meaning"><b>Meaning:</b> ${e(w.definition)}</p>`);
  if (!bits.length) bits.push('<p class="nocue">No sound on this device, and this word has no sentence or meaning to go on. Ask a grown-up to add one, or skip it.</p>');
  return `<div class="cues">${bits.join('')}</div>`;
}

export function hasClue(w) { return !!(w.sentence || w.definition); }

// Wire the replay buttons inside `root`.
export function wireHear(root, w) {
  const word = root.querySelector('#hearWord');
  const sent = root.querySelector('#hearSent');
  const play = (btn, fn) => btn && btn.addEventListener('click', () => {
    btn.classList.add('playing');
    const done = () => btn.classList.remove('playing');
    fn(done);
    setTimeout(done, 4000);
  });
  play(word, done => speak(w.word, { onend: done }));
  play(sent, done => speak(w.sentence, { onend: done }));
}

// Say it all: "word. sentence. word."
export function autoplay(w) {
  if (canSpeak()) sayWord(w.word, w.sentence);
}

export function answerInputHtml(id = 'ans', label = 'Type the word') {
  return `<input class="answer" id="${id}" type="text" inputmode="text" enterkeyhint="done" aria-label="${e(label)}"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" lang="en" translate="no">`;
}

// Build the two diff rows from checkSpelling's diff.
//   word row  – the correct spelling: wrong letters underlined, missing letters in dashed boxes.
//   typed row – what she typed: wrong letters underlined, extra letters struck through, gaps where
//               letters were left out.
// For `wrong` the diff carries the word's letter, so her letter comes from walking her input alongside.
// Returns safe HTML with screen-reader text so color is never the only cue.
export function diffRowsHtml(diff, input, target = '') {
  const typed = [...normalize(input)];
  const shown = [...String(target || '').normalize('NFC')]; // the word as written ("February"), for display
  let p = 0, j = 0;
  // The word's own letter at this position (keeps a proper noun's capital), else the diff's.
  const own = ch => { const c = shown[j++]; return c && normalize(c) === ch ? c : ch; };
  const wordCells = [];
  const mine = [];
  for (const d of diff) {
    if (d.kind === 'same') {
      p++;
      const c = own(d.ch);
      wordCells.push(`<span class="l same">${e(c)}</span>`);
      mine.push(`<span class="l same">${e(d.ch)}</span>`);
    } else if (d.kind === 'wrong') {
      const t = typed[p++] ?? '';
      wordCells.push(`<span class="l wrong">${e(own(d.ch))}<span class="sr"> (this letter was wrong)</span></span>`);
      mine.push(`<span class="l wrong">${e(t)}<span class="sr"> (wrong letter)</span></span>`);
    } else if (d.kind === 'missing') {
      wordCells.push(`<span class="l missing">${e(own(d.ch))}<span class="sr"> (you left this out)</span></span>`);
      mine.push('<span class="l gap"><span class="sr">(left out)</span>&nbsp;</span>');
    } else { // extra: only in her answer
      const t = typed[p++] ?? d.ch;
      mine.push(`<span class="l extra">${e(t)}<span class="sr"> (extra letter)</span></span>`);
    }
  }
  return {
    word: `<div class="diffrow" aria-label="Correct spelling">${wordCells.join('')}</div>`,
    typed: `<div class="diffrow typed" aria-label="Your answer">${mine.join('')}</div>`,
    legend: '<p class="legend">Underlined: a wrong letter. Dashed box: a letter you left out. Struck through: an extra letter.</p>',
  };
}
