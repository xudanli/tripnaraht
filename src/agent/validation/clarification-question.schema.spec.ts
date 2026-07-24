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

  it('coerces REPAIR halt NEED_CONFIRMATION + {id,label} into single_choice', () => {
    const [q] = parseClarificationQuestionsForClient([
      {
        id: 'repair_halt_confirmation',
        question: '系统已自动修复尝试 3 次，仍未收敛。',
        type: 'NEED_CONFIRMATION',
        required: true,
        options: [
          { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
          { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
          { id: 'continue_auto_repair', label: '继续自动修复' },
        ],
        hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
      },
    ]);
    expect(q?.type).toBe('single_choice');
    expect(q?.metadata?.presentation).toBe('structured_intake_v1');
    expect(q?.options).toEqual([
      { value: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
      { value: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
      { value: 'continue_auto_repair', label: '继续自动修复' },
    ]);
  });
});
