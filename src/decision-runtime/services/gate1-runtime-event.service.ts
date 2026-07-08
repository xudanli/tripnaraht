import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TravelEventPersistenceService } from '../../trips/event-store/travel-event-persistence.service';
import {
  buildGate1RuntimeEnvelope,
  buildGate1RuntimeIdempotencyKey,
} from '../builders/gate1-runtime-event.builder';
import {
  RuntimeAggregateType,
  RuntimeCanonicalEventType,
  RuntimePrivacyClass,
} from '../types/runtime-event-catalog';
import type {
  Gate1EventAnchor,
  RuntimeActor,
} from '../types/runtime-envelope.types';
import { isRuntimeEventOutboxEnabled } from '../decision-runtime.config';
import { RuntimeEventOutboxService } from './runtime-event-outbox.service';
import type {
  Gate1RuntimeEmitResult,
  RuntimePrismaTx,
} from '../types/gate1-runtime-emit.types';
import { isStagedRuntimeEmit } from '../types/gate1-runtime-emit.types';

export type { Gate1RuntimeEmitResult, RuntimePrismaTx };

/**
 * Gate1 → Decision Runtime dual-write adapter (Phase M0).
 * Fail-open: persistence errors never throw to callers.
 * Tier 1.2: optional outbox staging before travel_events publish.
 */
@Injectable()
export class Gate1RuntimeEventService {
  private readonly logger = new Logger(Gate1RuntimeEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: TravelEventPersistenceService,
    private readonly outbox: RuntimeEventOutboxService,
  ) {}

  async resolveAnchor(
    projectId: string,
    tx?: RuntimePrismaTx,
  ): Promise<Gate1EventAnchor | null> {
    const client = tx ?? this.prisma;
    const project = await client.gate1Project.findUnique({
      where: { id: projectId },
      select: { id: true, linkedTripId: true, organizationId: true },
    });
    if (!project?.linkedTripId) {
      return null;
    }
    return {
      tripId: project.linkedTripId,
      gate1ProjectId: project.id,
      organizationId: project.organizationId ?? undefined,
    };
  }

  /**
   * Publish outbox rows staged inside a committed transaction (Phase B).
   * Fail-open: never throws to Gate1 callers.
   */
  flushStaged(results: Array<Gate1RuntimeEmitResult | undefined>): void {
    for (const result of results) {
      if (!result || !isStagedRuntimeEmit(result)) continue;
      void this.outbox.publishById(result.outboxId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[Gate1Runtime] flushStaged failed for outbox ${result.outboxId}: ${message}`,
        );
      });
    }
  }

  private userActor(userId: string, role?: string): RuntimeActor {
    return { type: 'USER', id: userId, role };
  }

  private async emit(
    anchor: Gate1EventAnchor | null,
    projectId: string,
    build: (anchor: Gate1EventAnchor) => Parameters<typeof buildGate1RuntimeEnvelope>[0],
    tx?: RuntimePrismaTx,
  ): Promise<Gate1RuntimeEmitResult> {
    const resolved = anchor ?? (await this.resolveAnchor(projectId, tx));
    if (!resolved) {
      this.logger.debug(
        `[Gate1Runtime] Skip event — no linkedTripId for project ${projectId}`,
      );
      return null;
    }

    try {
      const envelope = buildGate1RuntimeEnvelope(build(resolved));
      if (isRuntimeEventOutboxEnabled()) {
        if (tx) {
          const outboxId = await this.outbox.stage(
            envelope,
            resolved.gate1ProjectId,
            tx,
          );
          return { staged: true, outboxId };
        }
        return await this.outbox.stageAndPublish(
          envelope,
          resolved.gate1ProjectId,
        );
      }
      return await this.persistence.persist(envelope);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Gate1Runtime] Failed to emit for project ${projectId}: ${message}`,
      );
      return null;
    }
  }

