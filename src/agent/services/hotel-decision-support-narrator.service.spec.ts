import { extractJsonObjectForParse } from './hotel-decision-support-narrator.service';

describe('extractJsonObjectForParse', () => {
  it('strips preamble before fenced JSON', () => {
    const raw = `下面是结果。
\`\`\`json
{"lines":[{"listing_id":"x","steward_zh":"你好"}]}
\`\`\``;
    const json = extractJsonObjectForParse(raw);
    expect(JSON.parse(json)).toEqual({
      lines: [{ listing_id: 'x', steward_zh: '你好' }],
    });
  });

  it('handles fenced multiline JSON without preamble', () => {
    const raw = `\`\`\`json
{
  "lines": [{"listing_id":"a","steward_zh":"ok"}]
}
\`\`\``;
    const json = extractJsonObjectForParse(raw);
    expect(JSON.parse(json).lines).toHaveLength(1);
  });

  it('passes through bare object string', () => {
    const raw = `{"lines":[]}`;
    expect(JSON.parse(extractJsonObjectForParse(raw))).toEqual({ lines: [] });
  });
});
