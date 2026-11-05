/**
 * API client — all calls to the Express server go through here.
 */

const BASE = '/api';

async function request(path, options = {}) {
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
