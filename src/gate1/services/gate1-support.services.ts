import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1TripSyncService } from '../../decision-runtime/services/gate1-trip-sync.service';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1ProjectStatus } from '../constants/gate1.constants';
import { assertGate1Transition } from '../utils/gate1-state-machine.util';

@Injectable()
export class Gate1AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(
    projectId: string,
    cohort: string,
    eventName: string,
    props?: {
      actorId?: string;
      participantId?: string;
      organizationId?: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.gate1AnalyticsEvent.create({
      data: {
        projectId,
        cohort,
        eventName,
        actorId: props?.actorId ?? null,
        participantId: props?.participantId ?? null,
        organizationId: props?.organizationId ?? null,
        properties: asInputJson(props?.properties),
      },
    });
  }

  async getMetrics(cohort?: string) {
    const projectWhere = cohort ? { cohort } : {};
    const projects = await this.prisma.gate1Project.findMany({
      where: projectWhere,
      include: {
        participants: true,
        decisions: true,
        manualWorkLogs: true,
        readinessReports: { where: { status: 'PUBLISHED' }, include: { findings: true } },
        planBs: { where: { status: 'PUBLISHED' } },
        outcome: true,
        participantFeedbacks: true,
      },
    });

    const planningProjects = projects.filter((p) => p.cohort === 'PLANNING');
    const scope = cohort ? projects : planningProjects;

    const invited = scope.flatMap((p) => p.participants.filter((x) => x.status !== 'DECLINED'));
    const accepted = invited.filter((x) =>
      ['JOINED', 'CONSENTED', 'IN_PROGRESS', 'SUBMITTED'].includes(x.status),
    );
    const consented = invited.filter((x) =>
      ['CONSENTED', 'IN_PROGRESS', 'SUBMITTED'].includes(x.status),
    );
    const submitted = invited.filter((x) => x.status === 'SUBMITTED');

    const privateUsedEvents = cohort
      ? await this.prisma.gate1AnalyticsEvent.count({
          where: { cohort, eventName: 'preference_form_submitted', properties: { path: ['privateUsed'], equals: true } },
        })
      : await this.prisma.gate1AnalyticsEvent.count({
          where: {
            cohort: 'PLANNING',
            eventName: 'preference_form_submitted',
            properties: { path: ['privateUsed'], equals: true },
          },
        });

    const materialChangeOrders = scope.filter((p) =>
      p.decisions.some((d) => d.materialChange),
    ).length;
    const evaluableOrders = scope.filter((p) => p.decisions.length > 0).length;

    const totalHumanMinutes = scope
      .flatMap((p) => p.manualWorkLogs)
      .reduce((sum, log) => sum + (log.minutes ?? 0), 0);

    const readinessFindings = scope.flatMap((p) =>
      p.readinessReports.flatMap((r) => r.findings),
    );
    const incrementalFindings = readinessFindings.filter((f) => f.isIncremental);
    const usefulReadiness = readinessFindings.filter((f) => f.advisorFeedback === 'USEFUL');

    const triggeredPlanBs = scope.flatMap((p) => p.planBs.filter((b) => b.triggered));
    const adoptedPlanBs = triggeredPlanBs.filter((b) => b.adopted === true);

    const metricsCohort = cohort ?? 'PLANNING';
    const readinessDenominator = metricsCohort === 'PLANNING' ? null : scope.length;
    const planBDenominator = ['NEAR_DEPARTURE', 'IN_TRIP_RECENT'].includes(metricsCohort)
      ? scope.length
      : null;

    const orgIds = new Set(scope.map((p) => p.organizationId).filter(Boolean));
    const secondOrderProjects = scope.filter((p) => p.outcome?.secondOrderProvided);
    const paymentProjects = scope.filter(
      (p) => (p.outcome?.paymentCommitmentCents ?? 0) > 0,
    );
    const completedProjects = scope.filter((p) => p.experimentStatus === 'COMPLETED');
    const feedbackCount = scope.reduce((n, p) => n + p.participantFeedbacks.length, 0);

    return {
      cohort: cohort ?? 'PLANNING_DEFAULT',
      participation: {
        invitationDenominator: invited.length,
        invitationAcceptedNumerator: accepted.length,
        invitationAcceptRate: invited.length ? accepted.length / invited.length : null,
        preferenceSubmittedNumerator: submitted.length,
        preferenceFillRate: consented.length ? submitted.length / consented.length : null,
        privateConstraintUsageNumerator: privateUsedEvents,
        privateConstraintUsageRate: submitted.length ? privateUsedEvents / submitted.length : null,
      },
      value: {
        materialChangeOrders,
        evaluableOrders,
        materialChangeRate: evaluableOrders ? materialChangeOrders / evaluableOrders : null,
        readinessIncrementalFindings: incrementalFindings.length,
        readinessUsefulFeedback: usefulReadiness.length,
        readinessIncrementalRate:
          readinessDenominator && incrementalFindings.length
            ? usefulReadiness.length / incrementalFindings.length
            : null,
        planBTriggered: triggeredPlanBs.length,
        planBAdopted: adoptedPlanBs.length,
        planBAdoptionRate:
          planBDenominator && triggeredPlanBs.length
            ? adoptedPlanBs.length / triggeredPlanBs.length
            : null,
      },
      productization: {
        totalHumanMinutes,
        projectCount: scope.length,
        completedProjects: completedProjects.length,
      },
      commercial: {
        participatingOrganizations: orgIds.size,
        secondOrderProvidedProjects: secondOrderProjects.length,
        secondOrderRate: orgIds.size ? secondOrderProjects.length / orgIds.size : null,
        paymentCommitmentProjects: paymentProjects.length,
        participantFeedbackCount: feedbackCount,
      },
      thresholds: {
        invitationAcceptRate: { green: 0.7, yellow: 0.5 },
        preferenceFillRate: { green: 0.7, yellow: 0.5 },
        materialChangeRate: { green: 0.6, yellow: 0.4 },
      },
    };
  }

  async exportDecisionPack(cohort?: string) {
    const metrics = await this.getMetrics(cohort);
    const projectWhere = cohort ? { cohort } : { cohort: 'PLANNING' as const };
    const projects = await this.prisma.gate1Project.findMany({
      where: projectWhere,
      select: {
        id: true,
        cohort: true,
        experimentStatus: true,
        destination: true,
        participantCount: true,
        createdAt: true,
        decisions: { select: { materialChange: true, changeTypes: true, submittedAt: true } },
        outcome: {
          select: {
            valueRating: true,
            secondOrderProvided: true,
            paymentCommitmentCents: true,
            advisorActualHours: true,
            clientRevisionRounds: true,
          },
        },
        _count: { select: { participants: true, manualWorkLogs: true } },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      cohortFilter: cohort ?? 'PLANNING_DEFAULT',
      methodology: 'Gate1 decision pack v0.3 — de-identified project aggregates only',
      metrics,
      projects: projects.map((p) => ({
        projectRef: p.id.slice(0, 8),
        cohort: p.cohort,
        status: p.experimentStatus,
        destination: p.destination,
        participantCount: p.participantCount,
        materialChange: p.decisions.some((d) => d.materialChange),
        outcomeSubmitted: !!p.outcome,
        valueRating: p.outcome?.valueRating ?? null,
        secondOrderProvided: p.outcome?.secondOrderProvided ?? false,
        paymentCommitmentCents: p.outcome?.paymentCommitmentCents ?? null,
      })),
    };
  }
}

@Injectable()
export class Gate1GuardService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripSync?: Gate1TripSyncService,
  ) {}

  async requireProject(projectId: string) {
    const project = await this.prisma.gate1Project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Gate1 project ${projectId} not found`);
    return project;
  }

  async requireConfirmedBaseline(projectId: string) {
    const baseline = await this.prisma.gate1ExperimentBaseline.findFirst({
      where: { projectId, isConfirmed: true },
      orderBy: { version: 'desc' },
    });
    if (!baseline) {
      throw new BadRequestException(
        'Baseline must be confirmed before publishing conflicts or candidates (AC-01)',
      );
    }
    return baseline;
  }

  async requireApprovedSanitizedConstraints(projectId: string) {
    const pending = await this.prisma.gate1SanitizedConstraint.count({
      where: { projectId, reviewStatus: 'PENDING' },
    });
    const approved = await this.prisma.gate1SanitizedConstraint.count({
      where: { projectId, reviewStatus: 'APPROVED' },
    });
    const privateCount = await this.prisma.gate1PrivateConstraint.count({
      where: {
        participant: { projectId },
        status: 'ACTIVE',
      },
    });
    if (privateCount > 0 && approved === 0) {
      throw new BadRequestException(
        'Private constraints exist but no approved sanitized constraints (FR-PRI-05)',
      );
    }
    if (pending > 0) {
      throw new BadRequestException('Sanitized constraints pending review');
    }
  }

  async transitionProject(projectId: string, to: Gate1ProjectStatus, actorUserId?: string) {
    const project = await this.requireProject(projectId);
    const from = project.experimentStatus as Gate1ProjectStatus;
    assertGate1Transition(from, to);
    const updated = await this.prisma.gate1Project.update({
      where: { id: projectId },
      data: { experimentStatus: to },
    });

    if (this.tripSync) {
      void this.tripSync.syncFromGate1Transition({
        projectId,
        fromExperimentStatus: from,
        toExperimentStatus: to,
        actorUserId,
      });
    }

    return updated;
  }

  async assertPublishWorkLog(projectId: string, humanMinutes?: number | null) {
    if (humanMinutes == null || humanMinutes <= 0) {
      const existing = await this.prisma.gate1ManualWorkLog.count({
        where: { projectId, minutes: { gt: 0 } },
      });
      if (existing === 0) {
        throw new BadRequestException(
          'Human work minutes required before publishing output (AC-10)',
        );
      }
    }
  }
}
