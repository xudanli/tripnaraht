import {
  ClarificationQuestionSchema,
  parseClarificationQuestionsForClient,
} from '../validation/clarification-question.schema';

describe('clarification-question.schema', () => {
  it('parses valid clarification question with conditionalInputs', () => {
    const [q] = parseClarificationQuestionsForClient([
      {
        id: 'pace',
        question: '请选择节奏',
        type: 'single_choice',
        required: true,
        options: [{ value: 'relaxed', label: '轻松' }],
        conditionalInputs: [
          {
            triggerValue: 'relaxed',
            inputType: 'number',
            label: '每日步行上限（km）',
            paramKey: 'max_walk_km',
          },
        ],
      },
    ]);
    expect(q?.id).toBe('pace');
    expect(q?.conditionalInputs).toHaveLength(1);
  });

  it('strips unknown keys from conditionalInputs', () => {
    const [q] = parseClarificationQuestionsForClient([
      {
        id: 'x',
        question: 'Q?',
        type: 'text',
        required: false,
        conditionalInputs: [
          {
            triggerValue: 'a',
            inputType: 'text',
            evil: 'drop-me',
          },
        ],
      },
    ]);
    expect(q?.conditionalInputs?.[0]).not.toHaveProperty('evil');
  });

  it('drops invalid questions and keeps valid ones', () => {
    const out = parseClarificationQuestionsForClient([
      { id: '', question: '', type: 'text', required: true },
      { id: 'ok', question: '目的地？', type: 'text', required: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('ok');
  });

  it('normalizes multiple_choice to multi_choice', () => {
    const parsed = ClarificationQuestionSchema.safeParse({
      id: 'm',
      question: '选',
      type: 'multi_choice',
      required: true,
      conditionalInputs: [{ triggerValue: 'x', inputType: 'multiple_choice' }],
    });
    expect(parsed.success).toBe(true);
    const [q] = parseClarificationQuestionsForClient([
      {
        id: 'm',
        question: '选',
        type: 'multi_choice',
        required: true,
        conditionalInputs: [{ triggerValue: 'x', inputType: 'multiple_choice' }],
      },
    ]);
    expect(q?.conditionalInputs?.[0]?.inputType).toBe('multi_choice');
  });
});
