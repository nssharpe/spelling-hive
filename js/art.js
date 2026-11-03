// Inline SVG: Bea the bee (the mascot) and honeycomb bits. All inline so nothing has to load.
// Colors are decorative (never text), but match the tokens in css/app.css.

const INK = '#2B1B0A';
const HONEY = '#F5B800';
let uidN = 0;

// mood: happy | wow | sad | wink | think
export function beeSvg(mood = 'happy') {
  const id = `bee${++uidN}`;
  const eyes = {
    happy: `<ellipse cx="48" cy="50" rx="4" ry="5" fill="${INK}"/><ellipse cx="72" cy="50" rx="4" ry="5" fill="${INK}"/><circle cx="49.4" cy="48" r="1.5" fill="#fff"/><circle cx="73.4" cy="48" r="1.5" fill="#fff"/>`,
    wow: `<circle cx="48" cy="50" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="72" cy="50" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="48" cy="51" r="3.2" fill="${INK}"/><circle cx="72" cy="51" r="3.2" fill="${INK}"/><path d="M41 40q7-5 13 0M66 40q7-5 13 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    sad: `<path d="M43 52q5-5 10 0M67 52q5-5 10 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M42 47l11-4M78 47l-11-4" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
    wink: `<ellipse cx="48" cy="50" rx="4" ry="5" fill="${INK}"/><circle cx="49.4" cy="48" r="1.5" fill="#fff"/><path d="M67 51q5-5 10 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
    think: `<ellipse cx="50" cy="48" rx="4" ry="5" fill="${INK}"/><ellipse cx="74" cy="48" rx="4" ry="5" fill="${INK}"/><circle cx="51.4" cy="46" r="1.5" fill="#fff"/><circle cx="75.4" cy="46" r="1.5" fill="#fff"/><path d="M42 39q6-3 12 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  }[mood] || '';
  const mouth = {
    happy: `<path d="M52 61q8 8 16 0" stroke="${INK}" stroke-width="2.6" fill="#C2410C" stroke-linejoin="round"/>`,
    wow: `<ellipse cx="60" cy="64" rx="4.5" ry="5.5" fill="${INK}"/>`,
    sad: `<path d="M53 66q7-6 14 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    wink: `<path d="M51 61q9 9 18-1" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    think: `<path d="M54 63h12" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  }[mood] || '';
  return `<svg viewBox="0 0 120 112" class="bee-svg" role="img" aria-label="Bea the bee">
  <defs><clipPath id="${id}"><ellipse cx="60" cy="64" rx="36" ry="33"/></clipPath></defs>
  <g class="wings" fill="#E4F3FB" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <ellipse cx="38" cy="30" rx="17" ry="11" transform="rotate(-32 38 30)"/>
    <ellipse cx="82" cy="30" rx="17" ry="11" transform="rotate(32 82 30)"/>
  </g>
  <path d="M48 34q-4-14-12-17M72 34q4-14 12-17" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <circle cx="35" cy="16" r="4" fill="${INK}"/><circle cx="85" cy="16" r="4" fill="${INK}"/>
  <ellipse cx="60" cy="64" rx="36" ry="33" fill="${HONEY}"/>
  <g clip-path="url(#${id})" fill="${INK}"><rect x="20" y="74" width="80" height="9"/><rect x="20" y="90" width="80" height="9"/></g>
  <ellipse cx="60" cy="64" rx="36" ry="33" fill="none" stroke="${INK}" stroke-width="2.6"/>
  <path d="M60 97v7" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="40" cy="60" r="4.5" fill="#F4977D" opacity=".7"/><circle cx="80" cy="60" r="4.5" fill="#F4977D" opacity=".7"/>
  ${eyes}
  ${mouth}
</svg>`;
}

export function beeHtml({ mood = 'happy', size = '', idle = true, id = '' } = {}) {
  return `<div class="bee ${size} ${idle ? 'idle' : ''}" ${id ? `id="${id}"` : ''} data-bee>${beeSvg(mood)}</div>`;
}

// Swap the mood, optionally with a one-shot animation class (bounce | wobble).
export function setBee(el, mood, anim) {
  if (!el) return;
  el.innerHTML = beeSvg(mood);
  if (anim) {
    el.classList.remove('bounce', 'wobble', 'idle');
    void el.offsetWidth;
    el.classList.add(anim);
    setTimeout(() => { el.classList.remove(anim); el.classList.add('idle'); }, 900);
  }
}

// A flat-top hexagon outline, for tiles and badges (size in px).
export function hexSvg(size = 24, fill = HONEY) {
  return `<svg viewBox="0 0 100 87" width="${size}" height="${Math.round(size * 0.87)}" aria-hidden="true" focusable="false"><polygon points="25,2 75,2 98,43.5 75,85 25,85 2,43.5" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></svg>`;
}
