import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGate1ProjectDto } from '../dto/gate1.dto';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1LinkedTripAnchorService } from '../../decision-runtime/services/gate1-linked-trip-anchor.service';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';

@Injectable()
export class Gate1ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly guard: Gate1GuardService,
    private readonly linkedTripAnchor: Gate1LinkedTripAnchorService,
  ) {}

  async create(advisorUserId: string, dto: CreateGate1ProjectDto) {
    const project = await this.prisma.gate1Project.create({
      data: {
        title: dto.title,
        cohort: dto.cohort,
        organizationId: dto.organizationId ?? null,
        advisorUserId,
        projectManagerId: dto.projectManagerId ?? null,
        destination: dto.destination ?? null,
        participantCount: dto.participantCount ?? null,
        linkedTripId: dto.linkedTripId ?? null,
        experimentStatus: 'DRAFT',
      },
    });

    await this.linkedTripAnchor.ensureOnCreate({
      projectId: project.id,
      advisorUserId,
      title: dto.title,
      destination: dto.destination,
      linkedTripId: dto.linkedTripId,
    });

    const refreshed = await this.prisma.gate1Project.findUniqueOrThrow({
      where: { id: project.id },
    });

    await this.analytics.track(project.id, project.cohort, 'gate1_project_created', {
      actorId: advisorUserId,
      organizationId: dto.organizationId,
      properties: { title: dto.title, linkedTripId: refreshed.linkedTripId },
    });

    return refreshed;
  }

  async list(advisorUserId?: string) {
    return this.prisma.gate1Project.findMany({
      where: advisorUserId ? { advisorUserId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        participants: { select: { id: true, status: true, displayName: true } },
        baselines: { where: { isConfirmed: true }, take: 1, orderBy: { version: 'desc' } },
        decisions: { take: 1, orderBy: { submittedAt: 'desc' } },
      },
    });
  }

  async getDetail(projectId: string) {
    await this.guard.requireProject(projectId);
    return this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      include: {
        baselines: { orderBy: { version: 'desc' } },
        participants: true,
        sanitizedConstraints: { where: { reviewStatus: 'APPROVED' } },
        conflictReports: { orderBy: { version: 'desc' }, include: { findings: true } },
        candidateStrategies: { orderBy: { version: 'desc' } },
        decisions: { orderBy: { submittedAt: 'desc' }, include: { selectedCandidate: true } },
        readinessReports: { orderBy: { version: 'desc' }, include: { findings: true } },
        planBs: { orderBy: { version: 'desc' } },
        travelEvents: { orderBy: { occurredAt: 'desc' }, take: 20 },
        outcome: true,
        participantFeedbacks: {
          select: { rating: true, wouldRecommend: true, submittedAt: true },
        },
        manualWorkLogs: true,
        privacyAssignments: true,
      },
    });
  }

  async transitionStatus(
    projectId: string,
    actorId: string,
    dto: import('../dto/gate1.dto').TransitionProjectDto,
  ) {
    const project = await this.guard.requireProject(projectId);
    await this.guard.transitionProject(
      projectId,
      dto.status as import('../constants/gate1.constants').Gate1ProjectStatus,
      actorId,
    );

    if (dto.reason) {
      const metadata = (project.metadata as Record<string, unknown> | null) ?? {};
      await this.prisma.gate1Project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            lastStatusChange: {
              from: project.experimentStatus,
              to: dto.status,
              reason: dto.reason,
              actorId,
              at: new Date().toISOString(),
            },
          },
        },
      });
    }

    await this.analytics.track(projectId, project.cohort, 'project_stage_changed', {
      actorId,
      properties: { from: project.experimentStatus, to: dto.status, reason: dto.reason ?? null },
    });

    return this.getDetail(projectId);
  }

  async listWorkLogs(projectId: string) {
    await this.guard.requireProject(projectId);
    const logs = await this.prisma.gate1ManualWorkLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    const totalMinutes = logs.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
    const byTaskType = logs.reduce<Record<string, number>>((acc, log) => {
      acc[log.taskType] = (acc[log.taskType] ?? 0) + (log.minutes ?? 0);
      return acc;
    }, {});
    return { logs, totalMinutes, byTaskType };
  }

  async getOpsQueue() {
    return this.prisma.gate1Project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: { select: { status: true } },
        baselines: { where: { isConfirmed: true }, take: 1 },
        conflictReports: { where: { status: 'DRAFT' }, take: 1 },
        candidateStrategies: { where: { status: 'DRAFT' }, take: 2 },
        readinessReports: { where: { status: 'DRAFT' }, take: 1 },
        planBs: { where: { status: 'DRAFT' }, take: 2 },
      },
    });
  }
}

@Injectable()
export class Gate1BaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly guard: Gate1GuardService,
  ) {}

  async submit(projectId: string, advisorUserId: string, dto: import('../dto/gate1.dto').SubmitBaselineDto) {
    const project = await this.guard.requireProject(projectId);

    const latest = await this.prisma.gate1ExperimentBaseline.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = latest ? latest.version + 1 : 1;
    const isConfirmed = dto.confirm === true;

    const baseline = await this.prisma.gate1ExperimentBaseline.create({
      data: {
        projectId,
        version,
        submittedBy: advisorUserId,
        submittedAt: isConfirmed ? new Date() : null,
        isConfirmed,
        participantCount: dto.participantCount ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        destination: dto.destination ?? null,
        customerType: dto.customerType ?? null,
        budgetRange: dto.budgetRange ?? null,
        currentStage: dto.currentStage ?? null,
        expectedFirstDraftHours: dto.expectedFirstDraftHours ?? null,
        expectedTotalHours: dto.expectedTotalHours ?? null,
        expectedRevisionRounds: dto.expectedRevisionRounds ?? null,
        difficultyLevel: dto.difficultyLevel ?? null,
        knownConstraints: asInputJson(dto.knownConstraints),
        knownConflicts: asInputJson(dto.knownConflicts),
        knownRisks: asInputJson(dto.knownRisks),
        pendingConfirmations: asInputJson(dto.pendingConfirmations),
        mightRejectWithoutTripnara: dto.mightRejectWithoutTripnara,
        rejectReason: dto.rejectReason ?? null,
        estimatedGmvCents: dto.estimatedGmvCents ?? null,
        originalPlanSummary: dto.originalPlanSummary ?? null,
        attachments: asInputJson(dto.attachments),
      },
    });

    if (isConfirmed && project.experimentStatus === 'DRAFT') {
      await this.guard.transitionProject(projectId, 'BASELINE_READY');
    }

    if (isConfirmed) {
      await this.analytics.track(projectId, project.cohort, 'baseline_submitted', {
        actorId: advisorUserId,
        properties: {
          version,
          expectedTotalHours: dto.expectedTotalHours,
          knownConflictCount: Array.isArray(dto.knownConflicts) ? dto.knownConflicts.length : 0,
        },
      });
    }

    return baseline;
  }

  async getLatest(projectId: string) {
    return this.prisma.gate1ExperimentBaseline.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
  }
}

export function generateInviteToken(): string {
  return randomBytes(24).toString('hex');
}
