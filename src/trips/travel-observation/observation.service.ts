import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ObservationExtractionService } from './extraction/observation-extraction.service';
import type { GroundingHints } from './grounding/grounding.types';
import { ObservationGroundingService } from './grounding/observation-grounding.service';
import { ObservationAssessmentBridgeService } from './assessment/observation-assessment.bridge.service';
import { LookWorldStateAssertionService } from './assessment/look-world-state-assertion.service';
import { LookFeedbackStore } from './feedback/look-feedback.store';
import { LookMediaStore } from './look-media/look-media.store';
import { RentalEvidencePackageStore } from './rental/rental-evidence.store';
import {
  paginateObservations,
  parseListFilter,
  projectObservationListItem,
  type LookObservationListResponse,
} from './observation-list.projection';
import {
  assertNoGpsRoadBlockSafety,
  buildMockAssessment,
} from './mock-assessment.builder';
import {
  computeMediaExpiresAt,
  LOOK_MEDIA_RETENTION_POLICY,
} from './media-retention';
import { ObservationRepository } from './observation.repository';
import {
  assertTransition,
  isAssessmentReadable,
  isTerminalStatus,
} from './observation-status.machine';
import type {
  AppendMediaInput,
  AssessmentNotReadyBody,
  CreateObservationInput,
  LookFeedbackReceipt,
  ObservationAssessment,
  ObservationDeletionReceipt,
  ObservationProgressStage,
  PatchContextResult,
  PatchObservationContextInput,
  RecaptureBoundaryInput,
  SubmitLookFeedbackInput,
  TravelObservationEvent,
} from './observation.types';
import {
  RECAPTURE_NEW_ID_DISTANCE_M,
  RECAPTURE_NEW_ID_TIME_MS,
} from './observation.types';
import { isFrozenSemanticKey } from './semantic-keys';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function progressFor(
  status: TravelObservationEvent['status'],
): ObservationProgressStage {
  switch (status) {
    case 'UPLOADING':
      return 'UPLOADING_MEDIA';
    case 'EXTRACTING':
    case 'MEDIA_APPENDED':
      return 'EXTRACTING_SCENE';
    case 'GROUNDING':
      return 'MATCHING_LOCATION';
    case 'ASSESSING':
      return 'CHECKING_TRIP_IMPACT';
    case 'COMPLETED':
      return 'FINALIZING';
    default:
      return 'EXTRACTING_SCENE';
  }
}

@Injectable()
export class ObservationService {
  private readonly ocrSeeds = new Map<string, string>();
  private readonly groundingHints = new Map<string, GroundingHints>();

  constructor(
    private readonly repo: ObservationRepository,
    private readonly extraction: ObservationExtractionService,
    private readonly grounding: ObservationGroundingService,
    private readonly assessmentBridge: ObservationAssessmentBridgeService,
    @Optional()
    private readonly lookWorldState?: LookWorldStateAssertionService,
    @Optional()
    private readonly rentalEvidence?: RentalEvidencePackageStore,
    @Optional()
    private readonly feedbackStore?: LookFeedbackStore,
    @Optional()
    private readonly lookMedia?: LookMediaStore,
  ) {}

  list(
    tripId: string,
    query?: { limit?: number; cursor?: string; filter?: string },
  ): LookObservationListResponse {
    const filter = parseListFilter(query?.filter);
    const events = this.repo
      .listByTrip(tripId)
      .sort(
        (a, b) =>
          new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      )
      .filter((e) => {
        if (filter === 'all') return true;
        const mapped = projectObservationListItem(
          e,
          this.repo.getLatestAssessment(e.observationId),
        ).filter;
        return mapped === filter;
      });

    const items = events.map((e) => {
      const assessment = this.repo.getLatestAssessment(e.observationId);
      const thumbRef = e.mediaRefs[0];
      const thumb = thumbRef ? this.lookMedia?.get(thumbRef) : undefined;
      return projectObservationListItem(e, assessment, {
        thumbnailUrl: thumb?.url ?? null,
      });
    });

    return paginateObservations(items, {
      limit: query?.limit ?? 20,
      cursor: query?.cursor,
    });
  }

