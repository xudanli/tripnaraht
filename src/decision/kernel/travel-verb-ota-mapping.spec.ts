import {
  isSagaCompensationLifecycle,
  mapTravelVerbToOtaNdc,
} from './travel-verb-ota-mapping';

describe('travel-verb-ota-mapping', () => {
  it('maps BOOK committed to OTA/NDC confirm states', () => {
    const m = mapTravelVerbToOtaNdc('BOOK', 'committed');
    expect(m?.otaAction).toBe('OTA_HotelResRS');
    expect(m?.ndcOrderState).toBe('CONFIRMED');
    expect(m?.sagaCompensation).toBe(false);
  });

  it('maps rolledBack to saga compensation', () => {
    const m = mapTravelVerbToOtaNdc('PAY', 'rolledBack');
    expect(m?.sagaCompensation).toBe(true);
    expect(isSagaCompensationLifecycle('rolledBack')).toBe(true);
  });
});
