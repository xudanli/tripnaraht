export type PublicTransitStationPair = {
  station_a: string;
  station_b: string;
};

export type PublicTransitRealtimeSnapshot = {
  serviceStatus: 'ACTIVE' | 'CANCELLED' | 'UNKNOWN';
  transferWindowMin: number;
  plannedTransferWindowMin: number;
  departureTime?: string;
  /** Optional: estimated minutes until next available trip for this station pair */
  nextAvailableTripOffsetMin?: number;
  snapshot_id?: string;
  provider_reference?: { provider: string; reference_type: string; reference_id: string };
  raw?: any;
};

export interface PublicTransitRealtimeAdapter {
  provider: string;
  getTripSnapshot(input: {
    station_a: string;
    station_b: string;
    at_iso: string;
  }): Promise<PublicTransitRealtimeSnapshot>;
}