  async create(
    tripId: string,
    input: CreateObservationInput,
    options?: { syncMockComplete?: boolean },
  ): Promise<TravelObservationEvent> {
    if (!input.mediaRefs?.length) {
      throw new UnprocessableEntityException({
        code: 'OBSERVATION_MEDIA_REQUIRED',
        status: 'IMAGE_INVALID',
        recoverable: true,
        action: 'RECAPTURE',
        message:
          'mediaRefs 必填（至少一张现场照片）。未接上传时可传 mockLocalMedia:true 或 ocrTextSeed。',
      });
    }

    const observationId = newId('obs');
    const submittedAt = new Date().toISOString();
    if (input.ocrTextSeed) {
      this.ocrSeeds.set(observationId, input.ocrTextSeed);
    }
    if (input.groundingHints) {
      this.groundingHints.set(observationId, input.groundingHints);
    }

    const event: TravelObservationEvent = {
      observationId,
      tripId,
      dayIndex: input.dayIndex,
      channel: 'LOOK_FIELD',
      source: input.source ?? 'IPHONE_CAMERA',
      intent: input.intent,
      capturedAt: input.capturedAt,
      submittedAt,
      mediaRefs: [...input.mediaRefs],
      captureRevision: 1,
      captureRevisions: [
        {
          observationId,
          captureRevision: 1,
          mediaRefs: [...input.mediaRefs],
          addedAt: submittedAt,
          reason: 'USER_ADDED_VIEW',
        },
      ],
      spatialContext: {
        latitude: input.location?.latitude,
        longitude: input.location?.longitude,
        accuracyMeters: input.location?.accuracyMeters,
        heading: input.heading,
      },
      tripContext: { ...(input.tripContext ?? {}) },
      observations: [],
      verificationStatus: 'UNVERIFIED',
      privacy: {
        containsFace: false,
        containsPlate: false,
        containsDocument: false,
        redactionApplied: false,
        retentionPolicy: LOOK_MEDIA_RETENTION_POLICY,
      },
      status: 'DRAFT',
      userQuestion: input.question,
    };

    this.repo.saveEvent(event);
    this.repo.setMediaExpiresAt(
      observationId,
      computeMediaExpiresAt(input.capturedAt, input.tripEndAt),
    );

    this.transition(observationId, 'UPLOADING');
    this.transition(observationId, 'EXTRACTING');

    if (options?.syncMockComplete === false) {
      // Pause before extraction completes — Assessment GET → 409
      return this.requireEvent(observationId);
    }

    await this.runExtractionAndComplete(observationId);
    return this.requireEvent(observationId);
  }

  async completeMockPipeline(
    observationId: string,
  ): Promise<TravelObservationEvent> {
    await this.runExtractionAndComplete(observationId);
    return this.requireEvent(observationId);
  }

  get(tripId: string, observationId: string): TravelObservationEvent {
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    if (event.deletedAt) {
      throw new NotFoundException(`Observation ${observationId} deleted`);
    }
    return {
      ...event,
      progressStage: progressFor(event.status),
    };
  }

