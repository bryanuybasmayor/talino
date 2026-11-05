/**
 * Simple hash-based router for SPA navigation.
 * Routes: #/ (home), #/report/:id, #/workspace, #/workspace/import, #/workspace/report/:id, #/workspace/report/:id/review
 */

const routes = [];
let currentCleanup = null;

export function route(pattern, handler) {
  // Convert pattern like '/report/:id' to regex
  const paramNames = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    pattern,
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    handler,
  });
}

export function navigate(path) {
  window.location.hash = path;
}

export function currentPath() {
  return window.location.hash.slice(1) || '/';
}

function matchRoute(path) {
  // Strip any anchor fragment after the path (e.g., /report/123#partb)
  const [cleanPath] = path.split('#');
  
  for (const r of routes) {
    const match = cleanPath.match(r.regex);
    if (match) {
      const params = {};
      r.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: r.handler, params };
    }
  }
  return null;
}

async function handleRoute() {
  const path = currentPath();
  const match = matchRoute(path);
  
  // Cleanup previous page
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
    currentCleanup = null;
  }

  const main = document.getElementById('main');
  if (!main) return;

  if (match) {
    try {
      currentCleanup = await match.handler(main, match.params);
    } catch (err) {
      console.error('Route error:', err);
      main.innerHTML = `
        <div class="flex items-center justify-center min-h-[60vh]">
          <div class="text-center">
            <h2 class="text-xl font-semibold text-ink mb-2">Something went wrong</h2>
            <p class="text-ink-muted">${err.message}</p>
            <a href="#/" class="inline-block mt-4 text-brand-primary hover:underline">Go home</a>
          </div>
        </div>`;
    }
  } else {
    main.innerHTML = `
      <div class="flex items-center justify-center min-h-[60vh]">
        <div class="text-center">
          <h2 class="text-xl font-semibold text-ink mb-2">Page not found</h2>
          <p class="text-ink-muted">The page "${path}" doesn't exist.</p>
          <a href="#/" class="inline-block mt-4 text-brand-primary hover:underline">Go home</a>
        </div>
      </div>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  // Initial route
  handleRoute();
}
