/**
 * Schema.org 发现层 adapter — 将 TripNARA 业务名词映射为外部索引/SEO 词汇（非 Runtime 语义）。
 */

import type { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import type { TravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';

export type SchemaOrgTravelType =
  | 'schema:Flight'
  | 'schema:LodgingBusiness'
  | 'schema:Hotel'
  | 'schema:TouristTrip'
  | 'schema:TouristAttraction'
  | 'schema:TrainTrip'
  | 'schema:BusTrip'
  | 'schema:BoatTrip'
  | 'schema:Reservation'
  | 'schema:FlightReservation'
  | 'schema:LodgingReservation'
  | 'schema:Trip';

export interface SchemaOrgDiscoveryEntity {
  '@type': SchemaOrgTravelType;
  '@id'?: string;
  name?: string;
  sameAs?: string[];
  identifier?: string;
}

export interface SchemaOrgDiscoveryPayload {
  '@context': 'https://schema.org';
  '@graph': SchemaOrgDiscoveryEntity[];
}

function transportModeToSchemaType(
  mode: string,
): SchemaOrgTravelType | undefined {
  const m = mode.toUpperCase();
  if (m === 'RAIL' || m === 'TRAIN') return 'schema:TrainTrip';
  if (m === 'BUS') return 'schema:BusTrip';
  if (m === 'MIXED' || m === 'FERRY') return 'schema:BoatTrip';
  return undefined;
}

export function ontologyContextToSchemaOrgDiscovery(
  ctx: NonNullable<TripPlanRequest['ontology_context']>,
): SchemaOrgDiscoveryPayload {
  const graph: SchemaOrgDiscoveryEntity[] = [];

  if (ctx.trip_id || ctx.destination) {
    graph.push({
      '@type': 'schema:TouristTrip',
      '@id': ctx.trip_id ? `tripnara:trip:${ctx.trip_id}` : undefined,
      name: ctx.destination?.name,
      identifier: ctx.trip_id,
    });
  }

  for (const f of ctx.flights ?? []) {
    graph.push({
      '@type': 'schema:Flight',
      '@id': f.flight_id ? `tripnara:flight:${f.flight_id}` : undefined,
      name: f.flight_no ?? f.airline,
      identifier: f.flight_id,
    });
    graph.push({
      '@type': 'schema:FlightReservation',
      '@id': f.flight_id ? `tripnara:reservation:flight:${f.flight_id}` : undefined,
      identifier: f.flight_id,
    });
  }

  for (const h of ctx.hotels ?? []) {
    graph.push({
      '@type': 'schema:LodgingBusiness',
      '@id': h.hotel_id ? `tripnara:hotel:${h.hotel_id}` : undefined,
      name: h.name,
      identifier: h.hotel_id,
    });
    graph.push({
      '@type': 'schema:LodgingReservation',
      '@id': h.hotel_id ? `tripnara:reservation:hotel:${h.hotel_id}` : undefined,
      identifier: h.hotel_id,
    });
  }

  for (const a of ctx.activities ?? []) {
    graph.push({
      '@type': 'schema:TouristAttraction',
      '@id': a.activity_id ? `tripnara:activity:${a.activity_id}` : undefined,
      name: a.name,
      identifier: a.activity_id,
    });
  }

  for (const t of ctx.transportations ?? []) {
    const schemaType = transportModeToSchemaType(t.mode);
    if (schemaType) {
      graph.push({
        '@type': schemaType,
        name: t.provider,
      });
    }
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function travelOntologyNounsToSchemaOrgDiscovery(
  nouns: NonNullable<TravelOntologyState['nouns']>,
  tripId?: string,
): SchemaOrgDiscoveryPayload {
  const ctx: NonNullable<TripPlanRequest['ontology_context']> = {
    trip_id: tripId,
    destination: nouns.destination
      ? {
          destination_id: nouns.destination.id,
          name: nouns.destination.name,
          country_code: nouns.destination.countryCode,
        }
      : undefined,
    flights: nouns.flights?.map((f) => ({
      flight_id: f.id,
      flight_no: f.flightNo,
      airline: f.airline,
      from: f.from,
      to: f.to,
      departure_time: f.departureTime,
      arrival_time: f.arrivalTime,
      price: f.price,
    })),
    hotels: nouns.hotels?.map((h) => ({
      hotel_id: h.id,
      name: h.name,
      check_in: h.checkIn,
      check_out: h.checkOut,
      nightly_price: h.nightlyPrice,
      room_available: h.roomAvailable,
    })),
    activities: nouns.activities?.map((a) => ({
      activity_id: a.id,
      name: a.name,
      type: a.type,
      start_time: a.startTime,
      end_time: a.endTime,
      location: a.location,
      price: a.price,
    })),
    transportations: nouns.transportation?.map((t) => ({
      mode: t.mode,
      provider: t.provider,
      eta_minutes: t.etaMinutes,
      cost_estimate: t.costEstimate,
    })),
  };
  return ontologyContextToSchemaOrgDiscovery(ctx);
}
