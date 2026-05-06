import { computeSegmentFeasibilityViolations } from './segment-feasibility.util';
import { ICELAND_F_ROAD_POLICY_SOURCE } from './iceland-f-road-policy.util';

describe('computeSegmentFeasibilityViolations / Iceland F-Road policy', () => {
  const baseSegment = {
    segment_type: 'F_ROAD' as const,
    road_condition: { status: 'OPEN' as const },
    seasonal_closures: [] as Array<{ start: string; end: string }>,
    evidence: { source: 'mock', url: 'https://example.invalid/segment' },
  };

  it('emits SEGMENT_SEASONALLY_CLOSED for F-Road in May when DB closures do not cover enter_at', () => {
    const { violations, facts } = computeSegmentFeasibilityViolations({
      segment: baseSegment,
      toPoi: null,
      enterAt: new Date('2026-05-12T10:00:00.000Z'),
      vehicleType: 'FOUR_BY_FOUR',
    });
    expect(violations).toContain('SEGMENT_SEASONALLY_CLOSED');
    expect(facts.icelandPolicySeasonallyClosed).toBe(true);
    expect((facts as Record<string, unknown>).road_policy_source).toBe(ICELAND_F_ROAD_POLICY_SOURCE);
  });

  it('does not apply Iceland overlay when DB seasonal window already matches', () => {
    const { violations, facts } = computeSegmentFeasibilityViolations({
      segment: {
        ...baseSegment,
        seasonal_closures: [{ start: '2026-05-01T00:00:00.000Z', end: '2026-05-31T23:59:59.000Z' }],
      },
      toPoi: null,
      enterAt: new Date('2026-05-12T10:00:00.000Z'),
      vehicleType: 'FOUR_BY_FOUR',
    });
    expect(violations.filter((c) => c === 'SEGMENT_SEASONALLY_CLOSED')).toHaveLength(1);
    expect(facts.icelandPolicySeasonallyClosed).toBe(false);
    expect((facts as Record<string, unknown>).road_policy_source).toBeUndefined();
  });

  it('July passage with F-Road + 4x4 has no seasonal violation from Iceland calendar', () => {
    const { violations } = computeSegmentFeasibilityViolations({
      segment: baseSegment,
      toPoi: null,
      enterAt: new Date('2026-07-15T10:00:00.000Z'),
      vehicleType: 'FOUR_BY_FOUR',
    });
    expect(violations).not.toContain('SEGMENT_SEASONALLY_CLOSED');
  });
});
