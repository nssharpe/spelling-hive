// UI helpers: modals, confirm, and small bits of markup.

import { escapeHtml } from './util.js';
import { app } from './app.js';
import { beeHtml } from './art.js';

export const e = escapeHtml;

/**
 * Open a modal. actions: [{ label, cls, value }]. Resolves with the clicked
 * action's value (or null when dismissed). `onOpen(el, close)` lets callers wire
 * up custom content; call close(value) to resolve.
 */
export function openModal({ title = '', body = '', actions = [{ label: 'OK', cls: 'primary', value: true }], onOpen, dismissable = true } = {}) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${title ? 'aria-label="' + e(title) + '"' : ''}>
      ${title ? `<h2>${e(title)}</h2>` : ''}
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${e(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    let done = false;
    const prevFocus = document.activeElement;
    const close = value => {
      if (done) return;
      done = true;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch { /* gone */ }
      resolve(value === undefined ? null : value);
    };
    const onKey = ev => {
      if (ev.key === 'Escape' && dismissable) { ev.stopPropagation(); close(null); }
    };
    back.addEventListener('click', ev => {
      if (ev.target === back && dismissable) close(null);
      const b = ev.target.closest('[data-i]');
      if (b && b.parentElement.classList.contains('actions')) {
        const a = actions[+b.dataset.i];
        close(a.value === undefined ? true : a.value);
      }
    });
    document.addEventListener('keydown', onKey, true);
    root.appendChild(back);
    const first = back.querySelector('input, textarea, select') || back.querySelector('.actions .btn:last-child');
    if (first) setTimeout(() => first.focus(), 30);
    if (onOpen) onOpen(back.querySelector('.modal'), close);
  });
}

// Screen-level keyboard shortcuts should stand down while a modal is up.
export function isModalOpen() {
  return !!document.querySelector('#modal-root .modal-back');
}

export function confirmModal(title, body, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return openModal({
    title, body: `<p>${body}</p>`,
    actions: [{ label: no, cls: 'ghost', value: false }, { label: yes, cls: danger ? 'red' : 'primary', value: true }],
  }).then(v => v === true);
}

// Where the "← Hub" link goes for the kid who was handed over from the family hub.
export function hubUrl(kid) {
  return 'https://nssharpe.github.io/family-hub/#/kid/' + encodeURIComponent(kid || '');
}

// The top bar: brand on the left, "← Hub" (only when this device came from the hub) and grown-ups on the right.
export function renderBar() {
  const bar = document.getElementById('bar');
  if (!bar) return;
  const hub = app.db && app.db.hub;
  bar.innerHTML = `<a class="brand" href="#/" aria-label="Spell Hive home">${beeHtml({ size: 'sm', idle: false })}<span>Spell Hive</span></a>
    <nav aria-label="Site">
      ${hub && hub.kid ? `<a href="${e(hubUrl(hub.kid))}">← Hub</a>` : ''}
      <a href="#/grown-ups">Grown-ups</a>
    </nav>`;
}

export function setView(html, { wide = false } = {}) {
  const root = document.getElementById('app');
  root.className = wide ? 'wide' : '';
  root.innerHTML = html;
  renderBar();
  window.scrollTo(0, 0);
  return root;
}
