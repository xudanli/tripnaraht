import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConflictFeedbackDto,
  CreateCandidateDto,
  PublishOutputDto,
  UpsertConflictReportDto,
} from '../dto/gate1.dto';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1AccessService } from './gate1-access.service';
import {
  Gate1RuntimeEventService,
  type Gate1RuntimeEmitResult,
} from '../../decision-runtime/services/gate1-runtime-event.service';

@Injectable()
export class Gate1ConflictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly access: Gate1AccessService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async upsertDraft(projectId: string, actorId: string, dto: UpsertConflictReportDto) {
    await this.guard.requireConfirmedBaseline(projectId);
    const project = await this.guard.requireProject(projectId);

    const latest = await this.prisma.gate1ConflictReport.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = dto.version ?? (latest ? latest.version + 1 : 1);

    const existing = await this.prisma.gate1ConflictReport.findUnique({
      where: { projectId_version: { projectId, version } },
      include: { findings: true },
    });

    if (existing?.status === 'PUBLISHED') {
      throw new BadRequestException('Cannot edit published report; create new version');
    }

    const report = existing
      ? await this.prisma.gate1ConflictReport.update({
          where: { id: existing.id },
          data: {
            sourceType: dto.sourceType ?? 'HUMAN_ASSISTED',
            humanMinutes: dto.humanMinutes ?? existing.humanMinutes,
          },
        })
      : await this.prisma.gate1ConflictReport.create({
          data: {
            projectId,
            version,
            status: 'DRAFT',
            sourceType: dto.sourceType ?? 'HUMAN_ASSISTED',
            humanMinutes: dto.humanMinutes ?? null,
            createdBy: actorId,
          },
        });

    if (existing) {
      await this.prisma.gate1ConflictFinding.deleteMany({ where: { reportId: report.id } });
    }

    await this.prisma.gate1ConflictFinding.createMany({
      data: dto.findings.map((f, i) => ({
        reportId: report.id,
        conflictType: f.conflictType,
        severity: f.severity,
        confidence: f.confidence,
        source: f.source,
        baselineStatus: f.baselineStatus,
        title: f.title,
        description: f.description,
        evidence: asInputJson(f.evidence),
        resolutionDirection: f.resolutionDirection ?? null,
        isBlocker: f.isBlocker ?? false,
        sortOrder: i,
      })),
    });

    if (project.experimentStatus === 'COLLECTING') {
      await this.guard.transitionProject(projectId, 'ANALYZING');
    }

