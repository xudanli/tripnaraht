import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { TripDecisionEngineService } from '../../trips/decision/trip-decision-engine.service';
import { ConstraintEvaluationGatewayService } from '../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import type { CanonicalOverallStatus } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';
import { isConstraintEvaluationGatewayEnabled } from '../../decision-runtime/constraints/constraint-evaluation.config';
import { guideDraftToTripPlan } from '../utils/guide-draft-to-trip-plan.util';
import { buildGuideTripWorldState } from '../utils/guide-world-state.util';
import { constraintAssertionsToWarnings } from '../utils/guide-constraint-warnings.util';
import { TravelCompilerService } from '../../travel-compiler/travel-compiler.service';
import { TravelGraphStoreService } from '../../travel-compiler/services/travel-graph-store.service';
import { isTravelCompilerEnabled } from '../../travel-compiler/utils/travel-compiler-config.util';
import { graphToTripPlan } from '../../travel-compiler/projection/graph-to-trip-plan.util';
import { buildTripWorldStateFromGraph } from '../../travel-compiler/projection/build-world-state-from-graph.util';
import { ConfigService } from '@nestjs/config';
import type { GuideItineraryDraft } from './guide-plan-builder.service';
import type { GuideTravelContext } from '../types/guide-to-plan.types';

