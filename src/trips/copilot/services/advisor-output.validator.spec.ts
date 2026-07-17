import {
  findInventedNumbers,
  validateAdvisorOutput,
} from './advisor-output.validator';
import { ACTIVITY_NO_VALIDATED_FALLBACK } from '../contracts/activity-editor-ai';

describe('advisor-output.validator', () => {
  it('rejects invented numbers not in allowed tokens', () => {
    const invented = findInventedNumbers('晚点28分钟再延误15分钟', ['晚点', '分钟']);
    expect(invented).toEqual(expect.arrayContaining(['28', '15']));
  });

  it('allows numbers present in tokens', () => {
    const invented = findInventedNumbers('延长约3小时到第5天', ['3', '5', '第5天']);
    expect(invented).toEqual([]);
  });

  it('falls back when recommendation without validated proposal', () => {
    const result = validateAdvisorOutput({
      output: {
        status: 'INSIGHT',
        summary: '当天安排偏满。',
        suggestion: '建议改到第5天。',
      },
      hasValidatedRecommendation: false,
      allowedFactTokens: ['5', '第5天'],
    });
    expect(result.ok).toBe(false);
    expect(result.output.suggestion).toBe(ACTIVITY_NO_VALIDATED_FALLBACK.suggestion);
  });

  it('clamps over-long summary', () => {
    const long = '一二三四五六七八九十'.repeat(6);
    const result = validateAdvisorOutput({
      output: { status: 'INSIGHT', summary: long, suggestion: '先预览。' },
      hasValidatedRecommendation: true,
      allowedFactTokens: [],
    });
    expect([...result.output.summary].length).toBeLessThanOrEqual(45);
    expect(result.reasons).toContain('SUMMARY_TOO_LONG');
  });
});
