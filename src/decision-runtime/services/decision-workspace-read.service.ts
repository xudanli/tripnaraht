import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isDecisionRuntimeReadFromProjectionEnabled,
  isRuntimeReplayValidationEnabled,
} from '../decision-runtime.config';
import type {
  DecisionWorkspaceBundle,
  DecisionWorkspaceReadMeta,
  DecisionWorkspaceReadSource,
} from '../types/decision-workspace-read.types';
import { DecisionWorkspaceReconciliationService } from './decision-workspace-reconciliation.service';

@Injectable()
export class DecisionWorkspaceReadService {
  private readonly logger = new Logger(DecisionWorkspaceReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: DecisionWorkspaceReconciliationService,
  ) {}

  private buildMeta(input: {
    source: DecisionWorkspaceReadSource;
    tripId: string | null;
    projectionEventCount: number;
    reconciliationMatched: boolean | null;
    warnings: string[];
  }): DecisionWorkspaceReadMeta {
    return {
      readModelSource: input.source,
      projectionEnabled: isDecisionRuntimeReadFromProjectionEnabled(),
      replayValidation: isRuntimeReplayValidationEnabled(),
      tripId: input.tripId,
      projectionEventCount: input.projectionEventCount,
      reconciliationMatched: input.reconciliationMatched,
      generatedAt: new Date().toISOString(),
      validationWarnings: input.warnings,
    };
  }

