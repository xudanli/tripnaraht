import { parsePlanDeltaIrFromLlmJson, validatePlanDeltaIrList } from './plan-delta-ir-parse.util';

describe('parsePlanDeltaIrFromLlmJson', () => {
  it('parses { deltas: [...] } envelope', () => {
    const raw = JSON.stringify({
      deltas: [
        {
          op: 'REPLACE',
          target: { type: 'POI', dayIndex: 1, id: 'poi_tokyo_tower' },
          payload: { query: '涩谷' },
        },
      ],
    });
    const out = parsePlanDeltaIrFromLlmJson(raw);
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe('REPLACE');
    expect(out[0].target.type).toBe('POI');
    expect(out[0].target.dayIndex).toBe(1);
    expect(out[0].payload.query).toBe('涩谷');
  });

  it('returns empty for invalid JSON', () => {
    expect(parsePlanDeltaIrFromLlmJson('not json')).toEqual([]);
  });

  it('filters invalid delta rows', () => {
    const raw = JSON.stringify({
      deltas: [{ op: 'INVALID', target: { type: 'POI' }, payload: {} }, { op: 'ADD', target: { type: 'HOTEL' }, payload: {} }],
    });
    const out = validatePlanDeltaIrList(parsePlanDeltaIrFromLlmJson(raw));
    expect(out).toHaveLength(1);
    expect(out[0].target.type).toBe('HOTEL');
  });
});
