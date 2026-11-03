// Home (who's spelling?) and a kid's own page.

import { app } from '../app.js';
import { setView, e } from '../ui.js';
import { ALL_WORDS } from '../words.js';
import { cardId } from '../session.js';
import { isDue } from '../srs.js';
import { cachedRates, hubKidOk } from '../hubtickets.js';
import { beeHtml } from '../art.js';

export function render() {
  const hubKid = app.db.hub && app.db.hub.kid;
  const tiles = app.db.profiles.map(p => {
    const prog = app.prog(p.id);
    return `<a class="tile ${p.id === hubKid ? 'you' : ''}" href="#/p/${e(p.id)}" aria-label="${e(p.name)}, grade ${prog.grade}">
      <span class="in"><span class="em" aria-hidden="true">${e(p.avatar)}</span><span class="nm">${e(p.name)}</span><span class="sub">Grade ${prog.grade}</span></span>
    </a>`;
  }).join('');
  setView(`<div class="hero">
    ${beeHtml({ size: 'lg' })}
    <h1>Spelling Hive</h1>
    <p class="lead">Listen. Type. Build your spelling.</p>
  </div>
  <h2 style="text-align:center">Who's spelling today?</h2>
  <div class="hexes">${tiles}</div>`);
}

// #/p/<pid>: the kid's page.
export function renderKid({ pid }) {
  const p = app.profile(pid);
  const prog = app.prog(pid);
  const now = Date.now();
  const words = [...ALL_WORDS, ...app.db.customWords];
  let learned = 0, due = 0;
  for (const w of words) {
    const c = prog.cards[cardId(w.id)];
    if (!c || c.state === 'new') continue;
    if (c.state === 'review') learned++;
    if (isDue(c, now)) due++;
  }
  const hub = app.db.hub && app.db.hub.code;
  const per = cachedRates(app.storage, now).spellingWordsPerTicket;
  const earn = hub && hubKidOk(pid);
  const need = Math.max(1, Math.ceil(per - (prog.ticketUnits || 0)));
  const cta = prog.placementDone
    ? `<a class="btn primary big" href="#/p/${e(pid)}/practice">Start practising</a>`
    : `<a class="btn primary big" href="#/p/${e(pid)}/placement">Let's find your level</a>`;

  setView(`<div class="hero">
    ${beeHtml({ size: 'lg' })}
    <h1>Hi ${e(p.name)}!</h1>
    ${prog.placementDone ? `<span class="hexbadge" role="img" aria-label="Grade ${prog.grade}"><small>Grade</small><b>${prog.grade}</b></span>` : '<p class="lead">First, a quick round to find your level.</p>'}
    <div class="stats">
      <div class="stat"><b>${learned}</b><span>words learned</span></div>
      <div class="stat"><b>${due}</b><span>to review</span></div>
      ${earn ? `<div class="stat"><b>${need}</b><span>${need === 1 ? 'word' : 'words'} to next ticket</span></div>` : ''}
    </div>
    <div class="row center">${cta}</div>
    ${hub ? '' : '<p class="muted small" style="margin-top:14px">Join the family hub to earn TV tickets.</p>'}
    <p style="margin-top:18px"><a href="#/">← All players</a></p>
  </div>`);
}
