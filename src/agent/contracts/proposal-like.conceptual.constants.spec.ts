import {
  PROPOSAL_LIKE_IS_NOT_A_BASE_CLASS,
  PROPOSAL_LIKE_REGISTRY,
} from './proposal-like.conceptual.constants';

describe('proposal-like conceptual registry', () => {
  it('forbids treating ProposalLike as a code base class', () => {
    expect(PROPOSAL_LIKE_IS_NOT_A_BASE_CLASS).toMatch(/documentation concept/i);
  });

  it('marks OR-Tools shadow as non-authoritative', () => {
    const shadow = PROPOSAL_LIKE_REGISTRY.find((r) => r.kind === 'ortools_shadow_attachment');
    expect(shadow?.authoritativeApply).toBe(false);
  });

  it('keeps Arrange PlanProposal as a local canonical surface', () => {
    const arrange = PROPOSAL_LIKE_REGISTRY.find((r) => r.kind === 'arrange_plan_proposal');
    expect(arrange?.actualTypeOrKey).toContain('PlanProposal');
  });
});
