// The route table. Pure (loaders are dynamic imports, nothing runs at import), so tests can use it.
// Each screen module exports render({pid, arg, params}) (or `entry`) and may return a cleanup function.
// `kid: true` routes take the kid's id as their first capture; an unknown kid goes home.

export const routes = [
  { re: /^\/?$/, load: () => import('./screens/home.js') },
  { re: /^\/p\/([\w-]+)$/, load: () => import('./screens/home.js'), entry: 'renderKid', kid: true },
  { re: /^\/p\/([\w-]+)\/practice$/, load: () => import('./screens/practice.js'), kid: true },
  { re: /^\/p\/([\w-]+)\/placement$/, load: () => import('./screens/placement.js'), kid: true },
  { re: /^\/grown-ups$/, load: () => import('./screens/grownups.js') },
];

// -> { route, m } for the first route matching the hash path, or null (the router sends that home).
export function resolve(hash) {
  for (const route of routes) {
    const m = String(hash).match(route.re);
    if (m) return { route, m };
  }
  return null;
}

// Where to go instead, if this hash names a kid this device doesn't have; otherwise null.
export function redirectFor(hash, hasProfile) {
  const r = resolve(hash);
  if (r && r.route.kid && !hasProfile(r.m[1])) return '/';
  return null;
}
