import type { PublicTransitRealtimeAdapter, PublicTransitRealtimeSnapshot } from './public-transit-realtime.adapter';

export type StubGtfsScenario = 'CANCELLED' | 'DELAY' | 'CONNECTION_GAP';

/**
 * Deterministic GTFS-Realtime stub adapter for CI/E2E.
 * - CANCELLED: serviceStatus=CANCELLED
 * - DELAY: increases required transfer window
 * - CONNECTION_GAP: planned < required
 */
export class StubGtfsRealtimeAdapter implements PublicTransitRealtimeAdapter {
  provider = 'stub_gtfs';

  constructor(private readonly scenario: StubGtfsScenario) {}

  async getTripSnapshot(input: { station_a: string; station_b: string; at_iso: string }): Promise<PublicTransitRealtimeSnapshot> {
    const base = {
      serviceStatus: 'ACTIVE' as const,
      transferWindowMin: 10,
      plannedTransferWindowMin: 10,
      departureTime: input.at_iso,
      nextAvailableTripOffsetMin: 0,
      snapshot_id: `stub_gtfs:${this.scenario}:${input.station_a}:${input.station_b}`,
      provider_reference: {
        provider: this.provider,
        reference_type: 'trip_update',
        reference_id: `tu_${this.scenario}_${input.station_a}_${input.station_b}`,
      },
      raw: { scenario: this.scenario },
    };

    if (this.scenario === 'CANCELLED') {
      return { ...base, serviceStatus: 'CANCELLED' };
    }
    if (this.scenario === 'DELAY') {
      // delay shrinks feasibility by increasing required window
      // target: delay = gap(10-5)=5 + offset(45)=50
      return { ...base, transferWindowMin: 10, plannedTransferWindowMin: 5, nextAvailableTripOffsetMin: 45 };
    }
    // CONNECTION_GAP
    return { ...base, transferWindowMin: 10, plannedTransferWindowMin: 3, nextAvailableTripOffsetMin: 45 };
  }
}