  private async loadGate1Bundle(projectId: string) {
    const [conflicts, candidates, decisions, readiness, planBs, outcomeRow] =
      await Promise.all([
      this.prisma.gate1ConflictReport.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        include: { findings: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.gate1CandidateStrategy.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: [{ version: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.gate1AdvisorDecision.findMany({
        where: { projectId },
        orderBy: { submittedAt: 'desc' },
        include: { selectedCandidate: true },
      }),
      this.prisma.gate1ReadinessReport.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        include: { findings: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.gate1PlanB.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: { version: 'asc' },
      }),
      this.prisma.gate1ProjectOutcome.findUnique({ where: { projectId } }),
    ]);

    return {
      conflicts: conflicts.map((r) => ({
        ...r,
        humanAssistedLabel: r.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : r.sourceType,
      })),
      candidates: candidates.map((c) => ({
        ...c,
        humanAssistedLabel:
          c.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : c.sourceType,
      })),
      decisions,
      readiness: readiness.map((r) => ({
        ...r,
        humanAssistedLabel: r.sourceType === 'HUMAN_ASSISTED' ? '人工协助' : r.sourceType,
      })),
      planBs,
      outcome: outcomeRow,
    };
  }

  private applyReadinessBlockerOrder<T extends { id: string }>(
    findings: T[],
    blockerFindingIds: string[],
  ): T[] {
    if (blockerFindingIds.length === 0) return findings;
    const map = new Map(findings.map((f) => [f.id, f]));
    const ordered: T[] = [];
    for (const id of blockerFindingIds) {
      const f = map.get(id);
      if (f) ordered.push(f);
    }
    for (const f of findings) {
      if (!blockerFindingIds.includes(f.id)) ordered.push(f);
    }
    return ordered;
  }

  private applyReadinessProjectionOrder(
    readiness: Array<{ id: string; findings: Array<{ id: string }> }>,
    blockerFindingIds: string[],
  ) {
    return readiness.map((report) => ({
      ...report,
      findings: this.applyReadinessBlockerOrder(report.findings, blockerFindingIds),
    }));
  }

  private orderByProjectionIds<T extends { id: string }>(
    items: T[],
    projectionIds: string[],
  ): T[] {
    const map = new Map(items.map((i) => [i.id, i]));
    const ordered: T[] = [];
    for (const id of projectionIds) {
      const item = map.get(id);
      if (item) ordered.push(item);
    }
    for (const item of items) {
      if (!projectionIds.includes(item.id)) {
        ordered.push(item);
      }
    }
    return ordered;
  }

  private orderConflictsByProjection<T extends { id: string; version: number }>(
    items: T[],
    keys: string[],
  ): T[] {
    const map = new Map(items.map((i) => [`${i.id}:v${i.version}`, i]));
    const ordered: T[] = [];
    for (const key of keys) {
      const item = map.get(key);
      if (item) ordered.push(item);
    }
    for (const item of items) {
      const key = `${item.id}:v${item.version}`;
      if (!keys.includes(key)) ordered.push(item);
    }
    return ordered;
  }

  async getWorkspace(projectId: string): Promise<DecisionWorkspaceBundle> {
    const warnings: string[] = [];
    const gate1 = await this.loadGate1Bundle(projectId);

    if (!isDecisionRuntimeReadFromProjectionEnabled()) {
      return {
        meta: this.buildMeta({
          source: 'gate1',
          tripId: null,
          projectionEventCount: 0,
          reconciliationMatched: null,
          warnings,
        }),
        ...gate1,
      };
    }

    const report = await this.reconciliation.reconcileProject(projectId);
    const projection = report.projection;

    if (report.skippedReason) {
      warnings.push(report.skippedReason);
      return {
        meta: this.buildMeta({
          source: 'projection_fallback',
          tripId: report.tripId || null,
          projectionEventCount: 0,
          reconciliationMatched: false,
          warnings,
        }),
        ...gate1,
      };
    }

    if (!report.allMatched) {
      for (const entity of report.entities) {
        if (!entity.matched) {
          warnings.push(
            `${entity.entity}: gate1=${entity.gate1Count} events=${entity.eventCount}`,
          );
        }
      }
      if (isRuntimeReplayValidationEnabled()) {
        this.logger.warn(
          `[DecisionWorkspaceRead] Projection mismatch for ${projectId}: ${warnings.join('; ')}`,
        );
      }
      return {
        meta: this.buildMeta({
          source: 'projection_fallback',
          tripId: report.tripId,
          projectionEventCount: projection.sourceEventCount,
          reconciliationMatched: false,
          warnings,
        }),
        ...gate1,
      };
    }

    const source: DecisionWorkspaceReadSource = 'projection_hybrid';
    return {
      meta: this.buildMeta({
        source,
        tripId: report.tripId,
        projectionEventCount: projection.sourceEventCount,
        reconciliationMatched: true,
        warnings,
      }),
      conflicts: this.orderConflictsByProjection(
        gate1.conflicts,
        projection.conflictReports.map((r) => `${r.reportId}:v${r.version}`),
      ),
      candidates: this.orderByProjectionIds(
        gate1.candidates,
        projection.candidates.map((c) => c.candidateId),
      ),
      decisions: this.orderByProjectionIds(
        gate1.decisions,
        projection.decisions.map((d) => d.decisionId),
      ),
      readiness: this.applyReadinessProjectionOrder(
        gate1.readiness as Array<{ id: string; findings: Array<{ id: string }> }>,
        projection.readinessBlockers.map((b) => b.findingId),
      ),
      planBs: this.orderByProjectionIds(
        gate1.planBs,
        projection.planBs.map((p) => p.planBId),
      ),
      outcome: gate1.outcome,
    };
  }

  async getConflicts(projectId: string) {
    const ws = await this.getWorkspace(projectId);
    return { meta: ws.meta, items: ws.conflicts };
  }

  async getCandidates(projectId: string) {
    const ws = await this.getWorkspace(projectId);
    return { meta: ws.meta, items: ws.candidates };
  }

  async getDecisions(projectId: string) {
    const ws = await this.getWorkspace(projectId);
    return { meta: ws.meta, items: ws.decisions };
  }

  async getLatestDecision(projectId: string) {
    const { items, meta } = await this.getDecisions(projectId);
    return { meta, item: items[0] ?? null };
  }

  async getReadiness(projectId: string) {
    const ws = await this.getWorkspace(projectId);
    return { meta: ws.meta, items: ws.readiness };
  }

  async getPlanBs(projectId: string) {
    const ws = await this.getWorkspace(projectId);
    return { meta: ws.meta, items: ws.planBs };
  }

  async getAuditTimeline(projectId: string) {
    return this.reconciliation.getAuditTimeline(projectId);
  }
}
