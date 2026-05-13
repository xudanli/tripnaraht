import { governanceEventLevelForType } from '../../agent/ledger/governance-ledger-event-level.util';

describe('governance-branch ledger event levels', () => {
  it('maps governance branch events to L2 policy', () => {
    expect(governanceEventLevelForType('governance_branch_selected')).toBe('L2_policy');
    expect(governanceEventLevelForType('governance_branch_outcome')).toBe('L2_policy');
    expect(governanceEventLevelForType('governance_resolution_event')).toBe('L2_policy');
  });
});
