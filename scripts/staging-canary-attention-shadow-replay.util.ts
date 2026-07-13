/**
 * Prisma-only Unified Row collection for staging replay (no Nest bootstrap).
 * Reads trip.metadata.rfc001DecisionProblems — same SSOT used by canonical store.
 */

import type { PrismaClient } from '@prisma/client';
import type { InternalUnifiedProblemRow } from '../src/decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import type { Rfc001DecisionProblem } from '../src/trips/guardian-decision-core/contracts/decision-problem.types';
import type { Rfc001DecisionCenterProblemView } from '../src/trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import { buildStagingReplayEvidence } from '../src/trips/guardian-decision-core/attention/attention-shadow-staging-replay.util';
import type { StagingReplayScenarioSpec } from '../src/trips/guardian-decision-core/attention/attention-shadow-staging-replay.util';
import { runAttentionShadowProjection } from '../src/trips/guardian-decision-core/attention/attention-shadow-run.util';
import { AttentionShadowEvidenceWriter } from '../src/trips/guardian-decision-core/attention/attention-shadow-evidence.writer';
import type { AttentionShadowStagingReplayEvidence } from '../src/trips/guardian-decision-core/contracts/attention-orchestration.types';
import {
  buildAttentionSeedProblems,
  buildLineageOverlayFromSeedProblems,
  profileForScenario,
  type AttentionSeedProblem,
} from './staging-canary-attention-seed-problems.util';

const RFC001_METADATA_KEY = 'rfc001DecisionProblems';

const RFC001_TO_WORKFLOW: Record<string, InternalUnifiedProblemRow['workflowStatus']> = {
  OPEN: 'OPEN',
  EVALUATING: 'EVALUATING',
  WAITING_HUMAN: 'WAITING_HUMAN',
  DECIDED: 'DECIDED',
  EXECUTING: 'APPLYING',
  RESOLVED: 'RESOLVED',
  FAILED: 'FAILED',
};

export const ATTENTION_SHADOW_STAGING_SR5_TRIP_ID = 'c0a55555-5555-4555-8555-555555555555';

export async function tripExists(prisma: PrismaClient, tripId: string): Promise<boolean> {
  const row = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  return Boolean(row);
}

export async function collectStagingReplayRowsFromPrisma(
  prisma: PrismaClient,
  tripId: string,
): Promise<{
  rows: InternalUnifiedProblemRow[];
  rowSource: string;
  problemCount: number;
  lineageOverlay: Array<{ problemId: string; weatherEpisodeId?: string; causedByProblemId?: string }>;
}> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, metadata: true },
  });
  if (!trip) {
    return { rows: [], rowSource: 'TRIP_NOT_FOUND', problemCount: 0, lineageOverlay: [] };
  }

  const meta = trip.metadata as Record<string, unknown> | null;
  const block = meta?.rfc001DecisionProblems as { items?: AttentionSeedProblem[] } | undefined;
  const problems = block?.items ?? [];

  return {
    rows: problems.map((problem) => mapRfc001ProblemToUnifiedRow(problem)),
    rowSource: 'TRIP_METADATA_RFC001',
    problemCount: problems.length,
    lineageOverlay: buildLineageOverlayFromSeedProblems(problems),
  };
}

export async function applyScenarioProfileToTrip(
  prisma: PrismaClient,
  tripId: string,
  scenarioId: string,
): Promise<ReturnType<typeof collectStagingReplayRowsFromPrisma>> {
  const profile = profileForScenario(scenarioId);
  const problems = buildAttentionSeedProblems(profile);
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) {
    throw new Error(`trip ${tripId} not found — run npm run attention:staging-seed first`);
  }
  const meta = { ...(trip.metadata as Record<string, unknown>) };
  meta.rfc001DecisionProblems = {
    items: problems,
    lastUpdatedAt: new Date().toISOString(),
  };
  meta.attentionShadowSeed = {
    profile,
    scenarioId,
    appliedAt: new Date().toISOString(),
  };
  await prisma.trip.update({
    where: { id: tripId },
    data: { metadata: meta, updatedAt: new Date() },
  });
  return collectStagingReplayRowsFromPrisma(prisma, tripId);
}

