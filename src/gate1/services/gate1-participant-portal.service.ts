import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GATE1_CONSENT_ITEMS,
  GATE1_CONSENT_TEXT_BY_TYPE,
  GATE1_CONSENT_TYPES,
  GATE1_CONSENT_VERSION,
  GATE1_PROPOSAL_FEEDBACK_RESPONSES,
} from '../constants/gate1.constants';
import { ProposalFeedbackDto } from '../dto/gate1.dto';
import {
  buildParticipantTodos,
  computeProgress,
  pickPrimaryAction,
  requiresFeedbackNote,
} from '../utils/gate1-participant-dashboard.util';
import { Gate1AnalyticsService } from './gate1-support.services';
import { Gate1ParticipantService } from './gate1-participant.service';
import { Gate1TrustSurfaceService } from './gate1-trust-surface.service';

@Injectable()
export class Gate1ParticipantPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: Gate1ParticipantService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly trustSurface: Gate1TrustSurfaceService,
  ) {}

  async getDashboard(token: string) {
    const participant = await this.participants.resolveByToken(token, { allowExpired: true });
    const full = await this.prisma.gate1Participant.findUnique({
      where: { id: participant.id },
      include: {
        project: true,
        consentRecords: { orderBy: { createdAt: 'desc' } },
        preferenceResponses: { orderBy: { version: 'desc' }, take: 1 },
        proposalFeedbacks: true,
      },
    });
    if (!full) throw new NotFoundException('Participant not found');

    const [publishedCandidates, participantTasks, changeNoticeRows] = await Promise.all([
      this.prisma.gate1CandidateStrategy.findMany({
        where: { projectId: full.projectId, status: 'PUBLISHED' },
        orderBy: [{ version: 'desc' }, { publishedAt: 'desc' }],
      }),
      this.prisma.gate1ParticipantTask.findMany({
        where: { participantId: full.id },
        orderBy: [{ blocking: 'desc' }, { dueAt: 'asc' }],
      }),
      this.prisma.gate1ChangeNotice.findMany({
        where: { projectId: full.projectId },
        orderBy: { publishedAt: 'desc' },
        include: { acks: { where: { participantId: full.id } } },
        take: 10,
      }),
    ]);

    const changeNotices = changeNoticeRows.map((n) => ({
      id: n.id,
      title: n.title,
      severity: n.severity,
      summary: n.whatHappened,
      actionRequired: n.actionRequired ?? undefined,
      deadline: n.deadline?.toISOString(),
      needsAck: n.requiresAck && n.acks.length === 0,
    }));

    const preferenceSubmitted = full.preferenceResponses.some((p) => p.status === 'SUBMITTED');
    const preferenceDraft = full.preferenceResponses.some((p) => p.status === 'DRAFT');

    const dashboardInput = {
      token,
      participantStatus: full.status,
      consentRecords: full.consentRecords,
      preferenceSubmitted,
      preferenceDraft,
      publishedCandidates,
      proposalFeedbacks: full.proposalFeedbacks,
      changeNotices,
      participantTasks,
      projectStage: full.project.experimentStatus,
    };

    const todos = buildParticipantTodos(dashboardInput);
    const progress = computeProgress({
      consentRecords: full.consentRecords,
      preferenceSubmitted,
      proposalFeedbacks: full.proposalFeedbacks,
      publishedCandidates,
      participantTasks,
    });

    const latestCandidate = publishedCandidates[0];
    const trustSurfaceSummary = await this.trustSurface.getParticipantTrustSurface(token);

    return {
      project: {
        id: full.project.id,
        title: full.project.title,
        destination: full.project.destination,
        stage: full.project.experimentStatus,
        startDate: full.project.startDate,
        endDate: full.project.endDate,
        cohort: full.project.cohort,
      },
      participant: {
        id: full.id,
        displayName: full.displayName,
        status: full.status,
        role: full.role,
      },
      primaryAction: pickPrimaryAction(todos),
      progress,
      todos,
      proposalSummary: latestCandidate
        ? {
            candidateId: latestCandidate.id,
            label: latestCandidate.label,
            version: latestCandidate.version,
            strategySummary: latestCandidate.strategySummary,
            publishedAt: latestCandidate.publishedAt,
          }
        : null,
      recentChanges: changeNotices.filter((n) => n.needsAck).slice(0, 3),
      readinessTasks: participantTasks,
      teamReadinessAggregate: {
        note: '团队层面仅显示聚合进度，不暴露他人阻塞详情',
      },
      consentStatus: full.consentRecords,
      trustSurface: {
        schemaVersion: 1 as const,
        cardCount: trustSurfaceSummary.summary.totalCards,
        detailPath: `/participant/projects/${token}/trust-surface`,
      },
    };
  }

  async getProposal(token: string, candidateId: string) {
    const participant = await this.participants.resolveByToken(token);
    const candidate = await this.prisma.gate1CandidateStrategy.findFirst({
      where: { id: candidateId, projectId: participant.projectId, status: 'PUBLISHED' },
    });
    if (!candidate) throw new NotFoundException('Published proposal not found');

    const feedback = await this.prisma.gate1ProposalFeedback.findUnique({
      where: {
        participantId_candidateStrategyId: {
          participantId: participant.id,
          candidateStrategyId: candidateId,
        },
      },
    });

    await this.analytics.track(
      participant.projectId,
      participant.project.cohort,
      'proposal_viewed',
      {
        participantId: participant.id,
        properties: {
          candidateId,
          proposalVersion: candidate.version,
        },
      },
    );

    return {
      proposal: {
        id: candidate.id,
        label: candidate.label,
        version: candidate.version,
        strategySummary: candidate.strategySummary,
        tradeoffs: candidate.tradeoffs,
        risks: candidate.risks,
        budgetSummary: candidate.budgetSummary,
        constraintSatisfaction: candidate.constraintSatisfaction,
        publishedAt: candidate.publishedAt,
      },
      feedback: feedback
        ? {
            response: feedback.response,
            status: feedback.status,
            candidateVersion: feedback.candidateVersion,
            submittedAt: feedback.submittedAt,
            needsReconfirm:
              feedback.status === 'INVALIDATED' ||
              feedback.candidateVersion < candidate.version,
          }
        : null,
    };
  }

  async submitProposalFeedback(token: string, candidateId: string, dto: ProposalFeedbackDto) {
    const participant = await this.participants.resolveByToken(token);
    if (!['CONSENTED', 'IN_PROGRESS', 'SUBMITTED'].includes(participant.status)) {
      throw new BadRequestException('Complete consent and preferences before proposal feedback');
    }

    if (!GATE1_PROPOSAL_FEEDBACK_RESPONSES.includes(dto.response)) {
      throw new BadRequestException(`Invalid feedback response: ${dto.response}`);
    }
    if (requiresFeedbackNote(dto.response) && !dto.note?.trim()) {
      throw new BadRequestException('Note required for this feedback type');
    }

    const candidate = await this.prisma.gate1CandidateStrategy.findFirst({
      where: { id: candidateId, projectId: participant.projectId, status: 'PUBLISHED' },
    });
    if (!candidate) throw new NotFoundException('Published proposal not found');

    const feedback = await this.prisma.gate1ProposalFeedback.upsert({
      where: {
        participantId_candidateStrategyId: {
          participantId: participant.id,
          candidateStrategyId: candidateId,
        },
      },
      create: {
        projectId: participant.projectId,
        participantId: participant.id,
        candidateStrategyId: candidateId,
        candidateVersion: candidate.version,
        response: dto.response,
        reasonType: dto.reasonType ?? null,
        note: dto.note ?? null,
        privateNote: dto.privateNote ?? null,
        status: 'SUBMITTED',
      },
      update: {
        candidateVersion: candidate.version,
        response: dto.response,
        reasonType: dto.reasonType ?? null,
        note: dto.note ?? null,
        privateNote: dto.privateNote ?? null,
        status: 'SUBMITTED',
        invalidatedAt: null,
        submittedAt: new Date(),
      },
    });

    const isHardBlock = dto.response === 'REJECT';
    if (isHardBlock) {
      const project = await this.prisma.gate1Project.findUnique({
        where: { id: participant.projectId },
        select: { advisorUserId: true },
      });
      await this.prisma.gate1ManualWorkLog.create({
        data: {
          projectId: participant.projectId,
          taskType: 'PARTICIPANT_PROPOSAL_BLOCKER',
          assigneeId: project?.advisorUserId ?? 'advisor',
          artifactRef: `proposal-v${candidate.version}`,
          notes: `Participant ${participant.displayName} rejected proposal ${candidate.label}`,
        },
      });
    }

    await this.analytics.track(
      participant.projectId,
      participant.project.cohort,
      'proposal_feedback_submitted',
      {
        participantId: participant.id,
        properties: {
          candidateId,
          proposalVersion: candidate.version,
          responseType: dto.response,
          hardBlock: isHardBlock,
        },
      },
    );

    return feedback;
  }

  async getPreferences(token: string) {
    const participant = await this.participants.resolveByToken(token);
    const [prefs, constraints] = await Promise.all([
      this.prisma.gate1PreferenceResponse.findFirst({
        where: { participantId: participant.id },
        orderBy: { version: 'desc' },
      }),
      this.prisma.gate1PrivateConstraint.findMany({
        where: { participantId: participant.id, status: 'ACTIVE' },
        select: {
          id: true,
          fieldKey: true,
          authorizationLevel: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);
    return { publicPrefs: prefs, privateConstraintMeta: constraints };
  }

  async listPrivateConstraints(token: string) {
    const participant = await this.participants.resolveByToken(token);
    return this.prisma.gate1PrivateConstraint.findMany({
      where: { participantId: participant.id },
      select: {
        id: true,
        fieldKey: true,
        authorizationLevel: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConsentCatalog() {
    return {
      version: GATE1_CONSENT_VERSION,
      items: GATE1_CONSENT_TYPES.map((type) => ({
        type,
        ...GATE1_CONSENT_ITEMS[type],
        text: GATE1_CONSENT_TEXT_BY_TYPE[type],
      })),
    };
  }
}
