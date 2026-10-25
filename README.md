# Military Airspace Scheduler

Live MOA / ATCAA schedule dashboard for the Brownwood & Brady complex (Central Texas).

## Run / build
- `npm install`
- `npm run start` – build the UI and launch the desktop app
- `npm run dist:win` – build the single-file Windows `.exe` (output in `release/`)
- `npm run dist:win:installer` – build a Windows installer instead
- `npm run build` / `npm run deploy` – original web build / GitHub Pages (no live FAA data: browsers block it)
- `npm test` – FAA retrieval, schedule and connection-state tests
- `npm run faa:probe` – live check of each FAA source (run on a normal internet connection)

## FAA data
Live schedules are fetched by the desktop app (`electron/faa.cjs`); browsers cannot reach sua.faa.gov (CORS).
**Nothing is ever estimated.** If no source returns validated FAA data the dashboard shows UNKNOWN / DATA UNAVAILABLE and a red banner; there are no "typical hours".

Sources, tried in order until one returns a validated response:
1. **FAA SUA Schedule Data Gateway** – official, documented ([format](https://sua.faa.gov/ops/docs/suagwDataFmt.html)); needs a registered FAA login (Settings). Next-24-hour list, updated each minute, polled every 2 min.
2. **FAA SUA website Text List export** (`/sua/download.app`) – public, *not documented by the FAA*; request shape taken from a third-party client, parsed header-first, fails loudly on anything unexpected. Polled every 5 min.
3. **FAA SUA website interacting-schedules pages** (`/sua/lkSched.jsp?asname=...`) – public, *not documented*; the layout of a populated page is unverified, so a row is accepted only if it names the airspace and has two timestamps. Pages that load but show no rows count as a **failure**, never as "nothing scheduled".

Safeguards: 3 tries with exponential backoff + jitter, 20 s timeouts, a 90 s overall budget, HTTP 429/`Retry-After` stops the cycle, one request cycle at a time with a 15 s minimum gap, a rejected gateway login is not re-sent until re-saved, truncated gateway feeds are rejected, every record is validated.

### What the statuses mean
| Label | Meaning |
|---|---|
| ACTIVE (SCHEDULED) | An approved FAA schedule window contains "now" in current data. **Not** confirmation that aircraft are flying there. |
| SCHEDULED | A later window exists, or the only window is pending approval. |
| NO SCHEDULE LISTED | The current FAA list has no entry. **Not** confirmation that it is quiet. |
| UNKNOWN | No current FAA data (disconnected, stale or only cached). |

Indicator: green FAA CONNECTED, yellow FAA DATA STALE, red FAA DISCONNECTED, gray CONNECTING. Cached data is always labelled CACHED with its original retrieval time and never drives a status. Times are shown in America/Chicago (CST/CDT) and Zulu.

### Diagnostics and verification
- Activity icon in the header: connection log, per-source results, validation stats and the **raw FAA response** (credentials redacted).
- `npm run faa:probe` (optionally `FAA_SUA_USER=... FAA_SUA_PWD=...`) tests each source on its own against the real FAA and writes `faa-probe-output.json`.
- `npm test` runs the parser/retry/status tests. Their fixtures are synthetic (the gateway sample is the FAA's own); they do not prove the live endpoints work.
- The last response is also saved to `faa-debug.json` in the app's data folder (Settings → Open debug file).

## Late-open alerts
An alert fires when a scheduled window ends at/after the cutoff (default 10:00 PM Central, or 12–6 AM).
Shown as a top bar, pop-up cards and a desktop notification. Only current FAA data triggers alerts (never cached or missing data).
