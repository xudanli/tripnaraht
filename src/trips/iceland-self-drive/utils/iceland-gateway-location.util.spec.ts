import {
  resolveIcelandGatewayFromLocationCode,
  resolveIcelandGatewayPlaceRef,
} from './iceland-gateway-location.util';

describe('iceland-gateway-location', () => {
  it('maps keflavik to KEF placeId 381221', () => {
    expect(resolveIcelandGatewayFromLocationCode('keflavik')).toEqual({
      placeId: 381221,
      label: 'Keflavík International Airport (KEF)',
    });
  });

  it('defaults unknown / empty to keflavik', () => {
    expect(resolveIcelandGatewayFromLocationCode(undefined).placeId).toBe(381221);
    expect(resolveIcelandGatewayFromLocationCode('nowhere').placeId).toBe(381221);
  });

  it('maps reykjavik and akureyri hubs', () => {
    expect(resolveIcelandGatewayFromLocationCode('reykjavik').placeId).toBe(381042);
    expect(resolveIcelandGatewayFromLocationCode('akureyri').placeId).toBe(381097);
  });

  it('prefers explicit placeId on PlaceRef', () => {
    expect(
      resolveIcelandGatewayPlaceRef({ placeId: 999, label: 'Custom' }).placeId,
    ).toBe(999);
  });
});
