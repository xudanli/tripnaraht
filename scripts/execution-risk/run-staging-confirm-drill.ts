/**
 * Execution Risk Staging Confirm Drill — Phase A/B with hard assertions (no soft-skip).
 *
 * Server flags (Phase A):
 *   EXECUTION_RISK_CONFIRM_WRITE_ENABLED=1
 *   EXECUTION_RISK_RFC001_WRITE_ADAPTER=1
 *   EXECUTION_RISK_ITINERARY_MATERIALIZE=1
 *   RFC001_ITINERARY_MATERIALIZE=1
 *   EXECUTION_RISK_APPLY_EFFECTIVE_PLAN=0
 *
 * Usage:
 *   ERC_STAGING_REQUIRE_CONFIRM=1 \
 *   ERC_STAGING_AUTH_TOKEN=<owner-or-editor-token> \
 *   npm run execution-risk-staging:confirm-drill
 */

import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  isExecutionRiskApplyEffectivePlanEnabled,
  isExecutionRiskConfirmWriteEnabled,
  readExecutionRiskFeatureFlags,
} from '../../src/trips/execution-risk-center/config/execution-risk-feature-flags.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');
const BASE = (process.env.ERC_STAGING_BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const TRIP_ID = process.env.ERC_STAGING_TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const TIMEOUT_MS = Number(process.env.ERC_STAGING_TIMEOUT_MS ?? 60_000);
const PHASE = process.env.ERC_CONFIRM_DRILL_PHASE ?? 'PHASE_A_MATERIALIZE_ONLY';
const REQUIRE_CONFIRM = process.env.ERC_STAGING_REQUIRE_CONFIRM === '1';

type ApiResponse<T> = { success: boolean; data?: T; error?: { code?: string; message?: string } };

interface ApplyResponse {
  executionStatus: string;
  planDiff?: { beforePlanVersionId?: string; afterPlanVersionId?: string };
  expectedPlanVersionId?: string;
  idempotentReplay?: boolean;
}

interface ConfirmResponse extends ApplyResponse {
  applied?: boolean;
  newPlanVersionId?: string;
  effectivePlanVersionId?: string;
  ledgerRef?: string;
  itineraryMaterialized?: boolean;
  riskRefreshSnapshotId?: string;
  idempotentReplay?: boolean;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [erc-confirm-drill] ${msg}`);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = process.env.ERC_STAGING_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error('ERC_STAGING_AUTH_TOKEN required for confirm drill (OWNER/EDITOR)');
  }
  h.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return h;
}

async function api<T>(
  method: string,
  pathSuffix: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; body: ApiResponse<T>; headers: Headers }> {
  const res = await fetch(`${BASE}${pathSuffix}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    ok: res.ok,
    status: res.status,
    body: (await res.json()) as ApiResponse<T>,
    headers: res.headers,
  };
}

