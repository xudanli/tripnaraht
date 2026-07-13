/**
 * Exec Slip Canary — TEP recoveryGraph fixture for Phase D userActions labels.
 */

import {
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_ACTIVITY_B_ID,
  EXEC_SLIP_CANARY_ACTIVITY_C_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import { RECOVERY_GRAPH_SCHEMA } from '../src/trips/tep/contracts/tep-self-drive.types';
import { buildTepPlanVersionMetadata } from '../src/trips/tep/contracts/tep-plan-metadata.types';
import type { RecoveryGraph } from '../src/trips/tep/contracts/tep-self-drive.types';

export function buildExecSlipCanaryRecoveryGraph(): RecoveryGraph {
  return {
    schemaId: RECOVERY_GRAPH_SCHEMA,
    removableNodes: [],
    movableNodes: [EXEC_SLIP_CANARY_ACTIVITY_A_ID],
    replaceableNodes: [EXEC_SLIP_CANARY_ACTIVITY_B_ID],
    protectedNodes: [EXEC_SLIP_CANARY_ACTIVITY_B_ID],
    dependencies: [],
    fallbackOptions: [
      {
        optionId: 'REPAIR-EXEC-SLIP-SUBSTITUTE-C',
        triggerRuleId: 'SDR-302',
        action: 'REPLACE',
        targetRefs: [EXEC_SLIP_CANARY_ACTIVITY_B_ID, EXEC_SLIP_CANARY_ACTIVITY_C_ID],
        description: '改走 Exec Slip Canary POI C（Substitute），预计仍可在 16:00 前入场',
        replacementRef: `activity_${EXEC_SLIP_CANARY_ACTIVITY_C_ID}`,
        replacementPoiId: String(EXEC_SLIP_CANARY_ACTIVITY_C_ID),
      },
      {
        optionId: 'REPAIR-EXEC-SLIP-EARLY-DEPART-A',
        triggerRuleId: 'SDR-101',
        action: 'SHIFT',
        targetRefs: [EXEC_SLIP_CANARY_ACTIVITY_A_ID],
        description: '从 POI A 提前 30 分钟出发，为 POI B 预留更多路程时间',
      },
    ],
  };
}

export function buildExecSlipCanaryTepPlanMetadata(syncedAt?: string) {
  return buildTepPlanVersionMetadata({
    decisionHooks: [],
    recoveryGraph: buildExecSlipCanaryRecoveryGraph(),
    syncedAt: syncedAt ?? new Date().toISOString(),
  });
}

export function patchExecSlipCanaryPlanVersionMetadata(
  metadata: Record<string, unknown>,
  syncedAt?: string,
): Record<string, unknown> {
  const planVersions = metadata.rfc001PlanVersions as
    | { items?: Array<Record<string, unknown>>; effectivePlanVersionId?: string }
    | undefined;
  if (!planVersions?.items?.length) return metadata;

  const effectiveId = planVersions.effectivePlanVersionId ?? 'plan_1';
  const items = planVersions.items.map((item) => {
    const isEffective =
      item.planVersionId === effectiveId || item.status === 'EFFECTIVE';
    if (!isEffective) return item;
    const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
    return {
      ...item,
      metadata: {
        ...itemMeta,
        tep: buildExecSlipCanaryTepPlanMetadata(syncedAt),
      },
    };
  });

  return {
    ...metadata,
    executionSlipCanaryDrill: {
      ...((metadata.executionSlipCanaryDrill as Record<string, unknown>) ?? {}),
      knowledgeScope: 'wind_slip_infeasible_only',
      substituteActivityId: EXEC_SLIP_CANARY_ACTIVITY_C_ID,
    },
    rfc001PlanVersions: {
      ...planVersions,
      items,
      lastUpdatedAt: syncedAt ?? new Date().toISOString(),
    },
  };
}

export const EXEC_SLIP_CANARY_TRIP_ID_EXPORT = EXEC_SLIP_CANARY_TRIP_ID;
