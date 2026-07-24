import { ICELAND_REGION_TEMPLATE } from '../config/iceland-region-templates';
import { ICELAND_DISCOVERY_PROTOCOL } from '../config/iceland-discovery-v1.protocol';
import type { RouteStrategyProfile } from '../types/exploration.types';

export const ICELAND_STRATEGY_PROFILES: RouteStrategyProfile[] = [
  {
    strategyId: 'depth-south-coast',
    archetype: 'DEPTH',
    weights: {
      coverage: 0.2,
      depth: 0.9,
      drivingPenalty: 0.85,
      remoteExploration: 0.15,
      stayStability: 0.8,
      uncertaintyPenalty: 0.7,
    },
    explanationKey: 'exploration.strategy.depth_south_coast',
  },
  {
    strategyId: 'coverage-ring-compressed',
    archetype: 'COVERAGE',
    weights: {
      coverage: 0.95,
      depth: 0.35,
      drivingPenalty: 0.25,
      remoteExploration: 0.3,
      stayStability: 0.4,
      uncertaintyPenalty: 0.5,
    },
    explanationKey: 'exploration.strategy.coverage_ring',
  },
  {
    strategyId: 'remote-highlands-south',
    archetype: 'REMOTE_EXPLORATION',
    weights: {
      coverage: 0.55,
      depth: 0.6,
      drivingPenalty: 0.4,
      remoteExploration: 0.95,
      stayStability: 0.35,
      uncertaintyPenalty: 0.2,
    },
    explanationKey: 'exploration.strategy.remote_highlands',
  },
];

export function resolveResearchProtocol(protocolId: string) {
  if (protocolId === ICELAND_DISCOVERY_PROTOCOL.protocolId) {
    return ICELAND_DISCOVERY_PROTOCOL;
  }
  return null;
}

export function resolveRegionTemplate(destinationCode: string) {
  if (destinationCode === 'IS') {
    return ICELAND_REGION_TEMPLATE;
  }
  return null;
}

export function listStrategyProfilesForProtocol(protocolId: string): RouteStrategyProfile[] {
  const protocol = resolveResearchProtocol(protocolId);
  if (!protocol) return [];
  return ICELAND_STRATEGY_PROFILES.filter((p) =>
    protocol.strategyIds.includes(p.strategyId),
  );
}

/** Consumer 模式（无 protocol）按目的地解析策略；冰岛与 research 共用三策略 */
export function listStrategyProfilesForExploration(
  protocolId: string | null | undefined,
  destinationCode: string,
): RouteStrategyProfile[] {
  if (protocolId) {
    return listStrategyProfilesForProtocol(protocolId);
  }
  if (destinationCode === 'IS') {
    return ICELAND_STRATEGY_PROFILES;
  }
  return [];
}
