import { FactsToReadinessCompiler } from './facts-to-readiness.compiler';
import type { CountryFacts } from './facts-to-readiness.compiler';
import type { TripContext } from '../types/trip-context.types';

describe('FactsToReadinessCompiler hiking', () => {
  const compiler = new FactsToReadinessCompiler();

  const facts: CountryFacts = {
    isoCode: 'IS',
    nameCN: '冰岛',
  };

  const context: TripContext = {
    traveler: { nationality: 'CN' },
    trip: {},
    itinerary: { countries: ['IS'], activities: ['hiking'] },
  };

  it('compileHikingTerrainAndGear emits must items for hiking', () => {
    const items = compiler.compileHikingTerrainAndGear(facts, context);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.level === 'must')).toBe(true);
  });

  it('skips when no hiking activity', () => {
    const items = compiler.compileHikingTerrainAndGear(facts, {
      ...context,
      itinerary: { countries: ['IS'], activities: ['sightseeing'] },
    });
    expect(items).toHaveLength(0);
  });
});
