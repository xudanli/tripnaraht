import type { TravelRiskEntityRef } from './risk-event.types';

export type TravelSignalType =
  | 'WEATHER_CHANGED'
  | 'ROAD_CLOSED'
  | 'FLIGHT_DELAYED'
  | 'FLIGHT_CANCELLED'
  | 'POI_CLOSED'
  | 'SAFETY_ALERT'
  | 'DATA_STALE';

export interface TravelSignalEvent {
  id: string;
  type: TravelSignalType;
  entityRef: TravelRiskEntityRef;
  observedAt: string;
  source: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload?: Record<string, unknown>;
}
