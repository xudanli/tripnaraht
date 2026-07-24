import {
  assertFeasibilityRepairAuthority,
  isPlanFeasibilityBlockerId,
  isPlanMutationRepairOption,
  isPrepOnlyRepairAction,
  resolveRepairTargetIssueId,
} from './repair-authority.util';

describe('repair-authority.util', () => {
  it('identifies prep-only actions', () => {
    expect(isPrepOnlyRepairAction('manual_confirm')).toBe(true);
    expect(isPrepOnlyRepairAction('shift_departure')).toBe(false);
  });

  it('identifies plan mutation options', () => {
    expect(isPlanMutationRepairOption({ actionType: 'adjust_time' })).toBe(true);
    expect(isPlanMutationRepairOption({ actionType: 'manual_confirm' })).toBe(false);
  });

  it('blocks plan mutation without feasibility authority', () => {
    expect(() =>
      assertFeasibilityRepairAuthority('readiness_prep', { actionType: 'add_buffer' }),
    ).toThrow(/REPAIR_AUTHORITY_FEASIBILITY/);
    expect(() =>
      assertFeasibilityRepairAuthority('feasibility', { actionType: 'add_buffer' }),
    ).not.toThrow();
  });

  it('maps prerequisite ids to feasibility issue ids', () => {
    expect(
      resolveRepairTargetIssueId('prereq:poi-access:item-1:poi_access_reservation_required'),
    ).toBe('poi-access:item-1:poi_access_reservation_required');
    expect(resolveRepairTargetIssueId('prereq:experience-regret:trip-1')).toBe(
      'experience-regret:unconfirmed:trip-1',
    );
  });

  it('detects plan-feasibility blocker ids', () => {
    expect(isPlanFeasibilityBlockerId('coverage-gap:gap-1')).toBe(true);
    expect(isPlanFeasibilityBlockerId('fact.IS.entry.visa')).toBe(false);
  });
});