  getAssessment(
    tripId: string,
    observationId: string,
  ): ObservationAssessment {
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    if (event.deletedAt) {
      throw new NotFoundException(`Observation ${observationId} deleted`);
    }

    if (isTerminalStatus(event.status) && event.status !== 'COMPLETED') {
      throw new UnprocessableEntityException({
        code: mapTerminalCode(event.status),
        status: event.status,
        recoverable: event.status !== 'CANCELLED',
        action: 'RECAPTURE_OR_RETRY',
      });
    }

    if (!isAssessmentReadable(event.status)) {
      const body: AssessmentNotReadyBody = {
        code: 'OBSERVATION_ASSESSMENT_NOT_READY',
        observationId,
        status: event.status,
        progress: { stage: progressFor(event.status) },
        retryAfterMs: 1200,
      };
      throw new ConflictException(body);
    }

    const assessment = this.repo.getLatestAssessment(observationId);
    if (!assessment) {
      throw new ConflictException({
        code: 'OBSERVATION_ASSESSMENT_NOT_READY',
        observationId,
        status: event.status,
        progress: { stage: progressFor(event.status) },
        retryAfterMs: 1200,
      } satisfies AssessmentNotReadyBody);
    }

    if (assessment.writesPlanVersion !== false) {
      throw new Error('Look invariant violated: writesPlanVersion must be false');
    }
    for (const fact of event.observations) {
      if (!isFrozenSemanticKey(fact.semanticKey)) {
        throw new Error(`Unfrozen semantic key: ${fact.semanticKey}`);
      }
    }
    return assessment;
  }

  async appendMedia(
    tripId: string,
    observationId: string,
    input: AppendMediaInput,
  ): Promise<TravelObservationEvent> {
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    if (event.deletedAt) {
      throw new NotFoundException(`Observation ${observationId} deleted`);
    }
    if (!input.mediaRefs?.length) {
      throw new UnprocessableEntityException({
        code: 'OBSERVATION_MEDIA_REQUIRED',
        status: 'IMAGE_INVALID',
        recoverable: true,
        action: 'RECAPTURE',
      });
    }

    if (input.ocrTextSeed) {
      this.ocrSeeds.set(observationId, input.ocrTextSeed);
    }
    if (input.groundingHints) {
      this.groundingHints.set(observationId, {
        ...(this.groundingHints.get(observationId) ?? {}),
        ...input.groundingHints,
      });
    }

    const addedAt = input.capturedAt ?? new Date().toISOString();
    const nextRevision = event.captureRevision + 1;
    const next: TravelObservationEvent = {
      ...event,
      mediaRefs: [...event.mediaRefs, ...input.mediaRefs],
      captureRevision: nextRevision,
      captureRevisions: [
        ...event.captureRevisions,
        {
          observationId,
          captureRevision: nextRevision,
          mediaRefs: [...input.mediaRefs],
          addedAt,
          reason: input.reason,
        },
      ],
      spatialContext: {
        ...event.spatialContext,
        ...(input.location
          ? {
              latitude: input.location.latitude,
              longitude: input.location.longitude,
              accuracyMeters: input.location.accuracyMeters,
            }
          : {}),
        ...(typeof input.heading === 'number' ? { heading: input.heading } : {}),
      },
      status: event.status,
      verificationStatus: 'UNVERIFIED',
      observations: [],
      extractionMeta: undefined,
    };
    this.repo.saveEvent(next);

    this.transition(observationId, 'MEDIA_APPENDED');
    this.transition(observationId, 'EXTRACTING');
    await this.runExtractionAndComplete(observationId);

    return this.requireEvent(observationId);
  }

