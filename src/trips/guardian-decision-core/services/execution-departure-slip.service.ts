/**
 * Slice 3 E1 — departure slip ingestion + canonical pipeline trigger.
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';
import type { ExecutionDepartureSource } from '../contracts/execution-slip.types';
import {
  readActivityContextFromTripMetadata,
  resolvePlannedDepartAt,
  resolveRemainingStayMinutes,
} from '../utils/execution-activity-context.util';
import { ExecutionDepartureObservationStoreService } from '../persistence/execution-departure-observation.store';
import { ExecutionSlipRunnerService } from '../execution/execution-slip-runner.service';
import { isCanonicalExecutionScheduleInfeasibleEnabled } from '../config/rfc002-canonical.config';
import { ExecutionSlipShadowMetricsService } from '../shadow/execution-slip-shadow-metrics.service';

export interface RecordDepartureSlipRequest {
  activityId: string;
  observedAt: string;
  stillAtPoi: boolean;
  source: ExecutionDepartureSource;
  idempotencyKey?: string;
}

export interface RecordDepartureSlipResponse {
  observationId: string;
  status: 'RECORDED' | 'NO_ACTION';
  problemId?: string;
  runId?: string;
}

@Injectable()
export class ExecutionDepartureSlipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observationStore: ExecutionDepartureObservationStoreService,
    private readonly runner: ExecutionSlipRunnerService,
    @Optional() private readonly shadowMetrics?: ExecutionSlipShadowMetricsService,
    @Optional()
    @Inject(forwardRef(() => UnifiedDecisionProblemReadModelService))
    private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    const isMember =
      trip.TripCollaborator.some((c) => c.userId === userId) ||
      (trip.metadata as { userId?: string } | null)?.userId === userId ||
      (userId === 'anonymous-dev-user' && process.env.NODE_ENV !== 'production');
    if (!isMember) {
      throw new ForbiddenException('需要为行程成员');
    }
  }

  async recordDepartureSlip(
    tripId: string,
    userId: string,
    body: RecordDepartureSlipRequest,
  ): Promise<RecordDepartureSlipResponse> {
    if (!isCanonicalExecutionScheduleInfeasibleEnabled()) {
      throw new BadRequestException({
        code: 'EXECUTION_SLIP_DISABLED',
        message: 'CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE 未启用',
      });
    }

    await this.assertTripMember(tripId, userId);

    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: body.activityId },
      select: {
        id: true,
        endTime: true,
        startTime: true,
        TripDay: { select: { tripId: true, Trip: { select: { metadata: true, updatedAt: true } } } },
      },
    });
    if (!item || item.TripDay.tripId !== tripId) {
      throw new NotFoundException(`活动 ${body.activityId} 不属于行程 ${tripId}`);
    }

    const activityContext = readActivityContextFromTripMetadata(
      item.TripDay.Trip.metadata,
      body.activityId,
    );
    const plannedDepartAt = resolvePlannedDepartAt({
      context: activityContext,
      endTime: item.endTime,
      startTime: item.startTime,
    });
    if (!plannedDepartAt) {
      throw new BadRequestException('活动缺少计划离开时间');
    }

    const trip = item.TripDay.Trip;
    const rev = resolveTripRevision(trip);
    const planVersionId = `plan_${revisionToString(rev)}`;

    const existingKey = body.idempotencyKey
      ? (await this.observationStore.listForTrip(tripId)).find(
          (o) => o.observationId === body.idempotencyKey,
        )
      : undefined;
    if (existingKey) {
      this.shadowMetrics?.recordIdempotentReplay();
    }

    this.shadowMetrics?.recordTrigger();

    const observation = await this.observationStore.record({
      tripId,
      planVersionId,
      activityId: body.activityId,
      plannedDepartAt,
      observedAt: body.observedAt,
      stillAtPoi: body.stillAtPoi,
      source: body.source,
      recordedBy: userId,
      idempotencyKey: body.idempotencyKey,
    });

    const remainingStayMinutes = resolveRemainingStayMinutes(activityContext, 60);

    const run = await this.runner.runFullFromObservation(observation, {
      remainingStayMinutes,
    });

    if (!run.problem) {
      this.shadowMetrics?.recordNoAction();
      return {
        observationId: observation.observationId,
        status: 'NO_ACTION',
      };
    }

    this.shadowMetrics?.recordProblemCreated();
    const repairCount = run.workspace?.repairCandidates.length ?? 0;
    this.shadowMetrics?.recordCandidates(repairCount, Math.max(0, 3 - repairCount));

    // POST problemId must be readable immediately on GET decision-queue/:problemId.
    this.decisionReadModel?.invalidateCache(tripId);

    return {
      observationId: observation.observationId,
      status: 'RECORDED',
      problemId: run.problem.problemId,
      runId: run.runId,
    };
  }
}
