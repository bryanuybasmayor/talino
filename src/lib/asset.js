/**
 * Resolve a public-folder asset path against the app's base URL.
 *
 * Assets referenced from HTML templates are strings, so Vite cannot rewrite
 * them at build time. When the app is served from a sub-path (GitHub Pages
 * project site) a hard-coded "/assets/..." would point at the domain root.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;

  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