  /**
   * RealityOS §16.5 — merge trip/day/vehicle/booking/location/confirmed scene.
   * May reassess; never writes PlanVersion / Apply.
   */
  async patchContext(
    tripId: string,
    observationId: string,
    input: PatchObservationContextInput,
  ): Promise<PatchContextResult> {
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    if (event.deletedAt) {
      throw new NotFoundException(`Observation ${observationId} deleted`);
    }
    if (event.status === 'CANCELLED') {
      throw new ConflictException({
        code: 'OBSERVATION_CANCELLED',
        message: 'Cannot patch context on cancelled observation',
      });
    }

    if (input.groundingHints) {
      this.groundingHints.set(observationId, {
        ...(this.groundingHints.get(observationId) ?? {}),
        ...input.groundingHints,
      });
    }

    const merged: TravelObservationEvent = {
      ...event,
      dayIndex: input.dayIndex ?? event.dayIndex,
      intent: input.confirmedIntent ?? event.intent,
      tripContext: {
        ...event.tripContext,
        ...(input.tripContext ?? {}),
      },
      spatialContext: {
        ...event.spatialContext,
        ...(input.location
          ? {
              latitude: input.location.latitude,
              longitude: input.location.longitude,
              accuracyMeters: input.location.accuracyMeters,
            }
          : {}),
        ...(typeof input.heading === 'number' ? { heading: input.heading } : {}),
      },
    };
    this.repo.saveEvent(merged);

    const canReopen =
      event.status === 'COMPLETED' ||
      event.status === 'CONTEXT_MISSING' ||
      event.status === 'MODEL_FAILED' ||
      event.status === 'ASSESSMENT_FAILED' ||
      event.status === 'IMAGE_INVALID';

    const shouldReassess =
      input.reassess === true ||
      (input.reassess !== false && canReopen);

    if (shouldReassess && canReopen) {
      // Reuse MEDIA_APPENDED reopen path (status machine); no new media required
      this.transition(observationId, 'MEDIA_APPENDED');
      const cleared = this.requireEvent(observationId);
      this.repo.saveEvent({
        ...cleared,
        observations: [],
        extractionMeta: undefined,
        verificationStatus: 'UNVERIFIED',
      });
      this.transition(observationId, 'EXTRACTING');
      await this.runExtractionAndComplete(observationId);
    }

    const latest = this.requireEvent(observationId);
    const assessment =
      latest.status === 'COMPLETED'
        ? this.repo.getLatestAssessment(observationId)
        : undefined;

    return {
      observationId,
      status: latest.status,
      captureRevision: latest.captureRevision,
      contextHash: assessment?.contextHash,
      assessmentRevision: assessment?.assessmentRevision,
      reassessed: shouldReassess && canReopen,
      analyticsEvent: 'look_context_corrected',
      writesPlanVersion: false,
    };
  }

  /** RealityOS §16.7 — user feedback on assessment; never Apply / PlanVersion */
  submitFeedback(
    tripId: string,
    observationId: string,
    input: SubmitLookFeedbackInput,
  ): LookFeedbackReceipt {
    if (!this.feedbackStore) {
      throw new UnprocessableEntityException({
        code: 'LOOK_FEEDBACK_UNAVAILABLE',
        message: 'Feedback store not configured',
      });
    }
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    if (event.deletedAt) {
      throw new NotFoundException(`Observation ${observationId} deleted`);
    }
    if (event.status !== 'COMPLETED') {
      throw new ConflictException({
        code: 'OBSERVATION_ASSESSMENT_NOT_READY',
        observationId,
        status: event.status,
        message: 'Feedback requires COMPLETED assessment',
      });
    }

    const assessments = this.repo.listAssessments(observationId);
    const match = assessments.find(
      (a) =>
        a.assessmentId === input.assessmentId &&
        (input.assessmentRevision == null ||
          a.assessmentRevision === input.assessmentRevision),
    );
    if (!match) {
      throw new NotFoundException(
        `Assessment ${input.assessmentId} not found for observation ${observationId}`,
      );
    }

    return this.feedbackStore.submit({
      observationId,
      assessmentId: match.assessmentId,
      assessmentRevision: match.assessmentRevision,
      result: input.result,
      userCorrection: input.userCorrection,
    });
  }

  delete(
    tripId: string,
    observationId: string,
  ): ObservationDeletionReceipt {
    const event = this.requireEvent(observationId);
    this.assertTrip(event, tripId);
    const deletedAt = new Date().toISOString();
    this.repo.saveEvent({ ...event, deletedAt, status: 'CANCELLED' });
    this.ocrSeeds.delete(observationId);
    this.groundingHints.delete(observationId);

    return {
      observationId,
      deleted: {
        originalMedia: true,
        thumbnails: true,
        accessRevoked: true,
      },
      retained: {
        structuredObservation: true,
        assessmentSummaries: true,
        ledgerRefs: false,
      },
      mediaRetentionPolicy: LOOK_MEDIA_RETENTION_POLICY,
      deletedAt,
    };
  }

