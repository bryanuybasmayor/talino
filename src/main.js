/**
 * Main entry point — sets up router, sidebar, and brand variables.
 */

import { route, startRouter, navigate } from './lib/router.js';
import { renderSidebar } from './components/sidebar.js';
import { getClients } from './lib/api.js';

// ── Apply brand colors as CSS variables ──────────────────────────────────
async function applyBrandColors() {
  try {
    const clients = await getClients();
    if (clients.length > 0) {
      const client = clients[0];
      const root = document.documentElement;
      root.style.setProperty('--client-primary', client.brand_colors?.primary || '#00D4D4');
      root.style.setProperty('--client-secondary', client.brand_colors?.secondary || '#FF6B35');
    }
  } catch (e) {
    // Use defaults
  }
}

// ── Register routes ──────────────────────────────────────────────────────
// Home
route('/', async (main) => {
  const { renderHome } = await import('./pages/home.js');
  return renderHome(main);
});

// Report view
route('/report/:id', async (main, params) => {
  const { renderReport } = await import('./pages/report.js');
  return renderReport(main, params.id);
});

// Workspace home
route('/workspace', async (main) => {
  const { renderWorkspace } = await import('./pages/workspace.js');
  return renderWorkspace(main);
});

// Import wizard
route('/workspace/import', async (main) => {
  const { renderImport } = await import('./pages/workspace-import.js');
  return renderImport(main);
});

// Report workspace
route('/workspace/report/:id', async (main, params) => {
  const { renderWorkspaceReport } = await import('./pages/workspace-report.js');
  return renderWorkspaceReport(main, params.id);
});

// Review screen
route('/workspace/report/:id/review', async (main, params) => {
  const { renderReview } = await import('./pages/workspace-review.js');
  return renderReview(main, params.id);
});

// ── Initialize ───────────────────────────────────────────────────────────
async function init() {
  await applyBrandColors();
  renderSidebar();
  
  // Re-render sidebar on navigation
  window.addEventListener('hashchange', () => renderSidebar());
  
  startRouter();
}

init();
