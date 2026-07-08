import { projectExplorationRentalContractFacts } from './exploration-rental-contract.adapter';

describe('projectExplorationRentalContractFacts', () => {
  const baseInput = {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' as const }],
    source: 'USER_CREATED' as const,
  };

  it('writes 2WD F_ROAD prohibition and KEF counter defaults', () => {
    const drafts = projectExplorationRentalContractFacts({
      ...baseInput,
      mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
    });

    expect(drafts.some((d) => d.predicate === 'mobility.prohibitedRoadClass')).toBe(true);
    expect(drafts.some((d) => d.predicate === 'rental.counterHours')).toBe(true);
    expect(drafts.some((d) => d.predicate === 'transport.scheduledArrival')).toBe(true);
  });

  it('late pickup after counter close enables scenario 005 evaluation path', () => {
    const drafts = projectExplorationRentalContractFacts({
      ...baseInput,
      mobilityContext: { vehicleType: '4WD_SUV' },
      rentalContext: { pickupTimeLocal: '23:30', afterHoursPickupConfirmed: false },
    });

    const arrival = drafts.find((d) => d.predicate === 'transport.scheduledArrival');
    expect(String(arrival?.payload)).toContain('23:30');
    expect(
      drafts.find((d) => d.predicate === 'rental.afterHoursPickupConfirmed')?.payload,
    ).toBe(false);
  });

  it('skips non-Iceland destinations', () => {
    expect(
      projectExplorationRentalContractFacts({
        ...baseInput,
        destinationCodes: ['NZ'],
      }),
    ).toEqual([]);
  });
});
