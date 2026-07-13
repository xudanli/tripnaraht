import { Injectable, Optional } from '@nestjs/common';
import { RiskGenerationMode } from '../../../generated/execution-risk-contracts';
import type { ActiveRisk, RiskSourceProjection } from '../types/execution-risk.types';
import { resolveKnowledgeCode } from './risk-canonical-mapping.util';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';
import { SeverityRuleEvaluatorService } from './severity-rule-evaluator.service';
import { computeSeverityDataGaps } from './severity-data-gaps.util';
import { SeverityHysteresisService } from './severity-hysteresis.service';

@Injectable()
export class ActiveRiskKnowledgeEnrichmentService {
  constructor(
    private readonly knowledge: ExecutionRiskKnowledgeRepositoryService,
    private readonly severityEvaluator: SeverityRuleEvaluatorService,
    @Optional() private readonly hysteresis?: SeverityHysteresisService,
  ) {}

  async enrichProjections(projections: RiskSourceProjection[]): Promise<RiskSourceProjection[]> {
    return Promise.all(projections.map((p) => this.enrichProjection(p)));
  }

  async enrichRisks(risks: ActiveRisk[]): Promise<ActiveRisk[]> {
    return Promise.all(risks.map((r) => this.enrichRisk(r)));
  }

  private async enrichProjection(projection: RiskSourceProjection): Promise<RiskSourceProjection> {
    const knowledgeCode = projection.knowledgeCode ?? resolveKnowledgeCode(projection.code);
    if (!knowledgeCode) return projection;

    const definition = await this.knowledge.findRiskDefinition(knowledgeCode);
    const enriched: RiskSourceProjection = {
      ...projection,
      knowledgeCode,
      isRootCause: projection.isRootCause ?? definition?.isRootCause,
      generationMode: projection.generationMode ?? (await this.resolveGenerationMode(knowledgeCode)),
    };

    if (enriched.generationMode !== RiskGenerationMode.DIRECT_DETECTION) {
      return enriched;
    }

    const rules = await this.knowledge.findSeverityRules(knowledgeCode);
    const metrics = projection.observedMetrics ?? {};
    const evaluation = await this.severityEvaluator.evaluate(knowledgeCode, { metrics });

    if (evaluation) {
      const applied = await this.applyHysteresisToProjection(enriched, {
        level: evaluation.level,
        executionGate: evaluation.executionGate,
      });
      return {
        ...applied,
        matchedRuleId: evaluation.matchedRuleId,
        metricValue: evaluation.metricValue,
        metricUnit: evaluation.metricUnit,
        severityState: 'KNOWN',
        dataGaps: [],
      };
    }

    const dataGaps = computeSeverityDataGaps(rules, metrics);
    if (dataGaps.length > 0) {
      return {
        ...enriched,
        severityState: 'UNKNOWN',
        dataGaps,
      };
    }

    return enriched;
  }

  private async enrichRisk(risk: ActiveRisk): Promise<ActiveRisk> {
    const knowledgeCode = risk.knowledgeCode ?? resolveKnowledgeCode(risk.code);
    if (!knowledgeCode) return risk;

    const definition = await this.knowledge.findRiskDefinition(knowledgeCode);
    const rootEventId =
      risk.rootEventId ??
      risk.sourceRefs.find((s) => s.sourceSystem === 'ENVIRONMENT_EVENT')?.sourceId;

    const base: ActiveRisk = {
      ...risk,
      knowledgeCode,
      isRootCause: risk.isRootCause ?? definition?.isRootCause,
      generationMode: risk.generationMode ?? (await this.resolveGenerationMode(knowledgeCode)),
      rootEventId,
    };

    if (base.severityState === 'UNKNOWN') {
      return {
        ...base,
        treatmentStatus: 'ACTION_REQUIRED',
      };
    }

    return base;
  }

  private async applyHysteresisToProjection(
    projection: RiskSourceProjection,
    proposed: { level: ActiveRisk['level']; executionGate: ActiveRisk['executionGate'] },
  ): Promise<RiskSourceProjection> {
    if (!this.hysteresis) {
      return {
        ...projection,
        level: proposed.level,
        executionGate: proposed.executionGate,
      };
    }

    const result = await this.hysteresis.apply(
      {
        tripId: projection.tripId,
        riskKey: projection.riskKey,
        knowledgeCode: projection.knowledgeCode,
        type: projection.type,
        level: projection.level,
        executionGate: projection.executionGate ?? 'ALLOW',
      },
      {
        level: proposed.level,
        executionGate: proposed.executionGate ?? 'ALLOW',
      },
    );

    return {
      ...projection,
      level: result.level,
      executionGate: result.executionGate,
      hysteresis: result.hysteresis,
    };
  }

  private async resolveGenerationMode(
    knowledgeCode: string,
  ): Promise<RiskGenerationMode | undefined> {
    const snapshot = await this.knowledge.getActiveKnowledgeVersion();
    void snapshot;
    const def = await this.knowledge.findRiskDefinition(knowledgeCode);
    if (!def) return undefined;
    const rules = await this.knowledge.findSeverityRules(knowledgeCode);
    if (rules.length > 0) return RiskGenerationMode.DIRECT_DETECTION;
    if (def.isRootCause) return RiskGenerationMode.DIRECT_DETECTION;
    return RiskGenerationMode.CAUSAL_DERIVATION;
  }
}
