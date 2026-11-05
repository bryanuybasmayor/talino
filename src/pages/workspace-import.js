import { getClients, createReport, importCSVs } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { card, button } from '../components/ui.js';
import Papa from 'papaparse';

export async function renderImport(main) {
  let clients = [];
  try { clients = await getClients(); } catch (e) { /* empty */ }

  main.innerHTML = `
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <a href="#/workspace" class="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors mb-6">${icon.chevronRight} Back to workspace</a>
      <div class="flex items-center gap-3 mb-6">
        <span aria-hidden="true" class="h-6 w-1 rounded-full bg-linear-to-b from-brand-primary to-accent-violet"></span>
        <h1 class="text-2xl font-bold font-display text-ink">New Report</h1>
      </div>

      ${card(`<div class="p-5 space-y-5">
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Client</label>
          <select id="imp-client" class="w-full px-3 py-2 rounded-md border border-border bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary">
            ${clients.map(c => `<option value="${c.slug}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Report title</label>
          <input id="imp-title" type="text" value="New report" class="w-full px-3 py-2 rounded-md border border-border bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Period start</label>
            <input id="imp-start" type="date" value="2025-01-01" class="w-full px-3 py-2 rounded-md border border-border bg-surface text-ink text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Period end</label>
            <input id="imp-end" type="date" value="2026-10-22" class="w-full px-3 py-2 rounded-md border border-border bg-surface text-ink text-sm" />
          </div>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input id="imp-sample" type="checkbox" class="rounded border-border text-brand-primary focus:ring-brand-primary" />
          <span class="text-sm text-ink">This is sample / dummy data</span>
        </label>
      </div>`, { class: 'mb-6' })}

      ${card(`<div class="p-5">
        <h2 class="text-sm font-semibold text-ink mb-3">Upload CSV files</h2>
        <div id="drop-zone" class="border-2 border-dashed border-border rounded-2xl bg-surface-alt/40 p-8 text-center hover:border-brand-primary/60 hover:bg-brand-primary/5 transition-colors cursor-pointer">
          <span class="grid place-items-center w-12 h-12 mx-auto mb-3 rounded-2xl bg-linear-to-br from-brand-primary/20 to-accent-violet/10 text-brand-primary ring-1 ring-brand-primary/20 [&_svg]:w-5 [&_svg]:h-5">${icon.upload}</span>
          <p class="text-sm text-ink-muted">Drop CSV files here or click to browse</p>
          <input id="file-input" type="file" accept=".csv" multiple class="hidden" />
        </div>
        <div id="file-list" class="mt-4 space-y-2"></div>
      </div>`, { class: 'mb-6' })}

      <div id="preview-area" class="mb-6 hidden"></div>
      <div id="import-result" class="mb-6 hidden"></div>

      <div class="flex gap-3">
        ${button('Preview', { id: 'btn-preview', variant: 'secondary', icon: icon.eye })}
        ${button('Import', { id: 'btn-import', variant: 'primary', icon: icon.upload, disabled: true })}
      </div>
    </div>`;

  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const fileList = document.getElementById('file-list');
  const previewArea = document.getElementById('preview-area');
  const btnPreview = document.getElementById('btn-preview');
  const btnImport = document.getElementById('btn-import');
  let selectedFiles = [];

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-brand-primary'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-brand-primary'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('border-brand-primary');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  function handleFiles(files) {
    selectedFiles = [...files].filter(f => f.name.endsWith('.csv'));
    fileList.innerHTML = selectedFiles.map(f => `
      <div class="flex items-center gap-2 text-sm text-ink">
        ${icon.fileText} <span>${f.name}</span>
        <span class="text-ink-faint">(${(f.size / 1024).toFixed(1)} KB)</span>
      </div>`).join('');
    btnImport.disabled = selectedFiles.length === 0;
  }

  btnPreview.addEventListener('click', async () => {
    if (!selectedFiles.length) return;
    previewArea.classList.remove('hidden');
    previewArea.innerHTML = '<p class="text-sm text-ink-muted animate-pulse">Parsing…</p>';
    const previews = [];
    for (const f of selectedFiles) {
      const text = await f.text();
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      previews.push({ name: f.name, rows: result.data.length, headers: result.meta.fields, errors: result.errors.length });
    }
    previewArea.innerHTML = card(`<div class="p-4">
      <h3 class="text-sm font-semibold text-ink mb-3">Preview</h3>
      ${previews.map(p => `
        <div class="flex items-center justify-between py-2 border-b border-border last:border-0">
          <div>
            <span class="text-sm font-medium text-ink">${p.name}</span>
            <span class="text-xs text-ink-muted ml-2">${p.rows} rows · ${p.headers?.length || 0} columns</span>
          </div>
          ${p.errors > 0 ? `<span class="text-xs text-warning">${p.errors} parse warnings</span>` : `<span class="text-xs text-positive">OK</span>`}
        </div>`).join('')}
    </div>`);
  });

  btnImport.addEventListener('click', async () => {
    if (!selectedFiles.length) return;
    const resultArea = document.getElementById('import-result');
    resultArea.classList.remove('hidden');
    resultArea.innerHTML = '<p class="text-sm text-ink-muted animate-pulse">Creating report and importing…</p>';
    btnImport.disabled = true;

    try {
      const report = await createReport({
        client: document.getElementById('imp-client').value,
        title: document.getElementById('imp-title').value,
        period_start: document.getElementById('imp-start').value,
        period_end: document.getElementById('imp-end').value,
        is_sample: document.getElementById('imp-sample').checked,
      });

      const result = await importCSVs(report.id, selectedFiles);
      resultArea.innerHTML = card(`<div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-positive">${icon.checkCircle}</span>
          <h3 class="text-sm font-semibold text-ink">Import complete</h3>
        </div>
        ${result.imported ? `<p class="text-sm text-ink-muted mb-2">${result.imported.length} file(s) imported</p>` : ''}
        ${result.quality_issues?.length ? `<p class="text-sm text-warning">${result.quality_issues.length} data quality issue(s) found</p>` : ''}
        <a href="#/workspace/report/${report.id}" class="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline mt-3">${icon.chevronRight} Go to report workspace</a>
      </div>`);
    } catch (err) {
      resultArea.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
      btnImport.disabled = false;
    }
  });
}
