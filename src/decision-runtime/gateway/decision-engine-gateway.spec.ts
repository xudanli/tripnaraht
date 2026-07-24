import { DecisionEngineRegistryService } from './registry/decision-engine-registry.service';
import { DecisionRouteResolverService } from './routing/decision-route-resolver.service';

describe('DecisionEngineRegistryService', () => {
  const prevRoad = process.env.RFC001_ICELAND_ROAD_CLOSE;
  const prevWeather = process.env.RFC001_ICELAND_WEATHER_ACTIVITY;

  afterEach(() => {
    if (prevRoad === undefined) delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    else process.env.RFC001_ICELAND_ROAD_CLOSE = prevRoad;
    if (prevWeather === undefined) delete process.env.RFC001_ICELAND_WEATHER_ACTIVITY;
    else process.env.RFC001_ICELAND_WEATHER_ACTIVITY = prevWeather;
  });

  it('GATE-001: registers PRIMARY canonical + FALLBACK legacy', () => {
    const registry = new DecisionEngineRegistryService();
    const ids = registry.listRegistrations().map((r) => r.engineId);
    expect(ids).toContain('CANONICAL_DECISION_RUNTIME');
    expect(ids).toContain('LEGACY_V15_ADAPTER');
    expect(registry.getEngine('CANONICAL_DECISION_RUNTIME')?.mode).toBe('PRIMARY');
    expect(registry.getEngine('LEGACY_V15_ADAPTER')?.mode).toBe('FALLBACK');
  });

  it('GATE-002: normalizes rfc001 semantic key to ROAD_SEGMENT_UNAVAILABLE', () => {
    const registry = new DecisionEngineRegistryService();
    expect(
      registry.normalizeSemanticKey('rfc001:FEASIBILITY_FAILURE:evt_1'),
    ).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(
      registry.normalizeSemanticKey('ROAD_SEGMENT_UNAVAILABLE:evt_1'),
    ).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(
      registry.normalizeSemanticKey('WEATHER_ACTIVITY_PROHIBITED:evt_w1'),
    ).toBe('WEATHER_ACTIVITY_PROHIBITED');
  });
});

describe('DecisionRouteResolverService', () => {
  const prevRoad = process.env.RFC001_ICELAND_ROAD_CLOSE;
  const prevWeather = process.env.RFC001_ICELAND_WEATHER_ACTIVITY;
  let registry: DecisionEngineRegistryService;
  let resolver: DecisionRouteResolverService;

  beforeEach(() => {
    registry = new DecisionEngineRegistryService();
    resolver = new DecisionRouteResolverService(registry);
  });

  afterEach(() => {
    if (prevRoad === undefined) delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    else process.env.RFC001_ICELAND_ROAD_CLOSE = prevRoad;
    if (prevWeather === undefined) delete process.env.RFC001_ICELAND_WEATHER_ACTIVITY;
    else process.env.RFC001_ICELAND_WEATHER_ACTIVITY = prevWeather;
  });

  it('GATE-003: canonical problem → PRIMARY', () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '1';
    const route = resolver.resolve({
      tripId: 'trip_1',
      problemId: 'problem_f208',
      hasCanonicalProblem: true,
      destinationCountry: 'IS',
    });
    expect(route.engineId).toBe('CANONICAL_DECISION_RUNTIME');
    expect(route.resolution).toBe('PRIMARY');
  });

  it('GATE-004: non-canonical problem → LEGACY_FALLBACK', () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '1';
    const route = resolver.resolve({
      tripId: 'trip_jp',
      problemId: 'gate_problem_1',
      hasCanonicalProblem: false,
      destinationCountry: 'JP',
    });
    expect(route.engineId).toBe('LEGACY_V15_ADAPTER');
    expect(route.resolution).toBe('LEGACY_FALLBACK');
  });

  it('GATE-005: existing canonical record never silent legacy when canonical disabled', () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '0';
    process.env.RFC001_ICELAND_WEATHER_ACTIVITY = '0';
    const route = resolver.resolve({
      tripId: 'trip_1',
      hasCanonicalProblem: true,
      hasExistingDecisionRecord: true,
    });
    expect(route.resolution).toBe('ENGINE_UNAVAILABLE');
  });

  it('GATE-006: weather-only flag enables PRIMARY for weather semantic key', () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '0';
    process.env.RFC001_ICELAND_WEATHER_ACTIVITY = '1';
    const route = resolver.resolve({
      tripId: 'trip_1',
      problemId: 'problem_wx',
      semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_w1',
      hasCanonicalProblem: true,
      destinationCountry: 'IS',
    });
    expect(route.engineId).toBe('CANONICAL_DECISION_RUNTIME');
    expect(route.resolution).toBe('PRIMARY');
  });
});
