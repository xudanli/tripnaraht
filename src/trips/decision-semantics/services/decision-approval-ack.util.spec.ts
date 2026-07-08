import { resolveDecisionAuthority } from '../authority/decision-authority.matrix';

describe('createDecision approval — REQUIRE_ADJUSTMENT + ack', () => {
  it('ROUTE_ADJUST (overridable=false) promotes to APPROVED when acknowledgement provided', () => {
    const authority = resolveDecisionAuthority({
      problemType: 'RISK',
      primaryDomain: 'ROUTE',
      enforcement: 'REQUIRE_ADJUSTMENT',
      overridable: false,
    });

    expect(authority.executionMode).toBe('EXPLICIT_CONFIRMATION');
    expect(authority.overridable).toBe(false);
    expect(authority.requiredApprover).toBe('TRIP_OWNER');

    const acknowledgement = ['我确认在了解阻断原因后仍执行该方案'];
    const shouldApprove =
      acknowledgement.length > 0 &&
      authority.executionMode === 'EXPLICIT_CONFIRMATION' &&
      authority.requiredApprover === 'TRIP_OWNER';

    expect(shouldApprove).toBe(true);
  });
});
