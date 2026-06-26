import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isTravelEventStoreEnabled } from '../../trips/event-store/travel-event-store.config';
import { Gate1RuntimeEventService } from './gate1-runtime-event.service';
import { countsAsRuntimeEmitPersisted } from '../types/gate1-runtime-emit.types';

export interface Gate1RuntimeBackfillResult {
  projectId: string;
  tripId: string | null;
  attempted: number;
  persisted: number;
  skippedNoTrip: boolean;
  storeDisabled: boolean;
  byEvent: Record<string, number>;
}

/**
 * Idempotent backfill of Gate1 table facts into Travel Event Store.
 * Safe to re-run: duplicate idempotency keys are ignored by persistence.
 */
@Injectable()
export class Gate1RuntimeBackfillService {
  private readonly logger = new Logger(Gate1RuntimeBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  private bump(
    byEvent: Record<string, number>,
    key: string,
    persisted: boolean,
  ): { attempted: number; persisted: number } {
    byEvent[key] = (byEvent[key] ?? 0) + 1;
    return { attempted: 1, persisted: persisted ? 1 : 0 };
  }

  async backfillProject(projectId: string): Promise<Gate1RuntimeBackfillResult> {
    const storeDisabled = !isTravelEventStoreEnabled();
    const byEvent: Record<string, number> = {};
    let attempted = 0;
    let persisted = 0;

    const anchor = await this.runtimeEvents.resolveAnchor(projectId);
    if (!anchor) {
      return {
        projectId,
        tripId: null,
        attempted: 0,
        persisted: 0,
        skippedNoTrip: true,
        storeDisabled,
        byEvent,
      };
    }

    if (storeDisabled) {
      this.logger.warn(
        `[Gate1Backfill] TRAVEL_EVENT_STORE_ENABLED=false — events will not persist`,
      );
    }

    const project = await this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      include: {
        participants: {
          include: { consentRecords: { where: { status: 'GRANTED' } } },
        },
        decisions: true,
        conflictReports: {
          where: { status: 'PUBLISHED' },
          include: { findings: true },
        },
        candidateStrategies: { where: { status: 'PUBLISHED' } },
        planBs: { where: { status: 'PUBLISHED' } },
        outcome: true,
        sanitizedConstraints: { where: { reviewStatus: 'APPROVED' } },
        readinessReports: {
          include: { findings: true },
        },
      },
    });

    if (!project) {
      throw new Error(`Gate1 project not found: ${projectId}`);
    }

    for (const participant of project.participants) {
      const granted = participant.consentRecords
        .map((c) => c.consentType)
        .filter((t): t is string => !!t);
      const humanAssisted = granted.includes('HUMAN_ASSISTED');
      if (!['CONSENTED', 'IN_PROGRESS', 'SUBMITTED'].includes(participant.status)) {
        continue;
      }
      if (!humanAssisted) continue;

      const result = await this.runtimeEvents.participantConsented({
        projectId,
        participantId: participant.id,
        actorId: participant.userId ?? participant.id,
        grantedConsentTypes: granted,
        humanAssistedGranted: humanAssisted,
      });
      const b = this.bump(byEvent, 'PARTICIPANT_CONSENTED', countsAsRuntimeEmitPersisted(result));
      attempted += b.attempted;
      persisted += b.persisted;

      const privateConstraints = await this.prisma.gate1PrivateConstraint.findMany({
        where: { participantId: participant.id, status: 'ACTIVE' },
      });
      for (const pc of privateConstraints) {
        const r = await this.runtimeEvents.constraintRecorded({
          projectId,
          constraintId: pc.id,
          participantId: participant.id,
          fieldKey: pc.fieldKey,
          visibility: 'PRIVATE',
          actorId: participant.userId ?? participant.id,
        });
        const bb = this.bump(byEvent, 'CONSTRAINT_RECORDED', countsAsRuntimeEmitPersisted(r));
        attempted += bb.attempted;
        persisted += bb.persisted;
      }

      const pref = await this.prisma.gate1PreferenceResponse.findFirst({
        where: { participantId: participant.id, status: 'SUBMITTED' },
        orderBy: { version: 'desc' },
      });
      if (pref) {
        const r = await this.runtimeEvents.constraintRecorded({
          projectId,
          constraintId: pref.id,
          participantId: participant.id,
          fieldKey: 'public_preferences',
          visibility: 'PUBLIC',
          actorId: participant.userId ?? participant.id,
        });
        const bb = this.bump(byEvent, 'CONSTRAINT_RECORDED_PUBLIC', countsAsRuntimeEmitPersisted(r));
        attempted += bb.attempted;
        persisted += bb.persisted;
      }
    }

