// UI helpers: modals, confirm, and small bits of markup.

import { escapeHtml } from './util.js';

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

export function starsHtml(n) {
  return `<div class="stars" aria-label="${n} of 5 stars">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= n ? '' : 'off'}">⭐</span>`).join('')}</div>`;
}

export function setView(html, { wide = false } = {}) {
  const root = document.getElementById('app');
  root.className = wide ? 'wide' : '';
  root.innerHTML = html;
  window.scrollTo(0, 0);
  return root;
}
