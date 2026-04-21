import { buildContextKey } from './context-utils';

describe('context-utils', () => {
  it('buildContextKey normalizes format', () => {
    expect(buildContextKey({ countryCode: 'is', month: 4, vehicleClass: 'SUV' })).toBe('IS:4:SUV');
  });
});

