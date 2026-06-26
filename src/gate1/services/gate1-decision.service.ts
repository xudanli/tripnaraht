import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitAdvisorDecisionDto } from '../dto/gate1.dto';
import { GATE1_MATERIAL_CHANGE_TYPES } from '../constants/gate1.constants';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import {
  Gate1RuntimeEventService,
  type Gate1RuntimeEmitResult,
} from '../../decision-runtime/services/gate1-runtime-event.service';

@Injectable()
export class Gate1DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async submit(projectId: string, advisorUserId: string, dto: SubmitAdvisorDecisionDto) {
    const project = await this.guard.requireProject(projectId);

    if (dto.materialChange) {
      if (!dto.changeTypes?.length) {
        throw new BadRequestException(
          'materialChange=true requires at least one changeType (AC-05)',
        );
      }
      for (const t of dto.changeTypes) {
        if (!GATE1_MATERIAL_CHANGE_TYPES.includes(t as (typeof GATE1_MATERIAL_CHANGE_TYPES)[number])) {
          throw new BadRequestException(`Invalid change type: ${t}`);
        }
      }
      if (!dto.changeEvidence?.trim()) {
        throw new BadRequestException('materialChange=true requires changeEvidence (AC-05)');
      }
    } else if (dto.changeTypes?.length) {
      throw new BadRequestException(
        'changeTypes provided but materialChange=false — likely文案润色，不计入重要改变 (AC-05)',
      );
    }

    if (dto.selectedCandidateId) {
      const candidate = await this.prisma.gate1CandidateStrategy.findFirst({
        where: { id: dto.selectedCandidateId, projectId, status: 'PUBLISHED' },
      });
      if (!candidate) {
        throw new BadRequestException('Selected candidate must be a published strategy for this project');
      }
    }

    if (dto.conflictReportVersion != null) {
      const report = await this.prisma.gate1ConflictReport.findUnique({
        where: {
          projectId_version: { projectId, version: dto.conflictReportVersion },
        },
      });
      if (!report || report.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'Decision must reference a published conflict report version (AC-08)',
        );
      }
    }

    if (dto.materialChange) {
      await this.invalidateProposalFeedbacks(projectId, dto.selectedCandidateId);
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const decision = await this.prisma.$transaction(async (tx) => {
      const created = await tx.gate1AdvisorDecision.create({
        data: {
          projectId,
          selectedCandidateId: dto.selectedCandidateId ?? null,
          conflictReportVersion: dto.conflictReportVersion ?? null,
          adoptedNone: dto.adoptedNone ?? false,
          modificationSummary: dto.modificationSummary ?? null,
          reasonCodes: asInputJson(dto.reasonCodes),
          reasonText: dto.reasonText ?? null,
          materialChange: dto.materialChange,
          changeTypes: asInputJson(dto.changeTypes),
          changeEvidence: dto.changeEvidence ?? null,
          valuableButNotAdopted: dto.valuableButNotAdopted ?? false,
          rejectionReason: dto.rejectionReason ?? null,
          submittedBy: advisorUserId,
        },
        include: { selectedCandidate: true },
      });

      const emitResult = await this.runtimeEvents.decisionRecorded({
        projectId,
        decisionId: created.id,
        selectedCandidateId: dto.selectedCandidateId,
        materialChange: dto.materialChange,
        changeTypes: dto.changeTypes,
        conflictReportVersion: dto.conflictReportVersion,
        actorId: advisorUserId,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return created;
    });

    this.runtimeEvents.flushStaged(staged);

    if (['ADVISOR_DECIDING', 'ANALYZING'].includes(project.experimentStatus)) {
      await this.guard.transitionProject(projectId, 'READY');
    }

    await this.analytics.track(projectId, project.cohort, 'advisor_decision_submitted', {
      actorId: advisorUserId,
      properties: {
        materialChange: dto.materialChange,
        changeTypes: dto.changeTypes,
        conflictReportVersion: dto.conflictReportVersion,
        selectedCandidateId: dto.selectedCandidateId,
      },
    });

    return decision;
  }

  async getLatest(projectId: string) {
    return this.prisma.gate1AdvisorDecision.findFirst({
      where: { projectId },
      orderBy: { submittedAt: 'desc' },
      include: { selectedCandidate: true },
    });
  }

  async listAll(projectId: string) {
    return this.prisma.gate1AdvisorDecision.findMany({
      where: { projectId },
      orderBy: { submittedAt: 'desc' },
      include: { selectedCandidate: true },
    });
  }

  private async invalidateProposalFeedbacks(projectId: string, candidateId?: string | null) {
    const where = {
      projectId,
      status: 'SUBMITTED',
      ...(candidateId ? { candidateStrategyId: candidateId } : {}),
    };
    const invalidated = await this.prisma.gate1ProposalFeedback.updateMany({
      where,
      data: { status: 'INVALIDATED', invalidatedAt: new Date() },
    });
    if (invalidated.count > 0) {
      const project = await this.guard.requireProject(projectId);
      await this.analytics.track(projectId, project.cohort, 'proposal_confirmation_invalidated', {
        properties: { count: invalidated.count, candidateId },
      });
    }
  }
}
