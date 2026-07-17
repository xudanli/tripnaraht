/**
 * travel-info API response delta (additive, backward compatible).
 *
 * Existing fields unchanged:
 *   segments[].duration | distance | travelMode | fromItemId | toItemId | …
 *
 * Additive:
 *   segments[].eta?: TravelEtaEnvelopeV1
 *
 * Compatibility rule:
 *   when eta is present, duration === eta.planningDurationMin
 *   (scheduling clients that only read duration stay correct once L2 lands)
 *
 * Example live segment (target after L1+L2 wire-up):
 *
 * {
 *   "fromItemId": "…",
 *   "toItemId": "…",
 *   "fromPlace": "Selfoss",
 *   "toPlace": "Landmannalaugar",
 *   "duration": 175,
 *   "distance": 182000,
 *   "travelMode": "DRIVING",
 *   "eta": {
 *     "schema": "tripnara/travel-eta/v1",
 *     "baseDurationMin": 145,
 *     "planningDurationMin": 175,
 *     "uncertaintyMin": 30,
 *     "confidence": 0.68,
 *     "adjustmentReasons": ["F_ROAD", "SEASONAL_UNCERTAINTY"],
 *     "provenance": {
 *       "provider": "MAPBOX",
 *       "sourceKind": "ROUTE_API",
 *       "calculatedAt": "2026-07-17T17:00:00.000Z",
 *       "cacheHit": false,
 *       "confidence": 0.68
 *     },
 *     "distanceM": 182000,
 *     "geometry": {
 *       "encoding": "ENCODED_POLYLINE",
 *       "value": "_p~iF…",
 *       "pointCount": 420,
 *       "source": "ROUTE_API"
 *     }
 *   }
 * }
 *
 * Persistence MVP (no Prisma column):
 *   ItineraryItem.metadata.travelEta = TravelEtaEnvelopeV1
 *   travelFromPreviousDuration continues to mirror planningDurationMin
 */

export type { TravelEtaEnvelopeV1, TravelInfoSegmentV1 } from './travel-eta.contract';
