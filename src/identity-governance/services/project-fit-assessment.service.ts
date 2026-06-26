import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FIT_RESULT_LABELS } from '../constants/project-fit.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { ProjectEligibilityRuleService } from './project-eligibility-rule.service';
import {
  buildDynamicQuestionnaire,
  FitQuestionnairePhase,
  parseListingFitConfig,
  validateRequiredAnswers,
} from '../utils/fit-questionnaire.util';
import {
  buildReportForRole,
  evaluateProjectFit,
} from '../utils/project-fit-evaluation.util';
import { buildSupplyContext } from '../utils/supply-context.util';

export type SaveFitAnswerInput = {
  questionKey: string;
  answer: unknown;
  sensitivityLevel?: string;
  consentScope?: Record<string, unknown>;
};

@Injectable()
export class ProjectFitAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly eligibilityRules: ProjectEligibilityRuleService,
  ) {}

  async getQuestionnaire(listingId: string, phase: FitQuestionnairePhase = 'full') {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');

    const rules = await this.eligibilityRules.listActiveRules(listingId);
    const fitConfig = parseListingFitConfig(listing.metadata);
    const questions = buildDynamicQuestionnaire({ rules, fitConfig, phase });
    const ruleSnapshotVersion = await this.eligibilityRules.getRuleSnapshotVersion(listingId);

    return {
      listingId,
      phase,
      ruleSnapshotVersion,
      estimatedMinutes: phase === 'preview' ? 2 : 5,
      questions,
    };
  }

  async startAssessment(userId: string, listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.listingStatus !== 'published') {
      throw new NotFoundException('项目不存在或未发布');
    }

    const ruleSnapshotVersion = await this.eligibilityRules.getRuleSnapshotVersion(listingId);
    const questionnaire = await this.getQuestionnaire(listingId, 'full');

    const assessment = await this.prisma.projectFitAssessment.create({
      data: {
        listingId,
        userId,
        ruleSnapshotVersion,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        explanationBundle: {
          questionnaireKeys: questionnaire.questions.map((q) => q.questionKey),
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'FIT_ASSESSMENT_STARTED',
      targetType: 'PROJECT_FIT_ASSESSMENT',
      targetId: assessment.id,
    });

    return { ...assessment, questionnaire };
  }

  async saveAnswers(userId: string, assessmentId: string, answers: SaveFitAnswerInput[]) {
    const assessment = await this.requireOwnerAssessment(userId, assessmentId);
    this.assertAssessmentEditable(assessment);

    for (const item of answers) {
      await this.prisma.fitAnswer.upsert({
        where: {
          assessmentId_questionKey: {
            assessmentId,
            questionKey: item.questionKey,
          },
        },
        create: {
          assessmentId,
          questionKey: item.questionKey,
          answer: item.answer as Prisma.InputJsonValue,
          sensitivityLevel: item.sensitivityLevel ?? 'LOW',
          consentScope: item.consentScope as Prisma.InputJsonValue | undefined,
        },
        update: {
          answer: item.answer as Prisma.InputJsonValue,
          sensitivityLevel: item.sensitivityLevel ?? 'LOW',
          consentScope: item.consentScope as Prisma.InputJsonValue | undefined,
        },
      });
    }

    if (assessment.status === 'NOT_STARTED') {
      await this.prisma.projectFitAssessment.update({
        where: { id: assessmentId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return this.prisma.fitAnswer.findMany({ where: { assessmentId } });
  }

  async evaluate(userId: string, assessmentId: string) {
    const assessment = await this.requireOwnerAssessment(userId, assessmentId);
    this.assertAssessmentEditable(assessment);
    await this.assertAssessmentFresh(assessment);

    const listing = await this.prisma.trustedProjectListing.findUnique({
      where: { id: assessment.listingId },
    });
    if (!listing) throw new NotFoundException('项目不存在');

    const rules = await this.eligibilityRules.listActiveRules(assessment.listingId);
    const fitConfig = parseListingFitConfig(listing.metadata);
    const questionnaire = buildDynamicQuestionnaire({ rules, fitConfig, phase: 'full' });
    const answers = await this.prisma.fitAnswer.findMany({ where: { assessmentId } });
    const answerMap = this.toAnswerMap(answers);

    const missing = validateRequiredAnswers(questionnaire, answerMap);
    if (missing.length > 0) {
      throw new BadRequestException(`请先完成必填问题：${missing.join(', ')}`);
    }

    const documentRules = rules.filter((r) => r.evidenceRequirement === 'DOCUMENT');
    if (documentRules.length > 0) {
      const uploadedDocs = await this.prisma.projectFitDocument.count({
        where: {
          assessmentId,
          ocrStatus: { in: ['COMPLETED', 'SKIPPED'] },
        },
      });
      if (uploadedDocs === 0) {
        throw new BadRequestException('该项目要求上传证件材料，请先完成文档上传');
      }
    }

    const result = evaluateProjectFit({
      rules: rules.map((r) => ({
        id: r.id,
        conditionKey: r.conditionKey,
        operator: r.operator,
        value: r.value,
        severity: r.severity as never,
        waiverPolicy: r.waiverPolicy,
        explanationTemplate: r.explanationTemplate,
      })),
      answers: answerMap,
      listing: {
        budgetMinCents: listing.budgetMinCents,
        budgetMaxCents: listing.budgetMaxCents,
        slotsTotal: listing.slotsTotal,
        slotsFilled: listing.slotsFilled,
        startDate: listing.startDate,
        endDate: listing.endDate,
      },
      enabledSoftDimensions: fitConfig.enabledSoftDimensions,
      supplyContext: await this.loadSupplyContext(assessment.listingId, listing),
    });

    const updated = await this.prisma.projectFitAssessment.update({
      where: { id: assessmentId },
      data: {
        status: 'COMPLETED',
        overallResult: result.overallResult,
        hardResults: result.hardResults as unknown as Prisma.InputJsonValue,
        dimensionResults: result.dimensionResults as unknown as Prisma.InputJsonValue,
        teamImpactResult: result.teamImpactResult as unknown as Prisma.InputJsonValue,
        requiredConfirmations: result.requiredConfirmations as unknown as Prisma.InputJsonValue,
        explanationBundle: result.explanationBundle as unknown as Prisma.InputJsonValue,
        evaluatedAt: new Date(),
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'FIT_ASSESSMENT_COMPLETED',
      targetType: 'PROJECT_FIT_ASSESSMENT',
      targetId: assessmentId,
      after: { overallResult: result.overallResult },
    });

    return {
      ...updated,
      overallResultLabel: FIT_RESULT_LABELS[result.overallResult],
    };
  }

  async getReport(
    requesterId: string,
    assessmentId: string,
    role: 'applicant' | 'leader' | 'operator',
  ) {
    const assessment = await this.prisma.projectFitAssessment.findUnique({
      where: { id: assessmentId },
      include: { listing: true },
    });
    if (!assessment) throw new NotFoundException('评估不存在');
    if (assessment.status !== 'COMPLETED') {
      throw new BadRequestException('评估尚未完成');
    }

    if (role === 'applicant' && assessment.userId !== requesterId) {
      throw new ForbiddenException('无权查看该评估报告');
    }
    if (role === 'leader') {
      const listing = assessment.listing;
      const isManager =
        listing.responsibleUserId === requesterId || listing.createdByUserId === requesterId;
      if (!isManager) throw new ForbiddenException('无权查看领队报告');
    }

    const bundle = assessment.explanationBundle as object | null;
    const evaluation = {
      overallResult: assessment.overallResult as never,
      hardResults: (assessment.hardResults as never) ?? [],
      dimensionResults: (assessment.dimensionResults as never) ?? [],
      teamImpactResult: (assessment.teamImpactResult as never) ?? {
        level: 'LOW',
        summary: '',
        privacySafeSummary: '',
        factors: [],
      },
      requiredConfirmations: (assessment.requiredConfirmations as string[]) ?? [],
      explanationBundle: (bundle as never) ?? { applicant: [], leader: [], operator: [] },
    };

    return {
      assessmentId: assessment.id,
      listingId: assessment.listingId,
      overallResult: assessment.overallResult,
      overallResultLabel: FIT_RESULT_LABELS[assessment.overallResult as keyof typeof FIT_RESULT_LABELS],
      ruleSnapshotVersion: assessment.ruleSnapshotVersion,
      report: buildReportForRole(evaluation, role),
    };
  }

  async getLatestForUser(userId: string, listingId: string) {
    return this.prisma.projectFitAssessment.findFirst({
      where: { userId, listingId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAssessmentStatusForUser(userId: string, listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');

    const currentRuleVersion = await this.eligibilityRules.getRuleSnapshotVersion(listingId);
    const latest = await this.getLatestForUser(userId, listingId);

    if (!latest) {
      return {
        listingId,
        hasAssessment: false,
        needsReassessment: false,
        reasons: {},
        currentRuleVersion,
        assessment: null,
      };
    }

    const ruleStale = latest.ruleSnapshotVersion < currentRuleVersion;
    const timeExpired =
      latest.expiresAt instanceof Date && latest.expiresAt.getTime() < Date.now();
    const statusExpired = latest.status === 'EXPIRED';
    const needsReassessment =
      ruleStale ||
      timeExpired ||
      statusExpired ||
      (latest.status === 'COMPLETED' && ruleStale);

    return {
      listingId,
      hasAssessment: true,
      needsReassessment,
      reasons: {
        ruleStale,
        timeExpired: timeExpired || statusExpired,
      },
      currentRuleVersion,
      assessment: {
        id: latest.id,
        status: latest.status,
        overallResult: latest.overallResult,
        ruleSnapshotVersion: latest.ruleSnapshotVersion,
        expiresAt: latest.expiresAt,
        evaluatedAt: latest.evaluatedAt,
      },
    };
  }

  async expireOutdated(): Promise<number> {
    const result = await this.prisma.projectFitAssessment.updateMany({
      where: {
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  private async loadSupplyContext(
    listingId: string,
    listing: {
      slotsTotal: number;
      slotsFilled: number;
      budgetMinCents: number | null;
      budgetMaxCents: number | null;
    },
  ) {
    const pendingStatuses = ['UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'WAITLISTED', 'APPROVED'];
    const pendingApplications = await this.prisma.trustedProjectApplication.findMany({
      where: { listingId, status: { in: pendingStatuses } },
      select: { fitAssessmentId: true },
    });

    const assessmentIds = pendingApplications
      .map((app) => app.fitAssessmentId)
      .filter((id): id is string => Boolean(id));

    const budgetAnswers = assessmentIds.length
      ? await this.prisma.fitAnswer.findMany({
          where: {
            assessmentId: { in: assessmentIds },
            questionKey: { in: ['budget_cents', 'budget_affordable'] },
          },
        })
      : [];

    const pendingBudgetCents: number[] = [];
    for (const row of budgetAnswers) {
      const raw = row.answer;
      const value =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'object' && raw && 'value' in (raw as object)
            ? Number((raw as { value: unknown }).value)
            : Number(raw);
      if (Number.isFinite(value)) pendingBudgetCents.push(value);
    }

    return buildSupplyContext({
      slotsTotal: listing.slotsTotal,
      slotsFilled: listing.slotsFilled,
      budgetMinCents: listing.budgetMinCents,
      budgetMaxCents: listing.budgetMaxCents,
      pendingApplications: pendingApplications.length,
      pendingBudgetCents,
    });
  }

  private toAnswerMap(answers: Array<{ questionKey: string; answer: unknown }>) {
    const answerMap: Record<string, unknown> = {};
    for (const row of answers) {
      answerMap[row.questionKey] = row.answer;
      if (typeof row.answer === 'object' && row.answer && 'value' in (row.answer as object)) {
        answerMap[row.questionKey] = (row.answer as { value: unknown }).value;
      }
    }
    return answerMap;
  }

  private assertAssessmentEditable(assessment: { status: string }) {
    if (!['NOT_STARTED', 'IN_PROGRESS'].includes(assessment.status)) {
      throw new BadRequestException('当前评估状态不可编辑');
    }
  }

  private async assertAssessmentFresh(assessment: { listingId: string; ruleSnapshotVersion: number }) {
    const currentVersion = await this.eligibilityRules.getRuleSnapshotVersion(assessment.listingId);
    if (assessment.ruleSnapshotVersion < currentVersion) {
      throw new BadRequestException('项目规则已更新，请重新评估');
    }
  }

  private async requireOwnerAssessment(userId: string, assessmentId: string) {
    const assessment = await this.prisma.projectFitAssessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('评估不存在');
    if (assessment.userId !== userId) throw new ForbiddenException('无权操作该评估');
    return assessment;
  }
}