  requiresNewObservationId(boundary: RecaptureBoundaryInput): boolean {
    if (boundary.intentChanged) return true;
    if (boundary.routeSegmentIdChanged) return true;
    if (
      typeof boundary.distanceFromOriginalMeters === 'number' &&
      boundary.distanceFromOriginalMeters > RECAPTURE_NEW_ID_DISTANCE_M
    ) {
      return true;
    }
    if (
      typeof boundary.timeSinceOriginalMs === 'number' &&
      boundary.timeSinceOriginalMs > RECAPTURE_NEW_ID_TIME_MS
    ) {
      return true;
    }
    return false;
  }

  getMediaExpiresAt(observationId: string): string | undefined {
    return this.repo.getMediaExpiresAt(observationId);
  }

  listAssessmentRevisions(observationId: string): ObservationAssessment[] {
    return this.repo.listAssessments(observationId);
  }

  getLinkedDecisionProblem(observationId: string) {
    return this.assessmentBridge.getByObservation(observationId);
  }

  getEvidencePackage(tripId: string, observationId: string) {
    this.get(tripId, observationId);
    const pkg = this.rentalEvidence?.getByObservation(observationId);
    if (!pkg) {
      throw new NotFoundException(
        `No EvidencePackage for observation ${observationId}`,
      );
    }
    return pkg;
  }

  private async runExtractionAndComplete(
    observationId: string,
  ): Promise<void> {
    const event = this.requireEvent(observationId);
    const extracted = await this.extraction.extract({
      images: event.mediaRefs.map((mediaRef) => ({ mediaRef })),
      intent: event.intent,
      userQuestion: event.userQuestion,
      hints: {},
      ocrTextSeed: this.ocrSeeds.get(observationId),
    });

    if (extracted.ok === false) {
      assertTransition(event.status, 'MODEL_FAILED');
      this.repo.saveEvent({
        ...event,
        status: 'MODEL_FAILED',
        progressStage: 'EXTRACTING_SCENE',
        extractionMeta: {
          providerId: extracted.providerId,
          sceneType: 'UNKNOWN',
          requiredAdditionalViews: [
            '暂时无法完成现场识别。照片已保存在本次行程中，你可以稍后重试。',
          ],
          uncertainties: extracted.errors,
        },
      });
      return;
    }

    const withFacts: TravelObservationEvent = {
      ...event,
      observations: extracted.facts,
      extractionMeta: {
        providerId: extracted.providerId,
        sceneType: extracted.raw.sceneType,
        requiredAdditionalViews: extracted.raw.requiredAdditionalViews,
        uncertainties: extracted.raw.uncertainties,
      },
      verificationStatus: 'UNVERIFIED',
    };
    this.repo.saveEvent(withFacts);

    this.transition(observationId, 'GROUNDING');
    await this.finalizeWithGrounding(observationId);
  }

