#!/usr/bin/env node
'use strict';
/**
 * Live FAA connectivity probe. Run it on a machine with normal internet access:
 *
 *   npm run faa:probe
 *   FAA_SUA_USER=you FAA_SUA_PWD=secret npm run faa:probe     # also tests the official gateway
 *
 * It exercises EACH source on its own (no fallback), against the real sua.faa.gov, using the same
 * parsing code the app uses, then prints a verdict per source and writes everything it received
 * (credentials redacted) to faa-probe-output.json. That file is the evidence of what the FAA
 * actually returns; send it along if a source fails so the parser can be fixed against reality.
 *
 * Nothing is invented: a source is only reported OK if the FAA returned data that parsed and validated.
 */
const fs = require('fs');
const path = require('path');
const faa = require('./faa.cjs');

// Pull the FAA designations the dashboard watches straight from the map definitions.
const mapSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'components', 'AirspaceMap.tsx'), 'utf8');
const names = [...new Set([...mapSrc.matchAll(/faaNames:\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1])))];

const creds = process.env.FAA_SUA_USER && process.env.FAA_SUA_PWD
  ? { user: process.env.FAA_SUA_USER, pwd: process.env.FAA_SUA_PWD } : null;

const fmt = (ms) => (ms ? new Date(ms).toISOString().replace('.000Z', 'Z') : '-');

(async () => {
  console.log(`Probing sua.faa.gov for ${names.length} airspace names: ${names.join(', ')}\n`);
  faa.resetDiagnostics();
  const report = { ranAt: new Date().toISOString(), node: process.version, names, sources: {} };

  for (const id of ['gateway', 'textlist', 'public']) {
    if (id === 'gateway' && !creds) {
      console.log('gateway   SKIPPED  (set FAA_SUA_USER and FAA_SUA_PWD to test the official feed)');
      report.sources[id] = { verdict: 'SKIPPED', reason: 'no credentials supplied' };
      continue;
    }
    const t0 = Date.now();
    const r = await faa.fetchSchedules({ creds, names, only: [id], doFetch: (u, o) => fetch(u, o), tries: 2 });
    const ms = Date.now() - t0;
    if (r.ok) {
      console.log(`${id.padEnd(9)} OK       ${r.entries.length} matching schedule(s) in ${ms} ms; as of ${fmt(r.asOf)}`);
      for (const e of r.entries) console.log(`            ${e.name.padEnd(28)} ${fmt(e.start)} -> ${fmt(e.end)}  status=${e.status}  alt=${e.lowAlt ?? '?'}-${e.highAlt ?? '?'}`);
      if (r.unmatched.length) console.log(`            other regional names seen (not mapped): ${r.unmatched.join(', ')}`);
      r.notes.forEach((n) => console.log(`            note: ${n}`));
      report.sources[id] = { verdict: 'OK', entries: r.entries, unmatched: r.unmatched, stats: r.stats, notes: r.notes, asOf: r.asOf };
    } else {
      const a = r.attempts.find((x) => x.source === id) || r.attempts[0] || {};
      console.log(`${id.padEnd(9)} FAILED   ${a.code || ''} ${a.httpStatus ? `(HTTP ${a.httpStatus}) ` : ''}${a.error || r.error}`);
      report.sources[id] = { verdict: 'FAILED', code: a.code, httpStatus: a.httpStatus, error: a.error || r.error };
    }
  }

  report.diagnostics = faa.getDiagnostics();
  const out = path.join(process.cwd(), 'faa-probe-output.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nRaw responses and the connection log were written to ${out}`);
  console.log('Interpretation: OK = real FAA data parsed and validated. FAILED = see the code/message and the raw response in the JSON.');
})();
