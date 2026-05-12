import { buildUnifiedExecutionSemanticView } from '../decision/execution/unified-execution-semantic-view';
import { synthesizeNarrative } from './narrative.synthesizer';
import { compileIntent } from '../intent/intent.compiler';

describe('synthesizeNarrative', () => {
  it('builds storyByDay from semantic view + causal graph', () => {
    const semanticView = buildUnifiedExecutionSemanticView({
      planDates: ['2026-06-01'],
      weatherByDate: {
        '2026-06-01': {
          violation: 'SOFT',
          hazardKinds: ['WIND_SPEED'],
        },
      },
      explanation: {
        summary: ' Systems aligned constraints.',
        steps: [],
        causalChain: [],
      },
    });

    const tripPlan = {
      version: '1',
      createdAt: 't',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 's1',
              time: '09:00',
              title: 'Drive',
              type: 'nature' as const,
            },
          ],
        },
      ],
    };

    const out = synthesizeNarrative({
      semanticView,
      causalGraph: {
        nodes: [
          {
            id: 'n1',
            type: 'CONSTRAINT',
            source: 'ROAD:F208',
            target: 's1',
            reasonCode: 'IMPASSABLE',
            timestamp: 1,
          },
        ],
      },
      tripPlan,
      compiledIntent: compileIntent({
        explicitIntent: {
          mobilityPreference: 'LOW_DRIVE',
          pace: 'RELAXED',
          riskTolerance: 'LOW',
          experienceBias: { nature: 2, driving: 1, city: 0 },
        },
      }),
      counterfactualOverlay: {
        scenarios: [{ id: 'c1', assumption: 'F208 OPEN', patchedConstraints: {}, simulationMode: 'PARTIAL_REPLAY', horizon: { start: '2026-06-01', end: '2026-06-01' } }],
        bestAlternative: 'Keep current plan',
      },
    });

    expect(out.title.length).toBeGreaterThan(0);
    expect(out.storyByDay.length).toBe(1);
    expect(out.storyByDay[0]!.story).toContain('第 1 天');
    expect(out.tradeoffNarratives.some((t) => t.includes('设想'))).toBe(true);
  });
});
