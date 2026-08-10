import { generateAnswerText } from './generate-answer-text.runner';

describe('generate-answer-text.runner', () => {
  it('prefers last successful step answerText', () => {
    const text = generateAnswerText(
      {},
      [
        { stepId: '1', success: false, duration: 1 },
        {
          stepId: '2',
          success: true,
          duration: 1,
          result: { answerText: '你好' },
        },
      ],
    );
    expect(text).toBe('你好');
  });

  it('summarizes when all steps fail', () => {
    expect(
      generateAnswerText({}, [{ stepId: '1', success: false, duration: 1 }]),
    ).toContain('失败');
  });
});
