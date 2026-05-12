/**
 * Booking / 槽位 → WorldDiff Contract
 */

import type { WorldTimeRange } from '../../constraint-field.interface';
import type { WorldDiff, WorldDiffMutationType, WorldDiffOrigin } from '../world-diff.contract';

function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `wd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface BookingToWorldDiffParams {
  readonly entityId: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly severity: WorldDiff['severity'];
  readonly temporalScope: WorldTimeRange;
  /** 通常为单槽或策略展开后的槽集合 */
  readonly impactedSlots: readonly string[];
  readonly source: WorldDiffOrigin;
  readonly id?: string;
  readonly type?: WorldDiffMutationType;
}

export function bookingChangeToWorldDiff(params: BookingToWorldDiffParams): WorldDiff {
  return {
    id: params.id ?? newId(),
    domain: 'BOOKING',
    type: params.type ?? 'STATE_CHANGE',
    entityId: params.entityId.trim(),
    stateBefore: params.stateBefore,
    stateAfter: params.stateAfter,
    severity: params.severity,
    temporalScope: params.temporalScope,
    impactedSlots: [...params.impactedSlots],
    propagationHint: 'LOCAL',
    source: params.source,
  };
}
