import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { resolveResearchProtocol } from '../config/exploration-protocol.registry';
import type {
  ConsumerRiskViewModel,
  ExplorationIssuesResponse,
} from '../types/exploration.types';
import {
  ExplorationPoiIssueBridgeService,
} from './exploration-poi-issue-bridge.service';
import { ExplorationOntologyIssuesBridgeService } from './exploration-ontology-issues-bridge.service';

@Injectable()
export class ConsumerExplorationIssuesService {
  private readonly logger = new Logger(ConsumerExplorationIssuesService.name);

  constructor(
    private readonly readModel: UnifiedDecisionProblemReadModelService,
    @Optional() private readonly poiIssueBridge?: ExplorationPoiIssueBridgeService,
    @Optional() private readonly ontologyIssueBridge?: ExplorationOntologyIssuesBridgeService,
  ) {}

  async listIssuesForScenario(input: {
    tripId: string;
    protocolId?: string | null;
  }): Promise<ExplorationIssuesResponse> {
    const protocol = input.protocolId ? resolveResearchProtocol(input.protocolId) : null;
    const displayPolicy = protocol?.issueSelectionPolicy ?? {
      maxIssues: 1,
      preferredSeverities: ['BLOCK'] as const,
      preferredCategories: [],
    };

    if (!isDecisionGatewayUnifiedEnabled()) {
      this.logger.warn(
        'DECISION_GATEWAY_UNIFIED is disabled; exploration issues list returns empty projection',
      );
      const poiIssues = this.poiIssueBridge
        ? await this.poiIssueBridge.projectUnresolvedPois(input.tripId)
        : [];
      const ontologyIssues: ConsumerRiskViewModel[] = this.ontologyIssueBridge
        ? await this.ontologyIssueBridge.projectUnresolvedOntologyIssues(input.tripId)
        : [];
      const merged = [...ontologyIssues, ...poiIssues];
      return {
        displayedIssues: this.applyDisplayPolicy(merged, displayPolicy),
        totalIssueCount: merged.length,
        blockerIssueCount: this.countBlockers(merged),
        gatewayIssueCount: 0,
        unresolvedPoiIssueCount: poiIssues.length,
        ontologyIssueCount: ontologyIssues.length,
        displayPolicy: {
          maxIssues: displayPolicy.maxIssues,
          preferredSeverity: displayPolicy.preferredSeverities[0] ?? 'BLOCK',
        },
      };
    }

    const projection = await this.readModel.projectPlanningConflicts(input.tripId);
    const gatewayIssues = projection.conflicts.map((c) => this.toConsumerRisk(c, input.tripId));
    const poiIssues = this.poiIssueBridge
      ? await this.poiIssueBridge.projectUnresolvedPois(input.tripId)
      : [];
    const ontologyIssues: ConsumerRiskViewModel[] = this.ontologyIssueBridge
      ? await this.ontologyIssueBridge.projectUnresolvedOntologyIssues(input.tripId)
      : [];
    const allIssues = [...gatewayIssues, ...ontologyIssues, ...poiIssues];
    const filtered = this.applyDisplayPolicy(allIssues, displayPolicy);

    return {
      displayedIssues: filtered,
      totalIssueCount: allIssues.length,
      blockerIssueCount: this.countBlockers(allIssues),
      gatewayIssueCount: gatewayIssues.length,
      unresolvedPoiIssueCount: poiIssues.length,
      ontologyIssueCount: ontologyIssues.length,
      displayPolicy: {
        maxIssues: displayPolicy.maxIssues,
        preferredSeverity: displayPolicy.preferredSeverities[0] ?? 'BLOCK',
      },
    };
  }

  /** Gateway 队列 issue 数（不含 CPRE POI 桥接） */
  async countGatewayIssues(tripId: string): Promise<number> {
    if (!isDecisionGatewayUnifiedEnabled()) return 0;
    const projection = await this.readModel.projectPlanningConflicts(tripId);
    return projection.conflicts.length;
  }

  private countBlockers(issues: ConsumerRiskViewModel[]): number {
    return issues.filter((i) => i.severity === 'BLOCK').length;
  }

