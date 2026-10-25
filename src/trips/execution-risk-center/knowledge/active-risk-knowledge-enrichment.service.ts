import { Injectable, Optional } from '@nestjs/common';
import { RiskGenerationMode } from '../../../generated/execution-risk-contracts';
import type { ActiveRisk, RiskSourceProjection } from '../types/execution-risk.types';
import { ExecutionRiskConstraintBindingService } from '../services/execution-risk-constraint-binding.service';
import { resolveKnowledgeCode } from './risk-canonical-mapping.util';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';
import { SeverityRuleEvaluatorService } from './severity-rule-evaluator.service';
import { computeSeverityDataGaps } from './severity-data-gaps.util';
import { SeverityHysteresisService } from './severity-hysteresis.service';
import {
  resolveRiskConstraintBindingSync,
  severityLevelForBinding,
  toRiskConstraintBindingAttachment,
} from './risk-constraint-binding-runtime.util';

@Injectable()
export class ActiveRiskKnowledgeEnrichmentService {
  constructor(
    private readonly knowledge: ExecutionRiskKnowledgeRepositoryService,
    private readonly severityEvaluator: SeverityRuleEvaluatorService,
    @Optional() private readonly hysteresis?: SeverityHysteresisService,
    @Optional() private readonly constraintBindings?: ExecutionRiskConstraintBindingService,
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
      return this.attachConstraintBinding(enriched);
    }

    const rules = await this.knowledge.findSeverityRules(knowledgeCode);
    const metrics = projection.observedMetrics ?? {};
    const evaluation = await this.severityEvaluator.evaluate(knowledgeCode, { metrics });

    if (evaluation) {
      const applied = await this.applyHysteresisToProjection(enriched, {
        level: evaluation.level,
        executionGate: evaluation.executionGate,
      });
      return this.attachConstraintBinding({
        ...applied,
        matchedRuleId: evaluation.matchedRuleId,
        metricValue: evaluation.metricValue,
        metricUnit: evaluation.metricUnit,
        severityState: 'KNOWN',
        dataGaps: [],
      });
    }

    const dataGaps = computeSeverityDataGaps(rules, metrics);
    if (dataGaps.length > 0) {
      return this.attachConstraintBinding({
        ...enriched,
        severityState: 'UNKNOWN',
        dataGaps,
      });
    }

    return this.attachConstraintBinding(enriched);
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

    const withBinding = await this.attachConstraintBinding(base);

    if (withBinding.severityState === 'UNKNOWN') {
      return {
        ...withBinding,
        treatmentStatus: 'ACTION_REQUIRED',
      };
    }

    return withBinding;
  }

  private async attachConstraintBinding<
    T extends { knowledgeCode?: string; executionGate?: ActiveRisk['executionGate']; constraintBinding?: ActiveRisk['constraintBinding'] },
  >(item: T): Promise<T> {
    if (!item.knowledgeCode) return item;
    if (item.constraintBinding?.templateIds?.length) return item;

    const severityLevel = severityLevelForBinding({ executionGate: item.executionGate });
    if (this.constraintBindings) {
      try {
        const resolved = await this.constraintBindings.resolve({
          knowledgeCode: item.knowledgeCode,
          severityLevel: severityLevel ?? undefined,
        });
        const attachment = toRiskConstraintBindingAttachment({
          bindings: resolved.bindings.map((b) => ({
            id: b.id,
            constraintTemplateId: b.constraintTemplateId,
            feasibilityDimension: b.feasibilityDimension,
            violationClass: b.violationClass,
            executionGate: b.executionGate,
            notesZh: b.notesZh,
            blocked: b.blocked,
          })),
          primary: resolved.primary
            ? {
                id: resolved.primary.id,
                constraintTemplateId: resolved.primary.constraintTemplateId,
                feasibilityDimension: resolved.primary.feasibilityDimension,
                violationClass: resolved.primary.violationClass,
                executionGate: resolved.primary.executionGate,
                notesZh: resolved.primary.notesZh,
              }
            : null,
          anyBlocked: resolved.anyBlocked,
        });
        if (attachment) return { ...item, constraintBinding: attachment };
      } catch {
        // fall through to sync defaults
      }
    }

    const sync = resolveRiskConstraintBindingSync({
      knowledgeCode: item.knowledgeCode,
      severityLevel,
    });
    return sync ? { ...item, constraintBinding: sync } : item;
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
