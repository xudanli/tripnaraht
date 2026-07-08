/** Consumer 旅行条件 — 枚举与目的地 catalog SSOT */

export const EXPLORATION_VEHICLE_TYPES = [
  { code: '2WD_COMPACT_SUV', label: '2WD 紧凑型 SUV' },
  { code: '4WD_SUV', label: '四驱 SUV' },
] as const;

export type ExplorationVehicleTypeCode =
  (typeof EXPLORATION_VEHICLE_TYPES)[number]['code'];

export const EXPLORATION_DESTINATION_PRESETS: Record<
  string,
  {
    label: string;
    budgetPresets: Array<{ currency: string; min: number; max: number }>;
    vehicleTypes: ExplorationVehicleTypeCode[];
  }
> = {
  IS: {
    label: '冰岛',
    budgetPresets: [{ currency: 'USD', min: 3000, max: 4000 }],
    vehicleTypes: ['2WD_COMPACT_SUV', '4WD_SUV'],
  },
};

export const CONSUMER_ENTRY_VARIANTS = [
  'SINGLE_RECOMMENDATION',
  'THREE_ROUTE_COMPARISON',
] as const;

/** 研究协议强制：未传 protocol 且 Consumer MVP 未开时回退冰岛研究 */
export function isResearchProtocolForcedByEnv(): boolean {
  return (
    process.env.RESEARCH_PROTOCOL_ENABLED === '1' &&
    process.env.EXPLORATION_CONSUMER_MVP_ENABLED !== '1'
  );
}

export function isExplorationConsumerMvpEnabled(): boolean {
  return process.env.EXPLORATION_CONSUMER_MVP_ENABLED === '1';
}
