import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState, VerificationIssue } from '../kernel/decision-state.types';
import type { PhaseExecutorContext } from '../kernel/interfaces/phase-executor.interface';
import { evaluateTravelOntologyConstraints } from '../kernel/travel-ontology-constraints';
import { PhysicalValidatorService } from '../../domain/ontology/validator/physical-validator.service';
import { KnowledgeValidationService } from '../../kpu/services/knowledge-validation.service';
import {
  ontologyViolationToVerificationIssue,
  physicalViolationToVerificationIssue,
} from './validation-gateway-ontology.util';

/**
 * Sprint 2：PhysicalValidator + KPU 作为 Validation Gateway 扩展 stage。
 */
@Injectable()
export class ValidationGatewayExtensionService {
  private readonly logger = new Logger(ValidationGatewayExtensionService.name);

  constructor(
    @Optional() private readonly physicalValidator?: PhysicalValidatorService,
    @Optional() private readonly knowledgeValidation?: KnowledgeValidationService,
  ) {}

  async stagePhysicalOntology(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ): Promise<{ issues: VerificationIssue[]; confidenceDelta: number; skipped?: boolean }> {
    const next = [...issues];
    let delta = confidenceDelta;
    let ran = false;

    const ontologyViolations = evaluateTravelOntologyConstraints(dso);
    if (ontologyViolations.length > 0) {
      ran = true;
      for (const v of ontologyViolations) {
        next.push(ontologyViolationToVerificationIssue(v));
      }
      const hard = ontologyViolations.filter((v) => v.severity === 'HARD').length;
      delta -= hard > 0 ? 0.2 : 0.08;
    }

    const actionInput = ctx.actionInput;
    const tripId = ctx.tripId ?? ctx.tripPlanRequest?.trip_id ?? ctx.requestId;
    if (this.physicalValidator && actionInput && Object.keys(actionInput).length > 0) {
      ran = true;
      try {
        const physical = await this.physicalValidator.evaluate({ tripId, actionInput });
        for (const v of physical.violations ?? []) {
          next.push(physicalViolationToVerificationIssue(v));
        }
        if (physical.blocking) delta -= 0.25;
        else if ((physical.violations?.length ?? 0) > 0) delta -= 0.1;
      } catch (e: unknown) {
        this.logger.warn(
          `[ValidationGatewayExtension] PhysicalValidator skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (!ran) {
      return { issues: next, confidenceDelta: delta, skipped: true };
    }
    return { issues: next, confidenceDelta: delta };
  }

  async stageKpuOutputCheck(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ): Promise<{ issues: VerificationIssue[]; confidenceDelta: number; skipped?: boolean }> {
    if (!this.knowledgeValidation || !ctx.itinerary) {
      return { issues, confidenceDelta, skipped: true };
    }

    const summary = this.buildItinerarySummary(ctx);
    if (!summary.trim()) {
      return { issues, confidenceDelta, skipped: true };
    }

    const next = [...issues];
    let delta = confidenceDelta;

    try {
      const result = await this.knowledgeValidation.validateSnippet({
        content: summary,
        source: 'itinerary.verify',
        metadata: {
          destination: String(ctx.tripPlanRequest?.destination ?? dso.environmentState?.countryCode ?? ''),
          requestId: ctx.requestId,
        },
        options: {
          enableFactCheck: false,
          enableConsistencyCheck: false,
          enableCitationCheck: false,
        },
      });

      if (ctx.itinerary) {
        ctx.itinerary.metadata = {
          ...(ctx.itinerary.metadata ?? {}),
          __kpu_snippet_validation: result,
        };
      }

      if (result.factCheck === 'fail' || result.consistency === 'inconsistent') {
        next.push({
          code: 'UNKNOWN',
          class: 'CONFLICT',
          message: `[KPU] 行程摘要未通过知识校验（fact=${result.factCheck} consistency=${result.consistency}）`,
          source: 'ITINERARY_VERIFY_SKILL',
          at: new Date().toISOString(),
          confidence01: 0.8,
        });
        delta -= 0.15;
      } else if (result.sourceCredibility < 0.4 || result.freshness < 0.4) {
        next.push({
          code: 'UNKNOWN',
          class: 'ADVISORY',
          message: `[KPU] 行程证据可信度或新鲜度偏低（credibility=${result.sourceCredibility} freshness=${result.freshness}）`,
          source: 'ITINERARY_VERIFY_SKILL',
          at: new Date().toISOString(),
          confidence01: 0.65,
        });
        delta -= 0.05;
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[ValidationGatewayExtension] KPU validateSnippet skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { issues: next, confidenceDelta: delta, skipped: true };
    }

    return { issues: next, confidenceDelta: delta };
  }

  private buildItinerarySummary(ctx: PhaseExecutorContext): string {
    const days = ctx.itinerary?.days;
    if (!Array.isArray(days)) return '';
    const lines: string[] = [];
    for (const day of days) {
      const items = Array.isArray((day as { items?: unknown[] }).items)
        ? (day as { items: Array<{ type?: string; location_ref?: { name?: string } }> }).items
        : [];
      for (const it of items) {
        const name = it.location_ref?.name ?? it.type ?? 'item';
        lines.push(String(name));
      }
    }
    return lines.join('; ');
  }
}
