/**
 * Weather → WorldDiff Contract（执行信号 / 日历域）
 */

import type { WorldTimeRange } from '../../constraint-field.interface';
import type { WorldDiff, WorldDiffMutationType, WorldDiffOrigin } from '../world-diff.contract';

function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `wd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface WeatherToWorldDiffParams {
  readonly entityId: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly severity: WorldDiff['severity'];
  readonly temporalScope: WorldTimeRange;
  readonly impactedSlots: readonly string[];
  readonly source: WorldDiffOrigin;
  readonly id?: string;
  readonly type?: WorldDiffMutationType;
}

export function weatherSignalToWorldDiff(params: WeatherToWorldDiffParams): WorldDiff {
  return {
    id: params.id ?? newId(),
    domain: 'WEATHER',
    type: params.type ?? 'STATE_CHANGE',
    entityId: params.entityId.trim(),
    stateBefore: params.stateBefore,
    stateAfter: params.stateAfter,
    severity: params.severity,
    temporalScope: params.temporalScope,
    impactedSlots: [...params.impactedSlots],
    propagationHint: 'GLOBAL',
    source: params.source,
  };
}
