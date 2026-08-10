import { createLightweightTripLookupHost } from './lightweight-trip-lookup-host.factory';

describe('lightweight-trip-lookup-host.factory', () => {
  it('omits findTrip when tripsService missing', () => {
    const host = createLightweightTripLookupHost({
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    });
    expect(host.findTripForLightweight).toBeUndefined();
  });

  it('wires findTrip to tripsService.findOne', async () => {
    const findOne = jest.fn(async () => ({ destination: 'Iceland' }));
    const host = createLightweightTripLookupHost({
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      tripsService: { findOne },
    });
    await host.findTripForLightweight!('t1', 'u1');
    expect(findOne).toHaveBeenCalledWith('t1', 'u1');
  });
});
