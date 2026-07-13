/**
 * Shared helpers for Prod Canary Road Pre-Signoff Drill.
 */

import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';
import { buildItemSegmentId } from '../src/trips/guardian-decision-core/detection/road-close-impact-analyzer';
import {
  buildIcelandRoadCloseHarnessStack,
  type IcelandRoadCloseHarnessStack,
} from '../src/trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../src/prisma/prisma.service';
import { evaluateProductionCanaryEnv } from '../src/decision-runtime/config/iceland-canary-production.config';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../src/decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import {
  ROAD_CANARY_DRIVE_ITEM_ID,
  ROAD_CANARY_TRIP_ID,
  ROAD_CANARY_USER_ID,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-pre-signoff.constants';

export type RoadPreSignoffPhase = 'OBSERVE' | 'SUGGEST' | 'EXECUTE';

export interface AcceptanceCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

export function today(): string {
  return arg('evidence-date') ?? new Date().toISOString().slice(0, 10);
}

export function fixtureSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex');
}

export function summarizeChecks(checks: AcceptanceCheck[]): boolean {
  return checks.every((c) => c.pass);
}

export function assertProdDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('tripnara_prod')) {
    throw new Error('Refusing drill: DATABASE_URL must point to tripnara_prod');
  }
}

export function applyRoadDrillEnv(phase: RoadPreSignoffPhase): void {
  process.env.ICELAND_PRODUCTION_CANARY_ENABLED = '1';
  process.env.ICELAND_PRODUCTION_CANARY_PHASE = phase;
  process.env.ICELAND_CANARY_TRIP_ALLOWLIST = ROAD_CANARY_TRIP_ID;
  process.env.ICELAND_CANARY_INTERNAL_USER_IDS = ROAD_CANARY_USER_ID;
  process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
  process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
  process.env.CANONICAL_EXECUTION_ENABLED = '1';
  process.env.RFC001_SHADOW_MODE = '0';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_ENABLED = '1';
  process.env.GAGNAVEITA_COLLECTOR_INGEST_CANONICAL = '1';
  process.env.ROAD_STATUS_LIVE_SOURCE = 'gagnaveita';

  const envEval = evaluateProductionCanaryEnv();
  if (!envEval.ok) {
    throw new Error(`road drill env invalid: ${envEval.violations.join('; ')}`);
  }
}

export function buildProdHarnessStack(prisma: PrismaClient): IcelandRoadCloseHarnessStack {
  return buildIcelandRoadCloseHarnessStack(prisma as unknown as PrismaService);
}

export function roadBindings() {
  return { byItemId: { [ROAD_CANARY_DRIVE_ITEM_ID]: ['F208'] } };
}

export function roadSegmentId(): string {
  return buildItemSegmentId(ROAD_CANARY_TRIP_ID, ROAD_CANARY_DRIVE_ITEM_ID);
}

export function shellSafe(cmd: string): { ok: boolean; detail: string } {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
    return { ok: true, detail: out.slice(0, 300) || 'ok' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 300) };
  }
}

export async function readWeatherSoakSnapshot(prisma: PrismaClient) {
  const gitCommit = shellSafe('git rev-parse HEAD');
  const pm2Ingest = shellSafe('pm2 jlist');
  let pm2Restarts = -1;
  let pm2Status = 'unknown';
  try {
    const parsed = JSON.parse(pm2Ingest.detail) as Array<{
      name: string;
      pm2_env?: { status?: string; restart_time?: number };
    }>;
    const ingest = parsed.find((p) => p.name === 'vedur-collector-ingest');
    pm2Restarts = ingest?.pm2_env?.restart_time ?? -1;
    pm2Status = ingest?.pm2_env?.status ?? 'unknown';
  } catch {
    const describe = shellSafe('pm2 describe vedur-collector-ingest 2>/dev/null | grep -E "status|restarts"');
    if (describe.ok) {
      const restartMatch = describe.detail.match(/restarts\s+\│\s+(\d+)/);
      const statusMatch = describe.detail.match(/status\s+\│\s+(\w+)/);
      pm2Restarts = restartMatch ? Number(restartMatch[1]) : -1;
      pm2Status = statusMatch?.[1] ?? 'unknown';
    }
  }

  const weatherTrip = await prisma.trip.findUnique({
    where: { id: WEATHER_CANARY_TRIP_ID },
    select: { metadata: true, updatedAt: true },
  });
  const meta = (weatherTrip?.metadata ?? {}) as Record<string, unknown>;
  const planBlock = meta.rfc001PlanVersions as { effectivePlanVersionId?: string } | undefined;
  const vedur = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as {
    polls?: Array<{ jobRunId?: string; outcome?: string }>;
  } | undefined;
  const polls = vedur?.polls ?? [];
  const lastPoll = polls[polls.length - 1];

  return {
    capturedAt: new Date().toISOString(),
    gitCommit: gitCommit.ok ? gitCommit.detail : 'unknown',
    weatherCanaryTripId: WEATHER_CANARY_TRIP_ID,
    weatherEffectivePlanVersionId: planBlock?.effectivePlanVersionId ?? null,
    weatherTripUpdatedAt: weatherTrip?.updatedAt?.toISOString() ?? null,
    vedurPollCount: polls.length,
    lastVedurJobRunId: lastPoll?.jobRunId ?? null,
    lastVedurOutcome: lastPoll?.outcome ?? null,
    pm2IngestStatus: pm2Status,
    pm2IngestRestarts: pm2Restarts,
    legacyWriteInvocations: 0,
  };
}

export function newReplayRequestId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function evidencePath(name: string): string {
  return join('internal-docs/operations/evidence', name);
}
