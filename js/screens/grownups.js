// Grown-ups: custom words, kid names and grades, voice, reset. Behind the AMC 8 Quest parent password
// (only its SHA-256 is stored here, never the password).

import { app } from '../app.js';
import { setView, e, openModal, confirmModal } from '../ui.js';
import { toast } from '../fx.js';
import { uid } from '../util.js';
import { upsertCustomWord, deleteCustomWord, resetProgress, clampGrade, MIN_GRADE, MAX_GRADE } from '../store.js';
import { englishVoices, setAudioSettings, sayWord, refreshVoices } from '../audio.js';

const PARENT_HASH = '3ea107e103aeecaceda90cd5d28027d44617058c00bd1b27289ec4d341302ff3';
const UNLOCK_MS = 15 * 60 * 1000;
let unlockedUntil = 0;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function render() {
  if (Date.now() < unlockedUntil) return view();
  gate();
}

function gate() {
  const root = setView(`<div class="panel gu">
    <h2>Grown-ups</h2>
    <p>Enter the parent password.</p>
    <form id="gate" autocomplete="off">
      <label class="field"><span>Password</span><input type="password" id="pw" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <p class="err" id="err" role="alert"></p>
      <div class="row"><button class="btn primary" type="submit">Unlock</button><a class="btn" href="#/">Back</a></div>
    </form>
  </div>`);
  const pw = root.querySelector('#pw');
  pw.focus();
  root.querySelector('#gate').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = root.querySelector('#err');
    if (!(window.crypto && crypto.subtle)) { err.textContent = 'This page needs a secure connection (https) to check the password.'; return; }
    const ok = (await sha256Hex(pw.value)) === PARENT_HASH;
    pw.value = '';
    if (!ok) { err.textContent = 'That is not the password.'; pw.focus(); return; }
    unlockedUntil = Date.now() + UNLOCK_MS;
    view();
  });
}

const gradeOptions = sel => { let o = ''; for (let g = MIN_GRADE; g <= MAX_GRADE; g++) o += `<option value="${g}" ${g === sel ? 'selected' : ''}>Grade ${g}</option>`; return o; };

