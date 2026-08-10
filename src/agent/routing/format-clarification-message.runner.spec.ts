import { formatClarificationMessage } from './format-clarification-message.runner';

describe('format-clarification-message.runner', () => {
  it('returns empty string when no questions', () => {
    expect(formatClarificationMessage()).toBe('');
    expect(formatClarificationMessage([])).toBe('');
  });

  it('numbers questions and includes options', () => {
    const text = formatClarificationMessage(
      [
        {
          id: 'q1',
          question: '目的地？',
          hint: '可写国家',
          options: ['冰岛', { label: '挪威', value: 'NO' }],
        } as any,
      ],
      'zh',
    );
    expect(text).toContain('1. 目的地？');
    expect(text).toContain('可写国家');
    expect(text).toContain('冰岛');
    expect(text).toContain('挪威');
  });
});
