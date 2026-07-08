import {
  hasConstraintApprovalSignal,
  hasConstraintHardViolationSignal,
  isConstraintAgentNarrateOnlyMode,
  resolveConstraintApprovalForAudit,
  resolveConstraintBlockedForAudit,
} from './constraint-agent-narrate-only.util';

describe('constraint-agent-narrate-only.util', () => {
  it('CAS-109: narrate-only audit uses violation signal not is_blocked', () => {
    const snapshot = {
      violations: [{ sev_level: 'SEV-1' }],
      sev_level: 'SEV-1' as const,
      is_blocked: false,
      block_authority: 'gateway' as const,
      narrate_only: true,
    };
    expect(resolveConstraintBlockedForAudit(snapshot)).toBe(true);
    expect(hasConstraintHardViolationSignal(snapshot)).toBe(true);
  });

  it('CAS-110: legacy agent authority respects is_blocked', () => {
    const snapshot = {
      violations: [],
      sev_level: 'SEV-4' as const,
      is_blocked: true,
      block_authority: 'agent' as const,
      narrate_only: false,
    };
    expect(resolveConstraintBlockedForAudit(snapshot)).toBe(true);
  });

  it('CAS-111: approval signal delegated in narrate-only mode', () => {
    const snapshot = {
      violations: [{ sev_level: 'SEV-2' }],
      sev_level: 'SEV-2' as const,
      requires_approval: false,
      block_authority: 'gateway' as const,
      narrate_only: true,
    };
    expect(resolveConstraintApprovalForAudit(snapshot)).toBe(true);
    expect(hasConstraintApprovalSignal(snapshot)).toBe(true);
    expect(isConstraintAgentNarrateOnlyMode()).toBe(
      process.env.PHASE6_LEGACY_DEPRECATION === '1' ||
        process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED === '1' ||
        process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION === '1',
    );
  });
});
