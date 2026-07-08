import type { BlockerCaseResult } from '../../blockers/blocker-case.schema';
import type { DeterministicReplayGateResult, ReplayGateMetric } from './replay-gate.types';

export async function runDeterministicReplayGate(input: {
  gate: ReplayGateMetric;
  caseId: string;
  runs: number;
  execute: () => Promise<BlockerCaseResult>;
  fingerprint: (result: BlockerCaseResult) => string;
  /** When true, all runs must share the same fingerprint (ReplayPass). */
  requireStableFingerprint?: boolean;
}): Promise<DeterministicReplayGateResult> {
  const errors: string[] = [];
  const runResults: DeterministicReplayGateResult['runs'] = [];
  const fingerprints = new Set<string>();

  for (let i = 0; i < input.runs; i++) {
    const caseResult = await input.execute();
    const fingerprint = input.fingerprint(caseResult);
    fingerprints.add(fingerprint);
    runResults.push({
      runIndex: i,
      pass: caseResult.pass,
      fingerprint,
      caseResult,
    });
    if (!caseResult.pass) {
      errors.push(
        `[${input.gate}] ${input.caseId} run=${i + 1}/${input.runs}: ${caseResult.errors.join('; ')}`,
      );
    }
  }

  const baselineFingerprint = runResults[0]?.fingerprint ?? null;
  if (input.requireStableFingerprint && fingerprints.size > 1) {
    errors.push(
      `[${input.gate}] ${input.caseId} fingerprint drift: ${fingerprints.size} distinct hashes across ${input.runs} runs`,
    );
  }

  return {
    gate: input.gate,
    caseId: input.caseId,
    requiredRuns: input.runs,
    pass: errors.length === 0,
    fingerprintsDistinct: fingerprints.size,
    baselineFingerprint,
    runs: runResults,
    errors,
  };
}

export function expectReplayGatePass(result: DeterministicReplayGateResult): void {
  if (!result.pass) {
    throw new Error(
      `${result.gate}@${result.requiredRuns} failed for ${result.caseId}:\n${result.errors.join('\n')}`,
    );
  }
}
