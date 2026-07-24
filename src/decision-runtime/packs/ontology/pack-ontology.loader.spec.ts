import {
  indexOntologyNodes,
  loadCountryRoadOntology,
  loadOntologyBundleFile,
  roadIsKeysForNode,
  regionAndCorridorNodes,
} from './pack-ontology.loader';

describe('pack-ontology.loader', () => {
  it('ONTO-001: loads IS road types from destination pack', () => {
    const bundle = loadCountryRoadOntology('IS');
    expect(bundle).not.toBeNull();
    expect(bundle!.schemaId).toBe('tripnara.destination.ontology.road_types@v1');
    expect(bundle!.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('ONTO-002: indexes nodes by ontologyNodeId', () => {
    const bundle = loadCountryRoadOntology('IS')!;
    const idx = indexOntologyNodes(bundle);
    expect(idx.get('ontology:road:IS:F208')?.roadIds).toEqual(['F208']);
    expect(idx.get('ontology:region:IS:SNAEFELLSNES')?.roadIsKeys).toEqual(['54', '56', '574']);
  });

  it('ONTO-003: roadIsKeysForNode resolves pack node', () => {
    const bundle = loadCountryRoadOntology('IS');
    expect(roadIsKeysForNode(bundle, 'ontology:corridor:IS:SOUTH_COAST')).toEqual(['1', '218', '249']);
    expect(roadIsKeysForNode(bundle, 'unknown')).toEqual([]);
  });

  it('ONTO-004: regionAndCorridorNodes excludes Road kind', () => {
    const bundle = loadCountryRoadOntology('IS')!;
    const regions = regionAndCorridorNodes(bundle);
    expect(regions.every((n) => n.kind === 'Region' || n.kind === 'Corridor')).toBe(true);
    expect(regions.some((n) => n.ontologyNodeId === 'ontology:road:IS:F208')).toBe(false);
  });

  it('ONTO-005: spatialSeed defines F208 segment for DB seeding', () => {
    const bundle = loadOntologyBundleFile('is/ontology/is-road-types.json');
    const f208 = bundle.spatialSeed?.segments.find((s) => s.id === 'seg-is-f208');
    expect(f208?.rules?.road_is_road_code).toBe('F208');
    expect(bundle.spatialSeed?.pois.length).toBeGreaterThanOrEqual(4);
  });
});
