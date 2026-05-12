#!/usr/bin/env npx tsx
/**
 * Read-only trend summary over local NDJSON snapshots (no CI gate).
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §8.6
 */
import fs from 'node:fs';
import { EXECUTION_OS_STABILITY_SNAPSHOT_PATH } from './execution-os-stability-snapshot.paths';

const windowN = Math.max(1, Math.min(500, Number(process.env.EXEC_OS_STABILITY_TREND_WINDOW ?? 50)));

function main(): void {
  if (!fs.existsSync(EXECUTION_OS_STABILITY_SNAPSHOT_PATH)) {
    const empty = {
      schemaId: 'agent.execution_os.stability_trend_summary@v1' as const,
      version: 1,
      window_requested: windowN,
      samples: 0,
      pass_rate: null as number | null,
      governance_match_rate: null as number | null,
      replay_safe_rate: null as number | null,
      note: `no snapshot file yet at ${EXECUTION_OS_STABILITY_SNAPSHOT_PATH}; run npm run ci:execution-os-stability locally to seed`,
    };
    console.log(JSON.stringify(empty, null, 2));
    process.exit(0);
  }

  const raw = fs.readFileSync(EXECUTION_OS_STABILITY_SNAPSHOT_PATH, 'utf8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-windowN);

  let pass = 0;
  let gov = 0;
  let replay = 0;
  let n = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { format_version?: number; verdict?: { status?: string; governance_match?: boolean; replay_safe?: boolean } };
      if (row.format_version !== 1 || !row.verdict) continue;
      n += 1;
      if (row.verdict.status === 'PASS') pass += 1;
      if (row.verdict.governance_match === true) gov += 1;
      if (row.verdict.replay_safe === true) replay += 1;
    } catch {
      /* skip corrupt line */
    }
  }

  const summary = {
    schemaId: 'agent.execution_os.stability_trend_summary@v1' as const,
    version: 1,
    window_requested: windowN,
    samples: n,
    pass_rate: n ? pass / n : null,
    governance_match_rate: n ? gov / n : null,
    replay_safe_rate: n ? replay / n : null,
    snapshot_path: EXECUTION_OS_STABILITY_SNAPSHOT_PATH,
    note: 'Rates are over trailing NDJSON lines only; CID manifest health is tracked separately via npm run ci:cid-v1.',
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
