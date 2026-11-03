// The practice screen: hear the word, type it, get feedback. One session is up to 15 words.
//
// Bookkeeping, per word PRESENTED (never for the forced retype after a miss):
//   recordAttempt once  -> history, card.miss, stats, and `firstTry`
//   schedule the SRS card separately (AGAIN on a miss, GOOD on a right answer)
//   updateGrade, and note any grade change for the summary
//   first-try-correct words are banked as ticket units (when this kid can earn hub tickets)
// A card that comes back later in the session is a new presentation, so it records again.

import { app } from '../app.js';
import { setView, e, isModalOpen } from '../ui.js';
import { ALL_WORDS } from '../words.js';
import { cardId, Session } from '../session.js';
import { checkSpelling, recordAttempt, buildSpellingQueue } from '../spell.js';
import { updateGrade } from '../level.js';
import { schedule, newCard, AGAIN, GOOD } from '../srs.js';
import { settleSession, cachedRates, hubKidOk } from '../hubtickets.js';
import { beeHtml, setBee } from '../art.js';
import { sfx, voicesReady, canSpeak, onVoicesChanged, stopSpeech } from '../audio.js';
import { confetti } from '../fx.js';
import { promptHtml, wireHear, autoplay, answerInputHtml, diffRowsHtml, hasClue } from './common.js';
import { renderSummary } from './summary.js';

export const SESSION_SIZE = 15;

