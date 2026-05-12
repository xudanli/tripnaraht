import { summarizeTemporalPropagationForSignals } from './summarize-temporal-for-signals';

describe('summarizeTemporalPropagationForSignals', () => {
  it('returns undefined when snapshot is missing', () => {
    expect(summarizeTemporalPropagationForSignals(undefined)).toBeUndefined();
  });

  it('aggregates drift totals and policy counts', () => {
    const summary = summarizeTemporalPropagationForSignals({
      emittedAt: '2026-01-01T00:00:00.000Z',
      timeDrifts: [
        {
          id: 'a',
          date: '2026-06-01',
          sourceSlotId: 'drive',
          deltaMinutes: 12,
          confidence: 0.8,
          propagationPolicy: 'PROPAGATE_SEQUENCE',
          cause: { kind: 'WEATHER_EXECUTION_QUALITY', delayFactor: 1.2 },
        },
        {
          id: 'b',
          date: '2026-06-01',
          sourceSlotId: 'day',
          deltaMinutes: 30,
          confidence: 0.5,
          propagationPolicy: 'ACCUMULATE_GLOBAL_SLACK',
          cause: { kind: 'WEATHER_EXECUTION_QUALITY', delayFactor: 1.2 },
        },
        {
          id: 'c',
          date: '2026-06-01',
          sourceSlotId: 'head',
          deltaMinutes: 0,
          confidence: 0.9,
          propagationPolicy: 'NO_PROPAGATION',
          cause: {
            kind: 'WEATHER_BLOCKED_ADVISORY',
            executionState: 'BLOCKED',
          },
        },
      ],
      constraintEdges: [
        {
          id: 'e1',
          date: '2026-06-01',
          fromSlotId: 'a',
          toSlotId: 'b',
          kind: 'TIMELINE_FOLLOW',
        },
      ],
    });

    expect(summary).toMatchObject({
      driftCount: 3,
      constraintEdgeCount: 1,
      totalSequenceDeltaMinutes: 12,
      totalGlobalSlackMinutes: 30,
      policyCounts: {
        PROPAGATE_SEQUENCE: 1,
        ACCUMULATE_GLOBAL_SLACK: 1,
        NO_PROPAGATION: 1,
      },
      downstreamShiftedSlotCount: 0,
      crossDayDriftCount: 0,
      totalCrossDayDeltaMinutes: 0,
      crossDayShiftedSlotCount: 0,
    });
    expect(summary?.downstreamShiftedSlotIds).toBeUndefined();
  });

  it('copies downstream shifted slot ids when present', () => {
    const summary = summarizeTemporalPropagationForSignals({
      emittedAt: '2026-01-01T00:00:00.000Z',
      timeDrifts: [],
      constraintEdges: [],
      downstreamShiftedSlotIds: ['sight'],
    });
    expect(summary?.downstreamShiftedSlotIds).toEqual(['sight']);
    expect(summary?.downstreamShiftedSlotCount).toBe(1);
    expect(summary?.crossDayShiftedSlotCount).toBe(0);
  });

  it('includes unifiedConstraintGraphStats when snapshot carries unified graph', () => {
    const summary = summarizeTemporalPropagationForSignals({
      emittedAt: '2026-01-01T00:00:00.000Z',
      timeDrifts: [],
      constraintEdges: [],
      unifiedConstraintGraph: {
        version: '1',
        emittedAt: '2026-01-01T00:00:00.000Z',
        nodes: [],
        edges: [],
        stats: {
          nodeCount: 5,
          edgeCount: 4,
          driftNodeCount: 1,
          slotNodeCount: 4,
          bookingDeadlineNodeCount: 0,
          domainNodeCounts: { SCHEDULE_TOPOLOGY: 4, WEATHER: 1 },
          domainEdgeCounts: { SCHEDULE_TOPOLOGY: 3, WEATHER: 1 },
        },
      },
    });

    expect(summary?.unifiedConstraintGraphStats).toEqual({
      version: '1',
      nodeCount: 5,
      edgeCount: 4,
      driftNodeCount: 1,
      slotNodeCount: 4,
      bookingDeadlineNodeCount: 0,
      domainNodeCounts: { SCHEDULE_TOPOLOGY: 4, WEATHER: 1 },
      domainEdgeCounts: { SCHEDULE_TOPOLOGY: 3, WEATHER: 1 },
    });
  });
});