  private applyDisplayPolicy(
    issues: ConsumerRiskViewModel[],
    policy: {
      maxIssues: number;
      preferredSeverities: Array<'BLOCK' | 'CONFLICT'>;
      preferredCategories?: string[];
    },
  ): ConsumerRiskViewModel[] {
    const severityRank = (s: string) => {
      const idx = policy.preferredSeverities.indexOf(s as 'BLOCK' | 'CONFLICT');
      return idx === -1 ? 99 : idx;
    };

    const sorted = [...issues].sort((a, b) => {
      const sa = severityRank(a.severity);
      const sb = severityRank(b.severity);
      if (sa !== sb) return sa - sb;
      return a.issueId.localeCompare(b.issueId);
    });

    return sorted.slice(0, Math.max(0, policy.maxIssues));
  }

  private toConsumerRisk(
    conflict: {
      id: string;
      severity?: string;
      title?: string;
      message?: string;
      consequence?: string;
      affectedDayNumbers?: number[];
      affectedScopeSummary?: string;
      decisionRequired?: boolean;
      metadata?: Record<string, unknown>;
    },
    tripId: string,
  ): ConsumerRiskViewModel {
    const severity = this.normalizeSeverity(conflict.severity);
    const meta = conflict.metadata ?? {};
    const batchId =
      typeof meta.gatewayAssessmentBatchId === 'string'
        ? meta.gatewayAssessmentBatchId
        : typeof meta.assessmentBatchId === 'string'
          ? meta.assessmentBatchId
          : 'pending-gateway-batch';

    return {
      issueId: conflict.id,
      severity,
      headline: conflict.title ?? conflict.message ?? '发现行程问题',
      explanation: conflict.message ?? '',
      consequence: conflict.consequence ?? '若不处理，该路段可能无法按当前计划执行。',
      affectedDay: conflict.affectedDayNumbers?.[0],
      affectedSegmentLabel: conflict.affectedScopeSummary,
      decisionRequired: conflict.decisionRequired ?? severity === 'BLOCK',
      evidence: extractEvidence(meta),
      source: {
        gatewayAssessmentBatchId: batchId,
        canonicalIssueId: conflict.id,
        tripId,
        tripVersion: typeof meta.tripVersion === 'number' ? meta.tripVersion : 1,
        evidenceVersion:
          typeof meta.evidenceVersion === 'string' ? meta.evidenceVersion : undefined,
      },
    };
  }

  private normalizeSeverity(raw?: string): ConsumerRiskViewModel['severity'] {
    switch (raw?.toUpperCase()) {
      case 'BLOCK':
      case 'CRITICAL':
        return 'BLOCK';
      case 'CONFLICT':
      case 'WARNING':
        return 'CONFLICT';
      case 'VERIFY':
      case 'REQUIRES_VERIFICATION':
        return 'VERIFY';
      default:
        return 'OPTIMIZE';
    }
  }
}

function extractEvidence(
  meta: Record<string, unknown>,
): ConsumerRiskViewModel['evidence'] {
  const refs = meta.evidenceRefs ?? meta.evidence;
  if (!Array.isArray(refs) || refs.length === 0) {
    const sourceLabel =
      typeof meta.sourceLabel === 'string' ? meta.sourceLabel : undefined;
    if (sourceLabel) {
      return [{ sourceLabel, confidence: 'MEDIUM' }];
    }
    return undefined;
  }

  return refs
    .map((ref) => {
      if (!ref || typeof ref !== 'object') return null;
      const r = ref as Record<string, unknown>;
      const sourceLabel =
        typeof r.sourceLabel === 'string'
          ? r.sourceLabel
          : typeof r.label === 'string'
            ? r.label
            : typeof r.provider === 'string'
              ? r.provider
              : '官方来源';
      return {
        sourceLabel,
        verifiedAt: typeof r.verifiedAt === 'string' ? r.verifiedAt : undefined,
        confidence: (r.confidence as 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM',
      };
    })
    .filter(Boolean) as NonNullable<ConsumerRiskViewModel['evidence']>;
}
