import { evaluateNonSemanticKvInfluence, flattenJsonPaths } from './json-kv-influence-evaluator';

describe('evaluateNonSemanticKvInfluence', () => {
  it('应提升与 modification.field 匹配的路径分数', () => {
    const r = evaluateNonSemanticKvInfluence({
      contextSnapshot: {
        userIntent: { preferences: { hotelStar: 4, neighborhood: 'downtown' } },
      },
      utilityWeights: { cost: 0.3, time: 0.7 },
      modification: { field: 'preferences.hotelStar', from: 4, to: 5 },
      outcomeCapture: { satisfaction: 0.8 },
    });
    expect(r.entries.length).toBeGreaterThan(0);
    const top = r.entries[0];
    expect(top.path).toContain('hotelStar');
    expect(top.influence01).toBeGreaterThan(0.3);
    expect(top.tags).toContain('edit_field_match');
  });

  it('无 snapshot 时返回空 entries', () => {
    const r = evaluateNonSemanticKvInfluence({});
    expect(r.entries).toEqual([]);
    expect(r.note).toBe('no_context_snapshot');
  });
});

describe('flattenJsonPaths', () => {
  it('应生成点分路径', () => {
    const paths = flattenJsonPaths({ a: { b: 1 } }, { maxDepth: 4, maxPaths: 50 });
    expect(paths).toContain('a');
    expect(paths).toContain('a.b');
  });
});
