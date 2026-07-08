import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CausalRuntimeSessionService } from '../../trips/causal-runtime/causal-runtime-session.service';
import {
  buildIcelandCausalTraceSeed,
  extractTravelHintsFromMessage,
  isTravelOrTransportProblem,
} from '../adapters/iceland-causal-trace.adapter';
import {
  CAUSAL_TRACE_PROTOCOL_VERSION,
  type CausalTraceReference,
} from '../causal-trace-reference.types';
import type { CausalOptionRef } from '../causal-trace-node.types';
import {
  CANONICAL_CAUSAL_TRACE_SCHEMA,
  type CanonicalCausalTraceV1,
} from '../causal-trace.types';
import { projectCausalStoryView } from '../projectors/causal-story-view.projector';
import type { CausalStoryPersona, CausalStoryView } from '../causal-story-view.types';
import { CAUSAL_SOURCE_REGISTRY } from '../causal-source.registry';
import { assertCausalTraceRefFresh } from '../errors/causal-trace-stale.error';
import { CanonicalCausalTraceStore } from './canonical-causal-trace.store';
import { CanonicalCausalTracePersistenceService } from './canonical-causal-trace-persistence.service';
import {
  CAUSAL_TRACE_REPLAY_SCHEMA,
  type CausalTraceReplayView,
} from '../causal-trace-replay.types';

export interface EnsureProblemTraceInput {
  tripId: string;
  problemId: string;
  worldStateVersion: string;
  triggerType?: string;
  triggerSource?: string;
  semanticKey?: string;
  problemType?: string;
  dimension?: string;
  diagnosticMessage?: string;
  destination?: string | null;
}

