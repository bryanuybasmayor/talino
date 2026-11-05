# TALINO — Client Insights Dashboard

A self-contained, locally-run insights dashboard demo for TALINO. It replaces the
raw-number Looker Studio report with a readable client view: campaign and LANU
performance, social listening, and one plain-language AI summary per section that
a human reviews and approves before it is shown.

Built for the **ZYN Philippines** demo. Runs on your laptop with two commands and
requires no login, database, or Docker.

---

## Quick start

```bash
npm install
cp .env.example .env      # optional — the demo works without an API key
npm run demo
```

`npm run demo` starts the API on `http://localhost:3001` and the client on
`http://localhost:5173` (the client proxies `/api`). Vite opens the browser.

If you ever need the seed data back:

```bash
npm run demo:reset
```

Then open:

| View | URL |
| --- | --- |
| Home / client list | `http://localhost:5173/#/` |
| Campaign report (client view) | `http://localhost:5173/#/report/rpt-campaign-demo` |
| Listening report (client view) | `http://localhost:5173/#/report/rpt-listening-demo` |
| Workspace (internal tools) | `http://localhost:5173/#/workspace` |

The two route groups are deliberately separate: `#/report/...` is what a client
sees, `#/workspace/...` is internal (import, AI review, data quality, audit log).
Login can be added later without changing URLs.

---

## What is in the demo

**Campaign report** — KPIs, LANU performance, campaign table, platform mix,
format mix, top posts, and data-quality notes. Uses the real numbers extracted
from the ZYN report. AI is **off** by default on this report; summaries show a
pending state until someone generates them.

**Listening report** — 1,265 ZYN mentions (plus 215 Ploom mentions for share of
voice) across 12 sections: volume, sentiment, emotion, topics, drivers,
objections, language, platform, geography, campaign share, top posts, and
narratives. Every section is marked **Sample data** because the mentions are
synthetic. All 12 summaries are pre-seeded so the demo works offline.

**Workspace** — import CSVs, generate/approve AI summaries, inspect data quality,
and read the audit log.

---

## AI setup

The AI layer is optional and provider-agnostic.

- **No key:** the app runs fully. AI endpoints return `503` with a clear message,
  and pre-seeded summaries are shown.
- **Gemini (default, free tier):** put `GEMINI_API_KEY` in `.env`. The default
  model is `gemini-3.5-flash-lite` (Google's current fast, low-cost model).
- **Claude (production):** set `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY`.
  Model comes from `AI_MODEL`; nothing is hard-coded.

Numbers always come from `server/lib/metrics.js`. The AI only writes words.

### Free-tier rule (important)

Sending real client data to a free-tier consumer AI service may violate the
client's data terms. The app enforces this:

- AI is allowed freely only when a report is marked `is_sample: true`.
- A report with real data has an **Allow AI on this report** toggle in the
  workspace. Turning it on shows an explicit free-tier warning, records
  `ai_allowed_at`, and must be an informed choice by the account team.
- The warning disappears automatically when `AI_PROVIDER=claude`.

### Approval flow

AI never publishes. Each section stores a `draft` and a `final`. The client view
only renders `final`. Approval copies draft → final and records who approved and
when. Every generation and approval is written to the audit log with provider,
model, and prompt version.

---

## Project layout

```
server/
  index.js              Express API (reports, import, AI, quality, audit)
  lib/
    store.js            Atomic JSON read/write under data/store/
    csv-import.js       CSV parsing + normalizers for the 6 report files
    data-quality.js     Duplicates, copied metrics, EMV outliers, tag checks
    metrics.js          Single source of truth for every computed number
    audit.js            Append-only audit log
  ai/
    provider.js         Provider factory + batching/retry orchestration
    gemini.js           Gemini adapter
    claude.js           Claude adapter
    prompts.js          Versioned prompts (PROMPT_VERSION)
src/
  main.js               Routes + app shell
  pages/                home, report, workspace, import, report admin, review
  components/           Sidebar, shared UI primitives
  lib/                  Router, API client, formatting, icons, chart theme, metrics
  styles/main.css       Tailwind v4 tokens, dark mode, print, motion
scripts/
  reset.js              Rebuilds the demo store from data/source-pdf
  make-sample-listening.js  Seeded synthetic listening dataset
data/
  source-pdf/           CSVs extracted from the client's report (see its README)
  seed/                 Committed sample AI output + mentions
  store/                Runtime state (gitignored)
```

### Storage

Everything is a JSON file under `data/store/`. Writes are atomic (temp file +
rename) so a crash cannot leave a half-written report. This keeps the demo
inspectable and makes a later move to a database a single-module change.

---

## Data caveats (worth repeating to the client)

- `format_mix.csv` is **approximate**: format counts sum to ~6,563 against 5,873
  posts. Show it as a mix, not an exact total.
- The source report has **no weekly over-time data**. The volume chart falls back
  to monthly and shows an honest empty state for anything unsupported.
- Seven rows have metrics copied between posts (Heart Evangelista ×2, Lella Ford
  ×3, Atasha Muhlach ×2). The data-quality panel surfaces all seven; don't
  quietly "fix" them.
- `proof_url` values are internal links and are hidden behind the off-by-default
  **Show internal links** toggle.
- Listening mentions are synthetic and use fictional accounts. Campaign names
  and the Ploom brand reference are real public context.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run demo` | API + client together (the demo command) |
| `npm run dev:server` | API only |
| `npm run dev:client` | Vite only |
| `npm run demo:reset` | Rebuild seed store |
| `npm run seed:listening` | Regenerate synthetic mentions (seeded, deterministic) |
| `npm run build` | Production bundle |
| `npm run preview` | Preview the production build |

---

## Deploying the demo (GitHub Pages)

`.github/workflows/deploy.yml` publishes a read-only copy on every push to `main`.

1. In the repo, open **Settings → Pages → Build and deployment** and set
   **Source** to **GitHub Actions**. A branch source serves the raw source
   files, whose absolute `/src/...` references cannot run from `/talino/`.
2. Push to `main`. The workflow seeds the demo store, snapshots the API's read
   responses into `public/demo-data/`, builds with `base=/talino/` and
   `VITE_STATIC_DEMO=true`, then deploys `dist/`.

The site is **read-only**. Pages has no Node server, so the client reads the
JSON snapshot instead of `/api`: reports, charts, AI summaries and the audit
log display normally, while importing CSVs, generating AI copy and approving
summaries report that the demo build cannot write. Run `npm run demo` locally
for the full workflow.

To build locally the same way:

```bash
npm run demo:reset && npm run snapshot:static
VITE_STATIC_DEMO=true npm run build && npm run preview
```

`BASE_PATH` overrides the `/talino/` sub-path when the repo is renamed.

---

## Accessibility & print

- Every chart has an `aria-label` summary and a **View as table** toggle.
- Light / Dark / System theme, no flash on load; charts re-theme on toggle.
- Print is always light mode and hides navigation and controls.
- Layout is verified at 375px (sidebar collapses to a top bar).
- Colors target WCAG AA against both themes.

---

## Before this goes live

1. Add authentication and put the workspace behind it.
2. Replace JSON files with a database; keep `metrics.js` as the only calculation
   layer.
3. Switch `AI_PROVIDER` to `claude` and confirm the client's data-processing
   terms.
4. Remove or replace the synthetic listening dataset with a real export.
5. Reconcile `format_mix.csv` with the platform totals.
6. Do **not** host this publicly in its current form — there is no login and the
   API trusts every caller.
