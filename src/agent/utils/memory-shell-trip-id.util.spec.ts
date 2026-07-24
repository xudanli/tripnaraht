import { isMemoryShellTripId } from './memory-shell-trip-id.util';

describe('isMemoryShellTripId', () => {
  it('accepts trip_<hex> shell ids', () => {
    expect(isMemoryShellTripId('trip_deadbeefcafebabe')).toBe(true);
    expect(isMemoryShellTripId('trip_abcd1234')).toBe(true);
  });

  it('rejects UUID and empty', () => {
    expect(isMemoryShellTripId('')).toBe(false);
    expect(isMemoryShellTripId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    expect(isMemoryShellTripId('trip_')).toBe(false);
  });
});
