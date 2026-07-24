/**
 * Release Gate — Batch 3 repeat-run metrics:
 *   ReplayPass@10  — P0 blockers, stable fingerprint across runs
 *   PolicyPass@20  — P1 blockers, fresh harness each run (parameter isolation)
 *   FinalStatePass@20 — all blockers, final-state layer fingerprint stability
 */

import {
  POLICY_PASS_RUNNERS,
  REPLAY_P0_RUNNERS,
  runDsBlockerIdempotency001,
  runMemBlockerDelete001,
  runMemBlockerPdi001,
  runMemBlockerScope001,
  runPolicyBlockerStale001,
  runStateBlockerPartial001PathA,
  runStateBlockerPartial001PathB,
} from '../../fixtures/blocker-case-runners';
import {
  computeBlockerResultFingerprint,
  computeFinalStateFingerprint,
} from './blocker-result-fingerprint.util';
import {
  DEFAULT_FINAL_STATE_PASS_AT,
  DEFAULT_POLICY_PASS_AT,
  DEFAULT_REPLAY_PASS_AT,
  parseReplayRunCount,
} from './replay-gate.types';
import {
  expectReplayGatePass,
  runDeterministicReplayGate,
} from './run-deterministic-replay.util';

const REPLAY_RUNS = parseReplayRunCount(process.env, 'HARNESS_REPLAY_PASS_AT', DEFAULT_REPLAY_PASS_AT);
const POLICY_RUNS = parseReplayRunCount(process.env, 'HARNESS_POLICY_PASS_AT', DEFAULT_POLICY_PASS_AT);
const FINAL_STATE_RUNS = parseReplayRunCount(
  process.env,
  'HARNESS_FINAL_STATE_PASS_AT',
  DEFAULT_FINAL_STATE_PASS_AT,
);

const ALL_FINAL_STATE_RUNNERS = [
  { caseId: 'DS-BLOCKER-IDEMPOTENCY-001', run: () => runDsBlockerIdempotency001(0) },
  { caseId: 'MEM-BLOCKER-SCOPE-001', run: runMemBlockerScope001 },
  { caseId: 'MEM-BLOCKER-DELETE-001', run: runMemBlockerDelete001 },
  { caseId: 'POLICY-BLOCKER-STALE-001', run: runPolicyBlockerStale001 },
  { caseId: 'STATE-BLOCKER-PARTIAL-001-path-a', run: runStateBlockerPartial001PathA },
  { caseId: 'STATE-BLOCKER-PARTIAL-001-path-b', run: runStateBlockerPartial001PathB },
  { caseId: 'MEM-BLOCKER-PDI-001', run: runMemBlockerPdi001 },
];

describe('Release Replay Gate', () => {
  describe(`ReplayPass@${REPLAY_RUNS}`, () => {
    for (const { caseId, run } of REPLAY_P0_RUNNERS) {
      it(`${caseId} — ${REPLAY_RUNS} deterministic runs with stable fingerprint`, async () => {
        const result = await runDeterministicReplayGate({
          gate: 'ReplayPass',
          caseId,
          runs: REPLAY_RUNS,
          execute: run,
          fingerprint: computeBlockerResultFingerprint,
          requireStableFingerprint: true,
        });
        expectReplayGatePass(result);
        expect(result.fingerprintsDistinct).toBe(1);
      });
    }
  });

  describe(`PolicyPass@${POLICY_RUNS}`, () => {
    it(`P1 blockers — ${POLICY_RUNS} fresh-harness runs`, async () => {
      const rounds = Math.ceil(POLICY_RUNS / POLICY_PASS_RUNNERS.length);
      let totalRuns = 0;

      for (let round = 0; round < rounds && totalRuns < POLICY_RUNS; round++) {
        for (const { caseId, run } of POLICY_PASS_RUNNERS) {
          if (totalRuns >= POLICY_RUNS) break;
          const result = await runDeterministicReplayGate({
            gate: 'PolicyPass',
            caseId: `${caseId}#${totalRuns + 1}`,
            runs: 1,
            execute: run,
            fingerprint: computeBlockerResultFingerprint,
          });
          expectReplayGatePass(result);
          totalRuns++;
        }
      }

      expect(totalRuns).toBe(POLICY_RUNS);
    });
  });

  describe(`FinalStatePass@${FINAL_STATE_RUNS}`, () => {
    it(`all blockers — ${FINAL_STATE_RUNS} runs with stable final-state fingerprint`, async () => {
      const rounds = Math.ceil(FINAL_STATE_RUNS / ALL_FINAL_STATE_RUNNERS.length);
      let totalRuns = 0;

      for (let round = 0; round < rounds && totalRuns < FINAL_STATE_RUNS; round++) {
        for (const { caseId, run } of ALL_FINAL_STATE_RUNNERS) {
          if (totalRuns >= FINAL_STATE_RUNS) break;
          const result = await runDeterministicReplayGate({
            gate: 'FinalStatePass',
            caseId: `${caseId}#${totalRuns + 1}`,
            runs: 1,
            execute: run,
            fingerprint: computeFinalStateFingerprint,
          });
          expectReplayGatePass(result);
          totalRuns++;
        }
      }

      expect(totalRuns).toBe(FINAL_STATE_RUNS);
    });
  });
});
