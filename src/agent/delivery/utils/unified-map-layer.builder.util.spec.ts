import { UNIFIED_MAP_LAYER_SCHEMA } from '../types/unified-map-layer.type';
import { buildUnifiedMapLayer } from './unified-map-layer.builder.util';

describe('unified-map-layer.builder.util', () => {
  it('聚合 POI、酒店 depot 与取还车点', () => {
    const layer = buildUnifiedMapLayer({
      tripId: 'trip-1',
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-06-01',
            items: [
              {
                id: 'poi-1',
                type: 'ACTIVITY',
                location_ref: {
                  name: '博物馆',
                  coordinates: { lat: 64.14, lng: -21.94 },
                },
                evidence_refs: [],
                verified: true,
                verification_status: 'VERIFIED',
              },
            ],
          },
        ],
      },
      bookingPayload: {
        accommodation_night_groups: [
          {
            night_index: 1,
            anchor_label_zh: '第 1 晚 · 雷克雅未克',
            cards: [
              {
                id: 'h1',
                name: '精品民宿',
                listing_lat: 64.15,
                listing_lng: -21.95,
              },
            ],
          },
        ],
        car_rentals: [
          {
            id: 'c1',
            vehicle_name: 'SUV',
            pickup_location: { lat: 64.13, lng: -21.9 },
            dropoff_location: { lat: 64.13, lng: -21.9 },
          },
        ],
      },
    });

    expect(layer?.schema).toBe(UNIFIED_MAP_LAYER_SCHEMA);
    expect(layer?.points.some((p) => p.kind === 'poi')).toBe(true);
    expect(layer?.points.some((p) => p.kind === 'hotel_depot')).toBe(true);
    expect(layer?.points.some((p) => p.kind === 'car_pickup')).toBe(true);
    expect(layer?.overview_directions_url).toContain('google.com/maps');
  });
});
