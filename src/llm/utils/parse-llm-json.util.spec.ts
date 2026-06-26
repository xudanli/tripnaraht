import { parseJsonFromLlmText, stripLlmJsonMarkdown } from './parse-llm-json.util';

describe('parse-llm-json.util', () => {
  it('strips ```json fences', () => {
    const raw = 'Here you go:\n```json\n{"passed":true}\n```\n';
    expect(stripLlmJsonMarkdown(raw)).toBe('{"passed":true}');
    expect(parseJsonFromLlmText(raw)).toEqual({ passed: true });
  });

  it('parses bare JSON', () => {
    expect(parseJsonFromLlmText('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON arrays in fences', () => {
    const raw = '```json\n[{"id":"n1"}]\n```';
    expect(parseJsonFromLlmText(raw)).toEqual([{ id: 'n1' }]);
  });
});