  private async finalizeWithGrounding(observationId: string): Promise<void> {
    const event = this.requireEvent(observationId);
    const hints = this.groundingHints.get(observationId) ?? {};
    const grounded = this.grounding.ground(event, hints);

    const mergedObservations = [...event.observations];
    for (const f of grounded.facts) {
      if (!mergedObservations.some((x) => x.semanticKey === f.semanticKey)) {
        mergedObservations.push(f);
      }
    }

    this.repo.saveEvent({
      ...event,
      observations: mergedObservations,
      verificationStatus: grounded.verificationStatus,
      tripContext: {
        ...event.tripContext,
        vehicleId:
          grounded.context.vehicle?.vehicleId ?? event.tripContext.vehicleId,
        bookingId:
          grounded.context.execution.bookingId ?? event.tripContext.bookingId,
      },
    });

    this.transition(observationId, 'ASSESSING');
    const assessing = this.requireEvent(observationId);
    const nextRevision = (assessing.latestAssessmentRevision ?? 0) + 1;
    const draftAssessment = buildMockAssessment({
      event: assessing,
      context: grounded.context,
      assessmentRevision: nextRevision,
      grounding: grounded,
    });
    assertNoGpsRoadBlockSafety(assessing, draftAssessment);

    // Observation Channel → WorldState (look.field_observation only; never road.status)
    let worldStateSnapshotId: string | undefined;
    if (this.lookWorldState?.enabled) {
      const projected = await this.lookWorldState.projectFromObservation({
        event: assessing,
        verificationStatus: grounded.verificationStatus,
        assessment: {
          assessmentId: draftAssessment.assessmentId,
          assessmentRevision: draftAssessment.assessmentRevision,
        },
      });
      worldStateSnapshotId = projected.snapshotId;
    }

    const { assessment } = await this.assessmentBridge.attachDecisionProblem({
      tripId: assessing.tripId,
      observationId,
      assessment: draftAssessment,
      worldStateSnapshotId,
    });
    if (assessment.writesPlanVersion !== false) {
      throw new Error('Look invariant violated: writesPlanVersion must be false');
    }
    this.repo.saveAssessment(assessment);

    const gpsFact =
      assessment.decisionProblem?.semanticKey ===
      'DATA_UNCERTAINTY.GPS_INSUFFICIENT'
        ? [
            {
              semanticType: 'DATA_UNCERTAINTY',
              semanticKey: 'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
              value: true,
              confidence: 1,
              source: 'ON_DEVICE' as const,
            },
          ]
        : [];

    const finalFacts = [...assessing.observations];
    for (const f of gpsFact) {
      if (
        isFrozenSemanticKey(f.semanticKey) &&
        !finalFacts.some((x) => x.semanticKey === f.semanticKey)
      ) {
        finalFacts.push(f);
      }
    }

    const completedEvent = {
      ...assessing,
      status: 'COMPLETED' as const,
      latestAssessmentRevision: nextRevision,
      progressStage: 'FINALIZING' as const,
      verificationStatus: assessment.verificationStatus,
      observations: finalFacts,
    };

    if (
      assessing.intent === 'CHECK_RENTAL_HANDOVER' &&
      this.rentalEvidence
    ) {
      this.rentalEvidence.upsertFromObservation(completedEvent, hints);
    }

    assertTransition(assessing.status, 'COMPLETED');
    this.repo.saveEvent(completedEvent);
  }

  private transition(
    observationId: string,
    to: TravelObservationEvent['status'],
  ): void {
    const event = this.requireEvent(observationId);
    assertTransition(event.status, to);
    this.repo.saveEvent({
      ...event,
      status: to,
      progressStage: progressFor(to),
    });
  }

  private requireEvent(observationId: string): TravelObservationEvent {
    const event = this.repo.getEvent(observationId);
    if (!event) {
      throw new NotFoundException(`Observation ${observationId} not found`);
    }
    return event;
  }

  private assertTrip(event: TravelObservationEvent, tripId: string): void {
    if (event.tripId !== tripId) {
      throw new NotFoundException(`Observation ${event.observationId} not found`);
    }
  }
}

function mapTerminalCode(status: TravelObservationEvent['status']): string {
  switch (status) {
    case 'CONTEXT_MISSING':
      return 'OBSERVATION_CONTEXT_INSUFFICIENT';
    case 'MODEL_FAILED':
      return 'OBSERVATION_MODEL_FAILED';
    case 'UPLOAD_FAILED':
      return 'OBSERVATION_UPLOAD_FAILED';
    case 'IMAGE_INVALID':
      return 'OBSERVATION_IMAGE_INVALID';
    case 'ASSESSMENT_FAILED':
      return 'OBSERVATION_ASSESSMENT_FAILED';
    case 'CANCELLED':
      return 'OBSERVATION_CANCELLED';
    default:
      return 'OBSERVATION_FAILED';
  }
}
