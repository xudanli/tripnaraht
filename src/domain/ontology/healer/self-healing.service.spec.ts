import { SelfHealingService } from './self-healing.service';
import { ViolationCode } from '../validator/physical-validator.constants';

describe('SelfHealingService', () => {
  const service = new SelfHealingService();

  it('suggestOptions returns TEMPORAL_SHIFT for SEGMENT_SEASONALLY_CLOSED with physical_domain.enter_at', () => {
    const violations = [
      {
        code: ViolationCode.SEGMENT_SEASONALLY_CLOSED,
        severity: 'BLOCK' as const,
        detail: 'test',
        evidence_source: 'policy:iceland_fr_highland_calendar_v1',
      },
    ];
    const input = {
      physical_domain: { segment_id: 's1', enter_at: '2026-05-15T10:00:00.000Z' },
    };
    const opts = service.suggestOptions(violations, input);
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe('TEMPORAL_SHIFT');
    expect(opts[0].temporal_shift?.shift_days).toBeGreaterThan(0);
    expect(opts[0].temporal_shift?.suggested_enter_at).toBeDefined();
  });

  it('returns empty when no enter_at', () => {
    const opts = service.suggestOptions(
      [{ code: ViolationCode.SEGMENT_SEASONALLY_CLOSED, severity: 'BLOCK', detail: 'x' }],
      {},
    );
    expect(opts).toHaveLength(0);
  });

  it('suggestOptions returns TEMPORAL_SHIFT for SEGMENT_ROAD_CLOSED (short deferral)', () => {
    const violations = [
      {
        code: ViolationCode.SEGMENT_ROAD_CLOSED,
        severity: 'BLOCK' as const,
        detail: 'Road passage blocked',
        evidence_source: 'road.is',
      },
    ];
    const input = {
      physical_domain: { segment_id: 's1', enter_at: '2026-07-15T10:00:00.000Z' },
    };
    const opts = service.suggestOptions(violations, input);
    expect(opts.some((o) => o.option_id === 'temporal_shift_live_road_closure_v1')).toBe(true);
    const live = opts.find((o) => o.option_id === 'temporal_shift_live_road_closure_v1');
    expect(live?.temporal_shift?.risk).toBe('HIGH');
    expect(live?.temporal_shift?.shift_days).toBeGreaterThanOrEqual(1);
  });

  it('buildHealedActionInput updates physical_domain.enter_at for TEMPORAL_SHIFT', () => {
    const violations = [
      {
        code: ViolationCode.SEGMENT_SEASONALLY_CLOSED,
        severity: 'BLOCK' as const,
        detail: 'test',
        evidence_source: 'policy:iceland_fr_highland_calendar_v1',
      },
    ];
    const input = {
      physical_domain: { segment_id: 's1', enter_at: '2026-05-15T10:00:00.000Z' },
      ontology_context: { trip_ref: 't1' },
    };
    const opts = service.suggestOptions(violations, input);
    expect(opts.length).toBeGreaterThan(0);
    const healed = service.buildHealedActionInput(opts[0], input);
    expect(healed?.physical_domain?.enter_at).not.toBe(input.physical_domain.enter_at);
    expect(healed?.ontology_context).toEqual(input.ontology_context);
  });
});
