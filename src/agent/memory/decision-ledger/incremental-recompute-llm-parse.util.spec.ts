import { parseIncrementalKernelDecisionsFromLlmText } from './incremental-recompute-llm-parse.util';

describe('parseIncrementalKernelDecisionsFromLlmText', () => {
  it('解析 {"decisions":[...]} 信封（json_object 友好）', () => {
    const r = parseIncrementalKernelDecisionsFromLlmText(
      '{"decisions":[{"nodeId":"a","output":{"x":1},"summary":"s"}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decisions).toEqual([{ nodeId: 'a', output: { x: 1 }, summary: 's' }]);
  });

  it('解析纯 JSON 数组', () => {
    const r = parseIncrementalKernelDecisionsFromLlmText(
      '[{"nodeId":"a","output":{"x":1},"summary":"s"}]',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decisions).toEqual([{ nodeId: 'a', output: { x: 1 }, summary: 's' }]);
  });

  it('解析 ```json 代码块', () => {
    const raw = 'Here you go:\n```json\n[{"nodeId":"n1","output":{}}]\n```\n';
    const r = parseIncrementalKernelDecisionsFromLlmText(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decisions).toEqual([{ nodeId: 'n1', output: {} }]);
  });

  it('数组前有说明文字时取首个 [ 至末个 ]', () => {
    const raw = 'Sure. [{"nodeId":"x","output":{"a":1}}] trailing';
    const r = parseIncrementalKernelDecisionsFromLlmText(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decisions[0].nodeId).toBe('x');
  });

  it('缺 output 时失败', () => {
    const r = parseIncrementalKernelDecisionsFromLlmText('[{"nodeId":"a"}]');
    expect(r.ok).toBe(false);
  });

  it('重复 nodeId 时后者覆盖前者', () => {
    const r = parseIncrementalKernelDecisionsFromLlmText(
      '[{"nodeId":"a","output":{"v":1}},{"nodeId":"a","output":{"v":2}}]',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decisions).toEqual([{ nodeId: 'a', output: { v: 2 } }]);
  });
});
