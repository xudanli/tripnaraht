import { resolveReadinessClaimItem } from './readiness-claim.catalog';

describe('readiness-claim.catalog', () => {
  it('resolves self-drive and overall issue codes', () => {
    expect(resolveReadinessClaimItem('RENTAL_ORDER').titleZh).toContain('租车');
    expect(
      resolveReadinessClaimItem('VEHICLE_RENTAL.RENTAL_ORDER').refId,
    ).toBe('VEHICLE_RENTAL.RENTAL_ORDER');
    expect(
      resolveReadinessClaimItem('TRANSPORT_INSURANCE_PENDING').labelZh,
    ).toContain('保险');
  });

  it('handles dynamic prefixes', () => {
    expect(resolveReadinessClaimItem('ROUTE_ISSUE_abc').titleZh).toContain(
      '路线',
    );
    expect(
      resolveReadinessClaimItem('TRANSPORT_PROBLEM_x').titleZh,
    ).toContain('交通');
  });
});
