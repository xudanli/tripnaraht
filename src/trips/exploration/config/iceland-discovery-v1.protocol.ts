import type { ResearchProtocolConfig } from './research-protocol.types';

/** 冰岛 9 天复杂自驾研究协议 — 实验输入 SSOT，非业务硬编码 */
export const ICELAND_DISCOVERY_PROTOCOL: ResearchProtocolConfig = {
  protocolId: 'iceland-discovery-v1',
  version: '1.0.0',
  defaultScenario: {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
    budget: { currency: 'USD', min: 3000, max: 4000 },
    mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
    insuranceContext: { coverageTier: 'STANDARD' },
    rentalContext: { pickupLocation: 'KEF', pickupTimeLocal: '10:00' },
    source: 'RESEARCH_PROTOCOL',
  },
  lockedFields: [
    'destinationCodes',
    'dateRange',
    'travelers',
    'budget',
    'mobilityContext.vehicleType',
  ],
  entryVariants: ['SINGLE_RECOMMENDATION', 'THREE_ROUTE_COMPARISON'],
  strategyIds: ['depth-south-coast', 'coverage-ring-compressed', 'remote-highlands-south'],
  issueSelectionPolicy: {
    maxIssues: 1,
    preferredSeverities: ['BLOCK'],
    preferredCategories: ['ROAD_ACCESS', 'VEHICLE_ACCESS'],
  },
  packagePresentationPolicy: {
    mode: 'LATIN_SQUARE',
    packageIds: ['full_report', 'auto_repair', 'expert_review', 'trip_assurance'],
  },
  requiredEvents: ['exploration_session_started', 'research_variant_assigned'],
  featureFlags: ['EXPLORATION_CONSUMER_MVP_ENABLED', 'RESEARCH_PROTOCOL_ENABLED'],
};
