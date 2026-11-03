// Placeholder home screen: lists the kids. The real home (bee/honeycomb look, practice,
// placement, grown-ups) comes in the screens task.

import { app } from '../app.js';
import { setView, e } from '../ui.js';

export function render() {
  const kids = app.db.profiles.map(p => {
    const prog = app.prog(p.id);
    return `<li class="kid"><span class="avatar" aria-hidden="true">${e(p.avatar)}</span> <b>${e(p.name)}</b> <span class="muted">grade ${prog.grade}</span></li>`;
  }).join('');
  setView(`<h1>Spell Hive</h1><ul class="kids">${kids}</ul><p class="muted">Coming soon.</p>`);
}
