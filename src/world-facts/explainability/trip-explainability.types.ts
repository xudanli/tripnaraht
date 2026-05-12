/**
 * Trip Explainability — 人类可读的「决策因子」投影（非原始 history dump）。
 */

import type { DecisionFactor } from '../decision-awareness.types';

export type ExplainabilityImpact = 'INFO' | 'WARNING' | 'BLOCKER';

export type ExplainabilityReasonType =
  | 'WEATHER'
  | 'ROAD_ACCESS'
  | 'SAFETY'
  | 'INVENTORY'
  | 'TIME_WINDOW';

/**
 * @deprecated 遗留叙事结构；主链路应使用 {@link DecisionFactor}（由 DecisionFactorFactory 直接从 Fact 生成）。
 */
export interface ExplainabilityReason {
  reasonType: ExplainabilityReasonType;
  title: string;
  summary: string;
  derivedFromFactIds: string[];
  confidence?: number;
  impact: ExplainabilityImpact;
}

export interface TripExplainabilityPayload {
  tripId: string;
  destination?: string;
  countryCode?: string;
  worldSnapshotVersion: string;
  /** 对外唯一契约（DecisionFactorFactory 由 Fact 直出） */
  decisionFactors: DecisionFactor[];
  generatedAt: string;
  /** 无法从 destination 解析 ISO 国家码时 */
  destinationCountryUnresolved?: boolean;
}
