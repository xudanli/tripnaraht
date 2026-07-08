import { TripOntologyFactsIngestService } from './trip-ontology-facts-ingest.service';
import { WorldFactService } from '../../world-facts/world-fact.service';

describe('TripOntologyFactsIngestService', () => {
  it('ingests vehicle + F208 facts for remote highlands strategy', async () => {
    const appendTripScoped = jest
      .fn()
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({ id: 'f2' });

    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    const result = await service.ingestExplorationRouteSelection({
      tripId: 'trip_1',
      vehicleType: '2WD',
      strategyId: 'remote-highlands-south',
      routeId: 'route_a',
    });

    expect(result.factIds).toHaveLength(2);
    expect(appendTripScoped).toHaveBeenCalledTimes(2);
  });

  it('ingests entry eligibility for Iceland + CN nationality', async () => {
    const appendTripScoped = jest
      .fn()
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({ id: 'f2' })
      .mockResolvedValueOnce({ id: 'f3' });

    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    const result = await service.ingestEntryEligibilityIfNeeded({
      tripId: 'trip_1',
      destinationCodes: ['IS'],
      nationality: 'CN',
    });

    expect(result.factIds).toHaveLength(3);
    expect(appendTripScoped).toHaveBeenCalledTimes(3);
  });

  it('skips entry eligibility for Schengen nationals', async () => {
    const appendTripScoped = jest.fn();
    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    const result = await service.ingestEntryEligibilityIfNeeded({
      tripId: 'trip_1',
      destinationCodes: ['IS'],
      nationality: 'DE',
    });

    expect(result.factIds).toHaveLength(0);
    expect(appendTripScoped).not.toHaveBeenCalled();
  });

  it('ingests insurance policy facts for Iceland STANDARD tier', async () => {
    const appendTripScoped = jest
      .fn()
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({ id: 'f2' });

    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    const result = await service.ingestExplorationInsuranceDeclaration({
      tripId: 'trip_1',
      destinationCodes: ['IS'],
      coverageTier: 'STANDARD',
    });

    expect(result.factIds).toHaveLength(2);
    expect(appendTripScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: 'insurance.coversDamageCause',
        subjectType: 'InsurancePolicy',
      }),
    );
  });

  it('ingests rental contract facts for Iceland exploration input', async () => {
    const appendTripScoped = jest.fn().mockResolvedValue({ id: 'f_rental' });

    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    const result = await service.ingestExplorationRentalContract({
      tripId: 'trip_1',
      explorationInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
        travelers: [{ type: 'ADULT' }],
        mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
        source: 'USER_CREATED',
      },
    });

    expect(result.factIds.length).toBeGreaterThan(0);
    expect(appendTripScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: 'mobility.prohibitedRoadClass',
        subjectType: 'RentalContract',
      }),
    );
  });

  it('ingests river crossing segment for depth-south-coast strategy', async () => {
    const appendTripScoped = jest
      .fn()
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({ id: 'f2' });

    const service = new TripOntologyFactsIngestService({
      appendTripScoped,
    } as unknown as WorldFactService);

    await service.ingestExplorationRouteSelection({
      tripId: 'trip_1',
      vehicleType: '4WD',
      strategyId: 'depth-south-coast',
      routeId: 'route_a',
    });

    expect(appendTripScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: 'route.hasRiverCrossing',
        subjectId: 'seg_river_crossing',
      }),
    );
  });
});