function view() {
  const s = app.db.settings;
  const voices = englishVoices();
  const hub = app.db.hub;
  const words = app.db.customWords.slice().sort((a, b) => a.word.localeCompare(b.word));

  setView(`<div class="gu">
    <h1>Grown-ups</h1>

    <div class="panel">
      <h3>Kids</h3>
      ${app.db.profiles.map(p => {
        const prog = app.prog(p.id);
        return `<div class="stack" data-kid="${e(p.id)}" style="margin-bottom:18px">
          <label class="field"><span>Name</span><input type="text" data-name value="${e(p.name)}" maxlength="24" autocomplete="off"></label>
          <label class="field"><span>Grade</span><select data-grade>${gradeOptions(prog.grade)}</select></label>
          <p class="muted small">${prog.placementDone ? `Placement done. ${prog.stats.firstTryRight || 0} of ${prog.stats.attempted || 0} first-try right so far.` : 'Has not done the placement round yet.'}</p>
          <div class="row">
            <button class="btn" data-save-name>Save name</button>
            <button class="btn" data-replace>Run placement again</button>
            <button class="btn red" data-reset>Reset progress</button>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="panel">
      <h3>Voice</h3>
      <label class="field"><span>Voice</span>
        <select id="voice">
          <option value="">Automatic (best English voice)</option>
          ${voices.map(v => `<option value="${e(v.voiceURI)}" ${v.voiceURI === s.voice ? 'selected' : ''}>${e(v.name)} (${e(v.lang)})</option>`).join('')}
        </select>
      </label>
      ${voices.length ? '' : '<p class="muted small">This device has no English voice, so words show as text clues instead.</p>'}
      <label class="field"><span>Speed: <output id="rateout">${Number(s.rate).toFixed(2)}</output></span><input type="range" id="rate" min="0.6" max="1.2" step="0.05" value="${s.rate}"></label>
      <label class="field"><input type="checkbox" id="sound" ${s.sound ? 'checked' : ''}> Sound effects</label>
      <button class="btn" id="test">🔊 Test the voice</button>
    </div>

    <div class="panel">
      <h3>Your own words</h3>
      <p class="muted small">Added words are practised first. The sentence and meaning are optional. Without a sentence the app just says the word.</p>
      <form id="addform" autocomplete="off" class="stack">
        <label class="field"><span>Word</span><input type="text" id="w-word" maxlength="40" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="field"><span>Sentence (optional)</span><input type="text" id="w-sentence" maxlength="200" autocomplete="off"></label>
        <label class="field"><span>Meaning (optional)</span><input type="text" id="w-def" maxlength="200" autocomplete="off"></label>
        <p class="err" id="w-err" role="alert"></p>
        <button class="btn primary" type="submit">Add word</button>
      </form>
      ${words.length ? `<h3 style="margin-top:18px">${words.length} added</h3><ul class="wlist">${words.map(w => `<li data-id="${e(w.id)}">
        <span class="wtxt"><b translate="no">${e(w.word)}</b>${w.sentence ? `<br><span class="muted small">${e(w.sentence)}</span>` : ''}</span>
        <span class="row"><button class="btn" data-edit aria-label="Edit ${e(w.word)}">Edit</button><button class="btn red" data-del aria-label="Delete ${e(w.word)}">Delete</button></span>
      </li>`).join('')}</ul>` : ''}
    </div>

    <div class="panel">
      <h3>Family hub</h3>
      ${hub ? `<p>Connected${hub.kid ? ` (opened as ${e(hub.kid)})` : ''}. First-try words earn TV tickets.</p><button class="btn red" id="leave">Disconnect from the hub</button>`
            : '<p>Not connected. Open Spell Hive from the family hub to earn TV tickets and sync progress.</p>'}
    </div>

    <div class="row"><button class="btn" id="lock">Lock</button><a class="btn primary" href="#/">Done</a></div>
  </div>`, { wide: false });
  // Listeners go on this wrapper, which is replaced on every render. (#app itself outlives the screen.)
  const root = document.querySelector('#app .gu');

  const rerender = () => { const y = window.scrollY; view(); window.scrollTo(0, y); };

  // ---- kids ----
  root.addEventListener('click', async ev => {
    const kidEl = ev.target.closest('[data-kid]');
    if (kidEl) {
      const pid = kidEl.dataset.kid;
      const p = app.profile(pid);
      if (ev.target.closest('[data-save-name]')) {
        const v = kidEl.querySelector('[data-name]').value.trim();
        if (!v) { toast('A name can\'t be empty', { icon: '⚠️' }); return; }
        p.name = v; p.u = Date.now(); app.save();
        toast('Name saved', { icon: '✅', gold: true });
      } else if (ev.target.closest('[data-replace]')) {
        app.prog(pid).placementDone = false; app.save();
        toast(`${p.name} will do the placement round next time`, { icon: '🐝' });
        rerender();
      } else if (ev.target.closest('[data-reset]')) {
        const ok = await confirmModal(`Reset ${p.name}'s progress?`, 'This clears every word, grade and ticket progress for this kid, on all devices that sync. It cannot be undone.', { yes: 'Reset', danger: true });
        if (!ok) return;
        resetProgress(app.db, pid); app.save();
        toast('Progress reset', { icon: '🧹' });
        rerender();
      }
      return;
    }
    const li = ev.target.closest('li[data-id]');
    if (li && ev.target.closest('[data-edit]')) editWord(li.dataset.id, rerender);
    else if (li && ev.target.closest('[data-del]')) {
      const w = app.db.customWords.find(x => x.id === li.dataset.id);
      if (w && await confirmModal(`Delete "${w.word}"?`, 'It will be removed for both kids.', { yes: 'Delete', danger: true })) {
        deleteCustomWord(app.db, w.id); app.save(); rerender();
      }
    }
  });
  root.addEventListener('change', ev => {
    const sel = ev.target.closest('[data-grade]');
    if (sel) {
      const pid = sel.closest('[data-kid]').dataset.kid;
      const prog = app.prog(pid);
      prog.grade = clampGrade(sel.value);
      prog.gradeChangedAt = Date.now();
      prog.placementDone = true;
      app.save();
      toast(`${app.profile(pid).name} is now at grade ${prog.grade}`, { icon: '🐝', gold: true });
    }
  });

  // ---- voice ----
  const apply = () => { setAudioSettings(app.db.settings); app.save(); };
  root.querySelector('#voice').addEventListener('change', ev => { s.voice = ev.target.value || null; apply(); });
  root.querySelector('#rate').addEventListener('input', ev => { s.rate = Number(ev.target.value); root.querySelector('#rateout').textContent = s.rate.toFixed(2); apply(); });
  root.querySelector('#sound').addEventListener('change', ev => { s.sound = ev.target.checked; apply(); });
  root.querySelector('#test').addEventListener('click', () => { refreshVoices(); sayWord('necessary', 'It is necessary to bring a coat.'); });

  // ---- add word ----
  root.querySelector('#addform').addEventListener('submit', ev => {
    ev.preventDefault();
    const err = root.querySelector('#w-err');
    const word = root.querySelector('#w-word').value.trim();
    const sentence = root.querySelector('#w-sentence').value.trim();
    const definition = root.querySelector('#w-def').value.trim();
    const problem = checkWord(word, null);
    if (problem) { err.textContent = problem; return; }
    const w = { id: uid('c-'), word, grade: 'custom' };
    if (sentence) w.sentence = sentence;
    if (definition) w.definition = definition;
    upsertCustomWord(app.db, w);
    app.save();
    toast(`Added "${word}"`, { icon: '✅', gold: true });
    rerender();
  });

  // ---- hub / lock ----
  const leave = root.querySelector('#leave');
  if (leave) leave.addEventListener('click', async () => {
    if (!(await confirmModal('Disconnect from the hub?', 'This device stops syncing and stops sending tickets. Progress on this device stays.', { yes: 'Disconnect', danger: true }))) return;
    app.db.hub = null; app.db.sync = null; app.save();
    rerender();
  });
  root.querySelector('#lock').addEventListener('click', () => { unlockedUntil = 0; app.go('/'); });
}

