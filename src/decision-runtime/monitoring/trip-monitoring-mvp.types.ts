/**
 * S3 Monitoring MVP — 5 类变量扫描 + Trigger Gateway 联动。
 * @see internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md §5.3
 */

export const TRIP_MONITORING_SCAN_SCHEMA_ID = 'tripnara.trip_monitoring_scan@v1';

export type TripMonitoringMvpKind =
  | 'ROAD_CLOSURE'
  | 'WEATHER_HAZARD'
  | 'FLIGHT_STATUS'
  | 'POI_CLOSURE'
  | 'BOOKING_STATUS';

export interface TripMonitoringItemView {
  kind: TripMonitoringMvpKind;
  label: string;
  status: 'ACTIVE' | 'PENDING' | 'PAUSED' | 'ALERT';
  lastCheckedAt?: string;
  nextCheckAt?: string;
  summary?: string;
  /** Consumer：受影响 day（0-based） */
  affectedDayIndex?: number;
  /** 关联 Decision Problem */
  problemId?: string;
  evidenceSource?: string;
}

export interface TripMonitoringScanResult {
  schemaId: typeof TRIP_MONITORING_SCAN_SCHEMA_ID;
  tripId: string;
  scannedAt: string;
  contextSnapshotId: string;
  contextSnapshotRevision: string;
  activeAlertCount: number;
  items: TripMonitoringItemView[];
  gatewayEnabled: boolean;
  dispatches: Array<{
    kind: TripMonitoringMvpKind;
    status: 'COMPLETED' | 'SKIPPED' | 'FAILED';
    detail?: string;
  }>;
}

export const MONITORING_MVP_METADATA_KEY = 'tripMonitoringMvp';

export interface StoredTripMonitoringMvpState {
  lastScanAt?: string;
  items: TripMonitoringItemView[];
}
