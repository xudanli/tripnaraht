import path from 'node:path';

/** Append-only NDJSON; under `artifacts/` (gitignored). */
export const EXECUTION_OS_STABILITY_SNAPSHOT_PATH = path.join(
  process.cwd(),
  'artifacts',
  'execution_os',
  'stability_snapshots_v1.ndjson',
);
