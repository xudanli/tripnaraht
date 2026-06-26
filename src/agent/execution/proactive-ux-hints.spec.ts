import {
  buildProactiveUxHints,
  buildProactiveUxHintsFromCascadeImpact,
  inferTripInteractionStage,
  mergeProactiveUxHintsIntoNarration,
} from './proactive-ux-hints';

describe('proactive-ux-hints', () => {
  const nowMs = Date.parse('2026-06-14T10:00:00.000Z');

  it('infers trip interaction stage from request dates', () => {
    expect(
      inferTripInteractionStage(
        { tripPlanRequest: { date_range: { start_date: '2026-06-20', end_date: '2026-06-25' } } },
        nowMs,
      ),
    ).toBe('PRE_TRIP');
    expect(
      inferTripInteractionStage(
        { tripPlanRequest: { date_range: { start_date: '2026-06-10', end_date: '2026-06-20' } } },
        nowMs,
      ),
    ).toBe('IN_TRIP');
    expect(
      inferTripInteractionStage(
        { tripPlanRequest: { date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } } },
        nowMs,
      ),
    ).toBe('POST_TRIP');
  });

  it('builds cascade glanceable hints from dependency impact', () => {
    const hints = buildProactiveUxHintsFromCascadeImpact({
      stage: 'PRE_TRIP',
      dependencyImpact: {
        impact: {
          affected: [
            {
              riskLevel: 'HIGH',
              message: 'F-road 封路影响高地 POI',
              recommendation: 'ASK_USER',
              cascadeConfidence: 0.76,
              netImpactMinutes: 30,
            },
          ],
        },
      },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].messageZh).toMatch(/级联影响/);
    expect(hints[0].messageZh).toMatch(/净影响约 30 分钟/);
    expect(hints[0].messageZh).toMatch(/级联置信度 76%/);
    expect(hints[0].messageZh).not.toMatch(/自动执行/);
  });

  it('builds glanceable hints for reliability and safety issues without booking language', () => {
    const hints = buildProactiveUxHints({
      nowMs,
      dso: {
        verification: {
          issues: [
            {
              code: 'WEATHER_RISK',
              class: 'ADVISORY',
              message: 'wind',
            },
          ],
        },
      } as any,
      ctx: {
        requestId: 'r1',
        tripPlanRequest: {
          date_range: { start_date: '2026-06-10', end_date: '2026-06-20' },
          party_profile: { risk_tolerance: 'low' },
        },
        itinerary: {
          request_id: 'r1',
          days: [],
          metadata: {
            __data_reliability: { finding_count: 1, evidence_count: 2 },
          },
        },
      },
    });

    expect(hints.map((h) => h.id)).toEqual(['data_reliability_recheck', 'safety_first_adjustment']);
    expect(hints.every((h) => h.surface === 'GLANCEABLE')).toBe(true);
    expect(hints.map((h) => h.messageZh).join('')).not.toMatch(/预订|下单|改签|自动执行/);
  });

  it('builds action-bound glanceable hint for risk event issues', () => {
    const hints = buildProactiveUxHints({
      nowMs,
      dso: {
        verification: {
          issues: [
            {
              code: 'ROUTE_INFEASIBLE',
              class: 'CONFLICT',
              message: '[风险事件|ROAD_ACCESS|U5] 道路关闭',
            },
          ],
        },
      } as any,
      ctx: {
        requestId: 'r1',
        tripPlanRequest: {
          date_range: { start_date: '2026-06-10', end_date: '2026-06-20' },
        },
      },
    });

    expect(hints.some((h) => h.id === 'risk_event_action_bound' && h.surface === 'GLANCEABLE')).toBe(true);
    expect(hints.map((h) => h.messageZh).join('')).not.toMatch(/预订|下单|改签|自动执行/);
  });

  it('merges proactive hints into tips and research_ui_hints', () => {
    const out = mergeProactiveUxHintsIntoNarration(
      { user_friendly_summary: '', day_by_day_narrative: [], highlights: [], tips: [] },
      [
        {
          id: 'x',
          stage: 'IN_TRIP',
          priority: 'HIGH',
          surface: 'GLANCEABLE',
          messageZh: '行动前先复核关键事实。',
          reason: 'DATA_RELIABILITY',
        },
      ],
    );

    expect(out.tips[0]).toContain('行动前先复核关键事实');
    expect(out.research_ui_hints?.[0]).toMatchObject({
      scope: 'proactive:data_reliability',
      freshness: 'HIGH',
    });
  });
});
