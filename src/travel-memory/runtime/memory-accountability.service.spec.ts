import { TravelMemoryRuntimeService } from './travel-memory-runtime.service';
import { MemoryAccountabilityService } from './memory-accountability.service';
import { CGUS_DECISION_TRACE_SCHEMA_VERSION } from '../../trips/decision/optimization/cgus-decision-trace.types';

describe('MemoryAccountabilityService', () => {
  it('explains decision from hot ledger episode + candidate', async () => {
    const runtime = new TravelMemoryRuntimeService();
    runtime.ingestCgusOutcomeLoop({
      kind: 'outcome',
      userId: 'U1',
      trace: {
        schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
        decision_id: 'D-ACC-1',
        trip_id: 'T1',
        decision_type: 'ACTIVITY_SELECTION',
        candidate_ids: ['A', 'B'],
        hard_constraint_result: 'all_feasible',
        hard_constraint_reasons: [],
        candidate_scores: {},
        ranking: ['A', 'B'],
        recommended_candidate: 'A',
        user_action: 'ACCEPT',
        chosen_candidate: 'A',
        actual_outcome: { completed: true, safetyIncident: false },
        decision_regret: 'NONE',
      },
    });

    const svc = new MemoryAccountabilityService(runtime);
    const explanation = await svc.explainDecision('D-ACC-1');
    expect(explanation.decisionId).toBe('D-ACC-1');
    expect(explanation.memoryUsed.length).toBeGreaterThan(0);
    expect(
      explanation.memoryUsed.some((m) => m.key.includes('ACTIVITY_SELECTION')),
    ).toBe(true);

    const episodeEvent = runtime
      .getLedger()
      .list({ activeOnly: false })
      .find((e) => e.memoryType === 'DECISION_EPISODE_REF');
    expect(episodeEvent).toBeTruthy();
    const evidence = await svc.explainMemory(episodeEvent!.memoryEventId);
    expect(evidence?.evidence.length).toBeGreaterThan(0);
    expect(evidence?.bitemporal.recorded_at).toBeTruthy();
  });

  it('marks CANDIDATE as ignored in decision explanation', async () => {
    const runtime = new TravelMemoryRuntimeService();
    runtime.writeCandidate({
      subject: { type: 'USER', id: 'U1' },
      memoryType: 'PREFERENCE',
      predicate: 'decision.affinity.TEST',
      value: {
        candidateValue: 'X',
        attributionConfidence: { status: 'CANDIDATE' },
        profileEligible: false,
      },
      scope: 'GLOBAL_USER',
      sourceType: 'DECISION_OUTCOME',
      confidence: 0.45,
      decisionId: 'D-IGN',
      episodeId: 'EP-IGN',
    });

    const svc = new MemoryAccountabilityService(runtime);
    const explanation = await svc.explainDecision('D-IGN');
    expect(
      explanation.memoryIgnored.some((m) =>
        m.reason.includes('CANDIDATE'),
      ),
    ).toBe(true);
  });
});
