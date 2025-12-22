// src/trips/readiness/packs/index.ts

/**
 * Capability Packs Index - 能力包索引
 * 
 * 导出所有可用的能力包
 */

export { highAltitudePack } from './high-altitude.pack';
export { sparseSupplyPack } from './sparse-supply.pack';
export { seasonalRoadPack } from './seasonal-road.pack';
export { permitCheckpointPack } from './permit-checkpoint.pack';
export { emergencyPack } from './emergency.pack';

export type {
  CapabilityPackType,
  CapabilityPackConfig,
  CapabilityTrigger,
  CapabilityCondition,
  CapabilityRule,
  CapabilityHazard,
  HighAltitudePackConfig,
  SparseSupplyPackConfig,
  SeasonalRoadPackConfig,
  PermitCheckpointPackConfig,
  EmergencyPackConfig,
  CapabilityPackResult,
} from '../types/capability-pack.types';

