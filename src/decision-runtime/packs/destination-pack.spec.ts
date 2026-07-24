import { DestinationPackLoaderService } from './loader/destination-pack-loader.service';
import { DestinationPackOverlayResolverService } from './loader/destination-pack-overlay-resolver.service';

describe('DestinationPackLoaderService', () => {
  it('PACK-001: loads global + IS manifests from data/', () => {
    const loader = new DestinationPackLoaderService();
    const manifests = loader.loadAll();
    const ids = manifests.map((m) => m.packId);
    expect(ids).toContain('destination.global');
    expect(ids).toContain('destination.is');
    expect(ids).toContain('destination.nz');
  });
});

describe('DestinationPackOverlayResolverService', () => {
  it('PACK-002: IS trip resolves global + country layers', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const resolver = new DestinationPackOverlayResolverService(loader);
    const active = resolver.resolve({ country: 'IS' });
    expect(active.layers.map((l) => l.layer)).toEqual(['GLOBAL', 'COUNTRY']);
    expect(active.supportedSemanticKeys).toContain('ROAD_SEGMENT_UNAVAILABLE');
    expect(active.supportedSemanticKeys).toContain('EXCESSIVE_DAILY_LOAD');
  });

  it('PACK-006: NZ trip resolves global + country (Phase 6 probe)', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const resolver = new DestinationPackOverlayResolverService(loader);
    const active = resolver.resolve({ country: 'NZ' });
    expect(active.layers.map((l) => l.packId)).toEqual([
      'destination.global',
      'destination.nz',
    ]);
    expect(active.supportedSemanticKeys).toContain('ROAD_SEGMENT_UNAVAILABLE');
    const road = active.evidenceProviders.find((e) => e.domain === 'road');
    expect(road?.primary).toBe('ROAD_NZ');
  });

  it('PACK-003: JP trip resolves global only (no country pack yet)', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const resolver = new DestinationPackOverlayResolverService(loader);
    const active = resolver.resolve({ country: 'JP' });
    expect(active.layers.map((l) => l.layer)).toEqual(['GLOBAL']);
    expect(active.supportedSemanticKeys).not.toContain('ROAD_SEGMENT_UNAVAILABLE');
  });

  it('PACK-004: IS pack provides ROAD_IS evidence provider', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const resolver = new DestinationPackOverlayResolverService(loader);
    const active = resolver.resolve({ country: 'IS' });
    const road = active.evidenceProviders.find((e) => e.domain === 'road');
    expect(road?.primary).toBe('ROAD_IS');
  });

  it('PACK-005: global pack exposes driving baseline modifier', () => {
    const loader = new DestinationPackLoaderService();
    const global = loader.getManifest('destination.global');
    expect(global?.environmentModifiers?.[0]?.path).toContain('global-driving-baseline');
  });

  it('PACK-007: IS pack loads road ontology from is-road-types.json', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const ontology = loader.getCountryRoadOntology('IS');
    expect(ontology?.schemaId).toBe('tripnara.destination.ontology.road_types@v1');
    expect(ontology?.nodes.some((n) => n.ontologyNodeId === 'ontology:road:IS:F208')).toBe(true);
    const node = loader.findOntologyNode('ontology:corridor:IS:SOUTH_COAST');
    expect(node?.roadIsKeys).toEqual(['1', '218', '249']);
  });
});
