import { KnowledgeGraphService } from './knowledge-graph.service';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { KnowledgeRelationRegistryService } from '../relations/knowledge-relation-registry.service';

describe('KnowledgeGraphService', () => {
  let graph: KnowledgeGraphService;

  beforeAll(async () => {
    const identity = new EntityIdentityRegistryService();
    identity.onModuleInit();
    const relations = new KnowledgeRelationRegistryService(
      { isDbConnected: () => false } as never,
      identity,
    );
    relations.reprojectStatic();
    graph = new KnowledgeGraphService(relations, identity);
  });

  it('subgraph returns nodes and edges from projections', () => {
    const sg = graph.subgraph({ country: 'IS', limit: 40 });
    expect(sg.nodes.length).toBeGreaterThan(0);
    expect(sg.edges.length).toBeGreaterThan(0);
    expect(sg.stats?.nodeCount).toBe(sg.nodes.length);
    expect(typeof sg.stats?.edgeDeltaWeek).toBe('number');
    expect(typeof sg.stats?.subgraphCount).toBe('number');
    expect(sg.note).toContain('Not Neo4j');
  });

  it('subgraph focusEntityId expands neighborhood', () => {
    const all = graph.subgraph({ limit: 20 });
    const focus = all.nodes[0]?.id;
    expect(focus).toBeTruthy();
    const sg = graph.subgraph({ focusEntityId: focus, limit: 30 });
    expect(sg.nodes.some((n) => n.id === focus)).toBe(true);
    expect(sg.edges.length).toBeGreaterThan(0);
  });

  it('pathQuery finds multi-hop when connected', () => {
    const sg = graph.subgraph({ limit: 80 });
    const edge = sg.edges[0];
    expect(edge).toBeTruthy();
    const path = graph.pathQuery({
      startEntityId: edge!.source,
      endEntityId: edge!.target,
      maxDepth: 3,
      pathType: 'shortest',
    });
    expect(path.candidates.length).toBeGreaterThanOrEqual(1);
    expect(path.candidates[0]?.isPrimary).toBe(true);
    expect(path.candidates[0]?.jumps).toBeGreaterThanOrEqual(1);
  });

  it('impactAnalysis returns summary buckets', () => {
    const sg = graph.subgraph({ limit: 40 });
    const src = sg.nodes[0]?.id;
    expect(src).toBeTruthy();
    const impact = graph.impactAnalysis({
      sourceEntityIds: [src!],
      impactType: 'all',
      maxDepth: 2,
    });
    expect(impact.summary.coveredEntities).toBeGreaterThanOrEqual(0);
    expect(impact.graph.nodes.length).toBeGreaterThan(0);
    expect(impact.entities.length).toBeGreaterThan(0);
  });
});
