import {
  TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_ID,
  buildTripExecutionSemanticViewSnapshot,
} from './trip-execution-semantic-view.builder';

describe('buildTripExecutionSemanticViewSnapshot', () => {
  it('attaches authority with stable builder id and deterministic fingerprint', () => {
    const input = {
      weatherByDate: {
        '2026-06-01': { executionState: 'DEGRADED' as const, violation: 'NONE' as const },
      },
      planDates: ['2026-06-01', '2026-06-02'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(input);
    expect(a.temporalScope?.horizon).toEqual({
      start: '2026-06-01',
      end: '2026-06-02',
    });
    const b = buildTripExecutionSemanticViewSnapshot(input);
    expect(a.authority?.builderId).toBe(TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_ID);
    expect(a.authority?.schemaVersion).toBe('1');
    expect(a.authority?.builderSemver).toMatch(/^\d+\.\d+\.\d+$/);
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(a.authority?.inputsFingerprint).toHaveLength(32);
  });

  it('keeps inputsFingerprint when only executionRuntime overlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      executionRuntime: {
        lastUpdatedAt: 1_700_000_000_000,
        source: 'STREAM' as const,
        lastStreamSeverity: 'HIGH' as const,
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.runtime?.source).toBe('STREAM');
    expect(b.runtime?.lastStreamSeverity).toBe('HIGH');
  });

  it('keeps inputsFingerprint when only healingSnapshot overlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      healingSnapshot: {
        status: 'STABLE',
        iteration: 3,
        remainingIssues: 0,
        stabilityScore: 0.95,
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.healing?.status).toBe('STABLE');
  });

  it('keeps inputsFingerprint when only explanation overlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      explanation: {
        summary: 'Test causal summary',
        steps: ['step a'],
        causalChain: ['step a'],
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.explanation?.summary).toBe('Test causal summary');
  });

  it('keeps inputsFingerprint when only counterfactualOverlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      counterfactualOverlay: {
        scenarios: [
          {
            id: 'x',
            assumption: 'test',
            patchedConstraints: {},
            simulationMode: 'PARTIAL_REPLAY' as const,
            horizon: { start: '2026-06-01', end: '2026-06-02' },
          },
        ],
        bestAlternative: 'Keep current plan',
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.counterfactual?.bestAlternative).toBe('Keep current plan');
  });

  it('keeps inputsFingerprint when only intentReconciliationOverlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      intentReconciliationOverlay: {
        conflicts: [],
        tradeoffs: [],
        priorities: ['minimize_fatigue'],
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.intentReconciliation?.priorities).toContain('minimize_fatigue');
  });

  it('keeps inputsFingerprint when only narrativeOverlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      narrativeOverlay: {
        title: 'Test',
        summary: 'S',
        storyByDay: [],
        emotionalArc: 'CALM' as const,
        tradeoffNarratives: [],
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.narrative?.title).toBe('Test');
  });

  it('keeps inputsFingerprint when only worldOverlay changes', () => {
    const base = {
      weatherByDate: {
        '2026-06-01': { violation: 'NONE' as const },
      },
      planDates: ['2026-06-01'] as const,
    };
    const a = buildTripExecutionSemanticViewSnapshot(base);
    const b = buildTripExecutionSemanticViewSnapshot({
      ...base,
      worldOverlay: {
        version: 9,
        lastUpdatedAt: 42,
        constraints: {
          version: 9,
          lastUpdatedAt: 42,
          roads: {},
          weather: {},
          bookings: {},
        },
      },
    });
    expect(a.authority?.inputsFingerprint).toBe(b.authority?.inputsFingerprint);
    expect(b.world?.version).toBe(9);
  });

  it('changes fingerprint when weather payload changes', () => {
    const x = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: { '2026-06-01': { violation: 'NONE' } },
      planDates: ['2026-06-01'],
    });
    const y = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: { '2026-06-01': { violation: 'SOFT' } },
      planDates: ['2026-06-01'],
    });
    expect(x.authority?.inputsFingerprint).not.toBe(y.authority?.inputsFingerprint);
  });
});
