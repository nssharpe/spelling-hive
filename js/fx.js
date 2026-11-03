// Confetti, floating "+10 XP" text and toasts.

import { escapeHtml } from './util.js';

const COLORS = ['#F2B33D', '#FFFFFF', '#2B2A33', '#E07A1F', '#18774A'];
let parts = [];
let raf = null;

function canvas() {
  const c = document.getElementById('fx');
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== innerWidth * dpr) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
  return c;
}

export function confetti({ count = 140, x = 0.5, y = 0.35, spread = 1, shapes = ['rect', 'circle'] } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = canvas();
  const dpr = window.devicePixelRatio || 1;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * spread;
    parts.push({
      x: x * c.width, y: y * c.height,
      vx: Math.cos(a) * v * dpr, vy: (Math.sin(a) * v - 7) * dpr,
      r: (4 + Math.random() * 5) * dpr,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[i % COLORS.length],
      shape: shapes[i % shapes.length],
      life: 0,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

function step() {
  const c = canvas();
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const dpr = window.devicePixelRatio || 1;
  parts = parts.filter(p => p.life < 220 && p.y < c.height + 40);
  for (const p of parts) {
    p.life++;
    p.vy += 0.25 * dpr;
    p.vx *= 0.985; p.vy *= 0.985;
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    g.strokeStyle = '#2B2A33';
    g.lineWidth = 1 * dpr;
    if (p.shape === 'circle') { g.beginPath(); g.arc(0, 0, p.r * 0.6, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else { g.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); g.strokeRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); }
    g.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : null;
  if (!raf) g.clearRect(0, 0, c.width, c.height);
}

export function floatText(text, el, { gold = false } = {}) {
  const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const f = document.createElement('div');
  f.className = 'floater' + (gold ? ' gold' : '');
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2 - 30 + (Math.random() * 30 - 15)}px`;
  f.style.top = `${r.top + r.height / 2 - 20}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

export function toast(title, { sub = '', icon = '✨', gold = false, ms = 3200 } = {}) {
  const root = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (gold ? ' gold' : '');
  t.innerHTML = `<span class="ti">${escapeHtml(icon)}</span><span>${escapeHtml(title)}${sub ? `<span class="ts">${escapeHtml(sub)}</span>` : ''}</span>`;
  root.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

export function bump(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}