  async participantConsented(input: {
    projectId: string;
    participantId: string;
    actorId: string;
    grantedConsentTypes: string[];
    humanAssistedGranted: boolean;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.PARTICIPANT_CONSENTED,
      aggregateType: RuntimeAggregateType.PARTICIPATION,
      aggregateId: payload.participantId,
      payload: {
        participantId: payload.participantId,
        grantedConsentTypes: payload.grantedConsentTypes,
        humanAssistedGranted: payload.humanAssistedGranted,
      },
      actor: this.userActor(payload.actorId, 'PARTICIPANT'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.PARTICIPANT_CONSENTED,
        payload.participantId,
        payload.grantedConsentTypes.join(','),
      ]),
    }), tx);
  }

  async constraintRecorded(input: {
    projectId: string;
    constraintId: string;
    participantId: string;
    fieldKey: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    const privacyClass =
      payload.visibility === 'PRIVATE'
        ? RuntimePrivacyClass.PRIVATE
        : RuntimePrivacyClass.TEAM;

    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.CONSTRAINT_RECORDED,
      aggregateType: RuntimeAggregateType.CONSTRAINT,
      aggregateId: payload.constraintId,
      payload: {
        participantId: payload.participantId,
        fieldKey: payload.fieldKey,
        visibility: payload.visibility,
      },
      actor: this.userActor(payload.actorId, 'PARTICIPANT'),
      privacyClass,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.CONSTRAINT_RECORDED,
        payload.constraintId,
      ]),
    }), tx);
  }

  async privateConstraintSummarized(input: {
    projectId: string;
    sanitizedConstraintId: string;
    actorId: string;
    reviewStatus: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    if (payload.reviewStatus !== 'APPROVED') {
      return null;
    }

    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.PRIVATE_CONSTRAINT_SUMMARIZED,
      aggregateType: RuntimeAggregateType.CONSTRAINT,
      aggregateId: payload.sanitizedConstraintId,
      payload: {
        sanitizedConstraintId: payload.sanitizedConstraintId,
        reviewStatus: payload.reviewStatus,
      },
      actor: this.userActor(payload.actorId, 'PRIVACY_ANALYST'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.PRIVATE_CONSTRAINT_SUMMARIZED,
        payload.sanitizedConstraintId,
        payload.reviewStatus,
      ]),
    }), tx);
  }

  async conflictDetected(input: {
    projectId: string;
    reportId: string;
    version: number;
    actorId: string;
    findingCount: number;
    sourceType: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.CONFLICT_DETECTED,
      aggregateType: RuntimeAggregateType.CONFLICT,
      aggregateId: input.reportId,
      aggregateVersion: input.version,
      payload: {
        reportId: payload.reportId,
        version: payload.version,
        findingCount: payload.findingCount,
        sourceType: payload.sourceType,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.CONFLICT_DETECTED,
        payload.reportId,
        payload.version,
      ]),
    }), tx);
  }

  async conflictAdvisorFeedback(input: {
    projectId: string;
    findingId: string;
    reportId: string;
    action: 'CONFIRMED' | 'DISMISSED' | 'RESOLVED' | string;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    const canonical =
      payload.action === 'DISMISSED'
        ? RuntimeCanonicalEventType.CONFLICT_DISMISSED
        : RuntimeCanonicalEventType.CONFLICT_CONFIRMED;

    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: canonical,
      aggregateType: RuntimeAggregateType.CONFLICT,
      aggregateId: payload.findingId,
      payload: {
        findingId: payload.findingId,
        reportId: payload.reportId,
        action: payload.action,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        canonical,
        payload.findingId,
        payload.action,
      ]),
    }), tx);
  }

  async candidateStrategyCreated(input: {
    projectId: string;
    candidateId: string;
    version: number;
    label: string;
    sourceType: string;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.CANDIDATE_STRATEGY_CREATED,
      aggregateType: RuntimeAggregateType.CANDIDATE_STRATEGY,
      aggregateId: payload.candidateId,
      aggregateVersion: payload.version,
      payload: {
        candidateId: payload.candidateId,
        version: payload.version,
        label: payload.label,
        sourceType: payload.sourceType,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.CANDIDATE_STRATEGY_CREATED,
        payload.candidateId,
        payload.version,
      ]),
    }), tx);
  }

  async decisionRecorded(input: {
    projectId: string;
    decisionId: string;
    selectedCandidateId?: string | null;
    materialChange: boolean;
    changeTypes?: string[];
    conflictReportVersion?: number | null;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.DECISION_RECORDED,
      aggregateType: RuntimeAggregateType.DECISION_CASE,
      aggregateId: payload.decisionId,
      payload: {
        decisionId: payload.decisionId,
        selectedCandidateId: payload.selectedCandidateId ?? null,
        materialChange: payload.materialChange,
        changeTypes: payload.changeTypes ?? [],
        conflictReportVersion: payload.conflictReportVersion ?? null,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.DECISION_RECORDED,
        payload.decisionId,
      ]),
    }), tx);
  }

  async contingencyPlanCreated(input: {
    projectId: string;
    planBId: string;
    label: string;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.CONTINGENCY_PLAN_CREATED,
      aggregateType: RuntimeAggregateType.CONTINGENCY_PLAN,
      aggregateId: payload.planBId,
      payload: {
        planBId: payload.planBId,
        label: payload.label,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.CONTINGENCY_PLAN_CREATED,
        payload.planBId,
      ]),
    }), tx);
  }

  async outcomeRecorded(input: {
    projectId: string;
    outcomeId: string;
    actorId: string;
    valueRating?: number | null;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.OUTCOME_RECORDED,
      aggregateType: RuntimeAggregateType.EXECUTION_RECORD,
      aggregateId: payload.outcomeId,
      payload: {
        outcomeId: payload.outcomeId,
        valueRating: payload.valueRating ?? null,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.OUTCOME_RECORDED,
        payload.outcomeId,
      ]),
    }), tx);
  }

  async readinessBlockerRaised(input: {
    projectId: string;
    findingId: string;
    reportId: string;
    reportVersion: number;
    dimension: string;
    status: string;
    title: string;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.READINESS_BLOCKER_RAISED,
      aggregateType: RuntimeAggregateType.READINESS_ASSESSMENT,
      aggregateId: payload.findingId,
      aggregateVersion: payload.reportVersion,
      payload: {
        findingId: payload.findingId,
        reportId: payload.reportId,
        reportVersion: payload.reportVersion,
        dimension: payload.dimension,
        status: payload.status,
        title: payload.title,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.READINESS_BLOCKER_RAISED,
        payload.findingId,
        payload.reportVersion,
      ]),
    }), tx);
  }

  async readinessBlockerResolved(input: {
    projectId: string;
    findingId: string;
    reportId: string;
    reportVersion: number;
    resolution: 'RESOLVED' | 'ACCEPT_RISK' | 'CLOSED';
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.READINESS_BLOCKER_RESOLVED,
      aggregateType: RuntimeAggregateType.READINESS_ASSESSMENT,
      aggregateId: payload.findingId,
      aggregateVersion: payload.reportVersion,
      payload: {
        findingId: payload.findingId,
        reportId: payload.reportId,
        reportVersion: payload.reportVersion,
        resolution: payload.resolution,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.READINESS_BLOCKER_RESOLVED,
        payload.findingId,
        payload.resolution,
      ]),
    }), tx);
  }

  async readinessAssessmentRecorded(input: {
    projectId: string;
    reportId: string;
    reportVersion: number;
    findingCount: number;
    redCount: number;
    yellowCount: number;
    greenCount: number;
    actorId: string;
    tx?: RuntimePrismaTx;
  }): Promise<Gate1RuntimeEmitResult> {
    const { tx, ...payload } = input;
    return this.emit(null, payload.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.READINESS_ASSESSMENT_RECORDED,
      aggregateType: RuntimeAggregateType.READINESS_ASSESSMENT,
      aggregateId: payload.reportId,
      aggregateVersion: payload.reportVersion,
      payload: {
        reportId: payload.reportId,
        reportVersion: payload.reportVersion,
        findingCount: payload.findingCount,
        redCount: payload.redCount,
        yellowCount: payload.yellowCount,
        greenCount: payload.greenCount,
      },
      actor: this.userActor(payload.actorId, 'ADVISOR'),
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.READINESS_ASSESSMENT_RECORDED,
        payload.reportId,
        payload.reportVersion,
      ]),
    }), tx);
  }

  async commandRejected(input: {
    projectId: string;
    commandType: string;
    actorId?: string;
    statusCode: number;
    reason: string;
  }): Promise<Gate1RuntimeEmitResult> {
    return this.emit(null, input.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.COMMAND_REJECTED,
      aggregateType: RuntimeAggregateType.DECISION_CASE,
      aggregateId: anchor.gate1ProjectId,
      payload: {
        commandType: input.commandType,
        statusCode: input.statusCode,
        reason: input.reason,
      },
      actor: input.actorId
        ? this.userActor(input.actorId)
        : { type: 'SYSTEM' as const, id: 'gate1-runtime' },
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.COMMAND_REJECTED,
        input.commandType,
        input.actorId ?? 'unknown',
        String(input.statusCode),
        input.reason.slice(0, 120),
      ]),
    }));
  }

  async sensitiveDataAccessed(input: {
    projectId: string;
    actorId: string;
    resourceType: string;
    resourceId: string;
    fieldKey?: string;
    reason?: string;
  }): Promise<Gate1RuntimeEmitResult> {
    return this.emit(null, input.projectId, (anchor) => ({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.SENSITIVE_DATA_ACCESSED,
      aggregateType: RuntimeAggregateType.CONSTRAINT,
      aggregateId: input.resourceId,
      payload: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        fieldKey: input.fieldKey ?? null,
        reason: input.reason ?? null,
      },
      actor: this.userActor(input.actorId, 'PRIVACY_ANALYST'),
      privacyClass: RuntimePrivacyClass.SENSITIVE,
      idempotencyKey: buildGate1RuntimeIdempotencyKey([
        anchor.gate1ProjectId,
        RuntimeCanonicalEventType.SENSITIVE_DATA_ACCESSED,
        input.resourceId,
        input.actorId,
        new Date().toISOString().slice(0, 16),
      ]),
    }));
  }
}
