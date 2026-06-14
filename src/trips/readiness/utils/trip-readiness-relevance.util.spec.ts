import {
  ACTIONABLE_READINESS_HORIZON_DAYS,
  filterRisksForTripPhase,
  filterSegmentHazardsForTripPhase,
  getTripReadinessPhase,
  isActionableLiveRisk,
} from './trip-readiness-relevance.util';

describe('trip-readiness-relevance', () => {
  it('classifies far-future trips as planning phase', () => {
    const start = new Date();
    start.setDate(start.getDate() + 180);
    expect(getTripReadinessPhase(start)).toBe('planning');
  });

  it('treats departure-day road checks as live-only risks', () => {
    expect(
      isActionableLiveRisk({
        type: 'driving_conditions',
        summary: '出发前查看路况（road.is）',
      }),
    ).toBe(true);
  });

  it('keeps structural vehicle/route constraints during planning', () => {
    expect(
      isActionableLiveRisk({
        type: 'driving_conditions',
        summary: 'F 路需要四驱车辆，冬季高地道路关闭',
      }),
    ).toBe(false);
  });

  it('defers generic destination weather risks during planning', () => {
    expect(
      isActionableLiveRisk({
        type: 'WEATHER',
        category: 'weather',
        summary: '天气相关风险，如极端天气、暴风雪等',
        isGenericTemplate: true,
      }),
    ).toBe(true);
  });

  it('keeps structural winter route guidance in weather copy during planning', () => {
    expect(
      isActionableLiveRisk({
        type: 'weather_extreme',
        category: 'weather',
        summary: '冬季 F 路可能关闭，需四驱车辆',
      }),
    ).toBe(false);
  });

  it('filters generic weather in planning phase', () => {
    const start = new Date();
    start.setDate(start.getDate() + 120);

    const { risks, phaseInfo } = filterRisksForTripPhase(
      [
        { id: 'weather', type: 'WEATHER', category: 'weather', isGenericTemplate: true, summary: '天气相关风险' },
        { id: 'terrain', type: 'terrain', summary: 'F 路需要四驱，冬季关闭' },
      ] as any[],
      start,
    );

    expect(phaseInfo.deferredLiveRiskCount).toBe(1);
    expect(risks.map((r) => r.id)).toEqual(['terrain']);
  });

  it('filters live risks in planning phase but keeps structural ones', () => {
    const start = new Date();
    start.setDate(start.getDate() + 120);

    const { risks, phaseInfo } = filterRisksForTripPhase(
      [
        { id: 'live', type: 'driving_conditions', summary: '出发前查看路况和 F 路状态' },
        { id: 'structural', type: 'terrain', summary: 'F 路需要四驱，冬季关闭' },
      ] as any[],
      start,
    );

    expect(phaseInfo.phase).toBe('planning');
    expect(phaseInfo.deferredLiveRiskCount).toBe(1);
    expect(risks.map((r) => r.id)).toEqual(['structural']);
    expect(phaseInfo.phaseHint.zh).toContain(String(ACTIONABLE_READINESS_HORIZON_DAYS));
  });

  it('defers winter segment hazards during planning phase', () => {
    const start = new Date();
    start.setDate(start.getDate() + 120);
    const filtered = filterSegmentHazardsForTripPhase(
      [
        {
          type: 'winter_road_condition',
          severity: 'medium',
          message: '冬季前往自然景点，请注意道路状况',
        },
        {
          type: 'cross_day',
          severity: 'low',
          message: '跨天行程，请合理安排出发时间',
        },
      ],
      start,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe('cross_day');
  });
});
