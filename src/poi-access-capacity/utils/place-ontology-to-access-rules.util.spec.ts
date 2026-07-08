import { placeOntologyToAccessRules } from './place-ontology-to-access-rules.util';

describe('placeOntologyToAccessRules', () => {
  const thingvellirOntology = {
    updatedAt: '2026-01-29T16:15:12.945Z',
    rules_v1: [
      {
        id: 'access_001',
        type: 'access',
        source: 'road.is',
        description: '冬季部分步道可能因冰雪关闭',
        restriction: '部分步道关闭，需查询官方路况',
      },
      {
        id: 'weather_001',
        type: 'weather',
        source: 'weatherapi',
        description: '强风、暴雪建议推迟户外活动',
      },
      {
        id: 'equipment_002',
        type: 'equipment',
        description: '冬季建议携带冰爪',
      },
    ],
  };

  it('maps safety/trail/access rules and skips equipment-only', () => {
    const rules = placeOntologyToAccessRules('is.thingvellir', 381037, thingvellirOntology);
    expect(rules.length).toBe(2);
    expect(rules.some((r) => r.ruleType === 'TRAIL_RESTRICTION')).toBe(true);
    expect(rules.every((r) => r.id.startsWith('ontology:381037:'))).toBe(true);
    expect(rules.some((r) => r.confidence === 'OFFICIAL')).toBe(true);
  });

  it('returns empty for null ontology', () => {
    expect(placeOntologyToAccessRules('is.x', 1, null)).toEqual([]);
  });
});