    for (const sc of project.sanitizedConstraints) {
      const r = await this.runtimeEvents.privateConstraintSummarized({
        projectId,
        sanitizedConstraintId: sc.id,
        actorId: sc.reviewedBy ?? sc.createdBy,
        reviewStatus: 'APPROVED',
      });
      const b = this.bump(byEvent, 'PRIVATE_CONSTRAINT_SUMMARIZED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;
    }

    for (const report of project.conflictReports) {
      const r = await this.runtimeEvents.conflictDetected({
        projectId,
        reportId: report.id,
        version: report.version,
        actorId: report.publishedBy ?? report.createdBy,
        findingCount: report.findings.length,
        sourceType: report.sourceType,
      });
      const b = this.bump(byEvent, 'CONFLICT_DETECTED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;

      for (const finding of report.findings) {
        if (
          finding.advisorFeedback !== 'CONFIRMED' &&
          finding.advisorFeedback !== 'DISMISSED' &&
          finding.advisorFeedback !== 'RESOLVED'
        ) {
          continue;
        }
        const fr = await this.runtimeEvents.conflictAdvisorFeedback({
          projectId,
          findingId: finding.id,
          reportId: report.id,
          action: finding.advisorFeedback,
          actorId: report.reviewedBy ?? report.publishedBy ?? report.createdBy,
        });
        const fb = this.bump(
          byEvent,
          finding.advisorFeedback === 'DISMISSED'
            ? 'CONFLICT_DISMISSED'
            : 'CONFLICT_CONFIRMED',
          countsAsRuntimeEmitPersisted(fr),
        );
        attempted += fb.attempted;
        persisted += fb.persisted;
      }
    }

    for (const candidate of project.candidateStrategies) {
      const r = await this.runtimeEvents.candidateStrategyCreated({
        projectId,
        candidateId: candidate.id,
        version: candidate.version,
        label: candidate.label,
        sourceType: candidate.sourceType,
        actorId: candidate.publishedBy ?? candidate.createdBy,
      });
      const b = this.bump(byEvent, 'CANDIDATE_STRATEGY_CREATED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;
    }

    for (const decision of project.decisions) {
      const r = await this.runtimeEvents.decisionRecorded({
        projectId,
        decisionId: decision.id,
        selectedCandidateId: decision.selectedCandidateId,
        materialChange: decision.materialChange,
        changeTypes: Array.isArray(decision.changeTypes)
          ? (decision.changeTypes as string[])
          : [],
        conflictReportVersion: decision.conflictReportVersion,
        actorId: decision.submittedBy,
      });
      const b = this.bump(byEvent, 'DECISION_RECORDED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;
    }

    for (const report of project.readinessReports) {
      if (report.status === 'PUBLISHED') {
        const r = await this.runtimeEvents.readinessAssessmentRecorded({
          projectId,
          reportId: report.id,
          reportVersion: report.version,
          findingCount: report.findings.length,
          redCount: report.findings.filter((f) => f.status === 'RED').length,
          yellowCount: report.findings.filter((f) => f.status === 'YELLOW').length,
          greenCount: report.findings.filter((f) => f.status === 'GREEN').length,
          actorId: report.publishedBy ?? report.createdBy,
        });
        const b = this.bump(byEvent, 'READINESS_ASSESSMENT_RECORDED', countsAsRuntimeEmitPersisted(r));
        attempted += b.attempted;
        persisted += b.persisted;
      }

      for (const finding of report.findings.filter((f) => f.status === 'RED')) {
        const r = await this.runtimeEvents.readinessBlockerRaised({
          projectId,
          findingId: finding.id,
          reportId: report.id,
          reportVersion: report.version,
          dimension: finding.dimension,
          status: finding.status,
          title: finding.title,
          actorId: report.createdBy,
        });
        const b = this.bump(byEvent, 'READINESS_BLOCKER_RAISED', countsAsRuntimeEmitPersisted(r));
        attempted += b.attempted;
        persisted += b.persisted;

        if (finding.closedAt) {
          const resolved = await this.runtimeEvents.readinessBlockerResolved({
            projectId,
            findingId: finding.id,
            reportId: report.id,
            reportVersion: report.version,
            resolution: 'RESOLVED',
            actorId: report.publishedBy ?? report.createdBy,
          });
          const br = this.bump(
            byEvent,
            'READINESS_BLOCKER_RESOLVED',
            countsAsRuntimeEmitPersisted(resolved),
          );
          attempted += br.attempted;
          persisted += br.persisted;
        }
      }
    }

    for (const planB of project.planBs) {
      const r = await this.runtimeEvents.contingencyPlanCreated({
        projectId,
        planBId: planB.id,
        label: planB.label,
        actorId: planB.publishedBy ?? planB.createdBy,
      });
      const b = this.bump(byEvent, 'CONTINGENCY_PLAN_CREATED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;
    }

    if (project.outcome) {
      const r = await this.runtimeEvents.outcomeRecorded({
        projectId,
        outcomeId: project.outcome.id,
        actorId: project.outcome.submittedBy,
        valueRating: project.outcome.valueRating,
      });
      const b = this.bump(byEvent, 'OUTCOME_RECORDED', countsAsRuntimeEmitPersisted(r));
      attempted += b.attempted;
      persisted += b.persisted;
    }

    return {
      projectId,
      tripId: anchor.tripId,
      attempted,
      persisted,
      skippedNoTrip: false,
      storeDisabled,
      byEvent,
    };
  }

  async backfillAllLinked(): Promise<Gate1RuntimeBackfillResult[]> {
    const projects = await this.prisma.gate1Project.findMany({
      where: { linkedTripId: { not: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const results: Gate1RuntimeBackfillResult[] = [];
    for (const p of projects) {
      results.push(await this.backfillProject(p.id));
    }
    return results;
  }
}
