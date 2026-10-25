/**
 * Mobile BFF — Proactive Decision V1 read + CTA + Confirm + Apply + Phase 5 feedback.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { assembleMobileProactiveDecisionSurface } from '../../trips/proactive-decision/surface/assemble-mobile-proactive-decision-surface.util';
import {
  mergeProactiveDecisionSurfaceIntoMetadata,
  readProactiveDecisionSurfaceSnapshot,
} from '../../trips/proactive-decision/surface/proactive-decision-surface-snapshot.util';
import {
  applyProactiveChangeDraft,
  confirmProactiveChangeDraft,
  handleProactiveReminderCta,
  ProactiveDraftLifecycleError,
} from '../../trips/proactive-decision/execution/proactive-draft-lifecycle.util';
import { ProactiveRfc001ApplyAdapterService } from '../../trips/proactive-decision/execution/proactive-rfc001-apply.adapter';
import type { ProactiveReminderCtaId } from '../../trips/proactive-decision/surface/proactive-reminder-card.types';
import type { MobileProactiveDecisionSurfaceDto } from '../dto/mobile-proactive-decision.types';
import {
  patchProactiveDecisionDatasetRecord,
  readProactiveDecisionDatasetLog,
} from '../../trips/proactive-decision/validation/build-proactive-decision-dataset.util';
import { computeProactiveValidationMetrics } from '../../trips/proactive-decision/validation/compute-proactive-validation-metrics.util';
import { evaluateProactiveValidationCanary } from '../../trips/proactive-decision/validation/evaluate-proactive-validation-canary.util';
import type {
  ProactiveDatasetOutcomeLabel,
  ProactiveDatasetUserAction,
} from '../../trips/proactive-decision/validation/proactive-decision-dataset.types';

@Injectable()
export class MobileProactiveDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly rfc001Apply: ProactiveRfc001ApplyAdapterService,
  ) {}

  async getSurface(
    tripId: string,
    userId: string,
  ): Promise<MobileProactiveDecisionSurfaceDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    return assembleMobileProactiveDecisionSurface({
      tripId,
      metadata: trip.metadata,
    });
  }

  async getValidationSummary(tripId: string, userId: string) {
    const trip = await this.access.assertTripMember(tripId, userId);
    const log = readProactiveDecisionDatasetLog(trip.metadata);
    const metrics = computeProactiveValidationMetrics({
      dataset: log?.records ?? [],
    });
    const canary = evaluateProactiveValidationCanary({ metrics });
    return {
      tripId,
      sampleSize: metrics.sampleSize,
      metrics,
      canary,
      recent: (log?.records ?? []).slice(-10),
    };
  }

  /**
   * Phase 5 — Client reports L1/L2 actually painted (Accept Rate denominator).
   * Prefer this over write-on-GET so prefetch does not inflate shown.
   */
  async markImpression(
    tripId: string,
    userId: string,
    surface: 'L1_PASSIVE' | 'L2_INTERRUPT',
  ): Promise<{
    ok: true;
    surface: 'L1_PASSIVE' | 'L2_INTERRUPT';
    metrics: ReturnType<typeof computeProactiveValidationMetrics>;
  }> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snap = readProactiveDecisionSurfaceSnapshot(trip.metadata);
    const assembled = assembleMobileProactiveDecisionSurface({
      tripId,
      metadata: trip.metadata,
    });

    if (surface === 'L1_PASSIVE' && !assembled.shouldRenderL1Passive) {
      throw new BadRequestException(
        'L1 passive is not renderable for this trip/stage',
      );
    }
    if (surface === 'L2_INTERRUPT' && !assembled.shouldRenderCard) {
      throw new BadRequestException(
        'L2 interrupt card is not renderable for this trip/stage',
      );
    }

    const metadata = patchProactiveDecisionDatasetRecord(trip.metadata, {
      signalEventId: snap?.impact.signalEventId,
      decisionProblemId: snap?.decisionProblemId,
      userVisible: true,
      // Keep PENDING unless already labeled
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const log = readProactiveDecisionDatasetLog(refreshed?.metadata);
    return {
      ok: true,
      surface,
      metrics: computeProactiveValidationMetrics({
        dataset: log?.records ?? [],
      }),
    };
  }

  async handleCta(
    tripId: string,
    userId: string,
    cta: ProactiveReminderCtaId,
  ): Promise<{
    surface: MobileProactiveDecisionSurfaceDto;
    ctaResult: ReturnType<typeof handleProactiveReminderCta>;
  }> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snap = readProactiveDecisionSurfaceSnapshot(trip.metadata);
    if (!snap) {
      throw new NotFoundException('No proactive decision surface for this trip');
    }

    let ctaResult: ReturnType<typeof handleProactiveReminderCta>;
    try {
      ctaResult = handleProactiveReminderCta({
        cta,
        draft: snap.changeDraft,
        whyZh: snap.intervention?.card?.whyPreviewZh ?? snap.changeDraft?.whyZh,
      });
    } catch (err: unknown) {
      this.rethrowLifecycle(err);
    }

    let nextDraft = snap.changeDraft;
    if (ctaResult.action === 'VIEW_OPTIONS' || ctaResult.action === 'DEFER') {
      nextDraft = ctaResult.draft;
    }

    const nextSnap = {
      ...snap,
      changeDraft: nextDraft,
      updatedAt: new Date().toISOString(),
    };

    const userAction = cta as ProactiveDatasetUserAction;
    const outcome: ProactiveDatasetOutcomeLabel =
      cta === 'DEFER' ? 'DEFERRED' : 'PENDING';

    let metadata = mergeProactiveDecisionSurfaceIntoMetadata(
      trip.metadata,
      nextSnap,
    );
    metadata = patchProactiveDecisionDatasetRecord(metadata, {
      signalEventId: snap.impact.signalEventId,
      decisionProblemId: snap.decisionProblemId,
      userAction,
      outcome,
      userVisible: true,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });

    return {
      surface: assembleMobileProactiveDecisionSurface({
        tripId,
        metadata: refreshed?.metadata,
      }),
      ctaResult,
    };
  }

  async confirmDraft(
    tripId: string,
    userId: string,
  ): Promise<MobileProactiveDecisionSurfaceDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snap = readProactiveDecisionSurfaceSnapshot(trip.metadata);
    if (!snap?.changeDraft) {
      throw new NotFoundException('No proactive change draft to confirm');
    }

    let confirmed: ReturnType<typeof confirmProactiveChangeDraft>;
    try {
      confirmed = confirmProactiveChangeDraft(snap.changeDraft);
    } catch (err: unknown) {
      this.rethrowLifecycle(err);
    }

    const nextSnap = {
      ...snap,
      changeDraft: confirmed,
      updatedAt: new Date().toISOString(),
    };
    let metadata = mergeProactiveDecisionSurfaceIntoMetadata(
      trip.metadata,
      nextSnap,
    );
    metadata = patchProactiveDecisionDatasetRecord(metadata, {
      signalEventId: snap.impact.signalEventId,
      decisionProblemId: snap.decisionProblemId,
      userAction: 'CONFIRM',
      outcome: 'ACCEPTED',
      userVisible: true,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return assembleMobileProactiveDecisionSurface({
      tripId,
      metadata: refreshed?.metadata,
    });
  }

  async applyDraft(
    tripId: string,
    userId: string,
  ): Promise<MobileProactiveDecisionSurfaceDto> {
    if (!this.rfc001Apply.isWriteEnabled()) {
      throw new BadRequestException(
        'Proactive Confirm→Apply write is disabled (PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED)',
      );
    }

    const trip = await this.access.assertTripMember(tripId, userId);
    const snap = readProactiveDecisionSurfaceSnapshot(trip.metadata);
    if (!snap?.changeDraft) {
      throw new NotFoundException('No proactive change draft to apply');
    }

    let applied;
    try {
      applied = await applyProactiveChangeDraft(
        snap.changeDraft,
        this.rfc001Apply.createApplyPort(),
      );
    } catch (err: unknown) {
      if (err instanceof ProactiveDraftLifecycleError) {
        this.rethrowLifecycle(err);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(message);
    }

    const nextSnap = {
      ...snap,
      changeDraft: applied,
      updatedAt: new Date().toISOString(),
    };
    let metadata = mergeProactiveDecisionSurfaceIntoMetadata(
      trip.metadata,
      nextSnap,
    );
    metadata = patchProactiveDecisionDatasetRecord(metadata, {
      signalEventId: snap.impact.signalEventId,
      decisionProblemId: snap.decisionProblemId,
      userAction: 'APPLY',
      outcome: 'ACCEPTED',
      userVisible: true,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return assembleMobileProactiveDecisionSurface({
      tripId,
      metadata: refreshed?.metadata,
    });
  }

  /**
   * Phase 5 — Useful / Not Useful feedback for validation metrics.
   */
  async submitFeedback(
    tripId: string,
    userId: string,
    useful: boolean,
  ): Promise<{ ok: true; metrics: ReturnType<typeof computeProactiveValidationMetrics> }> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snap = readProactiveDecisionSurfaceSnapshot(trip.metadata);

    const metadata = patchProactiveDecisionDatasetRecord(trip.metadata, {
      signalEventId: snap?.impact.signalEventId,
      decisionProblemId: snap?.decisionProblemId,
      userAction: useful ? 'FEEDBACK_USEFUL' : 'FEEDBACK_NOT_USEFUL',
      outcome: useful ? 'USEFUL' : 'NOT_USEFUL',
      userVisible: true,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const log = readProactiveDecisionDatasetLog(refreshed?.metadata);
    return {
      ok: true,
      metrics: computeProactiveValidationMetrics({
        dataset: log?.records ?? [],
      }),
    };
  }

  private rethrowLifecycle(err: unknown): never {
    if (err instanceof ProactiveDraftLifecycleError) {
      throw new BadRequestException({
        code: err.code,
        message: err.message,
      });
    }
    throw err;
  }
}