export async function render({ pid }) {
  const kid = app.profile(pid);
  const prog = app.prog(pid);
  if (!kid || !prog) { app.go('/'); return; }
  if (!prog.placementDone) { app.go(`/p/${pid}/placement`); return; }

  setView('<p class="muted" style="text-align:center">Getting your words ready…</p>');
  let voice = await voicesReady(1500);
  if (!document.getElementById('app')) return;

  const words = [...ALL_WORDS, ...app.db.customWords];
  const byCard = new Map(words.map(w => [cardId(w.id), w]));
  const queue = buildSpellingQueue(prog, words, Date.now(), SESSION_SIZE);
  if (!queue.length) {
    setView(`<div class="panel hero">${beeHtml({ mood: 'wink' })}<h2>Nothing to practise right now</h2><p>You're all caught up. Come back later!</p><a class="btn primary" href="#/p/${e(pid)}">Back</a></div>`);
    return;
  }

  const session = new Session(queue);
  const hub = app.db.hub && app.db.hub.code ? app.db.hub.code : null;
  const canEarn = !!hub && hubKidOk(pid);

  const S = {
    phase: 'idle',           // ask | retype | done | idle
    w: null, input: '',
    completed: new Set(),    // card ids finished at least once this session
    presented: new Set(),    // word ids
    right: new Map(),        // first-try-correct words
    missed: new Map(),       // words missed at least once
    gradeChanges: [],
    units: 0,                // first-try words banked as ticket units
    attempts: 0,
    startGrade: prog.grade,
    finished: false,
    nextAt: 0,
  };

  setView(`<div class="practice">
    <div class="topline">
      <a class="btn ghost" href="#/p/${e(pid)}" id="quit" aria-label="Stop practising">✕ Finish</a>
      <span class="count" id="count" aria-live="polite"></span>
    </div>
    <div class="progress" id="pg" aria-hidden="true"></div>
    <div class="stage" id="stage">${beeHtml({ mood: 'happy' })}</div>
    <div class="card" id="card">
      <div id="promptBox"></div>
      <form id="form" class="formrow" autocomplete="off">
        ${answerInputHtml('ans')}
        <div class="askrow">
          <button type="submit" class="btn primary big" id="check">Check</button>
          <button type="button" class="btn" id="idk">I don't know</button>
        </div>
      </form>
    </div>
    <div id="fb" aria-live="polite"></div>
    </div>`, { wide: true });
  // Listeners go on this wrapper, which is replaced with the screen. (#app itself outlives the screen.)
  const root = document.querySelector('#app .practice');

  const $ = sel => root.querySelector(sel);
  const bee = () => $('#stage .bee');
  const input = $('#ans');
  const form = $('#form');

  function drawProgress() {
    const total = session.total;
    const done = Math.min(total, S.completed.size);
    $('#pg').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'done' : i === done ? 'now' : ''}"></i>`).join('');
    $('#count').textContent = `${Math.min(done + 1, total)} of ${total}`;
  }

  function drawPrompt() {
    const w = S.w;
    $('#promptBox').innerHTML = promptHtml(w, { voice });
    wireHear($('#promptBox'), w);
    $('#idk').textContent = voice || hasClue(w) ? "I don't know" : 'Skip this word';
  }

  function present() {
    let id = session.next(Date.now());
    while (id && !byCard.get(id)) id = session.next(Date.now()); // a word that was deleted: skip it
    if (!id) return finish(true);
    const w = byCard.get(id);
    S.w = w; S.phase = 'ask'; S.input = '';
    $('#fb').innerHTML = '';
    form.classList.remove('hidden');
    input.value = '';
    input.disabled = false;
    setBee(bee(), 'happy');
    drawProgress();
    drawPrompt();
    input.focus();
    if (voice) setTimeout(() => { if (S.phase === 'ask' && S.w === w) autoplay(w); }, 200);
  }

  function showDef(w) {
    return w.definition ? `<p class="def"><b>${e(w.word)}</b> — ${e(w.definition)}</p>` : '';
  }
  function nextBtn(label = 'Next') {
    S.nextAt = Date.now() + 400; // ignore the Enter that just submitted the answer
    return `<div class="nextrow"><button type="button" class="btn primary big" id="next">${e(label)}</button></div>`;
  }
  function focusNext() { setTimeout(() => { const b = $('#next'); if (b) b.focus(); }, 450); }
  const lastOne = () => session.remaining === 0;

  function submit(raw, skipped = false) {
    if (S.phase !== 'ask') return;
    const w = S.w;
    if (!skipped && !raw.trim()) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); return; }
    if (skipped && !voice && !hasClue(w)) { // nothing to go on: drop the word without counting it
      S.phase = 'done';
      return next();
    }
    S.phase = 'feedback'; // no re-entry while we process
    const now = Date.now();
    const res = checkSpelling(skipped ? '' : raw, w.word);
    const { firstTry } = recordAttempt(prog, w.id, res.ok, now);   // exactly once per presented word
    const id = cardId(w.id);
    prog.cards[id] = schedule(prog.cards[id] || newCard(), res.ok ? GOOD : AGAIN, now);
    session.answered(id, prog.cards[id], now);
    S.attempts++; S.presented.add(w.id);
    if (res.ok && firstTry) {
      S.right.set(w.id, w);
      if (canEarn) { prog.ticketUnits = (Number(prog.ticketUnits) || 0) + 1; S.units++; }
    }
    if (!res.ok) S.missed.set(w.id, w);
    const before = prog.grade;
    const g = updateGrade(prog, now);
    if (g.changed) S.gradeChanges.push({ from: before, to: g.grade, dir: g.changed });
    app.save();

    form.classList.add('hidden');
    if (res.ok) {
      S.completed.add(id);
      drawProgress();
      S.phase = 'done';
      sfx.correct();
      setBee(bee(), 'wow', 'bounce');
      const cheer = firstTry ? ['Yes!', 'Nice one!', 'Spot on!', 'Buzzing!'][S.attempts % 4] : 'You got it this time!';
      $('#fb').innerHTML = `<div class="fb good" role="status">
        <h2>${cheer}</h2>
        <div class="word-big" translate="no">${e(w.word)}</div>
        ${showDef(w)}
        ${nextBtn(lastOne() ? 'See my results' : 'Next')}
      </div>`;
      focusNext();
    } else {
      S.phase = 'retype';
      sfx.wrong();
      setBee(bee(), 'sad', 'wobble');
      showMiss(w, res, raw, skipped);
    }
  }

  function showMiss(w, res, raw, skipped, again = false) {
    const rows = diffRowsHtml(res.diff, skipped ? '' : raw);
    $('#fb').innerHTML = `<div class="fb bad" role="status">
      <h2>${again ? 'Not quite yet.' : 'Not quite.'} Here's the word:</h2>
      ${rows.word}
      ${skipped ? '' : `<p class="diffcap">You typed</p>${rows.typed}`}
      ${rows.legend}
      <form class="retype" id="retypeForm" autocomplete="off">
        <label for="re">Type it once more:</label>
        ${answerInputHtml('re', 'Type the word once more')}
        <div class="nextrow"><button type="submit" class="btn primary big">Check</button></div>
      </form>
    </div>`;
    const re = $('#re');
    re.focus();
    $('#retypeForm').addEventListener('submit', ev => {
      ev.preventDefault();
      if (S.phase !== 'retype') return;
      const v = re.value;
      if (!v.trim()) return;
      const r2 = checkSpelling(v, w.word);   // not recorded: the miss already counted
      if (r2.ok) {
        S.completed.add(cardId(w.id));
        drawProgress();
        S.phase = 'done';
        sfx.correct();
        setBee(bee(), 'happy', 'bounce');
        $('#fb').innerHTML = `<div class="fb good" role="status">
          <h2>That's it!</h2>
          <div class="word-big" translate="no">${e(w.word)}</div>
          ${showDef(w)}
          ${nextBtn(lastOne() ? 'See my results' : 'Next')}
        </div>`;
        focusNext();
      } else {
        sfx.wrong();
        re.classList.remove('shake'); void re.offsetWidth; re.classList.add('shake');
        showMiss(w, r2, v, false, true);
      }
    });
  }

  function next() {
    if (S.phase !== 'done') return;
    present();
  }

  // ---- finishing ----

  let result = null;
  function finalize() {
    if (S.finished) return result;
    S.finished = true;
    const now = Date.now();
    const rates = cachedRates(app.storage, now);
    const per = rates.spellingWordsPerTicket;
    const { tickets, event } = settleSession(prog, { kid: pid, hub, rates, now, units: S.units });
    let queued = false;
    if (event) {
      queued = app.outbox().add(event);
      if (!queued) prog.ticketUnits += tickets * per; // the outbox refused it: keep the units
    }
    app.save();
    result = {
      tickets: queued ? tickets : 0, per, queued,
      send: queued ? app.flushTickets() : null,
      left: prog.ticketUnits,
    };
    return result;
  }

  function finish(natural) {
    if (!S.attempts) { app.go(`/p/${pid}`); return; }
    const r = finalize();
    stopSpeech();
    sfx.fanfare();
    const total = S.presented.size;
    if (S.right.size / Math.max(1, total) >= 0.7 || r.tickets) confetti({ count: 120 });
    renderSummary({
      pid, name: kid.name, total,
      right: [...S.right.values()], again: [...S.missed.values()],
      gradeChanges: S.gradeChanges,
      hubOn: !!hub, eligible: canEarn,
      tickets: r.tickets, per: r.per, left: r.left, send: r.send,
      natural,
    });
  }

  // ---- events ----

  form.addEventListener('submit', ev => { ev.preventDefault(); submit(input.value); });
  $('#idk').addEventListener('click', () => submit('', true));
  root.addEventListener('click', ev => {
    if (ev.target.closest('#next')) next();
    if (ev.target.closest('#quit')) { ev.preventDefault(); finish(false); }
  });
  const onKey = ev => {
    if (ev.key !== 'Enter' || ev.repeat || isModalOpen()) return;
    if (S.phase === 'done' && Date.now() >= S.nextAt && !S.finished) { ev.preventDefault(); next(); }
  };
  document.addEventListener('keydown', onKey);
  const offVoices = onVoicesChanged(() => {
    const v = canSpeak();
    if (v !== voice && S.phase === 'ask' && S.w) { voice = v; drawPrompt(); }
  });

  present();

  return () => {
    document.removeEventListener('keydown', onKey);
    offVoices();
    stopSpeech();
    if (!S.finished && S.attempts) finalize(); // left mid-session: still send what was earned
  };
}
