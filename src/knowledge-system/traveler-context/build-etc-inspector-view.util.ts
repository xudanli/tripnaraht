/**
 * Build Admin inspector view from EffectiveTravelerContext.
 */

import type {
  EffectiveMemoryItemV1,
  EffectiveTravelerContextV1,
} from '../../travel-memory/effective-context/effective-traveler-context.types';
import { resolveEffectiveTravelerContextConsumeMode } from '../../travel-memory/effective-context/resolve-etc-consume-mode.util';

export type TravelerContextSourceLabel =
  | 'TRIP_OVERRIDE'
  | 'TRAVELER_MEMORY'
  | 'RUNTIME'
  | 'REQUEST'
  | 'UNKNOWN';

export type SourceBreakdownEntry = {
  key: string;
  domain: string;
  value: unknown;
  source: TravelerContextSourceLabel;
  authority: string;
  confidence: number;
  sourceScope: string;
  sourceRefs: string[];
};

function layerToSource(layer: string): TravelerContextSourceLabel {
  switch (layer) {
    case 'L2_TRIP_OVERRIDE':
      return 'TRIP_OVERRIDE';
    case 'L1_PERSISTENT':
      return 'TRAVELER_MEMORY';
    case 'L0_WORKING':
      return 'RUNTIME';
    case 'REQUEST_OVERLAY':
      return 'REQUEST';
    default:
      return 'UNKNOWN';
  }
}

export function buildSourceBreakdown(
  etc: EffectiveTravelerContextV1,
): Record<string, SourceBreakdownEntry> {
  const out: Record<string, SourceBreakdownEntry> = {};
  const prefer = Object.values(etc.effective).filter(Boolean) as EffectiveMemoryItemV1[];
  const items = prefer.length > 0 ? prefer : etc.items;

  for (const item of items) {
    out[item.key] = {
      key: item.key,
      domain: item.domain,
      value: item.value,
      source: layerToSource(item.sourceScope ?? item.layer),
      authority: item.authority,
      confidence: item.confidence,
      sourceScope: item.sourceScope ?? item.layer,
      sourceRefs: item.sourceRefs ?? [],
    };
  }
  return out;
}

export type EtcLayerDiff = {
  longTermMemory: Array<{ key: string; value: unknown; domain: string }>;
  tripOverrides: Array<{ key: string; value: unknown; domain: string }>;
  runtimeInputs: Array<{ key: string; value: unknown; domain: string }>;
  overridden: Array<{ key: string; overriddenByKey?: string }>;
  effectiveKeys: string[];
};

export function buildEtcLayerDiff(etc: EffectiveTravelerContextV1): EtcLayerDiff {
  const longTermMemory: EtcLayerDiff['longTermMemory'] = [];
  const tripOverrides: EtcLayerDiff['tripOverrides'] = [];
  const runtimeInputs: EtcLayerDiff['runtimeInputs'] = [];
  const overridden: EtcLayerDiff['overridden'] = [];

  for (const item of etc.items) {
    const row = { key: item.key, value: item.value, domain: item.domain };
    const scope = item.sourceScope ?? item.layer;
    if (scope === 'L1_PERSISTENT') longTermMemory.push(row);
    else if (scope === 'L2_TRIP_OVERRIDE') tripOverrides.push(row);
    else runtimeInputs.push(row);
    if (item.overriddenByKey) {
      overridden.push({ key: item.key, overriddenByKey: item.overriddenByKey });
    }
  }

  return {
    longTermMemory,
    tripOverrides,
    runtimeInputs,
    overridden,
    effectiveKeys: Object.keys(etc.effective).filter(
      (k) => (etc.effective as Record<string, unknown>)[k] != null,
    ),
  };
}

export type TravelerContextInspectorView = {
  tripId: string;
  userId: string | null;
  consumeMode: 'off' | 'shadow' | 'active';
  etcConsumptionMode: 'SHADOW' | 'ACTIVE';
  effectiveTravelerContext: EffectiveTravelerContextV1;
  sourceBreakdown: Record<string, SourceBreakdownEntry>;
  tripOverrides: Array<{ key: string; value: unknown; domain: string; semantic_type?: string }>;
  memoryInputs: Array<{ key: string; value: unknown; domain: string }>;
  runtimeInputs: Array<{ key: string; value: unknown; domain: string }>;
  layerDiff: EtcLayerDiff;
  designPrinciple: string;
};

export function buildTravelerContextInspectorView(input: {
  tripId: string;
  userId?: string | null;
  etc: EffectiveTravelerContextV1;
}): TravelerContextInspectorView {
  const layerDiff = buildEtcLayerDiff(input.etc);
  return {
    tripId: input.tripId,
    userId: input.userId ?? input.etc.subjectId,
    consumeMode: resolveEffectiveTravelerContextConsumeMode(),
    etcConsumptionMode: input.etc.consumptionMode,
    effectiveTravelerContext: input.etc,
    sourceBreakdown: buildSourceBreakdown(input.etc),
    tripOverrides: layerDiff.tripOverrides,
    memoryInputs: layerDiff.longTermMemory,
    runtimeInputs: layerDiff.runtimeInputs,
    layerDiff,
    designPrinciple: input.etc.designPrinciple,
  };
}
