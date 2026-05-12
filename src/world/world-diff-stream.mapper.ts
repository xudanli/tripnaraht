/**
 * 将引擎 diff / 元数据映射为产品层 World Diff Stream 条目
 */

import type { ConstraintField } from './constraint-field.interface';
import type { WorldConstraintDiff } from './world-diff.engine';
import type {
  WorldDiffSource,
  WorldDiffStreamEvent,
  WorldDiffUiType,
} from './world-diff-stream.types';
import type { WorldDiff as WorldDiffContract } from './diff/world-diff.contract';

function bandToSeverity(band: WorldConstraintDiff['severity']): number {
  if (band === 'HIGH') {
    return 85;
  }
  if (band === 'MEDIUM') {
    return 50;
  }
  return 25;
}

function inferUiType(
  diff: WorldConstraintDiff,
  field?: ConstraintField,
): WorldDiffUiType {
  if (field?.userPolicy?.kind === 'DRIVING_SOFT_CAP') {
    return 'DRIVING_POLICY';
  }
  const primary = diff.domains[0];
  if (primary === 'ROAD') {
    return 'ROAD_BLOCK';
  }
  if (primary === 'WEATHER') {
    return 'WEATHER_SHIFT';
  }
  if (primary === 'BOOKING') {
    return 'BOOKING_CHANGE';
  }
  return 'GENERIC';
}

export interface ToWorldDiffStreamParams {
  readonly explanation: string;
  readonly source: WorldDiffSource;
  /** 刚写入的约束字段（用于细分 DRIVING_POLICY 等） */
  readonly constraintField?: ConstraintField;
  readonly emittedAtMs?: number;
  /** 默认 `crypto.randomUUID`，测试可注入 */
  readonly id?: string;
}

/**
 * 由一次 `WorldConstraintDiff` 生成 UI 流事件（Map / Timeline / Story 共用）
 */
export function toWorldDiffStreamEvent(
  diff: WorldConstraintDiff,
  params: ToWorldDiffStreamParams,
): WorldDiffStreamEvent {
  const emittedAtMs = params.emittedAtMs ?? Date.now();
  const id =
    params.id ??
    (typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `wd_${emittedAtMs}_${Math.random().toString(36).slice(2, 9)}`);

  return {
    id,
    type: inferUiType(diff, params.constraintField),
    affectedSlots: [...diff.affectedSlots],
    severity: bandToSeverity(diff.severity),
    explanation: params.explanation,
    source: params.source,
    emittedAtMs,
    domains: [...diff.domains],
  };
}

function originToStreamSource(
  o: WorldDiffContract['source'],
): WorldDiffSource {
  if (o === 'COMMAND') {
    return 'USER';
  }
  if (o === 'GRAPH') {
    return 'PROPAGATION';
  }
  return 'SYSTEM';
}

function contractDomainToUiType(
  domain: WorldDiffContract['domain'],
): WorldDiffUiType {
  if (domain === 'ROAD') {
    return 'ROAD_BLOCK';
  }
  if (domain === 'WEATHER') {
    return 'WEATHER_SHIFT';
  }
  if (domain === 'BOOKING') {
    return 'BOOKING_CHANGE';
  }
  return 'GENERIC';
}

function bandToUiSeverity(band: WorldDiffContract['severity']): number {
  if (band === 'HIGH') {
    return 85;
  }
  if (band === 'MEDIUM') {
    return 50;
  }
  return 25;
}

/**
 * 物理合约 WorldDiff → UI 流（因果叙事 / Map / Timeline）
 */
export function worldDiffContractToStreamEvent(
  contract: WorldDiffContract,
  explanation: string,
  emittedAtMs?: number,
): WorldDiffStreamEvent {
  return {
    id: contract.id,
    type: contractDomainToUiType(contract.domain),
    affectedSlots: [...contract.impactedSlots],
    severity: bandToUiSeverity(contract.severity),
    explanation,
    source: originToStreamSource(contract.source),
    emittedAtMs: emittedAtMs ?? Date.now(),
    domains: [contract.domain],
  };
}

/** @deprecated 使用 `toWorldDiffStreamEvent` */
export const toWorldDiff = toWorldDiffStreamEvent;
/** @deprecated 使用 `ToWorldDiffStreamParams` */
export type ToWorldDiffParams = ToWorldDiffStreamParams;
