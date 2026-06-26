import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { ConstraintViolationItem } from '../../../decision/kernel/decision-state.types';
import { evaluateTravelOntologyConstraintsForNouns } from '../../../decision/kernel/travel-ontology-constraints';
import { ontologyContextToNouns } from '../../../decision/kernel/travel-ontology.mapper';
import { PrismaService } from '../../../prisma/prisma.service';
import { PHYSICAL_RULE_BUNDLE_ID, PHYSICAL_VALIDATOR_VERSION } from './physical-validator.constants';
import { physicalGateFingerprint } from './physical-validator.fingerprint';
import type {
  PhysicalDomainFactInput,
  PhysicalEvaluationResult,
  PhysicalViolationItem,
} from './physical-validator.types';
import { ICELAND_F_ROAD_POLICY_SOURCE } from './iceland-f-road-policy.util';
import type { SegmentLatestRoadStatusV1 } from './road-status-contract.types';
import { getStaticPhysicalPoliciesEnvelope, type StaticPhysicalPoliciesEnvelope } from './physical-validator.static-policies';
import { computeSegmentFeasibilityViolations, type SegmentFeasibilityPoiLike } from './segment-feasibility.util';
import { validateOntologyRulesAgainstShapes } from '../shacl/physical-constraint.shapes';
import { enrichPhysicalEvaluation } from '../../../trips/experience-fulfillment/services/experience-fulfillment.orchestrator';

function userIntentFromActionInput(ai: Record<string, unknown>): DecisionState['userIntent'] | undefined {
  const wallet = ai.wallet as Record<string, unknown> | undefined;
  const budget =
    typeof wallet?.budget_limit === 'number' && wallet.budget_limit > 0
      ? wallet.budget_limit
      : typeof ai.budget === 'number' && (ai.budget as number) > 0
        ? (ai.budget as number)
        : undefined;
  const constraints = ai.constraints as Record<string, unknown> | undefined;
  if (budget == null && !constraints) return undefined;
  return {
    ...(budget != null ? { budget } : {}),
    ...(constraints ? { constraints } : {}),
  } as DecisionState['userIntent'];
}

function mapOntologyViolation(v: ConstraintViolationItem): PhysicalViolationItem {
  const sev = v.severity === 'HARD' ? 'BLOCK' : 'WARN';
  return {
    code: v.constraint ?? v.type,
    severity: sev,
    detail: v.detail,
    constraint: v.constraint,
    ...(typeof v.degree === 'number' ? { degree: v.degree } : {}),
  };
}

function mapSpatialViolation(
  code: string,
  segmentEvidence?: Record<string, unknown>,
  feasibilityFacts?: Record<string, unknown>,
): PhysicalViolationItem {
  let evidence_source =
    typeof segmentEvidence?.url === 'string'
      ? segmentEvidence.url
      : typeof segmentEvidence?.source === 'string'
        ? segmentEvidence.source
        : undefined;

  let detail = `Spatial feasibility violation: ${code}`;
  if (
    code === 'SEGMENT_SEASONALLY_CLOSED' &&
    feasibilityFacts?.icelandPolicySeasonallyClosed &&
    feasibilityFacts?.road_policy_source === ICELAND_F_ROAD_POLICY_SOURCE
  ) {
    detail =
      `Iceland interior F-Road: enter_at falls in typical highland closed season (${ICELAND_F_ROAD_POLICY_SOURCE}; integrate Road.is for live closure data).`;
    evidence_source = evidence_source ?? `policy:${ICELAND_F_ROAD_POLICY_SOURCE}`;
  }

  if (code === 'SEGMENT_ROAD_CLOSED') {
    const parts: string[] = [];
    if (feasibilityFacts?.staticRoadClosed) parts.push('static road_condition=CLOSED');
    if (feasibilityFacts?.roadIsBlocking) {
      parts.push(
        `live Road.is snapshot: ${String(feasibilityFacts.roadIsCondition ?? '')}` +
          (feasibilityFacts?.roadIsConditionText
            ? ` (${String(feasibilityFacts.roadIsConditionText)})`
            : ''),
      );
    }
    if (parts.length) {
      detail = `Road passage blocked — ${parts.join('; ')}`;
      evidence_source =
        evidence_source ??
        (typeof feasibilityFacts?.roadIsSourceUrl === 'string'
          ? (feasibilityFacts.roadIsSourceUrl as string)
          : undefined);
    }
  }

  return {
    code,
    severity: 'BLOCK',
    detail,
    evidence_source,
  };
}

@Injectable()
export class PhysicalValidatorService {
  static readonly VALIDATOR_VERSION = PHYSICAL_VALIDATOR_VERSION;
  static readonly RULE_BUNDLE_ID = PHYSICAL_RULE_BUNDLE_ID;