function isGuideDecisionEngineEnabled(): boolean {
  const raw = process.env.GUIDE_DECISION_ENGINE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function isGuideConstraintGatewayEnabled(): boolean {
  const raw = process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return isConstraintEvaluationGatewayEnabled();
}

export type GuideDecisionEnhancement = {
  engineAvailable: boolean;
  engineApplied: boolean;
  additionalWarnings: string[];
  /** Canonical constraint evaluation overall status when gateway path used */
  overallStatus?: CanonicalOverallStatus;
  evaluationMode?: 'constraint_gateway' | 'legacy_generate_plan' | 'skipped';
};

/**
 * Guide-to-plan 决策增强：优先 Constraint Evaluation Gateway（不形成正式决策、不写 Effective Plan）。
 * Legacy generatePlan 仅在 GUIDE_DECISION_ENGINE_ENABLED=1 且 Gateway 关闭时降级使用。
 */
@Injectable()
export class GuideDecisionBridgeService {
  private readonly logger = new Logger(GuideDecisionBridgeService.name);
  private decisionEngine?: TripDecisionEngineService;
  private constraintGateway?: ConstraintEvaluationGatewayService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly travelCompiler?: TravelCompilerService,
    @Optional() private readonly travelGraphStore?: TravelGraphStoreService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async enhanceDraft(params: {
    countryCode: string;
    travelContext?: GuideTravelContext | null;
    itineraryDraft: GuideItineraryDraft;
    tripId?: string;
  }): Promise<GuideDecisionEnhancement> {
    if (isGuideConstraintGatewayEnabled()) {
      return this.enhanceViaConstraintGateway(params);
    }

    if (isGuideDecisionEngineEnabled()) {
      return this.enhanceViaLegacyEngine(params);
    }

    this.logger.debug('Guide-to-plan: decision enhancement skipped (enable GUIDE_CONSTRAINT_GATEWAY or GUIDE_DECISION_ENGINE)');
    return {
      engineAvailable: this.getConstraintGateway() != null || this.getDecisionEngine() != null,
      engineApplied: false,
      additionalWarnings: [],
      evaluationMode: 'skipped',
    };
  }

  private async enhanceViaConstraintGateway(params: {
    countryCode: string;
    travelContext?: GuideTravelContext | null;
    itineraryDraft: GuideItineraryDraft;
    tripId?: string;
  }): Promise<GuideDecisionEnhancement> {
    const gateway = this.getConstraintGateway();
    if (!gateway) {
      return { engineAvailable: false, engineApplied: false, additionalWarnings: [], evaluationMode: 'skipped' };
    }

    try {
      let plan = guideDraftToTripPlan({
        draft: params.itineraryDraft,
        tripId: params.tripId,
        travelModeDefault:
          params.travelContext?.transportMode === 'self_drive' ? 'drive' : 'walk',
      });
      let worldState = buildGuideTripWorldState({
        countryCode: params.countryCode,
        travelContext: params.travelContext,
        draft: params.itineraryDraft,
        sessionId: params.tripId,
      });

      if (this.travelCompiler && isTravelCompilerEnabled(this.configService)) {
        const compilation = await this.travelCompiler.compileFromGuideDraft({
          draft: params.itineraryDraft,
          countryCode: params.countryCode,
          tripId: params.tripId,
        });
        if (compilation.graph) {
          plan = graphToTripPlan(compilation.graph);
          worldState = buildTripWorldStateFromGraph(compilation.graph);
          if (params.tripId && this.travelGraphStore) {
            await this.travelGraphStore.persistCompilation(params.tripId, compilation).catch(() => undefined);
          }
        }
      }

      const tripId = params.tripId ?? `guide_draft_${Date.now()}`;

      const report = await gateway.evaluatePlan({
        tripId,
        plan,
        worldState,
        countryCode: params.countryCode,
        evaluationMode: 'PLAN_VERIFY',
        skipLegacyChecker: true,
      });

      const additionalWarnings = constraintAssertionsToWarnings(report.assertions);
      if (report.overallStatus === 'UNVERIFIED' || report.overallStatus === 'INFEASIBLE') {
        additionalWarnings.unshift(
          `Canonical 约束评估：${report.overallStatus}（非已确认可执行结论）`,
        );
      }

      return {
        engineAvailable: true,
        engineApplied: true,
        additionalWarnings: additionalWarnings.slice(0, 8),
        overallStatus: report.overallStatus,
        evaluationMode: 'constraint_gateway',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Guide constraint gateway skipped: ${message}`);
      return { engineAvailable: true, engineApplied: false, additionalWarnings: [], evaluationMode: 'skipped' };
    }
  }

  private async enhanceViaLegacyEngine(params: {
    countryCode: string;
    travelContext?: GuideTravelContext | null;
    itineraryDraft: GuideItineraryDraft;
  }): Promise<GuideDecisionEnhancement> {
    const engine = this.getDecisionEngine();
    if (!engine) {
      return { engineAvailable: false, engineApplied: false, additionalWarnings: [], evaluationMode: 'skipped' };
    }

    try {
      const placeIds = [
        ...new Set(
          params.itineraryDraft.days.flatMap((day) =>
            day.items.map((item) => item.placeId).filter((id): id is number => id != null),
          ),
        ),
      ];
      const coords = await this.loadPlaceCoordinates(placeIds);
      const state = buildGuideTripWorldState({
        countryCode: params.countryCode,
        travelContext: params.travelContext,
        draft: params.itineraryDraft,
        placeCoords: coords,
      });
      const { log } = await engine.generatePlan(state, `guide_${Date.now()}`);
      return {
        engineAvailable: true,
        engineApplied: true,
        additionalWarnings: this.extractWarningsFromLog(log),
        evaluationMode: 'legacy_generate_plan',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Guide legacy decision engine skipped: ${message}`);
      return { engineAvailable: true, engineApplied: false, additionalWarnings: [], evaluationMode: 'skipped' };
    }
  }

  private async loadPlaceCoordinates(
    placeIds: number[],
  ): Promise<Map<number, { lat: number; lng: number }>> {
    const coords = new Map<number, { lat: number; lng: number }>();
    if (placeIds.length === 0) return coords;

    const geoRows = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
      SELECT p.id, ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng
      FROM "Place" p
      WHERE p.id = ANY(${placeIds}::int[]) AND p.location IS NOT NULL
    `;
    for (const g of geoRows) {
      coords.set(g.id, { lat: g.lat, lng: g.lng });
    }
    return coords;
  }

  private getDecisionEngine(): TripDecisionEngineService | null {
    if (this.decisionEngine) return this.decisionEngine;
    if (!this.moduleRef) return null;
    try {
      this.decisionEngine = this.moduleRef.get(TripDecisionEngineService, { strict: false });
      return this.decisionEngine;
    } catch {
      return null;
    }
  }

  private getConstraintGateway(): ConstraintEvaluationGatewayService | null {
    if (this.constraintGateway) return this.constraintGateway;
    if (!this.moduleRef) return null;
    try {
      this.constraintGateway = this.moduleRef.get(ConstraintEvaluationGatewayService, {
        strict: false,
      });
      return this.constraintGateway;
    } catch {
      return null;
    }
  }

  private extractWarningsFromLog(log: unknown): string[] {
    if (!log || typeof log !== 'object') return [];
    const warnings: string[] = [];
    const obj = log as Record<string, unknown>;
    const rejected = obj.rejectedActivities;
    if (Array.isArray(rejected) && rejected.length > 0) {
      warnings.push(`决策引擎标记 ${rejected.length} 项活动需复核`);
    }
    const notes = obj.notes;
    if (typeof notes === 'string' && notes.trim()) {
      warnings.push(notes.trim());
    }
    return warnings.slice(0, 5);
  }
}
