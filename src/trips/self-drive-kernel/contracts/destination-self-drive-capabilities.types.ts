/**
 * Destination Pack 自驾能力声明 — ADR-SELF-DRIVE-KERNEL §3
 * Pack 声明能提供什么；Kernel 不按国家分支决策逻辑。
 */

export const DESTINATION_SELF_DRIVE_CAPABILITIES_SCHEMA =
  'tripnara.destination_self_drive_capabilities@v1' as const;

export type CapabilityLevel =
  | 'NONE'
  | 'PARTIAL'
  | 'SUPPORTED'
  | 'PROVIDER_DEPENDENT';

export interface DestinationSelfDriveCapabilityFlags {
  road_status: CapabilityLevel;
  vehicle_road_fit: CapabilityLevel;
  altitude_risk: CapabilityLevel;
  restricted_area: CapabilityLevel;
  seasonal_window: CapabilityLevel;
  ferry: CapabilityLevel;
  toll: CapabilityLevel;
  live_traffic: CapabilityLevel;
  checkpoint: CapabilityLevel;
  fuel_density: CapabilityLevel;
  charging: CapabilityLevel;
}

export interface DestinationSelfDriveCapabilities {
  schemaId: typeof DESTINATION_SELF_DRIVE_CAPABILITIES_SCHEMA;
  packId: string;
  countryCode: string;
  version: string;
  capabilities: DestinationSelfDriveCapabilityFlags;
  notes?: string;
}
