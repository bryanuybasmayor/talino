/**
 * API client — all calls to the Express server go through here.
 */

const BASE = '/api';

// ── Static demo mode ─────────────────────────────────────────────────────
// A host with no Node server (GitHub Pages) gets a JSON snapshot of the read
// endpoints, written by scripts/snapshot-api.js. Build those sites with
// VITE_STATIC_DEMO=true.
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';
const DATA_BASE = `${import.meta.env.BASE_URL}demo-data/`;

let manifestPromise = null;

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${DATA_BASE}manifest.json`).then((res) => {
      if (!res.ok) throw new Error('Demo data is missing from this build');
      return res.json();
    });
  }
  return manifestPromise;
}

async function staticRequest(path) {
  const [endpoint, query] = path.split('?');
  const manifest = await loadManifest();
  const file = manifest[endpoint];
  if (!file) throw new Error(`This demo build has no data for ${endpoint}`);

  const res = await fetch(`${DATA_BASE}${file}`);
  if (!res.ok) throw new Error(`Demo data error ${res.status} for ${endpoint}`);
  let data = await res.json();

  // The only query the client sends is a client filter on /reports.
  if (query) {
    const client = new URLSearchParams(query).get('client');
    if (client && Array.isArray(data)) data = data.filter((r) => r.client === client);
  }

  return data;
}

function readOnlyError() {
  return new Error('This is a read-only demo build. Run the app locally to import or edit reports.');
}

async function request(path, options = {}) {
  if (STATIC_DEMO) {
    if (options.method && options.method !== 'GET') throw readOnlyError();
    return staticRequest(path);
  }

  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `API error ${res.status}`);
  }
  
  return res.json();
}

// ── Clients ──────────────────────────────────────────────────────────────
export const getClients = () => request('/clients');
export const getClient = (slug) => request(`/clients/${slug}`);

// ── Reports ──────────────────────────────────────────────────────────────
export const getReports = (client) => request(`/reports${client ? `?client=${client}` : ''}`);
export const getReport = (id) => request(`/reports/${id}`);
export const createReport = (data) => request('/reports', { method: 'POST', body: JSON.stringify(data) });
export const updateReport = (id, data) => request(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Report data ──────────────────────────────────────────────────────────
export const getReportData = (id, file) => request(`/reports/${id}/data/${file}`);

// ── Import ───────────────────────────────────────────────────────────────
export async function importCSVs(reportId, files) {
  if (STATIC_DEMO) throw readOnlyError();
  const formData = new FormData();
  for (const f of files) formData.append('files', f);
  
  const res = await fetch(`${BASE}/reports/${reportId}/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Import error ${res.status}`);
  }
  return res.json();
}

export async function previewCSVs(reportId, files) {
  if (STATIC_DEMO) throw readOnlyError();
  const formData = new FormData();
  for (const f of files) formData.append('files', f);
  
  const res = await fetch(`${BASE}/reports/${reportId}/import/preview`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Preview error ${res.status}`);
  }
  return res.json();
}

// ── AI ───────────────────────────────────────────────────────────────────
export const getAIStatus = () => request('/ai/status');

export function runAITags(reportId, onProgress) {
  if (STATIC_DEMO) return Promise.reject(readOnlyError());
  return new Promise((resolve, reject) => {
    let resolved = false, settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolved = true; resolve(v); } };
    const failStream = (e) => { if (!settled) { settled = true; reject(e); } };
    // SSE via POST isn't standard, so we use fetch with streaming
    fetch(`${BASE}/reports/${reportId}/ai/tags`, { method: 'POST' })
      .then(res => {
        if (!res.ok) return res.json().then(b => { throw new Error(b.error || 'AI error'); });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              // A stream that ends without a complete/error event is a failure.
              if (!settled) failStream(new Error('AI stream ended before completing'));
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'progress' && onProgress) onProgress(event);
                  if (event.type === 'complete') finish(event.result);
                  if (event.type === 'error') failStream(new Error(event.message));
                } catch (e) { /* skip malformed */ }
              }
            }
            read();
          }).catch(reject);
        }
        read();
      })
      .catch(reject);
  });
}

export function runAISummaries(reportId, onProgress) {
  if (STATIC_DEMO) return Promise.reject(readOnlyError());
  return new Promise((resolve, reject) => {
    fetch(`${BASE}/reports/${reportId}/ai/summaries`, { method: 'POST' })
      .then(res => {
        if (!res.ok) return res.json().then(b => { throw new Error(b.error || 'AI error'); });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        function read() {
          reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'progress' && onProgress) onProgress(event);
                  if (event.type === 'complete') finish(event.result);
                  if (event.type === 'error') failStream(new Error(event.message));
                } catch (e) { /* skip malformed */ }
              }
            }
            read();
          }).catch(reject);
        }
        read();
      })
      .catch(reject);
  });
}

export const runAINarratives = (reportId) => request(`/reports/${reportId}/ai/narratives`, { method: 'POST' });

export const updateSummary = (reportId, section, data) =>
  request(`/reports/${reportId}/ai/summaries/${section}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Metrics ──────────────────────────────────────────────────────────────
export const getMetrics = (id) => request(`/reports/${id}/metrics`);
export const getSectionMetrics = (id, section) => request(`/reports/${id}/metrics/${section}`);

// ── Quality & Audit ──────────────────────────────────────────────────────
export const getQuality = (id) => request(`/reports/${id}/quality`);
export const getAudit = (id) => request(`/reports/${id}/audit`);
