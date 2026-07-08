import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';

describe('minimal-evaluate-world.util (Phase 3)', () => {
  it('P3-WORLD-001: uses trip country code in world context', () => {
    const world = buildMinimalEvaluateWorld({
      countryCode: 'NZ',
      roadId: 'f-road-1',
      roadStatus: 'OPEN',
    });
    expect(world.physical?.countryCode).toBe('NZ');
    expect((world.routeDirection as { id?: string })?.id).toBe('synthetic-NZ');
  });
});