    return this.getReport(report.id);
  }

  async publish(projectId: string, version: number, actorId: string, dto: PublishOutputDto) {
    await this.guard.requireConfirmedBaseline(projectId);
    await this.guard.requireApprovedSanitizedConstraints(projectId);
    await this.guard.assertPublishWorkLog(projectId, dto.humanMinutes);

    const report = await this.prisma.gate1ConflictReport.findUnique({
      where: { projectId_version: { projectId, version } },
      include: { findings: true },
    });
    if (!report) throw new NotFoundException('Conflict report not found');
    if (report.findings.length === 0) {
      throw new BadRequestException('Conflict report must contain findings');
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.gate1ConflictReport.update({
        where: { id: report.id },
        data: {
          status: 'PUBLISHED',
          reviewedBy: dto.reviewedBy ?? actorId,
          publishedBy: actorId,
          publishedAt: new Date(),
          humanMinutes: dto.humanMinutes ?? report.humanMinutes,
          sourceType: 'HUMAN_ASSISTED',
        },
        include: { findings: true },
      });

      if (dto.humanMinutes) {
        await tx.gate1ManualWorkLog.create({
          data: {
            projectId,
            taskType: 'CONFLICT_REPORT',
            assigneeId: actorId,
            artifactRef: `conflict-v${version}`,
            minutes: dto.humanMinutes,
          },
        });
      }

      const emitResult = await this.runtimeEvents.conflictDetected({
        projectId,
        reportId: published.id,
        version: published.version,
        actorId,
        findingCount: published.findings.length,
        sourceType: published.sourceType,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return published;
    });

    this.runtimeEvents.flushStaged(staged);

    const project = await this.guard.requireProject(projectId);
    if (project.experimentStatus === 'ANALYZING') {
      await this.guard.transitionProject(projectId, 'ADVISOR_DECIDING');
    }

    await this.analytics.track(projectId, project.cohort, 'conflict_report_published', {
      actorId,
      properties: { version, humanMinutes: updated.humanMinutes, source: 'HUMAN_ASSISTED' },
    });

    return updated;
  }

  async getPublishedForAdvisor(projectId: string) {
    const reports = await this.prisma.gate1ConflictReport.findMany({
      where: { projectId, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      include: { findings: true },
    });
    return reports.map((r) => ({
      ...r,
      humanAssistedLabel: r.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : r.sourceType,
    }));
  }

  async getReport(reportId: string) {
    return this.prisma.gate1ConflictReport.findUnique({
      where: { id: reportId },
      include: { findings: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async recordFeedback(findingId: string, dto: ConflictFeedbackDto, actorId?: string) {
    if (actorId) {
      await this.access.assertAdvisorFindingAccess(findingId, actorId);
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const finding = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.gate1ConflictFinding.update({
        where: { id: findingId },
        data: {
          advisorFeedback: dto.feedback,
          advisorFeedbackNote: dto.note ?? null,
        },
        include: { report: true },
      });

      if (
        actorId &&
        (dto.feedback === 'CONFIRMED' ||
          dto.feedback === 'DISMISSED' ||
          dto.feedback === 'RESOLVED')
      ) {
        const emitResult = await this.runtimeEvents.conflictAdvisorFeedback({
          projectId: updated.report.projectId,
          findingId,
          reportId: updated.reportId,
          action: dto.feedback,
          actorId,
          tx,
        });
        if (emitResult) staged.push(emitResult);
      }

      return updated;
    });

    this.runtimeEvents.flushStaged(staged);

    await this.analytics.track(
      finding.report.projectId,
      (await this.guard.requireProject(finding.report.projectId)).cohort,
      'conflict_feedback_recorded',
      { properties: { findingId, valueStatus: dto.feedback } },
    );

    return finding;
  }

  async recordFindingAction(
    findingId: string,
    actorId: string,
    dto: import('../dto/gate1.dto').ConflictFindingActionDto,
  ) {
    await this.access.assertAdvisorFindingAccess(findingId, actorId);
    const actionFeedbackMap = {
      CONFIRM: 'CONFIRMED',
      DISMISS: 'DISMISSED',
      RESOLVE: 'RESOLVED',
    } as const;

    const staged: Gate1RuntimeEmitResult[] = [];

    const finding = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.gate1ConflictFinding.update({
        where: { id: findingId },
        data: {
          advisorFeedback: actionFeedbackMap[dto.action],
          advisorFeedbackNote: dto.reason ?? dto.resolutionStrategy ?? null,
        },
        include: { report: true },
      });

      const mappedAction = actionFeedbackMap[dto.action];
      if (
        mappedAction === 'CONFIRMED' ||
        mappedAction === 'DISMISSED' ||
        mappedAction === 'RESOLVED'
      ) {
        const emitResult = await this.runtimeEvents.conflictAdvisorFeedback({
          projectId: updated.report.projectId,
          findingId,
          reportId: updated.reportId,
          action: mappedAction,
          actorId,
          tx,
        });
        if (emitResult) staged.push(emitResult);
      }

      return updated;
    });

    this.runtimeEvents.flushStaged(staged);

    const project = await this.guard.requireProject(finding.report.projectId);
    await this.analytics.track(project.id, project.cohort, 'conflict_finding_actioned', {
      actorId,
      properties: {
        findingId,
        action: dto.action,
        severity: finding.severity,
      },
    });

    return finding;
  }
}

@Injectable()
export class Gate1CandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async createDraft(projectId: string, actorId: string, dto: CreateCandidateDto) {
    await this.guard.requireConfirmedBaseline(projectId);
    const version = dto.version ?? 1;

    return this.prisma.gate1CandidateStrategy.create({
      data: {
        projectId,
        version,
        label: dto.label,
        status: 'DRAFT',
        sourceType: dto.sourceType ?? 'HUMAN_ASSISTED',
        humanMinutes: dto.humanMinutes ?? null,
        strategySummary: dto.strategySummary,
        constraintSatisfaction: asInputJson(dto.constraintSatisfaction),
        tradeoffs: asInputJson(dto.tradeoffs),
        risks: asInputJson(dto.risks),
        budgetSummary: dto.budgetSummary ?? null,
        createdBy: actorId,
      },
    });
  }

  async publish(projectId: string, candidateId: string, actorId: string, dto: PublishOutputDto) {
    await this.guard.requireConfirmedBaseline(projectId);
    await this.guard.assertPublishWorkLog(projectId, dto.humanMinutes);

    const candidate = await this.prisma.gate1CandidateStrategy.findFirst({
      where: { id: candidateId, projectId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.gate1CandidateStrategy.update({
        where: { id: candidateId },
        data: {
          status: 'PUBLISHED',
          reviewedBy: dto.reviewedBy ?? actorId,
          publishedBy: actorId,
          publishedAt: new Date(),
          humanMinutes: dto.humanMinutes ?? candidate.humanMinutes,
          sourceType: 'HUMAN_ASSISTED',
        },
      });

      if (dto.humanMinutes) {
        await tx.gate1ManualWorkLog.create({
          data: {
            projectId,
            taskType: 'CANDIDATE_STRATEGY',
            assigneeId: actorId,
            artifactRef: `${candidate.label}-v${candidate.version}`,
            minutes: dto.humanMinutes,
          },
        });
      }

      const emitResult = await this.runtimeEvents.candidateStrategyCreated({
        projectId,
        candidateId: published.id,
        version: published.version,
        label: published.label,
        sourceType: published.sourceType,
        actorId,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return published;
    });

    this.runtimeEvents.flushStaged(staged);

    await this.analytics.track(
      projectId,
      (await this.guard.requireProject(projectId)).cohort,
      'candidate_published',
      {
        actorId,
        properties: {
          candidateId,
          label: candidate.label,
          version: candidate.version,
          source: 'HUMAN_ASSISTED',
        },
      },
    );

    return {
      ...updated,
      humanAssistedLabel: '人工协助',
    };
  }

  async listForAdvisor(projectId: string) {
    const candidates = await this.prisma.gate1CandidateStrategy.findMany({
      where: { projectId, status: 'PUBLISHED' },
      orderBy: [{ version: 'asc' }, { label: 'asc' }],
    });
    return candidates.map((c) => ({
      ...c,
      humanAssistedLabel: c.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : c.sourceType,
    }));
  }

  async compare(projectId: string, candidateAId: string, candidateBId: string) {
    const [a, b] = await Promise.all([
      this.prisma.gate1CandidateStrategy.findFirst({
        where: { id: candidateAId, projectId, status: 'PUBLISHED' },
      }),
      this.prisma.gate1CandidateStrategy.findFirst({
        where: { id: candidateBId, projectId, status: 'PUBLISHED' },
      }),
    ]);
    if (!a || !b) {
      throw new NotFoundException('Both candidates must be published strategies for this project');
    }

    return {
      candidateA: { id: a.id, label: a.label, version: a.version, ...this.candidateCompareFields(a) },
      candidateB: { id: b.id, label: b.label, version: b.version, ...this.candidateCompareFields(b) },
      dimensions: ['constraintSatisfaction', 'tradeoffs', 'risks', 'budgetSummary', 'strategySummary'].map(
        (key) => ({
          key,
          a: (a as Record<string, unknown>)[key] ?? null,
          b: (b as Record<string, unknown>)[key] ?? null,
          changed:
            JSON.stringify((a as Record<string, unknown>)[key]) !==
            JSON.stringify((b as Record<string, unknown>)[key]),
        }),
      ),
    };
  }

  async createAdvisorVersion(
    projectId: string,
    advisorUserId: string,
    dto: import('../dto/gate1.dto').CreateAdvisorCandidateDto,
  ) {
    await this.guard.requireConfirmedBaseline(projectId);

    let baseVersion = 0;
    if (dto.basedOnCandidateId) {
      const base = await this.prisma.gate1CandidateStrategy.findFirst({
        where: { id: dto.basedOnCandidateId, projectId, status: 'PUBLISHED' },
      });
      if (!base) {
        throw new BadRequestException('basedOnCandidateId must reference a published strategy');
      }
      baseVersion = base.version;
    }

    const latest = await this.prisma.gate1CandidateStrategy.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = Math.max(latest?.version ?? 0, baseVersion) + 1;
    const now = new Date();

    const candidate = await this.prisma.gate1CandidateStrategy.create({
      data: {
        projectId,
        version,
        label: dto.label,
        status: 'PUBLISHED',
        sourceType: 'ADVISOR',
        strategySummary: dto.strategySummary,
        constraintSatisfaction: asInputJson(dto.constraintSatisfaction),
        tradeoffs: asInputJson(dto.tradeoffs),
        risks: asInputJson(dto.risks),
        budgetSummary: dto.budgetSummary ?? null,
        createdBy: advisorUserId,
        publishedBy: advisorUserId,
        publishedAt: now,
      },
    });

    const project = await this.guard.requireProject(projectId);
    await this.analytics.track(projectId, project.cohort, 'advisor_strategy_created', {
      actorId: advisorUserId,
      properties: {
        candidateId: candidate.id,
        basedOnCandidateId: dto.basedOnCandidateId ?? null,
        version,
        modificationNote: dto.modificationNote ?? null,
      },
    });

    void this.runtimeEvents.candidateStrategyCreated({
      projectId,
      candidateId: candidate.id,
      version: candidate.version,
      label: candidate.label,
      sourceType: candidate.sourceType,
      actorId: advisorUserId,
    });

    return {
      ...candidate,
      humanAssistedLabel: '● 顾问判断',
      basedOnCandidateId: dto.basedOnCandidateId ?? null,
    };
  }

  private candidateCompareFields(candidate: {
    strategySummary: string;
    constraintSatisfaction: unknown;
    tradeoffs: unknown;
    risks: unknown;
    budgetSummary: string | null;
    sourceType: string;
    publishedAt: Date | null;
  }) {
    return {
      strategySummary: candidate.strategySummary,
      constraintSatisfaction: candidate.constraintSatisfaction,
      tradeoffs: candidate.tradeoffs,
      risks: candidate.risks,
      budgetSummary: candidate.budgetSummary,
      sourceType: candidate.sourceType,
      humanAssistedLabel: candidate.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : candidate.sourceType,
      publishedAt: candidate.publishedAt,
    };
  }
}
