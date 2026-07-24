import { evaluateMcpoiDaysFromDb } from './mcpoi-benchmark-runtime.util';
import { dbDaysToMcpoiScheduledByDayIndex } from './mcpoi-itinerary.adapter.util';
import { projectMcpoiEvaluationsToFeasibilityIssues } from './mcpoi-feasibility.projection.util';
import { MCPOI_BENCHMARK_TRIP_ID } from '../../arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';

describe('MCPOI benchmark runtime bridge', () => {
  const sampleDays = [
    {
      id: 'mcpoi-day-003',
      date: new Date('2026-10-06T00:00:00.000Z'),
      dayNumber: 3,
      items: [
        {
          id: 'mcpoi-a-001',
          type: 'ACTIVITY',
          note: 'Seljalandsfoss',
          startTime: new Date('2026-10-06T09:00:00.000Z'),
          endTime: new Date('2026-10-06T10:00:00.000Z'),
          order: 1,
        },
        {
          id: 'mcpoi-a-004',
          type: 'ACTIVITY',
          note: 'Dyrhólaey',
          startTime: new Date('2026-10-06T15:30:00.000Z'),
          endTime: new Date('2026-10-06T16:30:00.000Z'),
          order: 4,
        },
      ],
    },
  ];

  it('maps DB itinerary to benchmark evaluator (scheme A fragment)', () => {
    const byDay = dbDaysToMcpoiScheduledByDayIndex(sampleDays);
    expect(byDay.get(2)?.[1]?.poiId).toBe('POI-DYRHOLAEY');

    const evaluations = evaluateMcpoiDaysFromDb(sampleDays);
    expect(evaluations[0].hardViolations).toContain('H-07');
  });

  it('projects feasibility issues with member-scoped metadata', () => {
    const evaluations = evaluateMcpoiDaysFromDb(sampleDays);
    const issues = projectMcpoiEvaluationsToFeasibilityIssues(MCPOI_BENCHMARK_TRIP_ID, evaluations);
    const wind = issues.find((i) => i.semanticKey?.includes('H-07'));
    expect(wind?.resolutionMode).toBe('DECISION_REQUIRED');
    expect(wind?.proofs?.[0]?.evidenceSource).toBe('mcpoi_benchmark');
  });
});
