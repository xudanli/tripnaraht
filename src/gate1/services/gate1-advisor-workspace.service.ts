import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import {
  AdvisorProjectSignals,
  computeDaysToDeparture,
  computeNextAction,
  computeRiskLevel,
  isTerminalStatus,
  needsActionScore,
} from '../utils/gate1-advisor-workspace.util';

export type ListProjectsQuery = {
  cohort?: string;
  experimentStatus?: string;
  destination?: string;
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  sort?: 'needs_action' | 'departure' | 'created';
  departingWithinDays?: number;
};

@Injectable()
export class Gate1AdvisorWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
  ) {}

  async listProjects(advisorUserId: string, query: ListProjectsQuery = {}) {
    const projects = await this.prisma.gate1Project.findMany({
      where: {
        advisorUserId,
        ...(query.cohort ? { cohort: query.cohort } : {}),
        ...(query.experimentStatus ? { experimentStatus: query.experimentStatus } : {}),
        ...(query.destination
          ? { destination: { contains: query.destination, mode: 'insensitive' } }
          : {}),
      },
      include: this.projectListInclude(),
      orderBy: { updatedAt: 'desc' },
    });

    const rows = projects.map((p) => this.toListRow(p));

    let filtered = rows;
    if (query.riskLevel) {
      filtered = filtered.filter((r) => r.riskLevel === query.riskLevel);
    }
    if (query.departingWithinDays != null) {
      filtered = filtered.filter(
        (r) =>
          r.daysToDeparture != null &&
          r.daysToDeparture >= 0 &&
          r.daysToDeparture <= query.departingWithinDays!,
      );
    }

    const sort = query.sort ?? 'needs_action';
    filtered.sort((a, b) => {
      if (sort === 'needs_action') return b.needsActionScore - a.needsActionScore;
      if (sort === 'departure') {
        const da = a.daysToDeparture ?? 9999;
        const db = b.daysToDeparture ?? 9999;
        return da - db;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return filtered;
  }

  async getOrgPortfolio(organizationId: string, userId: string, roles?: string[]) {
    const projects = await this.prisma.gate1Project.findMany({
      where: { organizationId },
      include: this.projectListInclude(),
      orderBy: { updatedAt: 'desc' },
    });
    const rows = projects.map((p) => this.toListRow(p));
    const active = rows.filter((r) => !isTerminalStatus(r.experimentStatus));
    const highRisk = active.filter((r) => r.riskLevel === 'HIGH');
    const funnel = active.reduce<Record<string, number>>((acc, r) => {
      acc[r.experimentStatus] = (acc[r.experimentStatus] ?? 0) + 1;
      return acc;
    }, {});

    return {
      organizationId,
      requestedBy: userId,
      roles,
      projectCount: rows.length,
      activeProjectCount: active.length,
      highRiskCount: highRisk.length,
      funnel,
      projects: rows.sort((a, b) => b.needsActionScore - a.needsActionScore),
    };
  }

  async getDashboard(advisorUserId: string) {
    const rows = await this.listProjects(advisorUserId, { sort: 'needs_action' });
    const active = rows.filter((r) => !isTerminalStatus(r.experimentStatus));

    const todos = active
      .filter((r) => r.nextAction)
      .slice(0, 10)
      .map((r) => ({
        projectId: r.id,
        projectTitle: r.title,
        cohort: r.cohort,
        ...r.nextAction!,
      }));

    const highRisk = active.filter((r) => r.riskLevel === 'HIGH').slice(0, 8);

    const funnel = active.reduce<Record<string, number>>((acc, r) => {
      acc[r.experimentStatus] = (acc[r.experimentStatus] ?? 0) + 1;
      return acc;
    }, {});

    const departingSoon = active
      .filter((r) => r.daysToDeparture != null && r.daysToDeparture >= 0 && r.daysToDeparture <= 30)
      .sort((a, b) => (a.daysToDeparture ?? 999) - (b.daysToDeparture ?? 999))
      .slice(0, 10);

    const metrics = await this.analytics.getMetrics();

    return {
      todos,
      highRiskProjects: highRisk,
      funnel,
      departingSoon,
      gate1Summary: {
        totalProjects: rows.length,
        activeProjects: active.length,
        materialChangeRate: metrics.value.materialChangeRate,
        nextOrderRate: metrics.commercial.secondOrderRate,
        totalHumanHours: metrics.productization.totalHumanMinutes / 60,
      },
    };
  }

  async getOverview(projectId: string) {
    await this.guard.requireProject(projectId);
    const project = await this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      include: {
        baselines: { where: { isConfirmed: true }, take: 1, orderBy: { version: 'desc' } },
        participants: { select: { id: true, status: true } },
        conflictReports: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          take: 1,
          include: { findings: true },
        },
        candidateStrategies: { where: { status: 'PUBLISHED' } },
        decisions: { take: 1, orderBy: { submittedAt: 'desc' } },
        readinessReports: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          take: 1,
          include: { findings: true },
        },
        planBs: { where: { status: 'PUBLISHED' } },
        outcome: true,
      },
    });
    if (!project) return null;

    const baseline = project.baselines[0] ?? null;
    const startDate = project.startDate ?? baseline?.startDate ?? null;
    const signals = this.buildSignals(project, startDate);
    const latestConflicts = project.conflictReports[0]?.findings ?? [];
    const latestReadiness = project.readinessReports[0]?.findings ?? [];

    return {
      project: {
        id: project.id,
        title: project.title,
        destination: project.destination ?? baseline?.destination ?? null,
        cohort: project.cohort,
        experimentStatus: project.experimentStatus,
        advisorUserId: project.advisorUserId,
        participantCount: project.participantCount ?? baseline?.participantCount ?? null,
        startDate,
        endDate: project.endDate ?? baseline?.endDate ?? null,
        daysToDeparture: computeDaysToDeparture(startDate),
      },
      summary: {
        memberCompletionRate: signals.participantCount
          ? signals.submittedCount / signals.participantCount
          : 0,
        conflictCount: latestConflicts.length,
        blockerConflictCount: latestConflicts.filter((f) => f.isBlocker).length,
        publishedCandidateCount: signals.publishedCandidateCount,
        redReadinessCount: signals.redReadinessCount,
        hasDecision: signals.hasDecision,
        planBCount: project.planBs.length,
        riskLevel: computeRiskLevel(signals),
      },
      nextAction: computeNextAction(projectId, signals),
      recentArtifacts: {
        latestConflictVersion: project.conflictReports[0]?.version ?? null,
        latestReadinessVersion: project.readinessReports[0]?.version ?? null,
        latestDecisionAt: project.decisions[0]?.submittedAt ?? null,
        outcomeStatus: project.outcome?.submittedAt ? 'SUBMITTED' : 'PENDING',
      },
      trustSurface: {
        schemaVersion: 1 as const,
        cardCount:
          project.candidateStrategies.length +
          project.planBs.length +
          (project.decisions.length > 0 ? 1 : 0),
        detailPath: `/advisor/projects/${projectId}/trust-surface`,
      },
    };
  }

  async getConstraintsSummary(projectId: string) {
    await this.guard.requireProject(projectId);
    const [sanitized, participants, privatePending] = await Promise.all([
      this.prisma.gate1SanitizedConstraint.findMany({
        where: { projectId, reviewStatus: 'APPROVED' },
        select: {
          id: true,
          explanation: true,
          impactSummary: true,
          reviewStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.gate1Participant.findMany({
        where: { projectId, status: { notIn: ['DECLINED', 'WITHDRAWN', 'DELETED'] } },
        select: {
          id: true,
          displayName: true,
          status: true,
          role: true,
          submittedAt: true,
        },
      }),
      this.prisma.gate1PrivateConstraint.count({
        where: {
          participant: { projectId },
          status: 'ACTIVE',
        },
      }),
    ]);

    const pendingReview = await this.prisma.gate1SanitizedConstraint.count({
      where: { projectId, reviewStatus: 'PENDING' },
    });

    const missingInfo = participants
      .filter((p) => !['SUBMITTED'].includes(p.status))
      .map((p) => ({
        participantId: p.id,
        displayName: p.displayName,
        role: p.role,
        status: p.status,
        reason:
          p.status === 'INVITED' || p.status === 'OPENED'
            ? 'NOT_STARTED'
            : p.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : 'NEEDS_FOLLOW_UP',
      }));

    return {
      sanitizedConstraints: sanitized,
      missingInfo,
      privateConstraintCount: privatePending,
      sanitizedPendingReview: pendingReview,
    };
  }

  private projectListInclude() {
    return {
      baselines: { where: { isConfirmed: true }, take: 1, orderBy: { version: 'desc' as const } },
      participants: { select: { id: true, status: true } },
      conflictReports: {
        where: { status: 'PUBLISHED' as const },
        orderBy: { version: 'desc' as const },
        take: 1,
        include: { findings: true },
      },
      candidateStrategies: { where: { status: 'PUBLISHED' as const }, select: { id: true } },
      decisions: { take: 1, orderBy: { submittedAt: 'desc' as const } },
      readinessReports: {
        where: { status: 'PUBLISHED' as const },
        orderBy: { version: 'desc' as const },
        take: 1,
        include: { findings: true },
      },
      planBs: {
        where: { status: 'PUBLISHED' as const },
        select: { id: true, advisorPreDecision: true },
      },
    };
  }

  private buildSignals(
    project: {
      experimentStatus: string;
      cohort: string;
      participants: Array<{ status: string }>;
      conflictReports: Array<{ findings: Array<{ advisorFeedback: string | null; isBlocker: boolean }> }>;
      candidateStrategies: Array<{ id: string }>;
      decisions: Array<{ id: string }>;
      readinessReports: Array<{ findings: Array<{ status: string }> }>;
      planBs: Array<{ advisorPreDecision: string | null }>;
      baselines: Array<{ isConfirmed?: boolean; startDate?: Date | null; destination?: string | null }>;
    },
    startDate: Date | null,
  ): AdvisorProjectSignals {
    const activeParticipants = project.participants.filter(
      (p) => !['DECLINED', 'WITHDRAWN', 'DELETED'].includes(p.status),
    );
    const latestFindings = project.conflictReports[0]?.findings ?? [];
    const latestReadiness = project.readinessReports[0]?.findings ?? [];

    return {
      experimentStatus: project.experimentStatus,
      cohort: project.cohort,
      hasConfirmedBaseline: project.baselines.length > 0,
      participantCount: activeParticipants.length,
      submittedCount: activeParticipants.filter((p) => p.status === 'SUBMITTED').length,
      hasPublishedConflicts: latestFindings.length > 0,
      unpublishedConflictFeedback: latestFindings.filter((f) => !f.advisorFeedback).length,
      publishedCandidateCount: project.candidateStrategies.length,
      hasDecision: project.decisions.length > 0,
      redReadinessCount: latestReadiness.filter((f) => f.status === 'RED').length,
      unpublishedPlanBCount: project.planBs.filter((p) => p.advisorPreDecision === 'PENDING').length,
      daysToDeparture: computeDaysToDeparture(startDate),
    };
  }

  private toListRow(project: {
    id: string;
    title: string;
    destination: string | null;
    cohort: string;
    experimentStatus: string;
    updatedAt: Date;
    startDate: Date | null;
    baselines: Array<{ startDate: Date | null; destination: string | null }>;
    participants: Array<{ status: string }>;
    conflictReports: Array<{ findings: Array<{ advisorFeedback: string | null; isBlocker: boolean }> }>;
    candidateStrategies: Array<{ id: string }>;
    decisions: Array<{ id: string }>;
    readinessReports: Array<{ findings: Array<{ status: string }> }>;
    planBs: Array<{ advisorPreDecision: string | null }>;
  }) {
    const startDate = project.startDate ?? project.baselines[0]?.startDate ?? null;
    const signals = this.buildSignals(project, startDate);
    const nextAction = computeNextAction(project.id, signals);

    return {
      id: project.id,
      title: project.title,
      destination: project.destination ?? project.baselines[0]?.destination ?? null,
      cohort: project.cohort,
      experimentStatus: project.experimentStatus,
      memberCompletionRate: signals.participantCount
        ? signals.submittedCount / signals.participantCount
        : 0,
      riskLevel: computeRiskLevel(signals),
      nextAction,
      daysToDeparture: signals.daysToDeparture,
      needsActionScore: needsActionScore(signals),
      updatedAt: project.updatedAt,
    };
  }
}
