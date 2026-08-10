import { buildUserFacingAnswerText } from './build-user-facing-answer-text.runner';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('build-user-facing-answer-text.runner', () => {
  it('prefers narration summary', () => {
    const state = {
      narration: { user_friendly_summary: ' 摘要 ' },
      itinerary: { days: [{}, {}] },
    } as unknown as OrchestratorState;
    expect(buildUserFacingAnswerText(state)).toBe('摘要');
  });

  it('falls back to day count', () => {
    const state = {
      itinerary: { days: [{}, {}, {}] },
    } as unknown as OrchestratorState;
    expect(buildUserFacingAnswerText(state)).toContain('3 天');
  });
});
