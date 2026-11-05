# ZYN × TALINO — data extracted from the Looker PDF

Source: `TALI_ZYN_TALINO_Dashboard.pdf` (Looker Studio export, Oct 22, 2026). Six CSVs, UTF-8, dates as YYYY-MM-DD, money in PHP with no symbol.

| File | Rows | What it is | From |
|---|---|---|---|
| `kpis.csv` | 2 | Headline totals for all time and 2026 YTD | Pages 1–3 KPI strip |
| `lanus_2026.csv` | 8 | Top LANUs by EMV, 2026 YTD | Page 2 table |
| `top_posts.csv` | 17 | Top posts by EMV, with Instagram links and proof (Drive) links | Pages 1–2 tables + embedded links |
| `campaign_share.csv` | 10 | Share of posts per campaign (%) | Page 3 Events pie |
| `format_mix.csv` | 10 | Posts per platform/format, **approximate** | Page 1 bar chart, read by eye |
| `ploom_mentions.csv` | 21 | Ploom PH competitor mentions (first 21 of 1,923) | Page 4 table + embedded links |

## Known limits and data issues

- **Totals are rounded** as the PDF shows them (90.3M, ₱4.67B…).
- **`format_mix.csv` is approximate.** The values sum to ~6,560, more than the 5,873 posts total, so treat them as proportions, not counts. The Instagram Stories static/video split (54.8% / 45.2%) matches the PDF's posting-ratio chart.
- **Over-time charts are not included.** They are images in the PDF, so their daily values can't be extracted. Ask for the Looker source export to get them.
- **Copied metrics:** Heart Evangelista (2 posts), Lella Ford (3 posts) and Atasha Muhlach (2 posts) each have *different* post links but *identical* reach and EMV. Metrics look copied at creator level, not measured per post. Flag this to the client.
- **Format pairing:** where one creator has two posts on the same date (Heart Evangelista, Lella Ford Jun 19), the format and proof link were matched by row order.
- **Missing values:** Donny Pangilinan's post has no format or proof link; Shane T has no format or proof link; Maymay Entrata has no Instagram link (it is a Facebook post).
- **Ploom captions** are cut off in the source ("…"); story rows have no caption.
- `proof_url` values are Google Drive links from TALINO's own drive. Don't publish them on a public page.
