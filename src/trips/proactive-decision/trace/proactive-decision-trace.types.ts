/**
 * Phase 4 P0 — Decision Trace（一次主动建议为何产生，可回放解释）。
 * 人格细节仅解释层；用户文案不展示 Abu/Dr.Dre/Neptune 名称。
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';
import type { HardGateVerdict } from '../lenses/lens-activation.types';
import type { ProactiveLensId } from '../lenses/lens-activation.types';

export const PROACTIVE_DECISION_TRACE_SCHEMA =
  'nara.proactive_decision_trace@v1' as const;

/** Product-facing signal labels (replay JSON) */
export type ProactiveTraceSignalLabel =
  | 'WIND_CHANGE'
  | 'BLIZZARD'
  | 'HEAVY_RAIN'
  | 'ROAD_CLOSURE'
  | 'ROAD_DIFFICULTY_CHANGE'
  | 'ROUTE_AVAILABILITY_CHANGE'
  | 'OTHER';

export type ProactiveDecisionTraceV1 = {
  schemaId: typeof PROACTIVE_DECISION_TRACE_SCHEMA;
  version: 1;
  tripId: string;
  decisionProblemId: string | null;
  caseId: ProactiveDecisionCaseId | null;
  /** ISO time of trace assembly */
  at: string;

  signal: {
    label: ProactiveTraceSignalLabel;
    kind: ProactiveWorldSignalKind;
    signalEventId: string;
    /** e.g. Reynisfjara 14→25 m/s @ 16:00 */
    summaryZh: string;
    windFromMps?: number;
    windToMps?: number;
    localTimeHint?: string;
  };

  impact: {
    /** Machine key for replay, e.g. REYNISFJARA_AFFECTED */
    key: string;
    summaryZh: string;
    affectedItemIds: string[];
    affectedLabels: string[];
    impactLevel: string;
    decisionRequired: boolean;
  };

  abu: {
    required: true | false;
    risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
    verdict: HardGateVerdict | null;
  };

  dre: {
    required: true | false;
    utilityDrop: boolean;
  };

  neptune: {
    /** conditional = only when Need Alternative / repair */
    mode: 'required' | 'conditional' | 'off';
    activated: boolean;
    alternatives: number;
  };

  cgus: {
    selected: ProactiveOptionId | null;
    /** Product-friendly alias when mapped */
    selectedLabel?: string;
    confidence: number | null;
    reasonZh: string | null;
    impactZh: string | null;
  };

  intervention: {
    value: number | null;
    gate: 'NOTIFY_CARD' | 'SILENT_LEARNING' | null;
    threshold: number | null;
  };

  lenses: {
    order: ProactiveLensId[];
    activateAbu: boolean;
    activateDrDre: boolean;
    activateNeptune: boolean;
  };

  /**
   * User-facing WHY text — no persona names.
   * For iOS 「为什么」；完整人格细节只在本 Trace 结构中。
   */
  whyExplainZh: string;
};

export function mapSignalKindToTraceLabel(
  kind: ProactiveWorldSignalKind,
): ProactiveTraceSignalLabel {
  switch (kind) {
    case 'WEATHER_WIND':
      return 'WIND_CHANGE';
    case 'WEATHER_BLIZZARD':
      return 'BLIZZARD';
    case 'WEATHER_HEAVY_RAIN':
      return 'HEAVY_RAIN';
    case 'ROAD_CLOSURE':
      return 'ROAD_CLOSURE';
    case 'ROAD_DIFFICULTY_CHANGE':
      return 'ROAD_DIFFICULTY_CHANGE';
    case 'ROUTE_AVAILABILITY_CHANGE':
      return 'ROUTE_AVAILABILITY_CHANGE';
    default:
      return 'OTHER';
  }
}

export function buildImpactTraceKey(input: {
  affectedLabels: string[];
  affectedItemIds: string[];
}): string {
  const label = input.affectedLabels[0] ?? input.affectedItemIds[0] ?? 'UNKNOWN';
  const slug = label
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
  return `${slug || 'UNKNOWN'}_AFFECTED`;
}

export function mapOptionToProductLabel(
  optionId: ProactiveOptionId | null | undefined,
): string | undefined {
  if (!optionId) return undefined;
  switch (optionId) {
    case 'OPT_POSTPONE_NEXT_WINDOW':
      return 'MOVE_TO_NEXT_DAY';
    case 'OPT_KEEP_ORIGINAL':
      return 'KEEP_ORIGINAL';
    case 'OPT_INDOOR_SUBSTITUTE':
      return 'INDOOR_SUBSTITUTE';
    case 'OPT_REROUTE':
      return 'REROUTE';
    case 'OPT_CANCEL_ACTIVITY':
      return 'CANCEL_ACTIVITY';
    default:
      return optionId;
  }
}
