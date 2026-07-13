/**
 * Execution Slip Canary drill utilities (Sprint 4 Slice 3).
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { sign } from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import {
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_USER_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  ROAD_CANARY_TRIP_ID,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-pre-signoff.constants';
import {
  isTripOnIcelandCanaryAllowlist,
  parseIcelandCanaryTripAllowlist,
} from '../src/decision-runtime/config/iceland-canary-production.config';
import type { Rfc001DecisionProblem } from '../src/trips/guardian-decision-core/contracts/decision-problem.types';
import type { DecisionWorkspace } from '../src/trips/guardian-decision-core/contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../src/trips/guardian-decision-core/contracts/decision-record.types';
import type { ExecutionDepartureObservation } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';

export interface AcceptanceCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export type ExecSlipStagingPhase = 'A' | 'B' | 'C' | 'ROLLBACK' | 'SHADOW';

export function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const flag = process.argv.indexOf(`--${name}`);
  if (flag >= 0 && process.argv[flag + 1] && !process.argv[flag + 1].startsWith('--')) {
    return process.argv[flag + 1];
  }
  return fallback;
}

export function today(): string {
  return arg('evidence-date') ?? new Date().toISOString().slice(0, 10);
}

export function summarizeChecks(checks: AcceptanceCheck[]): boolean {
  return checks.every((c) => c.pass);
}

export function assertProdDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('tripnara_prod') && process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error(
      'Execution slip drill targets tripnara_prod. Set EXEC_SLIP_DRILL_ALLOW_PROD=1 to confirm.',
    );
  }
}

export function gitCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function mintCanaryJwt(userId = EXEC_SLIP_CANARY_USER_ID): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET required for staging HTTP auth');
  return sign({ sub: userId, email: 'exec-slip-canary@tripnara.dev' }, secret, {
    expiresIn: '2h',
  });
}

export async function httpJson<T>(
  method: string,
  url: string,
  opts?: { token?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  if (opts?.body) headers['Content-Type'] = 'application/json';
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

export function tripMetadata(metadata: unknown): Record<string, unknown> {
  return (metadata ?? {}) as Record<string, unknown>;
}

export function listProblems(meta: Record<string, unknown>): Rfc001DecisionProblem[] {
  const block = meta.rfc001DecisionProblems as { items?: Rfc001DecisionProblem[] } | undefined;
  return block?.items ?? [];
}

export function openProblems(meta: Record<string, unknown>): Rfc001DecisionProblem[] {
  return listProblems(meta).filter(
    (p) => !['RESOLVED', 'FAILED'].includes(p.status),
  );
}

export function listWorkspaces(meta: Record<string, unknown>): DecisionWorkspace[] {
  const block = meta.rfc001DecisionWorkspaces as { items?: DecisionWorkspace[] } | undefined;
  return block?.items ?? [];
}

export function latestWorkspaceForProblem(
  meta: Record<string, unknown>,
  problemId: string,
): DecisionWorkspace | undefined {
  return [...listWorkspaces(meta)]
    .reverse()
    .find((w) => w.problemId === problemId);
}

export function listObservations(meta: Record<string, unknown>): ExecutionDepartureObservation[] {
  const store = meta.executionDepartureObservations as
    | Record<string, ExecutionDepartureObservation>
    | undefined;
  return Object.values(store ?? {});
}

export function listLedger(meta: Record<string, unknown>): Rfc001DecisionRecord[] {
  const block = meta.rfc001DecisionLedger as { items?: Rfc001DecisionRecord[] } | undefined;
  return block?.items ?? [];
}

export function latestDecisionForProblem(
  meta: Record<string, unknown>,
  problemId: string,
): Rfc001DecisionRecord | undefined {
  const ref = meta.rfc001DecisionRef as { problemId?: string; decisionId?: string } | undefined;
  if (ref?.problemId === problemId && ref.decisionId) {
    return listLedger(meta).find((d) => d.decisionId === ref.decisionId);
  }
  return [...listLedger(meta)].reverse().find((d) => d.problemId === problemId);
}

export function effectivePlanVersionId(meta: Record<string, unknown>): string | undefined {
  const block = meta.rfc001PlanVersions as { effectivePlanVersionId?: string } | undefined;
  return block?.effectivePlanVersionId;
}

export function planVersionCount(meta: Record<string, unknown>): number {
  const block = meta.rfc001PlanVersions as { items?: unknown[] } | undefined;
  return block?.items?.length ?? 0;
}

export function legacyWriteCount(meta: Record<string, unknown>): number {
  return Number(meta.legacyWriteInvocations ?? 0);
}

export function worldStateAssertions(meta: Record<string, unknown>): Array<{ predicate?: string }> {
  const ws = meta.rfc001WorldState as { assertions?: Array<{ predicate?: string }> } | undefined;
  return ws?.assertions ?? [];
}

export function isOnWeatherOrRoadAllowlist(tripId: string): boolean {
  if (tripId === WEATHER_CANARY_TRIP_ID || tripId === ROAD_CANARY_TRIP_ID) return true;
  return isTripOnIcelandCanaryAllowlist(tripId);
}

export function allowlistTripIds(): string[] {
  return [...parseIcelandCanaryTripAllowlist()];
}

export async function loadTrip(prisma: PrismaClient, tripId = EXEC_SLIP_CANARY_TRIP_ID) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, metadata: true, updatedAt: true },
  });
  if (!trip) throw new Error(`Canary trip ${tripId} not found — run setup first`);
  return trip;
}

export function stagingStatePath(): string {
  return `internal-docs/operations/evidence/execution-slip-staging-state-${today()}.json`;
}

export function evidencePath(phase: string): string {
  const suffix =
    phase === 'A'
      ? 'a'
      : phase === 'B'
        ? 'b'
        : phase === 'C'
          ? 'c'
          : phase === 'ROLLBACK'
            ? 'rollback'
            : 'shadow';
  return `internal-docs/operations/evidence/execution-slip-staging-${suffix}-${today()}.json`;
}

export function requireProdWrite(): void {
  if (process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set EXEC_SLIP_DRILL_ALLOW_PROD=1 to write execution slip canary on tripnara_prod');
  }
}

export function assertInitialPlan(meta: Record<string, unknown>): AcceptanceCheck {
  const effective = effectivePlanVersionId(meta);
  return {
    id: 'SEED-PLAN',
    pass: effective === EXEC_SLIP_INITIAL_PLAN_ID,
    detail: `effectivePlanVersionId=${effective ?? 'missing'} expected=${EXEC_SLIP_INITIAL_PLAN_ID}`,
  };
}
