import {
  buildErQdrantCatalog,
  stableErPointId,
} from './entity-resolution-qdrant-catalog';
import {
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
} from './query-rewriting-knowledge-graph';

describe('entity-resolution-qdrant-catalog', () => {
  it('应覆盖 KG 全部目的地与 POI', () => {
    const catalog = buildErQdrantCatalog();
    const names = new Set(catalog.map((e) => e.standard_name));

    for (const label of KNOWLEDGE_GRAPH_DESTINATIONS) {
      expect(names.has(label)).toBe(true);
    }
    for (const label of KNOWLEDGE_GRAPH_POIS) {
      expect(names.has(label)).toBe(true);
    }
  });

  it('Golden Set 关键 entity_id 应对齐', () => {
    const catalog = buildErQdrantCatalog();
    const byName = new Map(catalog.map((e) => [e.standard_name, e]));

    expect(byName.get('雷克雅未克')?.entity_id).toBe('IS-REK');
    expect(byName.get('西峡湾')?.entity_id).toBe('IS-ISF');
    expect(byName.get('朗伊尔城')?.entity_id).toBe('SJ-LYR');
    expect(byName.get('林芝')?.entity_id).toBe('CN-XZLZ');
    expect(byName.get('纽约')?.entity_id).toBe('US-NYC');
    expect(byName.get('New York')?.entity_id).toBe('US-NYC');
  });

  it('stableErPointId 应确定性且非零', () => {
    const a = stableErPointId('IS-REK', '雷克雅未克');
    const b = stableErPointId('IS-REK', '雷克雅未克');
    const c = stableErPointId('IS', '冰岛');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBeGreaterThan(0);
  });
});
