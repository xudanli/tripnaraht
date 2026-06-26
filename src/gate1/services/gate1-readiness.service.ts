import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PublishOutputDto,
  ReadinessFeedbackDto,
  ReadinessFindingActionDto,
  UpsertReadinessReportDto,
} from '../dto/gate1.dto';
import { GATE1_READINESS_COHORTS, GATE1_READINESS_STATUSES } from '../constants/gate1.constants';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1AccessService } from './gate1-access.service';
import {
  Gate1RuntimeEventService,
  type Gate1RuntimeEmitResult,
} from '../../decision-runtime/services/gate1-runtime-event.service';

@Injectable()
export class Gate1ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly access: Gate1AccessService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  private assertReadinessCohort(cohort: string) {
    if (!GATE1_READINESS_COHORTS.includes(cohort as (typeof GATE1_READINESS_COHORTS)[number])) {
      throw new BadRequestException(
        `Readiness is not applicable for cohort ${cohort}; use PLANNING or NEAR_DEPARTURE`,
      );
    }
  }

  async upsertDraft(projectId: string, actorId: string, dto: UpsertReadinessReportDto) {
    const project = await this.guard.requireProject(projectId);
    this.assertReadinessCohort(project.cohort);
    await this.guard.requireConfirmedBaseline(projectId);

    const latest = await this.prisma.gate1ReadinessReport.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = dto.version ?? (latest ? latest.version + 1 : 1);

    const existing = await this.prisma.gate1ReadinessReport.findUnique({
      where: { projectId_version: { projectId, version } },
    });
    if (existing?.status === 'PUBLISHED') {
      throw new BadRequestException('Cannot edit published readiness report; create new version');
    }

    for (const f of dto.findings) {
      if (!GATE1_READINESS_STATUSES.includes(f.status as (typeof GATE1_READINESS_STATUSES)[number])) {
        throw new BadRequestException(`Invalid readiness status: ${f.status}`);
      }
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const report = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.gate1ReadinessReport.update({
            where: { id: existing.id },
            data: {
              sourceType: dto.sourceType ?? 'HUMAN_ASSISTED',
              humanMinutes: dto.humanMinutes ?? existing.humanMinutes,
            },
          })
        : await tx.gate1ReadinessReport.create({
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
        await tx.gate1ReadinessFinding.deleteMany({ where: { reportId: saved.id } });
      }

      await tx.gate1ReadinessFinding.createMany({
        data: dto.findings.map((f, i) => ({
          reportId: saved.id,
          dimension: f.dimension,
          status: f.status,
          title: f.title,
          description: f.description,
          evidence: asInputJson(f.evidence),
          responsibleParty: f.responsibleParty ?? null,
          dueAt: f.dueAt ? new Date(f.dueAt) : null,
          isIncremental: f.isIncremental ?? true,
          sortOrder: i,
        })),
      });

      const savedFindings = await tx.gate1ReadinessFinding.findMany({
        where: { reportId: saved.id },
        orderBy: { sortOrder: 'asc' },
      });

      for (const finding of savedFindings) {
        if (finding.status === 'RED') {
          const emitResult = await this.runtimeEvents.readinessBlockerRaised({
            projectId,
            findingId: finding.id,
            reportId: saved.id,
            reportVersion: saved.version,
            dimension: finding.dimension,
            status: finding.status,
            title: finding.title,
            actorId,
            tx,
          });
          if (emitResult) staged.push(emitResult);
        }
      }

      return saved;
    });

    this.runtimeEvents.flushStaged(staged);

    return this.getReport(report.id);
  }

  async publish(projectId: string, version: number, actorId: string, dto: PublishOutputDto) {
    const project = await this.guard.requireProject(projectId);
    this.assertReadinessCohort(project.cohort);
    await this.guard.requireConfirmedBaseline(projectId);
    await this.guard.assertPublishWorkLog(projectId, dto.humanMinutes);

    const report = await this.prisma.gate1ReadinessReport.findUnique({
      where: { projectId_version: { projectId, version } },
      include: { findings: true },
    });
    if (!report) throw new NotFoundException('Readiness report not found');
    if (report.findings.length === 0) {
      throw new BadRequestException('Readiness report must contain findings');
    }

    const redOpen = report.findings.filter((f) => f.status === 'RED' && !f.closedAt);
    if (redOpen.length > 0) {
      throw new BadRequestException(
        `Cannot publish: ${redOpen.length} RED finding(s) must be closed or risk-accepted first`,
      );
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.gate1ReadinessReport.update({
        where: { id: report.id },
        data: {
          status: 'PUBLISHED',
          reviewedBy: dto.reviewedBy ?? actorId,
          publishedBy: actorId,
          publishedAt: new Date(),
          humanMinutes: dto.humanMinutes ?? report.humanMinutes,
          sourceType: 'HUMAN_ASSISTED',
        },
        include: { findings: { orderBy: { sortOrder: 'asc' } } },
      });

      if (dto.humanMinutes) {
        await tx.gate1ManualWorkLog.create({
          data: {
            projectId,
            taskType: 'READINESS_REPORT',
            assigneeId: actorId,
            artifactRef: `readiness-v${version}`,
            minutes: dto.humanMinutes,
          },
        });
      }

      const emitResult = await this.runtimeEvents.readinessAssessmentRecorded({
        projectId,
        reportId: published.id,
        reportVersion: published.version,
        findingCount: published.findings.length,
        redCount: published.findings.filter((f) => f.status === 'RED').length,
        yellowCount: published.findings.filter((f) => f.status === 'YELLOW').length,
        greenCount: published.findings.filter((f) => f.status === 'GREEN').length,
        actorId,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return published;
    });

    this.runtimeEvents.flushStaged(staged);

    await this.analytics.track(projectId, project.cohort, 'readiness_report_published', {
      actorId,
      properties: {
        version,
        findingCount: updated.findings.length,
        incrementalCount: updated.findings.filter((f) => f.isIncremental).length,
        source: 'HUMAN_ASSISTED',
      },
    });

    return {
      ...updated,
      humanAssistedLabel: '人工协助',
    };
  }

  async getPublishedForAdvisor(projectId: string) {
    const reports = await this.prisma.gate1ReadinessReport.findMany({
      where: { projectId, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      include: { findings: { orderBy: { sortOrder: 'asc' } } },
    });
    return reports.map((r) => ({
      ...r,
      humanAssistedLabel: r.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : r.sourceType,
    }));
  }

  async getReport(reportId: string) {
    return this.prisma.gate1ReadinessReport.findUnique({
      where: { id: reportId },
      include: { findings: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async recordFeedback(findingId: string, dto: ReadinessFeedbackDto, actorId?: string) {
    if (actorId) {
      await this.access.assertAdvisorReadinessFindingAccess(findingId, actorId);
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const finding = await this.prisma.$transaction(async (tx) => {
      const before = await tx.gate1ReadinessFinding.findUnique({
        where: { id: findingId },
        include: { report: true },
      });
      if (!before) throw new NotFoundException('Readiness finding not found');

      const updated = await tx.gate1ReadinessFinding.update({
        where: { id: findingId },
        data: {
          advisorFeedback: dto.feedback,
          advisorFeedbackNote: dto.note ?? null,
          closedAt: dto.closeFinding ? new Date() : undefined,
        },
        include: { report: true },
      });

      if (
        dto.closeFinding &&
        before.status === 'RED' &&
        !before.closedAt &&
        actorId
      ) {
        const emitResult = await this.runtimeEvents.readinessBlockerResolved({
          projectId: updated.report.projectId,
          findingId,
          reportId: updated.reportId,
          reportVersion: updated.report.version,
          resolution: 'CLOSED',
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
      'readiness_feedback_recorded',
      { properties: { findingId, feedback: dto.feedback, isIncremental: finding.isIncremental } },
    );

    return finding;
  }

  async recordFindingAction(findingId: string, actorId: string, dto: ReadinessFindingActionDto) {
    await this.access.assertAdvisorReadinessFindingAccess(findingId, actorId);
    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const finding = await tx.gate1ReadinessFinding.findUnique({
        where: { id: findingId },
        include: { report: true },
      });
      if (!finding) throw new NotFoundException('Readiness finding not found');
      if (finding.report.status !== 'PUBLISHED') {
        throw new BadRequestException('Actions only allowed on published readiness findings');
      }

      const data: {
        responsibleParty?: string;
        dueAt?: Date;
        closedAt?: Date;
        advisorFeedbackNote?: string;
        evidence?: ReturnType<typeof asInputJson>;
      } = {};

      if (dto.action === 'ASSIGN') {
        if (!dto.responsibleParty?.trim()) {
          throw new BadRequestException('ASSIGN requires responsibleParty');
        }
        data.responsibleParty = dto.responsibleParty;
        if (dto.dueAt) data.dueAt = new Date(dto.dueAt);
      }

      if (dto.action === 'ACCEPT_RISK') {
        if (!dto.reason?.trim()) {
          throw new BadRequestException('ACCEPT_RISK requires reason with responsible party');
        }
        data.closedAt = new Date();
        data.advisorFeedbackNote = dto.reason;
      }

      if (dto.action === 'RESOLVE') {
        data.closedAt = new Date();
        data.advisorFeedbackNote = dto.reason ?? dto.solutionSummary ?? null;
      }

      if (dto.action === 'SELECT_SOLUTION') {
        if (!dto.solutionSummary?.trim()) {
          throw new BadRequestException('SELECT_SOLUTION requires solutionSummary');
        }
        const evidence =
          finding.evidence && typeof finding.evidence === 'object'
            ? { ...(finding.evidence as Record<string, unknown>) }
            : {};
        evidence.selectedSolution = dto.solutionSummary;
        data.evidence = asInputJson(evidence);
        data.advisorFeedbackNote = dto.reason ?? dto.solutionSummary;
      }

      const result = await tx.gate1ReadinessFinding.update({
        where: { id: findingId },
        data,
        include: { report: true },
      });

      if (
        finding.status === 'RED' &&
        !finding.closedAt &&
        data.closedAt &&
        (dto.action === 'RESOLVE' || dto.action === 'ACCEPT_RISK')
      ) {
        const emitResult = await this.runtimeEvents.readinessBlockerResolved({
          projectId: result.report.projectId,
          findingId,
          reportId: result.reportId,
          reportVersion: result.report.version,
          resolution: dto.action === 'ACCEPT_RISK' ? 'ACCEPT_RISK' : 'RESOLVED',
          actorId,
          tx,
        });
        if (emitResult) staged.push(emitResult);
      }

      return result;
    });

    this.runtimeEvents.flushStaged(staged);

    const project = await this.guard.requireProject(updated.report.projectId);
    await this.analytics.track(project.id, project.cohort, 'readiness_finding_actioned', {
      actorId,
      properties: { findingId, action: dto.action, severity: updated.status },
    });

    return updated;
  }
}
