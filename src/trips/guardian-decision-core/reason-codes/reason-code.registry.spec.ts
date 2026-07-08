import {
  RFC001_REASON_CODES,
  REASON_CODE_REGISTRY,
  assertKnownReasonCodes,
  getReasonCodeDefinition,
  isHardBlockReason,
} from './reason-code.registry';

describe('RFC001 reason code registry', () => {
  it('has unique source of truth for all phase-0 codes', () => {
    const codes = Object.values(RFC001_REASON_CODES);
    expect(codes.length).toBeGreaterThanOrEqual(17);
    for (const code of codes) {
      expect(REASON_CODE_REGISTRY[code]).toBeDefined();
      expect(REASON_CODE_REGISTRY[code].code).toBe(code);
    }
  });

  it('ROAD_SEGMENT_CLOSED is non-overridable BLOCKING', () => {
    const def = getReasonCodeDefinition(RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED)!;
    expect(def.overridable).toBe(false);
    expect(def.severity).toBe('BLOCKING');
    expect(def.requiresEvidence).toBe(true);
    expect(isHardBlockReason(def.code)).toBe(true);
  });

  it('assertKnownReasonCodes rejects unknown', () => {
    expect(() =>
      assertKnownReasonCodes([RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED, 'NOT_A_CODE']),
    ).toThrow(/Unknown RFC-001 reason codes/);
  });
});
