#!/usr/bin/env npx tsx
/**
 * Append-only stability observability: one NDJSON line per successful CI chain reach.
 * Never fails CI (best-effort); does not touch runtime kernel / enforcement / compatibility logic.
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §8.6
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXECUTION_OS_STABILITY_SNAPSHOT_PATH } from './execution-os-stability-snapshot.paths';
import { buildExecutionOsVerdictV1 } from './execution-os-stability-verdict.lib';
import type { ExecutionOsVerdictV1 } from './execution-os-stability-verdict.lib';

export type ExecutionOsStabilitySnapshotLineV1 = {
  format_version: 1;
  recorded_at: string;
  verdict: ExecutionOsVerdictV1;
  /** Optional CI correlation (non-authoritative) */
  ci_run_id?: string;
  ci_workflow?: string;
};

export function appendExecutionOsStabilitySnapshotV1(verdict: ExecutionOsVerdictV1): void {
  const dir = path.dirname(EXECUTION_OS_STABILITY_SNAPSHOT_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const line: ExecutionOsStabilitySnapshotLineV1 = {
    format_version: 1,
    recorded_at: new Date().toISOString(),
    verdict,
    ...(process.env.GITHUB_RUN_ID ? { ci_run_id: process.env.GITHUB_RUN_ID } : {}),
    ...(process.env.GITHUB_WORKFLOW ? { ci_workflow: process.env.GITHUB_WORKFLOW } : {}),
  };
  fs.appendFileSync(EXECUTION_OS_STABILITY_SNAPSHOT_PATH, `${JSON.stringify(line)}\n`, 'utf8');
}

function main(): void {
  const verdict = buildExecutionOsVerdictV1();
  try {
    appendExecutionOsStabilitySnapshotV1(verdict);
  } catch (e) {
    console.warn(
      '[execution-os-stability] snapshot append skipped:',
      e instanceof Error ? e.message : String(e),
    );
  }
}

main();
