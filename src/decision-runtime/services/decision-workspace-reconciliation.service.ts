import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  projectDecisionWorkspaceFromEvents,
  reconcileDecisionWorkspace,
  type DecisionWorkspaceReconciliation,
  type TravelEventRecord,
} from '../projections/decision-workspace.projection';
import {
  projectAuditTimeline,
  type AuditTimelineEntry,
} from '../projections/audit-timeline.projection';

@Injectable()
export class DecisionWorkspaceReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async loadTravelEventsForTrip(tripId: string): Promise<TravelEventRecord[]> {
    const rows = await this.prisma.travelEvent.findMany({
      where: { tripId },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        tripId: true,
        eventType: true,
        source: true,
        occurredAt: true,
        payload: true,
        metadata: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      tripId: row.tripId,
      eventType: row.eventType,
      source: row.source,
      occurredAt: row.occurredAt,
      payload: row.payload as Record<string, unknown>,
      metadata: row.metadata as Record<string, unknown> | null,
    }));
  }

  async reconcileProject(projectId: string): Promise<DecisionWorkspaceReconciliation> {
    const project = await this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        linkedTripId: true,
        decisions: { select: { id: true } },
        conflictReports: {
          where: { status: 'PUBLISHED' },
          select: { id: true, version: true },
        },
        candidateStrategies: {
          where: { status: 'PUBLISHED' },
          select: { id: true },
        },
        planBs: {
          where: { status: 'PUBLISHED' },
          select: { id: true },
        },
        outcome: { select: { id: true } },
        readinessReports: {
          select: {
            id: true,
            version: true,
            findings: {
              where: { status: 'RED', closedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new Error(`Gate1 project not found: ${projectId}`);
    }

    if (!project.linkedTripId) {
      return {
        projectId: project.id,
        tripId: '',
        projectTitle: project.title,
        linked: false,
        projection: projectDecisionWorkspaceFromEvents([], ''),
        entities: [],
        allMatched: false,
        skippedReason: 'no_linked_trip_id',
      };
    }

    const events = await this.loadTravelEventsForTrip(project.linkedTripId);
    const projection = projectDecisionWorkspaceFromEvents(events, project.linkedTripId);

    const redFindingIds = project.readinessReports.flatMap((r) =>
      r.findings.map((f) => f.id),
    );

    return reconcileDecisionWorkspace({
      projectId: project.id,
      tripId: project.linkedTripId,
      projectTitle: project.title,
      projection,
      gate1DecisionIds: project.decisions.map((d) => d.id),
      gate1PublishedConflictKeys: project.conflictReports.map(
        (r) => `${r.id}:v${r.version}`,
      ),
      gate1PublishedCandidateIds: project.candidateStrategies.map((c) => c.id),
      gate1PublishedPlanBIds: project.planBs.map((p) => p.id),
      gate1OutcomeIds: project.outcome ? [project.outcome.id] : [],
      gate1RedFindingIds: redFindingIds,
    });
  }

  async reconcileAllLinkedProjects(): Promise<DecisionWorkspaceReconciliation[]> {
    const projects = await this.prisma.gate1Project.findMany({
      where: { linkedTripId: { not: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const results: DecisionWorkspaceReconciliation[] = [];
    for (const p of projects) {
      results.push(await this.reconcileProject(p.id));
    }
    return results;
  }

  async getAuditTimeline(projectId: string): Promise<{
    projectId: string;
    tripId: string | null;
    entries: AuditTimelineEntry[];
    skippedReason?: string;
  }> {
    const project = await this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      select: { id: true, linkedTripId: true },
    });

    if (!project) {
      throw new Error(`Gate1 project not found: ${projectId}`);
    }

    if (!project.linkedTripId) {
      return {
        projectId,
        tripId: null,
        entries: [],
        skippedReason: 'no_linked_trip_id',
      };
    }

    const events = await this.loadTravelEventsForTrip(project.linkedTripId);
    return {
      projectId,
      tripId: project.linkedTripId,
      entries: projectAuditTimeline(events),
    };
  }
}
