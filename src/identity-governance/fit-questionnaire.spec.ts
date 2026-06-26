import {
  buildDynamicQuestionnaire,
  deriveLeaderRecommendation,
  validateRequiredAnswers,
} from './utils/fit-questionnaire.util';

describe('fit-questionnaire.util', () => {
  it('builds preview questionnaire with fewer questions than full', () => {
    const rules = [
      { id: 'r1', conditionKey: 'dates_available' },
      { id: 'r2', conditionKey: 'equipment_ready' },
    ];
    const preview = buildDynamicQuestionnaire({ rules, fitConfig: {}, phase: 'preview' });
    const full = buildDynamicQuestionnaire({ rules, fitConfig: {}, phase: 'full' });
    expect(preview.length).toBeLessThanOrEqual(full.length);
    expect(preview.some((q) => q.questionKey === 'dates_available')).toBe(true);
  });

  it('validates required answers', () => {
    const questions = buildDynamicQuestionnaire({
      rules: [{ id: 'r1', conditionKey: 'dates_available' }],
      fitConfig: {},
      phase: 'full',
    });
    const missing = validateRequiredAnswers(questions, {});
    expect(missing).toContain('dates_available');
  });

  it('derives leader recommendation without composite score', () => {
    expect(
      deriveLeaderRecommendation({ overallResult: 'NOT_RECOMMENDED', teamImpactLevel: 'LOW' }),
    ).toBe('REJECT');
    expect(
      deriveLeaderRecommendation({ overallResult: 'HIGH_FIT', teamImpactLevel: 'LOW' }),
    ).toBe('APPROVE');
  });
});
