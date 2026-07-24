import {
  FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON,
  shouldBlockAutoApplyForFlawedDraft,
} from './itinerary-adjust-flawed-auto-block.util';

describe('shouldBlockAutoApplyForFlawedDraft', () => {
  it('blocks when flawed_draft_narrate is true', () => {
    expect(shouldBlockAutoApplyForFlawedDraft({ flawed_draft_narrate: true })).toBe(true);
    expect(FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON).toBe('flawed_draft_forbidden');
  });

  it('allows when not flawed', () => {
    expect(shouldBlockAutoApplyForFlawedDraft({})).toBe(false);
    expect(shouldBlockAutoApplyForFlawedDraft(undefined)).toBe(false);
  });
});
