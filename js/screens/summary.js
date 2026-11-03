// End-of-session summary. Not a route: practice.js calls renderSummary() with the session's results.

import { app } from '../app.js';
import { setView, e } from '../ui.js';
import { beeHtml } from '../art.js';
import { plural } from '../util.js';

/**
 * d = { pid, name, total, right: [Word], again: [Word], gradeChanges: [{from,to,dir}],
 *       hubOn, eligible, tickets, per, left, send: Promise|null }
 */
export function renderSummary(d) {
  const n = d.right.length;
  const ratio = d.total ? n / d.total : 0;
  const mood = ratio >= 0.8 ? 'wow' : ratio >= 0.5 ? 'happy' : 'wink';
  const headline = ratio >= 0.8 ? 'Buzzing! Great spelling.' : ratio >= 0.5 ? 'Nice work.' : 'Good practice. Those words will come back soon.';

  const chips = (list, cls = '') => list.length
    ? `<ul class="chips">${list.map(w => `<li class="chip ${cls}" translate="no">${e(w.word)}</li>`).join('')}</ul>`
    : '';

  const grade = d.gradeChanges.map(c => c.dir === 'up'
    ? `<div class="notice up" role="status">Level up! You moved up to grade ${c.to}.</div>`
    : `<div class="notice down" role="status">Moving to grade ${c.to} for a while so the words feel good. You've got this.</div>`).join('');

  let ticket = '';
  if (!d.hubOn) {
    ticket = '<div class="ticketline dim" id="ticketline">Join the family hub to earn TV tickets<br><span class="small muted">Open Spelling Hive from the family hub to connect this device.</span></div>';
  } else if (d.eligible && d.tickets >= 1) {
    ticket = `<div class="ticketline" id="ticketline" role="status">+${plural(d.tickets, 'ticket', 'tickets')} on the way to the hub…</div>`;
  } else if (d.eligible) {
    const more = Math.max(1, Math.ceil(d.per - d.left));
    ticket = `<div class="ticketline dim" id="ticketline">${plural(more, 'more first-try word', 'more first-try words')} for your next TV ticket</div>`;
  }

  const root = setView(`
    <div class="panel hero">
      ${beeHtml({ mood, size: 'lg' })}
      <h1>${e(headline)}</h1>
      <p class="score" aria-label="${n} of ${d.total} right on the first try">${n} <span class="muted" style="font-size:1.4rem">of ${d.total}</span></p>
      <p class="muted">right on the first try</p>
    </div>
    ${grade}
    ${ticket}
    ${n ? `<div class="panel"><h3>Spelled right first try</h3>${chips(d.right)}</div>` : ''}
    ${d.again.length ? `<div class="panel soft"><h3>Practice these again</h3><p class="muted small">They'll come back soon.</p>${chips(d.again, 'again')}</div>` : ''}
    <div class="row center">
      <button class="btn primary big" id="more">Practice more</button>
      <a class="btn big" href="#/p/${e(d.pid)}">Done</a>
    </div>`);

  root.querySelector('#more').addEventListener('click', () => app.go(`/p/${d.pid}/practice`));

  if (d.send) {
    d.send.then(res => {
      const el = document.getElementById('ticketline');
      if (!el) return;
      el.textContent = res && res.failed === 0
        ? `+${plural(d.tickets, 'ticket', 'tickets')} sent to the hub`
        : `+${plural(d.tickets, 'ticket', 'tickets')} saved. They'll be sent to the hub when you're online.`;
    });
  }
}