@Injectable()
export class CanonicalCausalTraceService {
  private readonly store = new CanonicalCausalTraceStore();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly causalSession?: CausalRuntimeSessionService,
    @Optional() private readonly persistence?: CanonicalCausalTracePersistenceService,
  ) {}

  private commit(trace: CanonicalCausalTraceV1): CanonicalCausalTraceV1 {
    this.store.save(trace);
    void this.persistence?.upsertTrace(trace).catch(() => undefined);
    return trace;
  }

  private async ensureHydrated(tripId: string): Promise<void> {
    await this.persistence?.hydrateTrip(tripId, this.store);
  }

  toRef(trace: CanonicalCausalTraceV1): CausalTraceReference {
    return {
      traceId: trace.traceId,
      worldStateVersion: trace.worldStateVersion,
      protocolVersion: CAUSAL_TRACE_PROTOCOL_VERSION,
    };
  }

  async resolveWorldStateVersion(tripId: string, tripVersion?: string): Promise<string> {
    if (tripVersion?.trim()) {
      return `ws_${tripVersion.trim()}`;
    }
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true },
    });
    const stamp = trip?.updatedAt?.toISOString?.() ?? new Date().toISOString();
    return `ws_${stamp}`;
  }

  getTrace(traceId: string): CanonicalCausalTraceV1 | undefined {
    return this.store.get(traceId);
  }

  buildStoryView(
    trace: CanonicalCausalTraceV1,
    persona: CausalStoryPersona = 'neutral',
  ): CausalStoryView {
    return projectCausalStoryView(trace, persona);
  }

  buildStoryViewForProblem(
    tripId: string,
    problemId: string,
    persona: CausalStoryPersona = 'neutral',
  ): CausalStoryView | undefined {
    const ref = this.getActiveRef(tripId, problemId);
    if (!ref) return undefined;
    const trace = this.getTrace(ref.traceId);
    if (!trace) return undefined;
    return this.buildStoryView(trace, persona);
  }

  getActiveRef(tripId: string, problemId: string): CausalTraceReference | undefined {
    const traceId = this.store.getActiveTraceId(tripId, problemId);
    if (!traceId) return undefined;
    const trace = this.store.get(traceId);
    return trace ? this.toRef(trace) : undefined;
  }

  /** Prefer terminal traces (CALIBRATED/EXECUTED) for replay over stale/active preview handles */
  findBestTraceForProblem(tripId: string, problemId: string): CanonicalCausalTraceV1 | undefined {
    const rank = (status: CanonicalCausalTraceV1['status']): number => {
      switch (status) {
        case 'CALIBRATED':
          return 5;
        case 'EXECUTED':
          return 4;
        case 'SELECTED':
          return 3;
        case 'EXECUTING':
          return 2;
        case 'PREVIEW':
          return 1;
        default:
          return 0;
      }
    };
    const matches = this.store
      .listForTrip(tripId)
      .filter((t) => t.problems.some((p) => p.problemId === problemId));
    if (!matches.length) return undefined;
    return [...matches].sort(
      (a, b) => rank(b.status) - rank(a.status) || b.updatedAt.localeCompare(a.updatedAt),
    )[0];
  }

  async getTraceReplay(tripId: string, problemId: string): Promise<CausalTraceReplayView | undefined> {
    await this.ensureHydrated(tripId);
    const trace =
      this.findBestTraceForProblem(tripId, problemId) ??
      (() => {
        const ref = this.getActiveRef(tripId, problemId);
        return ref ? this.getTrace(ref.traceId) : undefined;
      })();
    if (!trace) return undefined;
    const ref = this.toRef(trace);
    return {
      schemaId: CAUSAL_TRACE_REPLAY_SCHEMA,
      tripId,
      problemId,
      generatedAt: new Date().toISOString(),
      ref,
      trace,
      causalStoryView: this.buildStoryView(trace, 'neutral'),
      guardianCausalStoryView: this.buildStoryView(trace, 'abu'),
    };
  }

  async ensureProblemTrace(input: EnsureProblemTraceInput): Promise<CanonicalCausalTraceV1> {
    await this.ensureHydrated(input.tripId);
    const activeId = this.store.getActiveTraceId(input.tripId, input.problemId);
    if (activeId) {
      const existing = this.store.get(activeId);
      if (existing) {
        if (existing.worldStateVersion !== input.worldStateVersion) {
          if (existing.status === 'CALIBRATED' || existing.status === 'EXECUTED') {
            return existing;
          }
          this.store.markStale(activeId);
          const stale = this.store.get(activeId);
          if (stale) this.commit(stale);
        } else {
          return existing;
        }
      }
    }

    const now = new Date().toISOString();
    const traceId = `ct_${randomBytes(8).toString('hex')}`;
    const tripRow = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { destination: true, metadata: true },
    });
    const destination = input.destination ?? tripRow?.destination;
    const tripMeta = (tripRow?.metadata ?? {}) as Record<string, unknown>;
    const strongWindSeed = tripMeta.inTripStrongWindSeed as
      | { problemId?: string; windMps?: number; routeLabel?: string }
      | undefined;
    const windMpsOverride =
      strongWindSeed?.problemId === input.problemId && typeof strongWindSeed.windMps === 'number'
        ? strongWindSeed.windMps
        : undefined;

    const travelHints = extractTravelHintsFromMessage(input.diagnosticMessage);
    const sessionAssessment = this.causalSession
      ?.getForTrip(input.tripId)
      ?.state.signals.icelandSelfDriveCausalAssessment;

    const icelandSeed =
      isTravelOrTransportProblem(input) || sessionAssessment
        ? buildIcelandCausalTraceSeed({
            tripId: input.tripId,
            problemId: input.problemId,
            destination,
            routeLabel: strongWindSeed?.routeLabel ?? travelHints.routeLabel,
            distanceKm: travelHints.distanceKm,
            durationMinutes: travelHints.durationMinutes,
            windMps: windMpsOverride,
            sessionAssessment,
          })
        : undefined;

    const trace: CanonicalCausalTraceV1 = {
      schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
      traceId,
      tripId: input.tripId,
      worldStateVersion: input.worldStateVersion,
      createdAt: now,
      updatedAt: now,
      trigger: {
        type: input.triggerType ?? 'DECISION_PROBLEM_OPEN',
        source: icelandSeed
          ? CAUSAL_SOURCE_REGISTRY.ICELAND_SELF_DRIVE_RUNTIME
          : CAUSAL_SOURCE_REGISTRY.GATEWAY_ASSERTION,
        observedAt: now,
      },
      facts: icelandSeed?.facts ?? [],
      effects: icelandSeed?.effects ?? [],
      problems: [
        icelandSeed?.problem ?? {
          problemId: input.problemId,
          problemType: input.problemType,
          severity: 'WARNING',
          assessmentKey: input.diagnosticMessage,
        },
      ],
      options: [],
      status: 'PREVIEW',
    };

    return this.commit(trace);
  }

  bindPreview(input: {
    traceId: string;
    optionId: string;
    problemId: string;
    metricsBefore?: Record<string, number>;
    metricsAfter?: Record<string, number>;
  }): CanonicalCausalTraceV1 | undefined {
    const trace = this.store.get(input.traceId);
    if (!trace) return undefined;

    const option: CausalOptionRef = {
      optionId: input.optionId,
      problemId: input.problemId,
      metricsBefore: input.metricsBefore,
      metricsAfter: input.metricsAfter,
    };
    const others = trace.options.filter((o) => o.optionId !== input.optionId);
    const updated: CanonicalCausalTraceV1 = {
      ...trace,
      options: [...others, option],
      selectedOptionId: input.optionId,
      status: 'PREVIEW',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(updated);
  }

  bindSelected(input: {
    traceId: string;
    optionId: string;
    executionRef?: string;
  }): CanonicalCausalTraceV1 | undefined {
    const trace = this.store.get(input.traceId);
    if (!trace) return undefined;
    const updated: CanonicalCausalTraceV1 = {
      ...trace,
      selectedOptionId: input.optionId,
      executionRef: input.executionRef,
      status: 'SELECTED',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(updated);
  }

  bindExecuting(traceId: string): CanonicalCausalTraceV1 | undefined {
    const trace = this.store.get(traceId);
    if (!trace) return undefined;
    const updated: CanonicalCausalTraceV1 = {
      ...trace,
      status: 'EXECUTING',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(updated);
  }

  bindExecuted(input: {
    traceId: string;
    executionRef: string;
    outcomeRef?: string;
  }): CanonicalCausalTraceV1 | undefined {
    const trace = this.store.get(input.traceId);
    if (!trace) return undefined;
    const updated: CanonicalCausalTraceV1 = {
      ...trace,
      executionRef: input.executionRef,
      outcomeRef: input.outcomeRef,
      status: 'EXECUTED',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(updated);
  }

  bindCalibrated(input: {
    traceId: string;
    outcomeRef: string;
    predictedMinutes?: number;
    actualMinutes?: number;
    verdict?: string;
  }): CanonicalCausalTraceV1 | undefined {
    const trace = this.store.get(input.traceId);
    if (!trace) return undefined;
    const predictionErrorMinutes =
      input.predictedMinutes != null &&
      input.actualMinutes != null &&
      Number.isFinite(input.predictedMinutes) &&
      Number.isFinite(input.actualMinutes)
        ? Math.round(input.actualMinutes - input.predictedMinutes)
        : undefined;
    const updated: CanonicalCausalTraceV1 = {
      ...trace,
      outcomeRef: input.outcomeRef,
      calibration: {
        outcomeRef: input.outcomeRef,
        predictedMinutes: input.predictedMinutes,
        actualMinutes: input.actualMinutes,
        predictionErrorMinutes,
        verdict: input.verdict,
        evaluatedAt: new Date().toISOString(),
      },
      status: 'CALIBRATED',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(updated);
  }

  assertExecuteAllowed(input: {
    ref: CausalTraceReference;
    problemId: string;
    optionId: string;
    currentWorldStateVersion: string;
  }): CanonicalCausalTraceV1 {
    const trace = this.store.get(input.ref.traceId);
    if (!trace) {
      throw new Error(`CAUSAL_TRACE_NOT_FOUND: ${input.ref.traceId}`);
    }
    assertCausalTraceRefFresh({
      ref: input.ref,
      currentWorldStateVersion: input.currentWorldStateVersion,
      traceStatus: trace.status,
    });
    if (!trace.problems.some((p) => p.problemId === input.problemId)) {
      throw new Error(`CAUSAL_TRACE_PROBLEM_MISMATCH: ${input.problemId}`);
    }
    if (trace.selectedOptionId && trace.selectedOptionId !== input.optionId) {
      throw new Error(`CAUSAL_TRACE_OPTION_MISMATCH: ${input.optionId}`);
    }
    return trace;
  }
}
