/**
 * Readiness 修复前的级联影响预分析 — 桥接 travel-cognition 与 Neptune 修复。
 */

import type { EvidenceEnvelope } from '../../../travel-cognition';
import {
  buildNonTransactionalReplanResult,
  extractFullTripDependencyChain,
  type NonTransactionalReplanResult,
} from '../../../travel-cognition';
import type { TripItineraryItemLike } from '../../../travel-cognition';
import type { ReadinessScoreFinding } from '../types/coverage-map.types';
import type {
  ReadinessCascadeUiHint,
  ReadinessCausalPreAnalysisSnapshot,
} from '../types/coverage-map.types';
import type { TripWorldState } from '../../decision/world-model';
import type { Prisma } from '@prisma/client';

export const READINESS_CAUSAL_PREANALYSIS_METADATA_KEY = 'readinessCausalPreAnalysis';

const CAUSAL_PREANALYSIS_CATEGORIES = new Set([
  'safety',
  'transport',
  'schedule',
  'evidence',
]);

function inferTriggerFromBlocker(
  blocker: ReadinessScoreFinding | undefined,
): EvidenceEnvelope | null {
  if (!blocker || !CAUSAL_PREANALYSIS_CATEGORIES.has(blocker.category)) {
    return null;
  }

  const msg = blocker.message ?? '';
  const msgLower = msg.toLowerCase();
  const action = (blocker.actionRequired ?? '').toLowerCase();
  const now = new Date().toISOString();

  const mentionsRoad =
    action.includes('road') ||
    msgLower.includes('封路') ||
    msgLower.includes('道路') ||
    msgLower.includes('f-road') ||
    msgLower.includes('f路') ||
    /f\d{3}/i.test(msg);

  if (mentionsRoad || blocker.category === 'transport') {
    const froad = /f[- ]?road|f\d{3}|f路|高地/i.test(msg);
    return {
      factType: 'ROAD',
      entityRef: { kind: 'ROAD', id: froad ? 'froad-blocker' : 'road-blocker', label: msg.slice(0, 80) },
      value: {
        isOpen: false,
        riskLevel: froad ? 3 : 2,
        reason: msg,
        metadata: { isFroad: froad, blockerId: blocker.id },
      },
      source: 'readiness_blocker',
      observedAt: now,
      confidence: blocker.severity === 'high' ? 0.85 : 0.7,
    };
  }

  const mentionsWeather =
    action.includes('weather') ||
    msgLower.includes('天气') ||
    msgLower.includes('风') ||
    msgLower.includes('暴雨') ||
    msgLower.includes('能见度');

  if (mentionsWeather || blocker.category === 'safety') {
    const wind = blocker.severity === 'high' ? 22 : 15;
    return {
      factType: 'WEATHER',
      entityRef: { kind: 'REGION', id: 'trip-weather-window', label: 'Trip weather window' },
      value: {
        windSpeed: wind,
        condition: msgLower.includes('雨') ? 'rain' : 'wind',
        metadata: { blockerId: blocker.id },
      },
      source: 'readiness_blocker',
      observedAt: now,
      confidence: 0.65,
    };
  }

  if (blocker.category === 'schedule') {
    return {
      factType: 'WEATHER',
      entityRef: { kind: 'REGION', id: 'schedule-pressure' },
      value: { windSpeed: 12, condition: 'schedule_feasibility' },
      source: 'readiness_blocker',
      observedAt: now,
      confidence: 0.55,
    };
  }

  return null;
}

export function buildReadinessCausalPreanalysis(input: {
  tripId: string;
  blocker?: ReadinessScoreFinding;
  itineraryItems: TripItineraryItemLike[];
  locale?: 'zh' | 'en';
  trigger?: EvidenceEnvelope;
}): NonTransactionalReplanResult | null {
  const trigger = input.trigger ?? inferTriggerFromBlocker(input.blocker);
  if (!trigger) return null;

  const chain = extractFullTripDependencyChain(input.itineraryItems);
  const result = buildNonTransactionalReplanResult({
    tripId: input.tripId,
    trigger,
    chain,
    locale: input.locale,
  });

  if (result.impact.affected.length === 0 && trigger.factType !== 'ROAD') {
    return null;
  }

  return result;
}

/** 将级联预分析写入 TripWorldState.signals，供 Neptune 修复感知下游影响 */
export function applyCausalPreAnalysisToWorldState(
  state: TripWorldState,
  preanalysis: NonTransactionalReplanResult,
): void {
  const affected = preanalysis.impact.affected;
  if (!affected.length) return;

  const severityMap = {
    CRITICAL: 'critical',
    HIGH: 'critical',
    MEDIUM: 'warn',
    LOW: 'info',
  } as const;

  const alerts = affected.slice(0, 8).map((node, index) => ({
    code: `readiness_causal_${preanalysis.trigger.factType.toLowerCase()}_${index}`,
    severity: severityMap[node.riskLevel] ?? ('warn' as const),
    message: `[级联] ${node.message}`,
  }));

  state.signals = {
    ...state.signals,
    alerts: [...(state.signals.alerts ?? []), ...alerts],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export { inferTriggerFromBlocker };

export function extractCausalPreAnalysisSnapshot(
  metadata: unknown,
): ReadinessCausalPreAnalysisSnapshot | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[READINESS_CAUSAL_PREANALYSIS_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ReadinessCausalPreAnalysisSnapshot;
}

export function mergeCausalPreAnalysisSnapshot(
  metadata: unknown,
  update: {
    result: NonTransactionalReplanResult;
    blockerId?: string;
  },
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prev = extractCausalPreAnalysisSnapshot(metadata) ?? {};
  const byBlockerId = { ...(prev.byBlockerId ?? {}) };
  if (update.blockerId) {
    byBlockerId[update.blockerId] = update.result;
  }
  const snapshot: ReadinessCausalPreAnalysisSnapshot = {
    latest: update.result,
    byBlockerId,
    updatedAt: new Date().toISOString(),
  };
  base[READINESS_CAUSAL_PREANALYSIS_METADATA_KEY] = snapshot;
  return base as unknown as Prisma.InputJsonValue;
}

/** 将级联影响转为准备度 UI 卡片 */
export function buildReadinessCascadeUiHints(
  preanalysis: NonTransactionalReplanResult | null | undefined,
): ReadinessCascadeUiHint[] {
  if (!preanalysis?.impact.affected.length) return [];

  return preanalysis.impact.affected.map((node, index) => ({
    id: `cascade_${preanalysis.trigger.factType.toLowerCase()}_${index}`,
    riskLevel: node.riskLevel,
    message: node.message,
    recommendation: node.recommendation,
    entityKind: node.entityRef.kind,
    entityLabel: node.entityRef.label ?? node.entityRef.id,
    userConfirmationRequired: node.userConfirmationRequired,
  }));
}

/** 为 top blocker 自动计算级联预分析（score 页刷新用） */
export function buildCausalPreanalysisForTopBlocker(input: {
  tripId: string;
  findings: ReadinessScoreFinding[];
  itineraryItems: TripItineraryItemLike[];
}): NonTransactionalReplanResult | null {
  const blocker =
    input.findings.find((f) => f.type === 'blocker' && f.severity === 'high') ??
    input.findings.find((f) => f.type === 'blocker') ??
    input.findings.find((f) => f.severity === 'high');

  if (!blocker) return null;

  return buildReadinessCausalPreanalysis({
    tripId: input.tripId,
    blocker,
    itineraryItems: input.itineraryItems,
  });
}
