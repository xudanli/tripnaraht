/**
 * Task D — Multi-candidate shadow dual-run E2E (engineering validation).
 *
 * Validates cp-sat-lex-v1 as Full Plan Candidate Selection Strategy.
 * Does NOT validate POI-level CP-SAT travel planning.
 */

import { buildTaskDScenarios } from './task-d-scenarios.fixture';
import { runShadowDualRun, runLegacyFrozenVsLexDualRun } from './shadow-dual-run.harness';
import { icelandMinimalWorldState } from '../fixtures/iceland-minimal.fixture';

describe('Task D: Shadow dual-run E2E (candidate selection)', () => {
  const scenarios = buildTaskDScenarios();

  it.each(scenarios.map((s) => [s.id, s]))(
    '%s',
    async (_id, scenario) => {
      const tripId = `task_d_${scenario.id}`;
      const worldState = scenario.worldState ?? icelandMinimalWorldState();

      const result = await runShadowDualRun({
        tripId,
        worldState,
        candidates: scenario.candidates,
        constraintReports: scenario.constraintReports,
        shadowError: scenario.shadowError,
        shadowTimeLimitMs: scenario.shadowTimeLimitMs,
        inputMismatch: scenario.inputMismatch,
      });

      expect(result.shadowCapability.nativeCpSat).toBe(false);
      expect(result.shadowCapability.optimizationLevel).toBe(
        'FULL_PLAN_CANDIDATE_SELECTION',
      );
      expect(result.shadowCapability.solverFamily).toBe(
        'ENUMERATIVE_LEXICOGRAPHIC_SELECTION',
      );

      if (scenario.expect.shadowNativeCpSat === false) {
        expect(result.shadowResult?.solverMetadata.nativeCpSat).toBe(false);
      }
      if (scenario.expect.shadowOptimizationLevel) {
        expect(result.shadowResult?.solverMetadata.optimizationLevel).toBe(
          scenario.expect.shadowOptimizationLevel,
        );
      }

      if (scenario.expect.eligibleForComparison != null) {
        expect(result.shadowEvent.eligibleForStrategyComparison).toBe(
          scenario.expect.eligibleForComparison,
        );
      }

      if (scenario.expect.sameWinner != null) {
        expect(result.shadowEvent.divergence.sameWinner).toBe(
          scenario.expect.sameWinner,
        );
      }

      if (scenario.expect.authorityWinnerId) {
        expect(result.authoritySelectedId).toBe(scenario.expect.authorityWinnerId);
      }
      if (scenario.expect.shadowWinnerId) {
        expect(result.shadowResult?.recommendedCandidateId).toBe(
          scenario.expect.shadowWinnerId,
        );
      }

      if (scenario.expect.divergenceTypes) {
        for (const t of scenario.expect.divergenceTypes) {
          expect(result.shadowEvent.divergence.types).toContain(t);
        }
      }

      if (scenario.expect.deterministicRepeat) {
        const repeat = await runShadowDualRun({
          tripId: `${tripId}_repeat`,
          worldState,
          candidates: scenario.candidates,
          constraintReports: scenario.constraintReports,
        });
        expect(repeat.shadowResult?.recommendedCandidateId).toBe(
          result.shadowResult?.recommendedCandidateId,
        );
      }

      if (
        result.shadowEvent.eligibleForStrategyComparison &&
        result.shadowEvent.lexicographicStageTraces?.length
      ) {
        expect(result.shadowEvent.divergence.stageTraceComplete).toBe(true);
        expect(result.shadowEvent.divergence.explainability.length).toBeGreaterThan(0);
      }
    },
    60_000,
  );

  it('input fingerprint includes snapshotHash and candidateCount', async () => {
    const scenario = scenarios.find((s) => s.id === 'TD-004-iceland-multi-lex')!;
    const result = await runShadowDualRun({
      tripId: 'task_d_fp',
      worldState: scenario.worldState!,
      candidates: scenario.candidates,
      constraintReports: scenario.constraintReports,
    });

    const fp = result.shadowEvent.inputFingerprint;
    expect(fp.snapshotHash).toBeTruthy();
    expect(fp.candidateCount).toBe(scenario.candidates.length);
    expect(fp.constraintReportVersion).toBe('canonical_constraint_report@v1');
  });

  it('legacy-frozen vs lex produces eligible comparison on Iceland multi', async () => {
    const scenario = scenarios.find((s) => s.id === 'TD-004-iceland-multi-lex')!;
    const { legacyResult, lexResult, shadowEvent } = await runLegacyFrozenVsLexDualRun({
      tripId: 'task_d_legacy_lex',
      worldState: scenario.worldState!,
      candidates: scenario.candidates,
      constraintReports: scenario.constraintReports,
    });

    expect(legacyResult.solverMetadata.nativeCpSat).toBe(false);
    expect(lexResult.solverMetadata.nativeCpSat).toBe(false);
    expect(lexResult.solverMetadata.solverEngine).toBe('cp-sat-lex-v1');
    expect(shadowEvent.eligibleForStrategyComparison).toBe(true);
    expect(shadowEvent.inputFingerprint.candidateSetHash).toBeTruthy();
  });

  it('shadow error does not block authority response', async () => {
    const scenario = scenarios.find((s) => s.id === 'TD-010-shadow-error')!;
    const result = await runShadowDualRun({
      tripId: 'task_d_err',
      worldState: scenario.worldState!,
      candidates: scenario.candidates,
      constraintReports: scenario.constraintReports,
      shadowError: 'boom',
    });

    expect(result.authoritySelectedId).toBeDefined();
    expect(result.shadowEvent.divergence.types).toContain('SHADOW_ERROR');
  });
});