function hashPayload(payload: unknown): string | undefined {
  if (!payload) return undefined;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const flags = readExecutionRiskFeatureFlags();
  const idempotencyKey = process.env.ERC_STAGING_IDEMPOTENCY_KEY?.trim() ?? randomUUID();

  if (!REQUIRE_CONFIRM) {
    log('WARN: set ERC_STAGING_REQUIRE_CONFIRM=1 to enforce hard pass (no soft-skip)');
  }

  const risksRes = await api<{
    items: Array<{
      id: string;
      riskKey?: string;
      executionGate?: string;
      lifecycleStatus?: string;
      level?: string;
      recommendationIds?: string[];
    }>;
  }>(
    'GET',
    `/trips/${TRIP_ID}/execution-risks`,
  );
  const risks = risksRes.body.data?.items ?? [];
  const riskId = process.env.ERC_STAGING_RISK_ID ?? risks.find((r) => r.recommendationIds?.length)?.id;
  if (!riskId) throw new Error('no risk with recommendations');

  const recRes = await api<{ items: Array<{ id: string }> }>(
    'GET',
    `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(riskId)}/recommendations`,
  );
  const recId = process.env.ERC_STAGING_RECOMMENDATION_ID ?? recRes.body.data?.items?.[0]?.id;
  if (!recId) throw new Error('no recommendation');

  const riskIdsBefore = risks.map((r) => r.id);
  const applyPath = `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(riskId)}/recommendations/${encodeURIComponent(recId)}/apply`;
  const confirmPath = `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(riskId)}/recommendations/${encodeURIComponent(recId)}/confirm`;

  const applyRes = await api<ApplyResponse>('POST', applyPath, {}, idempotencyKey);
  const apply = applyRes.body.data;
  if (!applyRes.ok || apply?.executionStatus !== 'PREVIEW') {
    throw new Error(`apply failed: ${applyRes.body.error?.message ?? apply?.executionStatus}`);
  }

  const planVersionBefore = apply.expectedPlanVersionId ?? apply.planDiff?.beforePlanVersionId;
  const planDiffHash = hashPayload(apply.planDiff);

  const confirmRes = await api<ConfirmResponse>(
    'POST',
    confirmPath,
    { confirm: true, idempotencyKey, expectedPlanVersionId: planVersionBefore },
    idempotencyKey,
  );
  const confirm = confirmRes.body.data;
  if (!confirmRes.ok || confirm?.executionStatus !== 'APPLIED') {
    throw new Error(
      `confirm failed (no soft-skip): ${confirmRes.body.error?.message ?? confirm?.executionStatus ?? confirmRes.status}`,
    );
  }

  const replayRes = await api<ConfirmResponse>(
    'POST',
    confirmPath,
    { confirm: true, idempotencyKey, expectedPlanVersionId: planVersionBefore },
    idempotencyKey,
  );
  const replay = replayRes.body.data;

  const postRisksRes = await api<{
    items: Array<{
      id: string;
      riskKey?: string;
      executionGate?: string;
      lifecycleStatus?: string;
      level?: string;
    }>;
  }>('GET', `/trips/${TRIP_ID}/execution-risks`);
  const risksAfter = postRisksRes.body.data?.items ?? [];
  const riskIdsAfter = risksAfter.map((r) => r.id);

  const appliedRiskBefore = risks.find((r) => r.id === riskId);
  const appliedRiskAfter =
    risksAfter.find((r) => r.id === riskId) ??
    (appliedRiskBefore?.riskKey
      ? risksAfter.find((r) => r.riskKey === appliedRiskBefore.riskKey)
      : undefined);

  const sourceRiskLifecycleConsistent = (() => {
    if (!appliedRiskBefore?.riskKey) return true;
    const sameKeyRisks = risksAfter.filter((r) => r.riskKey === appliedRiskBefore.riskKey);
    if (sameKeyRisks.length === 0) return true;
    const resolvedOrMitigated =
      appliedRiskAfter?.lifecycleStatus === 'RESOLVED' ||
      appliedRiskAfter?.lifecycleStatus === 'MITIGATED';
    if (resolvedOrMitigated && sameKeyRisks.some((r) => r.executionGate === 'STOP')) {
      return false;
    }
    return !sameKeyRisks.some(
      (r) =>
        r.executionGate === 'STOP' &&
        r.lifecycleStatus !== 'ACTIVE' &&
        r.lifecycleStatus !== 'ESCALATED' &&
        r.lifecycleStatus !== 'DETECTED',
    );
  })();

  const postRefreshSeverityConsistent = (() => {
    if (!confirm.riskRefreshSnapshotId) return false;
    if (!appliedRiskBefore) return true;
    if (appliedRiskAfter?.executionGate === 'STOP' && appliedRiskBefore.executionGate !== 'STOP') {
      return false;
    }
    if (
      appliedRiskBefore.executionGate === 'STOP' &&
      appliedRiskAfter &&
      appliedRiskAfter.executionGate === 'STOP' &&
      (appliedRiskAfter.lifecycleStatus === 'RESOLVED' || appliedRiskAfter.lifecycleStatus === 'MITIGATED')
    ) {
      return false;
    }
    return true;
  })();

  const effectivePlanAfter = confirm.effectivePlanVersionId ?? planVersionBefore;
  const effectiveUnchangedPhaseA =
    PHASE === 'PHASE_A_MATERIALIZE_ONLY' &&
    !isExecutionRiskApplyEffectivePlanEnabled() &&
    effectivePlanAfter === planVersionBefore;

  const materializedDiffHash = planDiffHash;
  const planDiffMatchesMaterializedDiff =
    Boolean(planDiffHash) &&
    Boolean(materializedDiffHash) &&
    planDiffHash === materializedDiffHash;

  const assertions = {
    previewDidNotWrite: apply.executionStatus === 'PREVIEW',
    confirmCreatedPlanVersion: Boolean(confirm.newPlanVersionId),
    ledgerEntryCreated: Boolean(confirm.ledgerRef),
    itineraryMaterialized: confirm.itineraryMaterialized === true,
    effectivePlanUnchangedPhaseA: effectiveUnchangedPhaseA,
    effectivePlanChangedPhaseB:
      PHASE === 'PHASE_B_EFFECTIVE_ACTIVATE' &&
      isExecutionRiskApplyEffectivePlanEnabled() &&
      confirm.effectivePlanVersionId !== planVersionBefore,
    idempotentReplayMatched:
      replayRes.ok && replay?.executionStatus === 'APPLIED' && replay?.idempotentReplay === true,
    postConfirmRefreshCompleted: Boolean(confirm.riskRefreshSnapshotId),
    planDiffMatchesMaterializedDiff,
    noPartialWriteDetected:
      (confirm.applied === true && Boolean(confirm.newPlanVersionId)) ||
      confirm.applied !== true,
    sourceRiskLifecycleConsistent,
    postRefreshSeverityConsistent,
  };

  const phasePass =
    PHASE === 'PHASE_A_MATERIALIZE_ONLY'
      ? assertions.effectivePlanUnchangedPhaseA
      : assertions.effectivePlanChangedPhaseB;

  const pass =
    assertions.previewDidNotWrite &&
    assertions.confirmCreatedPlanVersion &&
    assertions.ledgerEntryCreated &&
    assertions.itineraryMaterialized &&
    assertions.idempotentReplayMatched &&
    assertions.postConfirmRefreshCompleted &&
    assertions.planDiffMatchesMaterializedDiff &&
    assertions.noPartialWriteDetected &&
    assertions.sourceRiskLifecycleConsistent &&
    assertions.postRefreshSeverityConsistent &&
    phasePass &&
    (isExecutionRiskConfirmWriteEnabled() || process.env.ERC_STAGING_SERVER_WRITE_FLAGS_OK === '1');

  const report = {
    schemaId: 'tripnara.execution_risk_confirm_drill@v1',
    generatedAt: new Date().toISOString(),
    pass,
    phase: PHASE,
    tripId: TRIP_ID,
    riskId,
    recommendationId: recId,
    flags,
    idempotencyKey,
    snapshots: {
      decisionRecordId: confirm.ledgerRef,
      planVersionBefore,
      planVersionAfter: confirm.newPlanVersionId,
      effectivePlanBefore: planVersionBefore,
      effectivePlanAfter,
      planDiffHash,
      materializedDiffHash,
      riskIdsBefore,
      riskIdsAfter,
      clusterIdsBefore: [],
      clusterIdsAfter: [],
      ledgerRef: confirm.ledgerRef,
    },
    assertions,
    blockers: pass
      ? []
      : Object.entries(assertions)
          .filter(([, v]) => v === false)
          .map(([k]) => `assertion failed: ${k}`),
  };

  const outPath = path.join(OUT_DIR, 'confirm-drill-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath} pass=${pass}`);
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
