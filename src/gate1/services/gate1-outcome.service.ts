import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTravelEventDto,
  ParticipantFeedbackDto,
  SubmitProjectOutcomeDto,
} from '../dto/gate1.dto';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1ChangeNoticeService } from './gate1-change-notice.service';
import { Gate1RuntimeEventService } from '../../decision-runtime/services/gate1-runtime-event.service';
import type { Gate1RuntimeEmitResult } from '../../decision-runtime/types/gate1-runtime-emit.types';

@Injectable()
export class Gate1OutcomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly changeNotices: Gate1ChangeNoticeService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async createTravelEvent(projectId: string, actorId: string, dto: CreateTravelEventDto) {
    await this.guard.requireProject(projectId);

    if (dto.planBId) {
      const planB = await this.prisma.gate1PlanB.findFirst({
        where: { id: dto.planBId, projectId, status: 'PUBLISHED' },
      });
      if (!planB) throw new BadRequestException('planBId must reference a published Plan B for this project');
    }

    const event = await this.prisma.gate1TravelEvent.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        eventType: dto.eventType ?? 'INCIDENT',
        occurredAt: new Date(dto.occurredAt),
        handler: dto.handler ?? null,
        result: dto.result ?? null,
        responsibleParty: dto.responsibleParty ?? null,
        planBId: dto.planBId ?? null,
        createdBy: actorId,
      },
    });

    const project = await this.guard.requireProject(projectId);
    if (project.experimentStatus === 'READY') {
      await this.guard.transitionProject(projectId, 'ACTIVE');
    }

    await this.analytics.track(projectId, project.cohort, 'travel_event_recorded', {
      actorId,
      properties: { eventId: event.id, eventType: event.eventType, planBId: dto.planBId ?? null },
    });

    if (event.eventType === 'CHANGE' || event.eventType === 'INCIDENT') {
      await this.changeNotices.createFromTravelEvent(projectId, event.id, actorId);
    }

    return event;
  }

  async listTravelEvents(projectId: string) {
    return this.prisma.gate1TravelEvent.findMany({
      where: { projectId },
      orderBy: { occurredAt: 'desc' },
      include: { planB: { select: { id: true, label: true, riskTitle: true } } },
    });
  }

  async submitOutcome(projectId: string, actorId: string, dto: SubmitProjectOutcomeDto) {
    const project = await this.guard.requireProject(projectId);

    if (dto.secondOrderIntent === 'VERBAL' && dto.secondOrderProvided) {
      throw new BadRequestException('secondOrderProvided=true requires CONFIRMED or PROVIDED intent, not VERBAL');
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const outcome = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.gate1ProjectOutcome.upsert({
        where: { projectId },
        create: {
          projectId,
          valueRating: dto.valueRating ?? null,
          valueNotes: dto.valueNotes ?? null,
          secondOrderIntent: dto.secondOrderIntent ?? null,
          secondOrderProvided: dto.secondOrderProvided ?? false,
          paymentCommitmentCents: dto.paymentCommitmentCents ?? null,
          paymentCommitmentType: dto.paymentCommitmentType ?? null,
          paymentNotes: dto.paymentNotes ?? null,
          clientRevisionRounds: dto.clientRevisionRounds ?? null,
          advisorActualHours: dto.advisorActualHours ?? null,
          exceptionCostCents: dto.exceptionCostCents ?? null,
          submittedBy: actorId,
        },
        update: {
          valueRating: dto.valueRating ?? undefined,
          valueNotes: dto.valueNotes ?? undefined,
          secondOrderIntent: dto.secondOrderIntent ?? undefined,
          secondOrderProvided: dto.secondOrderProvided ?? undefined,
          paymentCommitmentCents: dto.paymentCommitmentCents ?? undefined,
          paymentCommitmentType: dto.paymentCommitmentType ?? undefined,
          paymentNotes: dto.paymentNotes ?? undefined,
          clientRevisionRounds: dto.clientRevisionRounds ?? undefined,
          advisorActualHours: dto.advisorActualHours ?? undefined,
          exceptionCostCents: dto.exceptionCostCents ?? undefined,
          submittedBy: actorId,
          submittedAt: new Date(),
        },
      });

      const emitResult = await this.runtimeEvents.outcomeRecorded({
        projectId,
        outcomeId: saved.id,
        actorId,
        valueRating: dto.valueRating ?? null,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return saved;
    });

    this.runtimeEvents.flushStaged(staged);

    if (dto.secondOrderProvided) {
      await this.analytics.track(projectId, project.cohort, 'second_order_provided', {
        actorId,
        organizationId: project.organizationId ?? undefined,
        properties: { intent: dto.secondOrderIntent },
      });
    }

    if (dto.paymentCommitmentCents && dto.paymentCommitmentCents > 0) {
      await this.analytics.track(projectId, project.cohort, 'payment_commitment_recorded', {
        actorId,
        organizationId: project.organizationId ?? undefined,
        properties: {
          amount: dto.paymentCommitmentCents,
          contractType: dto.paymentCommitmentType,
        },
      });
    }

    if (dto.markCompleted !== false) {
      if (['READY', 'ACTIVE', 'ADVISOR_DECIDING'].includes(project.experimentStatus)) {
        await this.guard.transitionProject(projectId, 'COMPLETED');
      }
    }

    await this.analytics.track(projectId, project.cohort, 'project_outcome_submitted', {
      actorId,
      properties: {
        valueRating: dto.valueRating,
        secondOrderProvided: dto.secondOrderProvided,
        paymentCommitmentCents: dto.paymentCommitmentCents,
      },
    });

    return outcome;
  }

  async getOutcome(projectId: string) {
    const [outcome, travelEvents, feedbacks] = await Promise.all([
      this.prisma.gate1ProjectOutcome.findUnique({ where: { projectId } }),
      this.listTravelEvents(projectId),
      this.prisma.gate1ParticipantFeedback.findMany({
        where: { projectId },
        select: {
          id: true,
          rating: true,
          wouldRecommend: true,
          comment: true,
          submittedAt: true,
          participant: { select: { displayName: true } },
        },
      }),
    ]);

    return { outcome, travelEvents, participantFeedbacks: feedbacks };
  }

  async submitParticipantFeedback(token: string, dto: ParticipantFeedbackDto) {
    const participant = await this.prisma.gate1Participant.findUnique({
      where: { inviteToken: token },
      include: { project: true },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    if (participant.status !== 'SUBMITTED') {
      throw new BadRequestException('Participant must have submitted preferences before feedback');
    }

    const feedback = await this.prisma.gate1ParticipantFeedback.upsert({
      where: { participantId: participant.id },
      create: {
        projectId: participant.projectId,
        participantId: participant.id,
        rating: dto.rating ?? null,
        wouldRecommend: dto.wouldRecommend ?? null,
        comment: dto.comment ?? null,
      },
      update: {
        rating: dto.rating ?? undefined,
        wouldRecommend: dto.wouldRecommend ?? undefined,
        comment: dto.comment ?? undefined,
        submittedAt: new Date(),
      },
    });

    await this.analytics.track(participant.projectId, participant.project.cohort, 'participant_feedback_submitted', {
      participantId: participant.id,
      properties: { rating: dto.rating, wouldRecommend: dto.wouldRecommend },
    });

    return feedback;
  }
}
