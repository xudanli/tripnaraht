/**
 * World Command Layer — 用户直接编辑世界前提 → 统一管线写入 SSOT
 */

import type { WorldCommand } from './world-command.types';
import type { ConstraintField } from './constraint-field.interface';
import type { ApplyWorldEventOptions, ApplyWorldEventResult } from './world-constraint.pipeline';
import {
  applyWorldEvent,
  type WorldDomainEvent,
} from './world-constraint.pipeline';
import type { WorldConstraintDiff } from './world-diff.engine';
import { computeWorldDiff } from './world-diff.engine';
import type { WorldConstraintStore } from './world-constraint.store';

export interface ApplyWorldCommandOptions extends ApplyWorldEventOptions {
  readonly atMs?: number;
}

export interface ApplyWorldCommandResult {
  readonly store: WorldConstraintStore;
  readonly diff: WorldConstraintDiff;
  readonly emittedKind: 'WORLD_CONSTRAINT_DIFF';
  readonly command: WorldCommand;
  /** 由域事件映射的命令会带上原始事件；纯策略 upsert 则无 */
  readonly sourceEvent?: WorldDomainEvent;
}

function now(at?: number): number {
  return at ?? Date.now();
}

function drivingPolicyField(ratio: number, at: number): ConstraintField {
  const severity = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return {
    id: 'USER_POLICY_DRIVING',
    type: 'BOOKING',
    state: ratio >= 0.5 ? 'DEGRADED' : 'OPEN',
    severity,
    temporalScope: {
      start: new Date(at).toISOString(),
      end: new Date(at).toISOString(),
    },
    impactWeight: 0.7,
    version: 0,
    userPolicy: {
      kind: 'DRIVING_SOFT_CAP',
      maxMountainRoadRatio: ratio,
    },
  };
}

function poiLockField(poiId: string, at: number): ConstraintField {
  return {
    id: `USER_LOCK_POI:${poiId}`,
    type: 'BOOKING',
    state: 'OPEN',
    severity: 15,
    temporalScope: {
      start: new Date(at).toISOString(),
      end: new Date(at).toISOString(),
    },
    impactWeight: 0.85,
    version: 0,
    affectedPoiIds: [poiId],
    userPolicy: {
      kind: 'POI_LOCK',
      lockedPoiId: poiId,
    },
  };
}

function fromPipeline(
  cmd: WorldCommand,
  r: ApplyWorldEventResult,
  ev?: WorldDomainEvent,
): ApplyWorldCommandResult {
  return {
    store: r.store,
    diff: r.diff,
    emittedKind: r.emittedKind,
    command: cmd,
    ...(ev !== undefined ? { sourceEvent: ev } : {}),
  };
}

function pipelineOptions(
  options?: ApplyWorldCommandOptions,
): ApplyWorldEventOptions | undefined {
  return options?.tripPlan !== undefined ? { tripPlan: options.tripPlan } : undefined;
}

/**
 * 人机命令 → `WorldDomainEvent` 或策略字段 upsert → `computeWorldDiff`
 */
export function applyWorldCommand(
  store: WorldConstraintStore,
  cmd: WorldCommand,
  options?: ApplyWorldCommandOptions,
): ApplyWorldCommandResult {
  const at = now(options?.atMs);
  const eventOpts = pipelineOptions(options);

  switch (cmd.type) {
    case 'BLOCK_ROAD': {
      const ev: WorldDomainEvent = {
        kind: 'ROAD',
        roadId: cmd.roadId,
        status: 'IMPASSABLE',
        at,
        ...(cmd.affectedSlotIds?.length
          ? { affectedSlotIds: [...cmd.affectedSlotIds] }
          : {}),
        ...(cmd.affectedPoiIds?.length
          ? { affectedPoiIds: [...cmd.affectedPoiIds] }
          : {}),
      };
      return fromPipeline(cmd, applyWorldEvent(store, ev, eventOpts), ev);
    }
    case 'UNBLOCK_ROAD': {
      const ev: WorldDomainEvent = {
        kind: 'ROAD',
        roadId: cmd.roadId,
        status: 'OPEN',
        at,
        ...(cmd.affectedSlotIds?.length
          ? { affectedSlotIds: [...cmd.affectedSlotIds] }
          : {}),
        ...(cmd.affectedPoiIds?.length
          ? { affectedPoiIds: [...cmd.affectedPoiIds] }
          : {}),
      };
      return fromPipeline(cmd, applyWorldEvent(store, ev, eventOpts), ev);
    }
    case 'AVOID_WEATHER': {
      const ev: WorldDomainEvent = {
        kind: 'WEATHER',
        date: cmd.regionOrDateId,
        violation: 'HARD',
        executionStress: 75,
        at,
      };
      return fromPipeline(cmd, applyWorldEvent(store, ev, eventOpts), ev);
    }
    case 'LOCK_POI': {
      store.upsert(poiLockField(cmd.poiId, at));
      const written = store.get('BOOKING', `USER_LOCK_POI:${cmd.poiId}`)!;
      const diff = computeWorldDiff(written, options?.tripPlan);
      return {
        store,
        diff,
        emittedKind: 'WORLD_CONSTRAINT_DIFF',
        command: cmd,
      };
    }
    case 'ADD_DRIVING_CONSTRAINT': {
      store.upsert(drivingPolicyField(cmd.constraint.maxMountainRoadRatio, at));
      const written = store.get('BOOKING', 'USER_POLICY_DRIVING')!;
      const diff = computeWorldDiff(written, options?.tripPlan);
      return {
        store,
        diff,
        emittedKind: 'WORLD_CONSTRAINT_DIFF',
        command: cmd,
      };
    }
    default: {
      const _exhaustive: never = cmd;
      throw new Error(`unknown world command ${JSON.stringify(_exhaustive)}`);
    }
  }
}
