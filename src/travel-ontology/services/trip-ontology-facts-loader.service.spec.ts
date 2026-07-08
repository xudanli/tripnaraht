import { TripOntologyFactsLoaderService } from './trip-ontology-facts-loader.service';
import { WorldFactRepository } from '../../world-facts/world-fact.repository';
import { TRAVEL_WORLD_PREDICATES } from '../contracts/travel-world-fact.types';

describe('TripOntologyFactsLoaderService', () => {
  it('loads and maps trip-scoped facts from repository', async () => {
    const repo = {
      findLatestFactsForTrip: jest.fn().mockResolvedValue([
        {
          id: 'wf_1',
          factKey: 'trip:trip_1:vehicle',
          subjectType: 'RentalVehicle',
          subjectId: 'veh_1',
          predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
          valueJson: { payload: '4WD', scope: { tripId: 'trip_1' } },
          confidence: 1,
          severity: null,
          sourceType: 'user_booking',
          sourceRef: 'order',
          validFrom: null,
          validTo: null,
          observedAt: new Date('2026-07-05T10:00:00.000Z'),
          snapshotVersion: 'trip:trip_1',
          supersedesFactId: null,
          createdAt: new Date('2026-07-05T10:00:00.000Z'),
        },
      ]),
    } as unknown as WorldFactRepository;

    const loader = new TripOntologyFactsLoaderService(repo);
    const facts = await loader.loadForTrip('trip_1');

    expect(repo.findLatestFactsForTrip).toHaveBeenCalledWith('trip_1');
    expect(facts).toHaveLength(1);
    expect(facts[0]?.value).toBe('4WD');
  });

  it('returns empty array on repository failure', async () => {
    const repo = {
      findLatestFactsForTrip: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as WorldFactRepository;

    const loader = new TripOntologyFactsLoaderService(repo);
    await expect(loader.loadForTrip('trip_1')).resolves.toEqual([]);
  });
});
