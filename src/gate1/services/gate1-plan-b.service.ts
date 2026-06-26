import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdvisorPlanBPreDecisionDto,
  CreatePlanBDto,
  PublishOutputDto,
  RecordPlanBOutcomeDto,
} from '../dto/gate1.dto';
import { GATE1_PLAN_B_COHORTS } from '../constants/gate1.constants';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1ChangeNoticeService } from './gate1-change-notice.service';
import { Gate1RuntimeEventService } from '../../decision-runtime/services/gate1-runtime-event.service';
import type { Gate1RuntimeEmitResult } from '../../decision-runtime/types/gate1-runtime-emit.types';
import { ContingencyOrchestratorService } from '../../decision/contingency/contingency-orchestrator.service';

@Injectable()
export class Gate1PlanBService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly changeNotices: Gate1ChangeNoticeService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
    @Optional() private readonly contingencyOrchestrator?: ContingencyOrchestratorService,
  ) {}

  private assertPlanBCohort(cohort: string) {
    if (!GATE1_PLAN_B_COHORTS.includes(cohort as (typeof GATE1_PLAN_B_COHORTS)[number])) {
      throw new BadRequestException(`Plan B not applicable for cohort ${cohort}`);
    }
  }

  async createDraft(projectId: string, actorId: string, dto: CreatePlanBDto) {
    const project = await this.guard.requireProject(projectId);
    this.assertPlanBCohort(project.cohort);
    await this.guard.requireConfirmedBaseline(projectId);

    if (!dto.triggerCondition.trim()) {
      throw new BadRequestException('Plan B trigger condition must be observable (FR-PLB-02)');
    }

    const version = dto.version ?? 1;

    return this.prisma.gate1PlanB.create({
      data: {
        projectId,
        version,
        label: dto.label,
        status: 'DRAFT',
        sourceType: dto.sourceType ?? 'HUMAN_ASSISTED',
        humanMinutes: dto.humanMinutes ?? null,
        riskTitle: dto.riskTitle,
        riskDescription: dto.riskDescription ?? null,
        triggerCondition: dto.triggerCondition,
        latestDecisionAt: dto.latestDecisionAt ? new Date(dto.latestDecisionAt) : null,
        alternativeSummary: dto.alternativeSummary,
        costSummary: dto.costSummary ?? null,
        impactSummary: dto.impactSummary ?? null,
        createdBy: actorId,
      },
    });
  }

  async publish(projectId: string, planBId: string, actorId: string, dto: PublishOutputDto) {
    const project = await this.guard.requireProject(projectId);
    this.assertPlanBCohort(project.cohort);
    await this.guard.requireConfirmedBaseline(projectId);
    await this.guard.assertPublishWorkLog(projectId, dto.humanMinutes);

    const planB = await this.prisma.gate1PlanB.findFirst({
      where: { id: planBId, projectId },
    });
    if (!planB) throw new NotFoundException('Plan B not found');

    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.gate1PlanB.update({
        where: { id: planBId },
        data: {
          status: 'PUBLISHED',
          reviewedBy: dto.reviewedBy ?? actorId,
          publishedBy: actorId,
          publishedAt: new Date(),
          humanMinutes: dto.humanMinutes ?? planB.humanMinutes,
          sourceType: 'HUMAN_ASSISTED',
        },
      });

      if (dto.humanMinutes) {
        await tx.gate1ManualWorkLog.create({
          data: {
            projectId,
            taskType: 'PLAN_B',
            assigneeId: actorId,
            artifactRef: `${planB.label}-v${planB.version}`,
            minutes: dto.humanMinutes,
          },
        });
      }

      const emitResult = await this.runtimeEvents.contingencyPlanCreated({
        projectId,
        planBId: published.id,
        label: published.label,
        actorId,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return published;
    });

    this.runtimeEvents.flushStaged(staged);

    await this.analytics.track(projectId, project.cohort, 'plan_b_published', {
      actorId,
      properties: { planBId, label: planB.label, source: 'HUMAN_ASSISTED' },
    });

    return { ...updated, humanAssistedLabel: '人工协助' };
  }

  async listForAdvisor(projectId: string) {
    const items = await this.prisma.gate1PlanB.findMany({
      where: { projectId, status: 'PUBLISHED' },
      orderBy: [{ version: 'asc' }, { label: 'asc' }],
    });
    return items.map((p) => ({
      ...p,
      humanAssistedLabel: p.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : p.sourceType,
    }));
  }

  async recordPreDecision(planBId: string, dto: AdvisorPlanBPreDecisionDto) {
    const planB = await this.prisma.gate1PlanB.findUnique({ where: { id: planBId } });
    if (!planB || planB.status !== 'PUBLISHED') {
      throw new BadRequestException('Plan B must be published before advisor pre-decision');
    }

    return this.prisma.gate1PlanB.update({
      where: { id: planBId },
      data: {
        advisorPreDecision: dto.decision,
        advisorPreDecisionReason: dto.reason ?? null,
      },
    });
  }

  async recordOutcome(projectId: string, planBId: string, dto: RecordPlanBOutcomeDto) {
    const planB = await this.prisma.gate1PlanB.findFirst({
      where: { id: planBId, projectId, status: 'PUBLISHED' },
    });
    if (!planB) throw new NotFoundException('Published Plan B not found');

    const updated = await this.prisma.gate1PlanB.update({
      where: { id: planBId },
      data: {
        triggered: dto.triggered,
        triggeredAt: dto.triggered ? new Date() : planB.triggeredAt,
        adopted: dto.adopted ?? null,
        adoptedAt: dto.adopted === true ? new Date() : planB.adoptedAt,
        outcomeSummary: dto.outcomeSummary ?? null,
      },
    });

    const project = await this.guard.requireProject(projectId);
    if (dto.triggered) {
      await this.analytics.track(projectId, project.cohort, 'plan_b_triggered', {
        properties: { planBId, adopted: dto.adopted ?? null },
      });
      await this.changeNotices.createFromPlanBTrigger(projectId, planBId, 'system');

      if (this.contingencyOrchestrator) {
        await this.contingencyOrchestrator.trigger({
          tripId: project.linkedTripId ?? projectId,
          reason: 'plan_b_triggered',
          pathId: 'ADVISOR_PLAN_B',
          humanAssisted: true,
          metadata: {
            projectId,
            planBId,
            triggered: dto.triggered,
            adopted: dto.adopted ?? null,
            outcomeSummary: dto.outcomeSummary ?? null,
            label: planB.label,
          },
        });
      }
    }

    return updated;
  }
}
