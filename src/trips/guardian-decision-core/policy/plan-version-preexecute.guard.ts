/**
 * WP3 — pre-execute guards before PlanVersion materialization.
 */

import { BadRequestException } from '@nestjs/common';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import { RFC001_AUTHORIZATION_VALIDITY_MS } from '../config/rfc001-iceland.config';

export type PreExecuteGuardCode =
  | 'BASE_PLAN_VERSION_STALE'
  | 'EFFECTIVE_PLAN_VERSION_MISMATCH'
  | 'WORLD_STATE_SNAPSHOT_STALE'
  | 'AUTHORIZATION_EXPIRED';

export class PlanVersionPreExecuteGuardError extends BadRequestException {
  constructor(
    public readonly guardCode: PreExecuteGuardCode,
    message: string,
  ) {
    super({ guardCode, message });
  }
}

export interface PreExecuteGuardContext {
  record: Rfc001DecisionRecord;
  planVersion: PlanVersion;
  currentEffectivePlanVersionId?: string;
  worldStateSnapshot?: { snapshotId: string; assertionIds: string[] };
  snapshotAssertions: WorldStateAssertion[];
  activeRoadAssertion?: WorldStateAssertion<RoadStatusAssertionPayload>;
  now?: Date;
}

export function assertBasePlanVersionOptimisticLock(
  ctx: PreExecuteGuardContext,
): void {
  const effective =
    ctx.currentEffectivePlanVersionId ?? ctx.record.basePlanVersionId;
  if (ctx.record.basePlanVersionId !== effective) {
    throw new PlanVersionPreExecuteGuardError(
      'BASE_PLAN_VERSION_STALE',
      `basePlanVersionId ${ctx.record.basePlanVersionId} no longer matches effective ${effective}`,
    );
  }
}

export function assertEffectivePlanVersionConsistency(
  ctx: PreExecuteGuardContext,
): void {
  const parent = ctx.planVersion.parentPlanVersionId;
  const expected =
    ctx.currentEffectivePlanVersionId ?? ctx.record.basePlanVersionId;
  if (parent !== expected) {
    throw new PlanVersionPreExecuteGuardError(
      'EFFECTIVE_PLAN_VERSION_MISMATCH',
      `PlanVersion parent ${parent ?? 'none'} does not match effective/base ${expected}`,
    );
  }
}

export function assertWorldStateSnapshotFreshness(
  ctx: PreExecuteGuardContext,
): void {
  const now = ctx.now ?? new Date();
  const snapshot = ctx.worldStateSnapshot;
  if (!snapshot || snapshot.snapshotId !== ctx.record.worldStateSnapshotId) {
    throw new PlanVersionPreExecuteGuardError(
      'WORLD_STATE_SNAPSHOT_STALE',
      `World state snapshot ${ctx.record.worldStateSnapshotId} not found`,
    );
  }

  const roadAssertions = ctx.snapshotAssertions.filter(
    (a) => a.predicate === 'road.status',
  ) as WorldStateAssertion<RoadStatusAssertionPayload>[];

  for (const assertion of roadAssertions) {
    if (assertion.status !== 'ACTIVE') {
      throw new PlanVersionPreExecuteGuardError(
        'WORLD_STATE_SNAPSHOT_STALE',
        `Assertion ${assertion.assertionId} is ${assertion.status}`,
      );
    }
    if (
      !assertion.validUntil ||
      new Date(assertion.validUntil).getTime() < now.getTime()
    ) {
      throw new PlanVersionPreExecuteGuardError(
        'WORLD_STATE_SNAPSHOT_STALE',
        `Assertion ${assertion.assertionId} expired at ${assertion.validUntil}`,
      );
    }
    if (
      ctx.activeRoadAssertion &&
      ctx.activeRoadAssertion.assertionId !== assertion.assertionId
    ) {
      throw new PlanVersionPreExecuteGuardError(
        'WORLD_STATE_SNAPSHOT_STALE',
        `Newer road assertion ${ctx.activeRoadAssertion.assertionId} supersedes snapshot`,
      );
    }
  }
}

export function assertAuthorizationNotExpired(
  ctx: PreExecuteGuardContext,
): void {
  const now = ctx.now ?? new Date();
  const authorizedAt = ctx.record.decidedAt;
  if (!authorizedAt) {
    throw new PlanVersionPreExecuteGuardError(
      'AUTHORIZATION_EXPIRED',
      'Decision has no authorization timestamp',
    );
  }
  const ageMs = now.getTime() - new Date(authorizedAt).getTime();
  if (ageMs > RFC001_AUTHORIZATION_VALIDITY_MS) {
    throw new PlanVersionPreExecuteGuardError(
      'AUTHORIZATION_EXPIRED',
      `Authorization expired (${ageMs}ms > ${RFC001_AUTHORIZATION_VALIDITY_MS}ms)`,
    );
  }
}

export function assertPlanVersionPreExecuteGuards(
  ctx: PreExecuteGuardContext,
): void {
  assertBasePlanVersionOptimisticLock(ctx);
  assertEffectivePlanVersionConsistency(ctx);
  assertWorldStateSnapshotFreshness(ctx);
  assertAuthorizationNotExpired(ctx);
}
