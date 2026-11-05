/**
 * Sidebar component — navigation + theme toggle.
 * Collapses to top bar on mobile.
 */

import { icon } from '../lib/icons.js';
import { currentPath } from '../lib/router.js';

function getTheme() {
  return localStorage.getItem('theme') || 'system';
}

function applyTheme(theme) {
  localStorage.setItem('theme', theme);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'dark' || (theme === 'system' && prefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const path = currentPath();
  const theme = getTheme();

  const navItems = [
    {
      href: '#/',
      label: 'Reports',
      icon: icon.home,
      match: /^\/$/,
      tile: 'from-brand-primary/25 to-accent-teal/15 text-brand-primary ring-brand-primary/25',
      activeTile: 'from-brand-primary/45 to-accent-teal/25 text-brand-primary ring-brand-primary/50',
      rail: 'from-brand-primary to-accent-teal',
      activeRow: 'bg-brand-primary/15 ring-1 ring-brand-primary/30 shadow-sm shadow-brand-primary/10',
    },
    {
      href: '#/workspace',
      label: 'Workspace',
      icon: icon.settings,
      match: /^\/workspace/,
      tile: 'from-accent-violet/25 to-accent-pink/15 text-accent-violet ring-accent-violet/25',
      activeTile: 'from-accent-violet/45 to-accent-pink/25 text-accent-violet ring-accent-violet/50',
      rail: 'from-accent-violet to-accent-pink',
      activeRow: 'bg-accent-violet/15 ring-1 ring-accent-violet/30 shadow-sm shadow-accent-violet/10',
    },
  ];

  sidebar.innerHTML = `
    <!-- Mobile top bar -->
    <div class="sidebar-dark lg:hidden fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center justify-between no-print">
      <div class="flex items-center gap-2">
        <span class="grid place-items-center w-8 h-8 rounded-xl bg-linear-to-br from-white/95 to-white/80 ring-1 ring-white/25 shadow-sm">
          <img src="/assets/logos/talino-mark.svg" alt="TALINO" class="w-6 h-6 rounded-md" />
        </span>
        <span class="font-display font-bold text-sm text-gradient">TALINO</span>
      </div>
      <div class="flex items-center gap-1.5">
        ${navItems.map(item => `
          <a href="${item.href}" class="p-2 rounded-lg transition-colors ${path.match(item.match) ? `bg-linear-to-br ${item.activeTile} ring-1 shadow-sm` : 'text-ink-muted hover:text-ink hover:bg-white/10'}" aria-label="${item.label}" title="${item.label}">
            ${item.icon}
          </a>
        `).join('')}
        <button id="theme-toggle-mobile" class="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-white/10 transition-colors" aria-label="Toggle theme">
          ${theme === 'dark' ? icon.moon : theme === 'light' ? icon.sun : icon.monitor}
        </button>
      </div>
    </div>
    <div class="lg:hidden h-14"></div>

    <!-- Desktop sidebar -->
    <div class="sidebar-dark hidden lg:flex flex-col w-60 h-screen sticky top-0 border-r border-border no-print">
      <div class="p-4 border-b border-border">
        <a href="#/" class="flex items-center gap-2.5 group">
          <span class="grid place-items-center w-10 h-10 rounded-xl bg-linear-to-br from-white/95 to-white/80 ring-1 ring-white/25 shadow-md shadow-black/20 transition-transform group-hover:scale-105">
            <img src="/assets/logos/talino-mark.svg" alt="TALINO" class="w-8 h-8 rounded-lg" />
          </span>
          <div>
            <span class="font-display font-bold text-sm text-gradient block leading-tight">TALINO</span>
            <span class="text-[10px] text-ink-faint uppercase tracking-widest">Insights</span>
          </div>
        </a>
      </div>

      <nav class="flex-1 p-3">
        <p class="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Navigate</p>
        <div class="space-y-1.5">
          ${navItems.map(item => `
            <a href="${item.href}" class="relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all ${
              path.match(item.match)
                ? `${item.activeRow} text-ink`
                : 'text-ink-muted hover:text-ink hover:bg-white/5'
            }">
              ${path.match(item.match) ? `<span aria-hidden="true" class="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-linear-to-b ${item.rail}"></span>` : ''}
              <span class="grid place-items-center w-8 h-8 rounded-lg bg-linear-to-br ring-1 transition-colors ${path.match(item.match) ? item.activeTile : item.tile} [&_svg]:w-4 [&_svg]:h-4">
                ${item.icon}
              </span>
              ${item.label}
            </a>
          `).join('')}
        </div>
      </nav>

      <div class="p-3 space-y-3 border-t border-border">
        <a href="#/workspace/import" class="group flex items-center gap-2.5 p-2.5 rounded-xl bg-linear-to-r from-brand-primary/20 via-accent-violet/15 to-brand-secondary/20 ring-1 ring-white/10 hover:ring-brand-primary/40 hover:shadow-sm hover:shadow-black/20 transition-all">
          <span class="grid place-items-center w-7 h-7 rounded-lg bg-white/10 text-brand-primary ring-1 ring-white/20 [&_svg]:w-4 [&_svg]:h-4">${icon.upload}</span>
          <span class="min-w-0">
            <span class="block text-xs font-semibold text-ink">New report</span>
            <span class="block text-[10px] text-ink-muted">Import data</span>
          </span>
          <span class="ml-auto text-ink-faint group-hover:text-brand-primary transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5">${icon.chevronRight}</span>
        </a>

        <div class="flex items-center gap-1 bg-white/5 rounded-xl p-1 ring-1 ring-inset ring-white/10" role="radiogroup" aria-label="Theme">
          ${[
            { id: 'light', icon: icon.sun, label: 'Light' },
            { id: 'dark', icon: icon.moon, label: 'Dark' },
            { id: 'system', icon: icon.monitor, label: 'System' },
          ].map(t => `
            <button data-theme="${t.id}" role="radio" aria-checked="${theme === t.id}" aria-label="${t.label}" title="${t.label}"
              class="flex-1 grid place-items-center py-1.5 rounded-lg transition-colors ${
                theme === t.id
                  ? 'bg-white/15 text-brand-primary ring-1 ring-white/15 shadow-sm'
                  : 'text-ink-muted hover:text-ink hover:bg-white/10'
              } [&_svg]:w-4 [&_svg]:h-4">
              ${t.icon}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Theme toggle handlers
  sidebar.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      renderSidebar();
    });
  });

  // Mobile theme toggle cycles through modes
  const mobileToggle = sidebar.querySelector('#theme-toggle-mobile');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const current = getTheme();
      const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      applyTheme(next);
      renderSidebar();
    });
  }
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') {
    applyTheme('system');
  }
});