  private readonly logger = new Logger(PhysicalValidatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Same semantic hash used when folding physical gate into context signature v2. */
  gateFingerprint(result: PhysicalEvaluationResult): string {
    return physicalGateFingerprint({
      validator_version: result.validator_version,
      rule_bundle_id: result.rule_bundle_id,
      violations: result.violations,
    });
  }

  /** Admin / Policy Lab (read-only): built-in static gates documented before Road.is rows exist. */
  getStaticPolicies(): StaticPhysicalPoliciesEnvelope {
    return getStaticPhysicalPoliciesEnvelope();
  }

  /**
   * Unified physical + ontology evaluation for Action PREVIEW/COMMIT.
   * Spatial checks run only when `action_input.physical_domain` includes segment_id + enter_at.
   */
  async evaluate(params: {
    tripId: string;
    actionInput?: Record<string, unknown> | null;
  }): Promise<PhysicalEvaluationResult> {
    const evaluated_at = new Date().toISOString();
    const violations: PhysicalViolationItem[] = [];
    const ai = params.actionInput ?? {};

    let nouns: NonNullable<NonNullable<DecisionState['travelOntologyState']>['nouns']> | undefined;
    try {
      if (ai.ontology_context && typeof ai.ontology_context === 'object') {
        nouns = ontologyContextToNouns(ai.ontology_context as any);
      } else if (
        ai.travel_ontology &&
        typeof ai.travel_ontology === 'object' &&
        (ai.travel_ontology as any).nouns &&
        typeof (ai.travel_ontology as any).nouns === 'object'
      ) {
        nouns = (ai.travel_ontology as any).nouns;
      }
    } catch (e) {
      this.logger.warn(`[PhysicalValidator] ontology mapping skipped: ${e}`);
    }

    const userIntent = userIntentFromActionInput(ai as Record<string, unknown>);
    const ontologyViolations = evaluateTravelOntologyConstraintsForNouns(nouns, userIntent);
    for (const v of ontologyViolations) {
      violations.push(mapOntologyViolation(v));
    }

    const pd = ai.physical_domain as PhysicalDomainFactInput | undefined;
    if (pd?.segment_id && pd?.enter_at) {
      const spatial = await this.evaluateSegment(pd.segment_id, pd.enter_at, pd.vehicle_type);
      violations.push(...spatial);
    }

    const ontologyRules =
      ai.place_ontology_rules ?? ai.ontologyRules ?? (ai.ontology_rules as unknown);
    if (ontologyRules) {
      for (const sv of validateOntologyRulesAgainstShapes(ontologyRules)) {
        violations.push({
          code: 'ONTOLOGY_RULES_SHAPE_VIOLATION',
          severity: sv.severity,
          detail: `${sv.path}: ${sv.message}`,
          constraint: sv.shapeId,
        });
      }
    }

    const blocking = violations.some((x) => x.severity === 'BLOCK');

    const base: PhysicalEvaluationResult = {
      validator_version: PHYSICAL_VALIDATOR_VERSION,
      rule_bundle_id: PHYSICAL_RULE_BUNDLE_ID,
      violations,
      evaluated_at,
      blocking,
    };

    const userMessage =
      typeof ai.user_message === 'string'
        ? ai.user_message
        : typeof ai.message === 'string'
          ? ai.message
          : undefined;
    const partialParams =
      ai.partial_params && typeof ai.partial_params === 'object'
        ? (ai.partial_params as Record<string, unknown>)
        : undefined;

    return enrichPhysicalEvaluation(base, {
      userMessage,
      partialParams,
      scope: 'CANDIDATE',
      targetIds: pd?.segment_id ? [String(pd.segment_id)] : undefined,
    });
  }

  private async evaluateSegment(
    segmentId: string,
    enterAtIso: string,
    vehicleType?: PhysicalDomainFactInput['vehicle_type'],
  ): Promise<PhysicalViolationItem[]> {
    const out: PhysicalViolationItem[] = [];
    const enterAt = new Date(enterAtIso);
    if (Number.isNaN(enterAt.getTime())) {
      out.push({
        code: 'SEGMENT_INVALID_ENTER_AT',
        severity: 'BLOCK',
        detail: 'physical_domain.enter_at is not a valid ISO datetime',
      });
      return out;
    }

    try {
      const segRow = await (this.prisma as any).spatialDomainSegment?.findUnique?.({
        where: { id: segmentId },
      });
      if (!segRow) {
        out.push({
          code: 'SEGMENT_NOT_FOUND',
          severity: 'BLOCK',
          detail: `Segment not found: ${segmentId}`,
        });
        return out;
      }
      const segment = this.fromSegmentDb(segRow);
      const toPoiRow = await (this.prisma as any).spatialDomainPoi?.findUnique?.({
        where: { id: segment.to_poi_id },
      });
      const toPoi = toPoiRow ? this.fromPoiDb(toPoiRow) : null;

      const { violations: codes, facts } = computeSegmentFeasibilityViolations({
        segment,
        toPoi,
        enterAt,
        vehicleType,
      });
      const evidence = segment.evidence && typeof segment.evidence === 'object' ? (segment.evidence as any) : undefined;
      for (const code of codes) {
        out.push(mapSpatialViolation(code, evidence, facts));
      }
    } catch (e) {
      this.logger.warn(`[PhysicalValidator] segment evaluate failed: ${e}`);
      out.push({
        code: 'SEGMENT_EVAL_UNAVAILABLE',
        severity: 'BLOCK',
        detail: 'Spatial domain could not be evaluated (database unavailable)',
      });
    }
    return out;
  }

  private fromPoiDb(row: any): SegmentFeasibilityPoiLike & { id: string } {
    return {
      id: String(row.id),
      closed: Boolean(row.closed),
      time_windows: Array.isArray(row.timeWindows) ? row.timeWindows : [],
    };
  }

  private fromSegmentDb(row: any): import('./segment-feasibility.util').SegmentFeasibilitySegmentLike & {
    to_poi_id: string;
    evidence?: Record<string, unknown>;
  } {
    return {
      to_poi_id: String(row.toPoiId),
      segment_type: row.segmentType,
      road_condition: (row.roadCondition ?? undefined) as any,
      latest_status:
        row.latestStatus && typeof row.latestStatus === 'object'
          ? (row.latestStatus as SegmentLatestRoadStatusV1)
          : undefined,
      seasonal_closures: Array.isArray(row.seasonalClosures) ? row.seasonalClosures : [],
      evidence: (row.evidence ?? undefined) as any,
    };
  }
}
