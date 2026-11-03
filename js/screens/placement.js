// The placement round, shown the first time a kid practices: 3 words per grade, starting at
// grade 5 and going up, until a grade has 2 misses. No right/wrong feedback while it runs, and
// nothing here touches history, cards, stats or tickets: placement only sets the starting grade.
// Leaving part-way saves nothing, so an aborted round never places a kid (placementStart([])
// would answer 12, so it is never called without answers).

import { app } from '../app.js';
import { setView, e } from '../ui.js';
import { GRADES, wordsForGrade } from '../words.js';
import { checkSpelling } from '../spell.js';
import { placementStart } from '../level.js';
import { shuffle } from '../util.js';
import { beeHtml, setBee } from '../art.js';
import { sfx, voicesReady, canSpeak, onVoicesChanged, stopSpeech } from '../audio.js';
import { promptHtml, wireHear, autoplay, answerInputHtml, hasClue } from './common.js';

const PER_GRADE = 3;

export async function render({ pid }) {
  const kid = app.profile(pid);
  const prog = app.prog(pid);
  if (!kid || !prog) { app.go('/'); return; }
  if (prog.placementDone) { app.go(`/p/${pid}`); return; }

  let cleanupFn = null;
  intro();

  function intro() {
    const root = setView(`<div class="panel hero">
      ${beeHtml({ mood: 'happy', size: 'lg' })}
      <h1>Let's find your level</h1>
      <p class="lead">I'll say some words, starting easy and getting trickier. Type each one. There's no hurry, and mistakes are fine. It just helps me pick the right words for you.</p>
      <div class="row center"><button class="btn primary big" id="go">Let's go</button></div>
      <p style="margin-top:14px"><button class="btn ghost" id="skip">Skip: start at grade 5</button></p>
      <p><a href="#/p/${e(pid)}">Not now</a></p>
    </div>`);
    root.querySelector('#go').addEventListener('click', () => { sfx.tap(); start(); });
    root.querySelector('#skip').addEventListener('click', () => {
      prog.grade = 5; prog.gradeChangedAt = Date.now(); prog.placementDone = true; app.save();
      app.go(`/p/${pid}`);
    });
  }

  async function start() {
    const hashBefore = location.hash;
    let voice = await voicesReady(1500);
    if (location.hash !== hashBefore) return; // navigated away while we waited
    // 3 random words per grade (not the same three every time).
    const plan = GRADES.map(g => ({ grade: g, words: shuffle(wordsForGrade(g)).slice(0, PER_GRADE) })).filter(p => p.words.length);
    const results = []; // { grade, ok }
    let gi = 0, wi = 0, cur = null, busy = false;

    const root = setView(`
      <div class="topline"><a class="btn ghost" href="#/p/${e(pid)}">✕ Not now</a><span class="count" id="count" aria-live="polite"></span></div>
      <div class="stage" id="stage">${beeHtml({ mood: 'think' })}</div>
      <div class="card">
        <div id="promptBox"></div>
        <form id="form" class="formrow" autocomplete="off">
          ${answerInputHtml('ans')}
          <div class="askrow">
            <button type="submit" class="btn primary big">Next</button>
            <button type="button" class="btn" id="idk">I don't know</button>
          </div>
        </form>
      </div>`, { wide: true });
    const $ = s => root.querySelector(s);
    const input = $('#ans');

    function drawPrompt() {
      $('#promptBox').innerHTML = promptHtml(cur, { voice });
      wireHear($('#promptBox'), cur);
    }
    function ask() {
      const p = plan[gi];
      cur = p.words[wi];
      busy = false;
      input.value = '';
      $('#count').textContent = `Word ${results.length + 1}`;
      drawPrompt();
      input.focus();
      if (voice) setTimeout(() => { if (cur && !busy) autoplay(cur); }, 200);
    }
    function answer(raw, skipped) {
      if (busy) return;
      if (!skipped && !raw.trim()) return;
      if (skipped && !voice && !hasClue(cur)) { // nothing to go on: not counted either way
        return advance(null);
      }
      busy = true;
      const ok = !skipped && checkSpelling(raw, cur.word).ok;
      sfx.tap();
      advance({ grade: plan[gi].grade, ok });
    }
    function advance(r) {
      if (r) results.push(r);
      wi++;
      const g = plan[gi].grade;
      const misses = results.filter(x => x.grade === g && !x.ok).length;
      if (misses >= 2 || wi >= plan[gi].words.length) { gi++; wi = 0; }
      if (misses >= 2 || gi >= plan.length) return finish(results);
      ask();
    }

    $('#form').addEventListener('submit', ev => { ev.preventDefault(); answer(input.value, false); });
    $('#idk').addEventListener('click', () => answer('', true));
    const offVoices = onVoicesChanged(() => {
      const v = canSpeak();
      if (v !== voice && cur && !busy) { voice = v; drawPrompt(); }
    });
    cleanupFn = () => { offVoices(); stopSpeech(); };
    ask();
  }

  function finish(results) {
    stopSpeech();
    if (!results.length) { intro(); return; } // nothing answered: never place from an empty round
    const start = placementStart(results);
    prog.grade = start;
    prog.gradeChangedAt = Date.now();
    prog.placementDone = true;
    app.save();
    sfx.fanfare();
    const root = setView(`<div class="panel hero">
      ${beeHtml({ mood: 'wow', size: 'lg' })}
      <h1>You're starting at grade ${start}</h1>
      <p class="lead">I'll pick words that fit, and move you up as you get them right.</p>
      <div class="row center"><a class="btn primary big" href="#/p/${e(pid)}/practice">Start practicing</a></div>
    </div>`);
    setBee(root.querySelector('.bee'), 'wow', 'bounce');
  }

  return () => { if (cleanupFn) cleanupFn(); stopSpeech(); };
}
