import {
  aggregateExecutabilityStatus,
  fromConstraintEnforcement,
  fromFeasibilityPriority,
  fromPackRule,
} from './verdict.mapper';

describe('verdict.mapper', () => {
  it('maps Pack BLOCK to REJECT', () => {
    expect(fromPackRule({ verdict: 'BLOCK', overridable: false })).toEqual({
      outcome: 'REJECT',
      severity: 'CRITICAL',
    });
  });

  it('maps Pack WARNING overridable to CAUTION', () => {
    expect(fromPackRule({ verdict: 'WARNING', overridable: true })).toEqual({
      outcome: 'CAUTION',
      severity: 'MEDIUM',
    });
  });

  it('maps must_handle blocker to REJECT', () => {
    expect(fromFeasibilityPriority('must_handle', 'blocker')).toEqual({
      outcome: 'REJECT',
      severity: 'CRITICAL',
    });
  });

  it('maps REQUIRE_ADJUSTMENT to SUGGEST_REPAIR', () => {
    expect(fromConstraintEnforcement('REQUIRE_ADJUSTMENT')).toEqual({
      outcome: 'SUGGEST_REPAIR',
      severity: 'HIGH',
    });
  });

  it('aggregates REJECT to NOT_EXECUTABLE', () => {
    expect(
      aggregateExecutabilityStatus([
        { outcome: 'CAUTION', severity: 'MEDIUM' },
        { outcome: 'REJECT', severity: 'CRITICAL' },
      ]),
    ).toBe('NOT_EXECUTABLE');
  });

  it('aggregates HIGH load to REQUIRES_REPAIR per IS-CERT-101', () => {
    expect(
      aggregateExecutabilityStatus([{ outcome: 'SUGGEST_REPAIR', severity: 'HIGH' }]),
    ).toBe('REQUIRES_REPAIR');
  });

  it('aggregates only CAUTION to EXECUTABLE_WITH_CAUTION', () => {
    expect(
      aggregateExecutabilityStatus([{ outcome: 'CAUTION', severity: 'MEDIUM' }]),
    ).toBe('EXECUTABLE_WITH_CAUTION');
  });
});
