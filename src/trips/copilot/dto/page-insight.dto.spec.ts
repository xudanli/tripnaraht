import {
  defaultInsightScopeForPageId,
  defaultPageModeForPageId,
  normalizeCopilotInsightScope,
  normalizeCopilotPageMode,
} from './page-insight-mode.util';

describe('page-insight mode normalizers', () => {
  it('maps FE aliases for pageMode', () => {
    expect(normalizeCopilotPageMode('ACTIVITY_INSERTION')).toBe('ACTIVITY_EDITOR');
    expect(normalizeCopilotPageMode('activityInsertion')).toBe('ACTIVITY_EDITOR');
    expect(normalizeCopilotPageMode('SELECTED_DAY')).toBe('ITINERARY_DAY_EDITOR');
    expect(normalizeCopilotPageMode('DECISION_SPACE')).toBeUndefined();
    expect(normalizeCopilotPageMode('')).toBeUndefined();
  });

  it('maps FE aliases for insightScope', () => {
    expect(normalizeCopilotInsightScope('ACTIVITY_EDITOR')).toBe('ACTIVITY');
    expect(normalizeCopilotInsightScope('SELECTED_DAY')).toBe('ITINERARY_DAY');
    expect(normalizeCopilotInsightScope('ACTIVITY_INSERTION')).toBe('ACTIVITY_INSERTION');
    expect(normalizeCopilotInsightScope('EXECUTION_HOME')).toBe('EXECUTION');
  });

  it('defaults from pageId', () => {
    expect(defaultPageModeForPageId('ACTIVITY_EDITOR')).toBe('ACTIVITY_EDITOR');
    expect(defaultInsightScopeForPageId('ACTIVITY_EDITOR')).toBe('ACTIVITY');
    expect(defaultPageModeForPageId('DECISION_SPACE')).toBeUndefined();
  });
});
