import {
  buildCandidateEvaluations,
  solveLexicographicCpSat,
} from './cp-sat-lexicographic.engine';
import { ObjectiveSemanticsRegistry } from '../../objectives/objective-semantics.registry';
import {
  icelandMinimalMultiCandidateFixture,
} from '../../../decision-lab/fixtures/iceland-minimal.fixture';

describe('cp-sat-lexicographic.engine', () => {
  const registry = new ObjectiveSemanticsRegistry();
  const enabledObjectives = registry.list().map((o) => o.objectiveId);
  const candidates = icelandMinimalMultiCandidateFixture();

  const candidateEvaluations = buildCandidateEvaluations({
    candidates,
    enabledObjectives,
    registry,
  });

  it('cp-sat-lex-v1 picks balanced over conservative on Iceland multi fixture', () => {
    const result = solveLexicographicCpSat(
      {
        candidates,
        enabledObjectives,
        timeLimitMs: 30_000,
        candidateEvaluations,
      },
      'cp-sat-lex-v1',
    );

    expect(result.engineId).toBe('cp-sat-lex-v1');
    expect(result.winnerId).toBe('balanced');
    expect(result.stageTraces.length).toBeGreaterThan(0);
    expect(result.stageTraces[0]?.layer).toBe('L2');
    expect(result.stageTraces[0]?.eliminatedCandidateIds.length).toBeGreaterThanOrEqual(0);
    expect(result.incumbentFound).toBe(true);
  });

  it('cp-sat-lex-v1 agrees with lex-rank-v0 on same fixture', () => {
    const v1 = solveLexicographicCpSat(
      {
        candidates,
        enabledObjectives,
        timeLimitMs: 30_000,
        candidateEvaluations,
      },
      'cp-sat-lex-v1',
    );
    const v0 = solveLexicographicCpSat(
      {
        candidates,
        enabledObjectives,
        timeLimitMs: 30_000,
        candidateEvaluations,
      },
      'lex-rank-v0',
    );

    expect(v1.winnerId).toBe(v0.winnerId);
  });

  it('respects time limit flag', () => {
    const result = solveLexicographicCpSat(
      {
        candidates,
        enabledObjectives,
        timeLimitMs: 0,
        candidateEvaluations,
      },
      'cp-sat-lex-v1',
    );

    expect(result.timedOut).toBe(true);
  });
});
