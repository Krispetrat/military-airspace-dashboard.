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

## Tabs

* **Map** - the original map, schedule list and activity list, plus optional **airports** (military and civil, with METAR/TAF), **ADS-B aircraft** and **weather radar** layers.
* **Daily Overview** - a plain-language summary of one day, with published schedules, observed aircraft, historical patterns and estimates kept visibly separate.
* **Airspace Timeline** - a Gantt-style chart of every monitored MOA, ATCAA and range for one date, in local time or UTC.
* **History** - searchable records, weekly patterns, monthly/yearly statistics, scheduled-vs-observed comparison, and backup/restore/CSV export of the local SQLite database.

Full description, sources, limits and the exact rules behind every estimate: [docs/NEW_FEATURES.md](docs/NEW_FEATURES.md).

## FAA data
Live schedules are fetched by the desktop app (`electron/faa.cjs`); browsers cannot reach sua.faa.gov (CORS).
**Nothing is ever estimated in the schedule list, the map status colours or the alerts.** If no source returns validated FAA data the dashboard shows UNKNOWN / DATA UNAVAILABLE and a red banner; there are no "typical hours". Estimates exist only in the Daily Overview and Timeline tabs, where every one is labelled ESTIMATE, carries its source and confidence, and is never produced for a date the FAA list already covers (see [docs/NEW_FEATURES.md](docs/NEW_FEATURES.md)).

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

## Airspace areas and range activity

The map now covers four things, all driven by data files in `src/app/data/`:

| Area | What is drawn | Source |
|---|---|---|
| Brownwood & Brady | 11 MOA/ATCAA shapes (unchanged) | original app data |
| Fort Sill / Falcon Range | R-5601C (contains Falcon Bombing Range) and R-5601D | 14 CFR 73.56, 81 FR 79998; cross-checked vertex-for-vertex against FAA NASR |
| Rivers MOA | one MOA, 8,000 ft MSL up to (not incl.) 18,000 ft MSL, Fort Worth Center | FAA NASR cycle 2026-10-29 |

Read `docs/DATA_SOURCES.md` before relying on any of it: it lists what was verified, what could not be, and what each
evidence label means. Short version: the Fort Sill Range Control PDF has **no coordinates**, so the Falcon outline is the
FAA's restricted-airspace boundary over the range, not a survey of the ground impact area; and nothing is shown for hours,
frequencies or schedules unless a source states it.

### Range activity (Fort Sill Range Control)

`Activity` tab and the Falcon Range detail panel show aircraft-related rows from the published Range Control PDF, each tagged
*In schedule*, *General schedule* or *Inferred* (and *Confirmed*, reserved for a NOTAM/ATC-grade source; nothing uses it yet).
The desktop app re-reads the PDF every 3 hours (`electron/rangecontrol.cjs` -> `src/app/utils/rangeControlParse.ts`). If that
fails, or in a web browser, the bundled snapshot (`src/app/data/activity/fortSillRangeControl.ts`) is shown, labelled with
its coverage dates. Days outside the coverage are "not loaded", never "nothing scheduled".

### Adding another MOA, range or activity source

1. **Airspace**: `npm run airspace:import -- --search "<text>"` finds it in the FAA NASR snapshot (dev dependency
   `@squawk/airspace-data`); `npm run airspace:import -- --name "<exact name>" --id <slug> --group <groupId>` prints a ready
   entry. Paste it into a file in `src/app/data/airspace/`, list it in `index.ts`.
2. **New group** (a new complex): add one line to `DEFS` in `src/app/data/regions.ts`. Map presets, filter chips and
   zoom-to are computed from the airspace in the group.
3. **Activity source**: add an `ActivitySource` in `src/app/data/activity/` (see `fortSillRangeControl.ts`) and list it in
   `index.ts`; point airspace at it with `activityFacilityIds`.
4. `npm test` checks ids, polygons, region bounds, and (when the NASR package is installed) compares geometry and limits
   against it.

### Tests

`npm test` runs 224 tests: the original 97 FAA/schedule/data/range-control tests, plus time zones (DST days), the SQLite history store, pattern analysis, the day model and its wording rules, aviation-data parsers, the main-process network proxy and file operations, radar registration, airports and label placement.
