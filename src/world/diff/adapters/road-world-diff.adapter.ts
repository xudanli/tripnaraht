/**
 * Road → WorldDiff Contract（图引擎 / SSOT RoadConstraintDiff 共用）
 */

import type { RoadConstraintDiff } from '../../road-constraint-diff.types';
import type {
  WorldDiff,
  WorldDiffMutationType,
  WorldDiffOrigin,
} from '../world-diff.contract';
import type { WorldTimeRange } from '../../constraint-field.interface';

function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `wd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function numericSeverityToBand(n: number): WorldDiff['severity'] {
  if (n >= 67) {
    return 'HIGH';
  }
  if (n >= 34) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export interface RoadToWorldDiffParams {
  readonly stateBefore: string;
  readonly temporalScope: WorldTimeRange;
  readonly source: WorldDiffOrigin;
  /** 已由行程解析的槽位（可选；缺省则仅占位，传播仍可由 SEQUENCE hint 展开） */
  readonly impactedSlotIds?: readonly string[];
  readonly id?: string;
  readonly type?: WorldDiffMutationType;
}

/**
 * 由路网 SSOT diff（`RoadConstraintDiff`）生成统一合约条目。
 */
export function roadConstraintDiffToWorldDiff(
  rd: RoadConstraintDiff,
  params: RoadToWorldDiffParams,
): WorldDiff {
  const after = String(rd.state);
  return {
    id: params.id ?? newId(),
    domain: 'ROAD',
    type: params.type ?? 'STATE_CHANGE',
    entityId: rd.roadId.trim(),
    stateBefore: params.stateBefore,
    stateAfter: after,
    severity: numericSeverityToBand(rd.severity),
    temporalScope: params.temporalScope,
    impactedSlots: [...(params.impactedSlotIds ?? [])],
    propagationHint: 'SEQUENCE',
    source: params.source,
  };
}
