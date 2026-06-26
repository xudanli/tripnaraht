import {
  allocationsFromPercentages,
  resolveStructureAllocations,
  sumAllocations,
} from './budget-structure.util';

describe('budget-structure.util', () => {
  it('resolves absolute allocations when sum equals intent total', () => {
    const { allocations } = resolveStructureAllocations(
      {
        mode: 'absolute',
        allocations: {
          transportation: 3000,
          accommodation: 500,
          experience: 5000,
          food: 1500,
          other: 0,
        },
      },
      { total: 10000, currency: 'CNY', source: 'user', setAt: '2026-01-01' },
    );
    expect(sumAllocations(allocations)).toBe(10000);
  });

  it('rejects absolute allocations when sum mismatches', () => {
    expect(() =>
      resolveStructureAllocations(
        {
          mode: 'absolute',
          allocations: {
            transportation: 3000,
            accommodation: 500,
            experience: 5000,
            food: 1500,
            other: 1000,
          },
        },
        { total: 10000, currency: 'CNY', source: 'user', setAt: '2026-01-01' },
      ),
    ).toThrow(/必须等于总预算/);
  });

  it('normalizes percent mode to allocations', () => {
    const allocations = allocationsFromPercentages(
      {
        transportation: 30,
        accommodation: 5,
        experience: 50,
        food: 15,
        other: 0,
      },
      10000,
    );
    expect(sumAllocations(allocations)).toBe(10000);
  });
});