// Returns an error message, or '' when the word is fine. `editingId` lets a word keep its own spelling.
function checkWord(word, editingId) {
  if (!word) return 'Type the word first.';
  if (!/^[A-Za-z][A-Za-z'’ -]*$/.test(word)) return 'Use letters, apostrophes, hyphens and spaces only.';
  const dup = app.db.customWords.find(w => w.word.toLowerCase() === word.toLowerCase() && w.id !== editingId);
  if (dup) return 'That word is already in your list.';
  return '';
}

function editWord(id, done) {
  const w = app.db.customWords.find(x => x.id === id);
  if (!w) return;
  openModal({
    title: 'Edit word',
    body: `<label class="field"><span>Word</span><input type="text" id="m-word" value="${e(w.word)}" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Sentence (optional)</span><input type="text" id="m-sentence" value="${e(w.sentence || '')}" maxlength="200" autocomplete="off"></label>
      <label class="field"><span>Meaning (optional)</span><input type="text" id="m-def" value="${e(w.definition || '')}" maxlength="200" autocomplete="off"></label>
      <p class="err" id="m-err" role="alert"></p>`,
    actions: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: 'Save', cls: 'primary', value: 'save' }],
    onOpen: (el, close) => {
      // Validate before closing: intercept the Save click.
      el.querySelector('.actions').addEventListener('click', ev => {
        const b = ev.target.closest('[data-i]');
        if (!b || +b.dataset.i !== 1) return;
        ev.stopPropagation();
        const word = el.querySelector('#m-word').value.trim();
        const problem = checkWord(word, id);
        if (problem) { el.querySelector('#m-err').textContent = problem; return; }
        const next = { id, word, grade: 'custom' };
        const sentence = el.querySelector('#m-sentence').value.trim();
        const def = el.querySelector('#m-def').value.trim();
        if (sentence) next.sentence = sentence;
        if (def) next.definition = def;
        upsertCustomWord(app.db, next);
        app.save();
        close('saved');
      }, true);
    },
  }).then(v => { if (v === 'saved') done(); });
}