function mapRfc001ProblemToUnifiedRow(problem: AttentionSeedProblem): InternalUnifiedProblemRow {
  const semanticKey = problem.semanticCapability ?? problem.type;
  const routeSegmentId = problem.affectedEntityRefs.find((r) => r.kind === 'ROUTE_SEGMENT')?.id;
  const view = buildMinimalCanonicalView(problem, semanticKey);

  return {
    problemId: problem.problemId,
    authority: 'CANONICAL',
    flow: 'CANONICAL_L2',
    semanticKey,
    instanceKey: `${semanticKey}:${problem.problemId}`,
    type: 'RISK',
    dimension: semanticKey.includes('WEATHER') ? 'ENVIRONMENT' : 'SCHEDULE',
    enforcement: semanticKey.includes('ROAD') ? 'BLOCK' : 'REQUIRE_CONFIRMATION',
    phase: 'EXECUTION',
    affectsPlan: true,
    workflowStatus: RFC001_TO_WORKFLOW[problem.status] ?? 'OPEN',
    executionStatus: 'NONE',
    title: humanTitle(semanticKey),
    summary: humanTitle(semanticKey),
    scope: {
      tripId: problem.tripId,
      itemIds: problem.affectedPlanItemIds?.length ? [...problem.affectedPlanItemIds] : undefined,
      routeSegmentIds: routeSegmentId ? [routeSegmentId] : undefined,
    },
    evidenceCount: 1,
    evidenceFreshness: 'FRESH',
    occurrenceCount: 1,
    occurrences: [{ observedAt: problem.detectedAt, source: 'RFC001' }],
    sourceIds: problem.triggerEventId ? [problem.triggerEventId] : [],
    detectors: [{ id: 'rfc001', label: 'RFC001' }],
    origin: { module: 'RFC001', detectorId: 'rfc001' },
    rawCanonical: view,
    queueTitle: humanTitle(semanticKey),
    queueDescription: humanTitle(semanticKey),
  };
}

function buildMinimalCanonicalView(
  problem: AttentionSeedProblem,
  semanticKey: string,
): Rfc001DecisionCenterProblemView {
  return {
    schemaId: 'tripnara.rfc001_problem_view@v1',
    tripId: problem.tripId,
    problemId: problem.problemId,
    problemSummary: {
      id: problem.problemId,
      tripId: problem.tripId,
      type: 'RISK',
      title: humanTitle(semanticKey),
      description: humanTitle(semanticKey),
      status: 'OPEN',
      detectedBy: 'RFC001',
      detectedAt: problem.detectedAt,
      tripVersion: 1,
      affectedScope: [],
      semanticKey,
      sourceRefs: [],
      assertionIds: [],
    },
    rfc001Problem: {
      ...problem,
      triggerEventId: problem.weatherEpisodeId
        ? `weather_episode:${problem.weatherEpisodeId}`
        : problem.triggerEventId,
    },
    leadingPersona: 'DECISION_CORE',
    requiresUserConfirmation: true,
    candidates: [],
    options: [],
    lineage: [],
  };
}

function humanTitle(semanticKey: string): string {
  return semanticKey.replace(/_/g, ' ').toLowerCase();
}

export function runStagingReplayFromPrismaRows(input: {
  spec: StagingReplayScenarioSpec;
  rows: InternalUnifiedProblemRow[];
  commitSha?: string;
  runId?: string;
  rowSource?: string;
  persistEvidence?: boolean;
  lineageOverlay?: Array<{ problemId: string; weatherEpisodeId?: string; causedByProblemId?: string }>;
}): { evidence: AttentionShadowStagingReplayEvidence; evidencePath?: string } {
  const output = runAttentionShadowProjection({
    tripId: input.spec.tripId,
    rows: input.rows,
    source: 'STAGING_REPLAY',
    sampleId: input.spec.scenarioId,
    sampleGroup: 'STAGING_REPLAY',
    lineageOverlay: input.lineageOverlay,
  });

  const evidence = buildStagingReplayEvidence({
    spec: input.spec,
    rows: input.rows,
    output,
    commitSha: input.commitSha,
    runId: input.runId,
  });

  if (input.rowSource && evidence.comparison.reason) {
    evidence.comparison.reason = `[${input.rowSource}] ${evidence.comparison.reason}`;
  } else if (input.rowSource) {
    evidence.comparison.reason = `[${input.rowSource}]`;
  }

  let evidencePath: string | undefined;
  if (input.persistEvidence !== false) {
    const writer = new AttentionShadowEvidenceWriter();
    evidencePath = writer.writeStagingReplay(evidence);
  }

  return { evidence, evidencePath };
}

export async function resolveStagingReplayTripId(
  prisma: PrismaClient,
  preferredTripId: string,
  opts?: { allowFallback?: boolean },
): Promise<{ tripId: string; note?: string }> {
  if (await tripExists(prisma, preferredTripId)) {
    return { tripId: preferredTripId };
  }
  if (opts?.allowFallback !== false && (await tripExists(prisma, ATTENTION_SHADOW_STAGING_SR5_TRIP_ID))) {
    return {
      tripId: ATTENTION_SHADOW_STAGING_SR5_TRIP_ID,
      note: `preferred trip ${preferredTripId} not found; using SR#5 staging canary ${ATTENTION_SHADOW_STAGING_SR5_TRIP_ID}`,
    };
  }
  return {
    tripId: preferredTripId,
    note: `trip ${preferredTripId} not found on staging — run: npm run attention:staging-seed`,
  };
}
