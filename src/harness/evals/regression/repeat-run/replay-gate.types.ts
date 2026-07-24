import type { BlockerCaseResult } from '../../blockers/blocker-case.schema';

export type ReplayGateMetric = 'ReplayPass' | 'PolicyPass' | 'FinalStatePass';

export type DeterministicReplayRunResult = {
  runIndex: number;
  pass: boolean;
  fingerprint: string;
  caseResult: BlockerCaseResult;
};

export type DeterministicReplayGateResult = {
  gate: ReplayGateMetric;
  caseId: string;
  requiredRuns: number;
  pass: boolean;
  fingerprintsDistinct: number;
  baselineFingerprint: string | null;
  runs: DeterministicReplayRunResult[];
  errors: string[];
};

export type ReplaySuiteGateResult = {
  pass: boolean;
  replayPassAt: DeterministicReplayGateResult[];
  policyPassAt: DeterministicReplayGateResult[];
  finalStatePassAt: DeterministicReplayGateResult[];
  errors: string[];
};

export function parseReplayRunCount(
  env: NodeJS.ProcessEnv = process.env,
  key: string,
  defaultValue: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return defaultValue;
  return n;
}

export const DEFAULT_REPLAY_PASS_AT = 10;
export const DEFAULT_POLICY_PASS_AT = 20;
export const DEFAULT_FINAL_STATE_PASS_AT = 20;
