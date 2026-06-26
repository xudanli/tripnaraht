// src/trips/decision/trip-decision-engine.service.ts

/**
 * Trip Decision Engine Service
 * 
 * 决策神经系统的核心：整合 Abu、Dr.Dre、Neptune 三个策略
 * 只做决策，不做 UI，不做爬取
 */

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import { OperationalPolicyService } from './operational-policy/operational-policy.service';
import { evaluateGeneratePlanGovernance } from './operational-policy/operational-policy-evaluator';
import { OpsRealityAuditService } from './services/ops-reality-audit.service';
import { ModuleRef } from '@nestjs/core';
import {
  TripWorldState,
  TravelLeg,
  GeoPoint,
  ActivityCandidate,
  ISODate,
  type WeatherExecutionSignal,
} from './world-model';
import { TripPlan, PlanDay, PlanSlot } from './plan-model';
import { abuSelectCoreActivities } from './strategies/abu';
import { drdreBuildDaySchedule } from './strategies/drdre';
import { neptuneRepairPlan, type NeptuneRepairResult } from './strategies/neptune';
import {
  runExecutionCognitiveOrchestration,
  commitEcoWorldModelUpdate,
  shouldRunEcoPipeline,
  evaluateEcoNeptuneClosure,
  mergeEcoClosureIntoDigest,
  isNeptuneRetryAllowed,
} from '../execution-cognitive-orchestrator';
import {
  applyMinimalNeptunePatches,
  planMinimalNeptunePatches,
  resolveCorrectionStrategy,
} from '../execution-convergence-optimizer';
import type { NeptunePatch } from '../execution-convergence-optimizer/neptune-patch.types';
import {
  evaluateSinglePassConvergence,
  evaluateTwoPassConvergence,
  buildExecutionStateSnapshot,
  evaluateFixedPoint,
  shouldContinueIteration,
  buildConvergenceProofSketch,
} from '../execution-convergence-formalization';
import {
  buildFormalIterationSnapshot,
  evaluateContraction,
  evaluateOscillationBound,
} from '../execution-formal-proof';
import { DecisionRunLog, DecisionTrigger } from './decision-log';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';
import { ReadinessService } from '../readiness/services/readiness.service';
// import { PoiFeaturesAdapterService, PoiFeatures } from './services/poi-features-adapter.service';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from '../../route-directions/services/route-direction-poi-generator.service';
import { RouteDirectionObservabilityService } from '../../route-directions/services/route-direction-observability.service';
import { CompliancePluginService } from '../../route-directions/plugins/compliance-plugin.service';
import { TransportPluginService } from '../../route-directions/plugins/transport-plugin.service';
import { getPolicyProfile } from './config/objective-config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DecisionParamsInjectorService } from '../../agent/memory/services/decision-params-injector.service';
import { AGENT_MEMORY_DECISION_COMPLETED } from '../../agent/memory/events/agent-memory.events';
import { ConstraintDSLCompiler } from './constraints/constraint-dsl-compiler.service';
import { ConstraintDSL } from './constraints/constraint-dsl.types';
import { ConstraintConflictResolver } from './constraints/constraint-conflict-resolver.service';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { MultiPlanGenerator, PlanVariant } from './services/multi-plan-generator.service';
import { DEMDailyEnergyService, DailyEnergyBudget } from './services/dem-daily-energy.service';
import { DEMRouteSegmentationService } from './services/dem-route-segmentation.service';
import { DEMRiskScoringService, PlanRiskScore } from './services/dem-risk-scoring.service';
import { DEMEvidenceChainService } from './services/dem-evidence-chain.service';
import { DryRunPlannerService } from './services/dry-run-planner.service';
import { DemDecisionEvidencePipelineService } from './services/dem-decision-evidence-pipeline.service';
import { DemEvidenceEnforcerService } from './services/dem-evidence-enforcer.service';
import { DemDecisionEvidenceService } from './services/dem-decision-evidence.service';
import { DemEvidencePipelineResult, DemDecisionEvidence } from './interfaces/dem-decision-evidence.interface';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { PlanConverterService } from './services/plan-converter.service';
import { WorldModelContext } from './shared/world-model.types';
import { WeatherObservationEvidence } from './models/physical-reality.model';
import { WeatherDecisionEvidenceService } from './services/weather-decision-evidence.service';
import type {
  WeatherEvidenceLocationContext,
  WeatherEvidencePipelineResult,
  WeatherDecisionEvidence,
} from './interfaces/weather-decision-evidence.interface';
import type { VehicleProfile, VehicleClass, ExecutionState } from './hazard/travel-hazard.types';
import type { TimeDrift } from './temporal/time-drift.types';
import { projectRouteExecutionHazards } from '../routing/execution/project-route-execution-hazards';
import { buildExecutionEnrichedTravelLeg } from '../routing/execution/build-execution-enriched-travel-leg';
import { routeExecutionToTemporalDrifts } from '../routing/execution/route-execution-temporal-bridge';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { augmentOverlayFramesWithPedestrianGaps } from '../execution-overlay/augment-overlay-pedestrian-gaps';
import { applyPhysicsAuthorityToOverlayFrames } from '../execution-overlay/apply-physics-authority-to-overlay';
import { mergeRepairHintsIntoFrames } from '../execution-overlay/merge-repair-hints-into-frames';
import { stampOverlayAnnotationsFromSignals } from '../execution-overlay/stamp-overlay-annotations';
import { assertOverlayOnly, planHasInboundTravelLeg } from '../execution-overlay/overlay-decision-policy';
import { assertOnlyDAGIsDecisionSource, buildExecutionTruthDAG } from '../execution-truth-dag';
import {
  buildExecutionStabilityBaseline,
  runExecutionStabilityCycle,
  STABILITY_GLOBAL_THRESHOLD,
  closureToLyapunovCarrier,
  evaluateLyapunov,
  evaluateStochasticLyapunov,
} from '../execution-stability';
import {
  buildDisturbanceModel,
  buildExecutionUncertainty,
  estimateResidualVariance,
  evaluateBayesianCausalUpdate,
  evaluateProbabilisticFixedPointSketch,
  evaluateProbabilisticStability,
} from '../execution-probabilistic-dynamics';
import { buildP7EcoClosureAugmentation } from '../meta-dynamics';
import { buildP8EcoClosureAugmentation } from '../recursive-semantics';
import { buildP9EcoClosureAugmentation } from '../epistemic-boundary';
import { buildP10EcoClosureAugmentation } from '../computational-ontology';
import {
  applyEcoIdentityDriftAlert,
  commitEcoIdentityLedger,
  finalizeEcoClosureDigestSlice,
  gateEcoClosureSecondPass,
  isEcoClosureEnforcementDisabled,
  isEcoLedgerDbPersistenceSkipped,
  resolveCorrectionStrategyWithLedger,
  hydrateEcoLedgerIntoTripWorldState,
  applyEcoLedgerTripContext,
  applyPressureRegulation,
  applyControlPhaseEngineTick,
} from '../execution-closure-persistence';

/** P-ECO-Closure-6 — probabilistic certificates (audit). */
const P6_LYAPUNOV_ENERGY_EPSILON = 0.18;
const P6_CERTAINTY_TAU = 0.95;
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { assertIRCreatedOnlyByCompiler } from '../execution-ir/ir-creation-guard';
import { applyWeatherDriveDelayAndEmitDrifts } from './temporal/apply-weather-drive-delay';
import { propagateSequenceDriftsToDownstreamSlots } from './temporal/propagate-sequence-drifts';
import { buildCrossDayHandoffEdges } from './temporal/build-cross-day-edges';
import { emitCrossDayHandoffDrifts } from './temporal/emit-cross-day-handoff-drifts';
import { propagateCrossDayDriftsToNextDaySlots } from './temporal/propagate-cross-day-drifts';
import { summarizeTemporalPropagationForSignals } from './temporal/summarize-temporal-for-signals';
import { applyAccumulatedGlobalSlackToPlanDays } from './temporal/apply-accumulated-global-slack-to-plan';
import { applyOperationalDayWindowFeasibility } from './temporal/apply-operational-day-window-feasibility';
import { applyDaylightFeasibilityHints } from './temporal/apply-daylight-feasibility-hints';
import { approximateCivilTwilightLocal } from './temporal/approximate-civil-twilight';
import { buildEffectiveDrivableWindowForDay } from './temporal/build-effective-drivable-window';
import { buildLegTemporalSafetyAssessments } from './temporal/build-leg-temporal-safety-assessments';
import { buildTemporalExecutionWindowsBySlot } from './temporal/build-temporal-execution-windows';
import { buildGoldenHourOpportunitySignal } from './signals/build-golden-hour-opportunity';
import { buildOvernightRestructuringPressures } from './restructuring/build-overnight-restructuring-pressure';
import { deriveOvernightFromOverlay } from './restructuring/derive-overnight-from-overlay';
import type { OperationalDayWindowSignalSummary } from './temporal/temporal-propagation.types';
import type { EffectiveDrivableWindow } from './temporal/effective-drivable-window.types';
import type { GoldenHourOpportunitySignal } from './signals/golden-hour-opportunity.types';
import { buildUnifiedConstraintGraph } from './constraint-graph/build-unified-constraint-graph';
import { reduceSemanticRuntimeView } from './execution/semantic-runtime-reducer';
import type { WorldConstraintStoreSnapshot } from '../../world/world-snapshot';
import { evaluateMinimalRepairs } from './repair/repair-evaluator';
import { mapGuardianRepairsToChosenActions } from './repair/guardian-repair-applier.util';
import type { AuroraNightObservationSignal } from './signals/aurora-night-signals.types';
import {
  buildAuroraNightObservationSignal,
  buildNightObservationFeasibilitySummary,
} from './signals/build-night-observation-feasibility';
import { buildAuroraOpportunityByDate } from './signals/build-aurora-opportunity';
import {
  evaluateOpportunityMigrationsForPlan,
} from './opportunity/opportunity-migration-evaluator';
import { migrationStanceFromAuroraIntentWeight } from './opportunity/opportunity-threshold.policy';
import { materializeProposedCorridorMigrations } from './migration/materialize-corridor-migration-proposal';
import { enrichProposalsWithSimulation } from './migration/simulate-corridor-migration';
import { IcelandAuroraAdapter } from '../../data-contracts/adapters/iceland-aurora.adapter';
import {
  DEFAULT_VEHICLE_FUEL_PROFILE,
  extractFuelPoiIndexFromCandidates,
  summarizeFuelReachabilityForPlan,
} from '../fuel';
import {
  assertOverlayFieldConsistency,
  buildLegDateIndexFromPlan,
  buildPhysicsFieldIndex,
  buildUnifiedPhysicsField,
} from '../physics';
import { DecisionLogEntry } from './shared/decision-result.types';
import { mapUserPersonaToDecisionParams, extractPersonaKeywordsFromPreferences } from './config/user-persona-mapping.config';
import { createHumanCapabilityModelFromProfile } from './models/human-capability.model';
import { ReadinessAgentService } from './readiness/readiness-agent.service';
import { TravelReadinessResult } from './readiness/types/readiness-checklist.types';
import { EcoIdentityLedgerPersistenceService } from './services/eco-identity-ledger-persistence.service';
import { enrichTripWorldStateInventoryPlaceholders } from './inventory-ontology/inventory-candidate-enrichment';
import { TrailPlanningAdapter } from './adapters/trail-planning.adapter';
import { attachHardTrekTrailPlanToState } from './adapters/hard-trek-trail-planning.hook';
import { buildShadowRealitySnapshotV0 } from '../reality-kernel/build-shadow-reality-snapshot-v0';
import {
  buildDecisionContextV0,
  computePlanningHorizonFromTripContext,
} from '../reality-kernel/build-decision-context-v0';
import type { DecisionContextV0 } from '../reality-kernel/decision-context.types';
import {
  isRealityEnforcementEnabled,
  isRealityReadBoundaryEnabled,
} from '../reality-kernel/reality-enforcement.env';
import { getBoundDecisionContext, runWithDecisionContextAsync } from '../reality-kernel/reality-context.storage';
import {
  appendRealityExecutionTrace,
  evaluatePlanningTick,
} from '../reality-kernel/reality-policy-engine';
import {
  bindExecutionDecisionToContext,
  enforceExecutionDecision,
  ExecutionGate,
} from '../reality-kernel/reality-execution-gate';
import {
  appendDecisionCausality,
  attachOutcomeToCausalityRecord,
  buildDecisionCausalityId,
} from '../reality-kernel/decision-causality';
import {
  buildBlockedAtGateCausalityRecordV1,
  finalizeDecisionCausalityRecordV1,
} from '../causal-runtime/decision-causality-v1';
import { CausalTravelEventEmitterService } from '../causal-runtime/causal-travel-event.emitter.service';
import { CausalRuntimeSessionService } from '../causal-runtime/causal-runtime-session.service';
import {
  attachIcelandAssessmentToState,
  buildIcelandAssessmentFromTripState,
} from '../causal-runtime/domains/trip-world-state-iceland-causal.util';
import { buildCausalPersonaProjection } from '../causal-runtime/persona/build-causal-persona-projection';

export interface SenseTools {
  // keep it small: you can adapt to your existing services
  getHotelPointForDate?: (date: string) => Promise<GeoPoint | undefined>;
  getTravelLeg: (
    from: GeoPoint,
    to: GeoPoint
  ) => Promise<TravelLeg>;
}

@Injectable()
export class TripDecisionEngineService {
  private readonly logger = new Logger(TripDecisionEngineService.name);

  private readinessService?: ReadinessService;
  private readinessAgent?: ReadinessAgentService;
  /** Lazily resolved — optional Prisma-backed ECO identity ledger. */
  private ecoLedgerPersistenceService: EcoIdentityLedgerPersistenceService | null | undefined;

  constructor(
    private readonly tools: SenseToolsAdapter,
    private readonly moduleRef: ModuleRef,
    private readonly decisionParamsInjector: DecisionParamsInjectorService,
    private readonly eventEmitter: EventEmitter2,
    // private readonly poiFeaturesAdapter?: PoiFeaturesAdapterService,
    @Optional() private readonly routeDirectionSelector?: RouteDirectionSelectorService,
    @Optional() private readonly routeDirectionPoiGenerator?: RouteDirectionPoiGeneratorService,
    @Optional() private readonly observabilityService?: RouteDirectionObservabilityService,
    @Optional() private readonly compliancePlugin?: CompliancePluginService,
    @Optional() private readonly transportPlugin?: TransportPluginService,
    @Optional() private readonly demDailyEnergyService?: DEMDailyEnergyService,
    @Optional() private readonly demRouteSegmentationService?: DEMRouteSegmentationService,
    @Optional() private readonly demRiskScoringService?: DEMRiskScoringService,
    @Optional() private readonly demEvidenceChainService?: DEMEvidenceChainService,
    @Optional() private readonly dryRunPlanner?: DryRunPlannerService,
    @Optional() private readonly demEvidencePipeline?: DemDecisionEvidencePipelineService,
    @Optional() private readonly demEvidenceEnforcer?: DemEvidenceEnforcerService,
    @Optional() private readonly demDecisionEvidenceService?: DemDecisionEvidenceService,
    @Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService,
    @Optional() private readonly planConverter?: PlanConverterService,
    @Optional() private readonly constraintDSLCompiler?: ConstraintDSLCompiler,
    @Optional() private readonly conflictResolver?: ConstraintConflictResolver,
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
    @Inject(forwardRef(() => MultiPlanGenerator))
    @Optional()
    private readonly multiPlanGenerator?: MultiPlanGenerator,
    @Optional() private readonly weatherDecisionEvidence?: WeatherDecisionEvidenceService,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
    @Optional() private readonly opsRealityAudit?: OpsRealityAuditService,
    @Optional() private readonly operationalPolicy?: OperationalPolicyService,
    @Optional() private readonly trailPlanningAdapter?: TrailPlanningAdapter,
    @Optional() private readonly causalTravelEventEmitter?: CausalTravelEventEmitterService,
    @Optional() private readonly causalRuntimeSession?: CausalRuntimeSessionService,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // ReadinessService 和 ReadinessAgentService 在需要时通过 ModuleRef 获取
  }

  /**
   * 懒加载获取 ReadinessService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getEcoLedgerPersistence(): EcoIdentityLedgerPersistenceService | null {
    if (this.ecoLedgerPersistenceService === undefined) {
      try {
        this.ecoLedgerPersistenceService =
          this.moduleRef.get(EcoIdentityLedgerPersistenceService, { strict: false }) ?? null;
      } catch {
        this.ecoLedgerPersistenceService = null;
      }
    }
    return this.ecoLedgerPersistenceService;
  }

  /** Cold resume: load prior ledger from Trip.metadata before any path reads `signals.ecoIdentityLedger` / ECO gate uses prior ledger. */
  private async hydrateEcoIdentityLedgerFromStorage(state: TripWorldState): Promise<void> {
    const svc = this.getEcoLedgerPersistence();
    if (!svc) return;
    try {
      await hydrateEcoLedgerIntoTripWorldState(state, id => svc.loadLedgerBundle(id));
    } catch (e) {
      this.logger.warn(`hydrateEcoIdentityLedgerFromStorage failed: ${String(e)}`);
    }
  }

  private async persistEcoIdentityLedgerToStorage(state: TripWorldState): Promise<void> {
    if (isEcoLedgerDbPersistenceSkipped()) return;
    const tripId = state.signals.ecoLedgerTripId;
    if (!tripId) return;
    const ledger = state.signals.ecoIdentityLedger;
    if (!ledger) return;
    if (state.policies?.ecoClosure?.persistEcoIdentityLedger === false) return;
    const svc = this.getEcoLedgerPersistence();
    if (!svc) return;
    try {
      const expected = state.signals.ecoLedgerMetadataRevision;
      const result = await svc.saveLedger(
        tripId,
        ledger,
        expected !== undefined ? { expectedRevision: expected } : {},
      );
      if (result.ok && result.newRevision !== undefined) {
        state.signals.ecoLedgerMetadataRevision = result.newRevision;
        return;
      }
      if (result.conflict) {
        const bundle = await svc.loadLedgerBundle(tripId);
        state.signals.ecoLedgerMetadataRevision = bundle.revision;
        const retry = await svc.saveLedger(tripId, ledger, {
          expectedRevision: bundle.revision,
        });
        if (retry.ok && retry.newRevision !== undefined) {
          state.signals.ecoLedgerMetadataRevision = retry.newRevision;
          this.logger.debug(
            `persistEcoIdentityLedgerToStorage: persisted after revision refresh for trip ${tripId}`,
          );
          return;
        }
        if (retry.conflict) {
          this.logger.warn(
            `persistEcoIdentityLedgerToStorage: ledger persist lost race after retry for trip ${tripId}`,
          );
          return;
        }
        this.logger.warn(
          `persistEcoIdentityLedgerToStorage: unexpected outcome after revision retry for trip ${tripId}`,
        );
        return;
      }
      if (!result.ok) {
        this.logger.warn(
          `persistEcoIdentityLedgerToStorage: save skipped or failed for trip ${tripId}`,
        );
      }
    } catch (e) {
      this.logger.warn(`persistEcoIdentityLedgerToStorage failed: ${String(e)}`);
    }
  }

  /**
   * Shared by {@link repairPlan} and {@link generatePlan}: stability tick → Neptune VM → optional ECO closure → persist ledger.
   */
  private async runNeptuneStabilityAndEcoClosure(
    state: TripWorldState,
    plan: TripPlan,
  ): Promise<NeptuneRepairResult> {
    const stabilityCycle = runExecutionStabilityCycle({
      detection: {
        dag: state.signals.executionTruthDAG,
        ir: state.signals.executionIR,
        baseline: state.signals.executionStabilityBaseline,
      },
      fixHandlers: {
        recompileIR: () => {
          const dag = state.signals.executionTruthDAG;
          if (dag?.nodes?.length) {
            state.signals.executionIR = compileDAGToIR(dag);
          }
        },
      },
    });
    if (stabilityCycle.score.global < STABILITY_GLOBAL_THRESHOLD) {
      this.logger.debug(
        `P14 stability: global=${stabilityCycle.score.global.toFixed(3)} fixesApplied=${stabilityCycle.fixesApplied} drifts=${stabilityCycle.signals.map(s => s.type).join(',')}`,
      );
    }

    let repaired = neptuneRepairPlan({
      state,
      plan,
      executionIR: state.signals.executionIR!,
    });

    const ecoPipelineRan = shouldRunEcoPipeline(state);
    if (ecoPipelineRan) {
      const ecoIdentityPriorLedger = state.signals.ecoIdentityLedger;
      const ecoEnforcementDisabled = isEcoClosureEnforcementDisabled(state.policies?.ecoClosure);
      let eco = runExecutionCognitiveOrchestration(state, repaired);
      repaired = eco.neptuneResult;
      let closureEval = evaluateEcoNeptuneClosure(state, eco);
      applyPressureRegulation(state, { stabilityScore: closureEval.stabilityScore });
      applyControlPhaseEngineTick(state, closureEval, {
        stabilityScore: closureEval.stabilityScore,
      });
      const neptuneAfterEcoPass1 = repaired;
      const convergenceOpts = state.policies?.ecoClosure?.convergenceSemantics;
      const fpPass1 = evaluateFixedPoint(null, neptuneAfterEcoPass1, closureEval, convergenceOpts);
      const formalSnapPass1 = buildFormalIterationSnapshot(state, 0);
      const useFpGate =
        state.policies?.ecoClosure?.useFixedPointIterationGate === true ||
        (typeof process !== 'undefined' && process.env?.TRIP_ECO_FP_GATE === '1');
      const requestRetry = useFpGate
        ? shouldContinueIteration(fpPass1)
        : closureEval.shouldRerunNeptune;
      const maxExtra =
        typeof state.policies?.ecoClosure?.maxExtraNeptunePasses === 'number'
          ? state.policies.ecoClosure.maxExtraNeptunePasses
          : 1;
      const regCtrl = state.signals.pressureRegulation?.control;
      const throttle = regCtrl?.ecoThrottle ?? 1;
      let effectiveMaxExtra = Math.max(0, Math.floor(maxExtra * throttle));
      if (regCtrl?.neptuneRetryPolicy === 'block') {
        effectiveMaxExtra = 0;
      } else if (typeof regCtrl?.closureRetryLimit === 'number') {
        effectiveMaxExtra = Math.min(effectiveMaxExtra, regCtrl.closureRetryLimit);
      }
      const baseAllowRetry =
        requestRetry &&
        isNeptuneRetryAllowed(state) &&
        effectiveMaxExtra > 0;
      const allowRetry = ecoEnforcementDisabled
        ? baseAllowRetry
        : gateEcoClosureSecondPass({
            priorLedger: ecoIdentityPriorLedger,
            baseAllowRetry,
          });

      if (allowRetry) {
        this.promMetrics?.recordOpsNeptuneEcoSecondPass();
        const snapshotPass1 = buildExecutionStateSnapshot(1, neptuneAfterEcoPass1, closureEval);
        const beforeRetry = closureEval;
        const correctionStrategy = ecoEnforcementDisabled
          ? resolveCorrectionStrategy(state)
          : resolveCorrectionStrategyWithLedger(state, ecoIdentityPriorLedger);
        let appliedMinimalPatches: NeptunePatch[] | undefined;

        if (correctionStrategy === 'minimal_patch_then_neptune') {
          const planned = planMinimalNeptunePatches(state, closureEval, eco);
          const patchOutcome = applyMinimalNeptunePatches(state, planned);
          appliedMinimalPatches = patchOutcome.applied;
        }

        repaired = neptuneRepairPlan({
          state,
          plan,
          executionIR: state.signals.executionIR!,
        });
        eco = runExecutionCognitiveOrchestration(state, repaired);
        repaired = eco.neptuneResult;
        closureEval = evaluateEcoNeptuneClosure(state, eco);
        const convergence = evaluateTwoPassConvergence(
          neptuneAfterEcoPass1,
          repaired,
          beforeRetry,
          closureEval,
          convergenceOpts,
        );
        const fixedPoint = evaluateFixedPoint(snapshotPass1, repaired, closureEval, convergenceOpts);
        const patchMag =
          correctionStrategy === 'minimal_patch_then_neptune'
            ? Math.min(1, (appliedMinimalPatches?.length ?? 0) / 4)
            : 0;
        const lyapunov = evaluateLyapunov(
          closureToLyapunovCarrier(beforeRetry, 0),
          closureToLyapunovCarrier(closureEval, patchMag),
        );
        const formalSnapPass2 = buildFormalIterationSnapshot(state, patchMag);
        const contractionProof = evaluateContraction(formalSnapPass1, formalSnapPass2);
        const oscillationBound = evaluateOscillationBound({
          contractionRate: fixedPoint.contractionRate,
          k: contractionProof.lipschitzConstant,
          patchDecreasing: contractionProof.monotonicPatchSequence,
        });
        const executionUncertainty = buildExecutionUncertainty(state);
        const disturbanceModel = buildDisturbanceModel(state);
        const stochasticLyapunov = evaluateStochasticLyapunov(
          closureToLyapunovCarrier(beforeRetry, 0),
          closureToLyapunovCarrier(closureEval, patchMag),
          disturbanceModel,
        );
        const bayesianCausal = evaluateBayesianCausalUpdate(state.signals.reflectiveCausalModel);
        const probabilisticStability = evaluateProbabilisticStability({
          meanEnergy: stochasticLyapunov.expectedNextEnergy,
          energyVariance: stochasticLyapunov.energyVarianceNext,
          epsilon: P6_LYAPUNOV_ENERGY_EPSILON,
          tau: P6_CERTAINTY_TAU,
        });
        const epsilonResidual =
          convergenceOpts?.epsilonResidual ??
          convergence.epsilonResidual ??
          0.06;
        const probabilisticFixedPoint = evaluateProbabilisticFixedPointSketch({
          residualDelta: fixedPoint.residualDelta,
          epsilonResidual,
          residualVariance: estimateResidualVariance(executionUncertainty, disturbanceModel),
          tau: P6_CERTAINTY_TAU,
        });
        const p7Aug = buildP7EcoClosureAugmentation({
          state,
          lyapunov,
          probabilisticStability,
          convergenceOpts,
          iterationKind: 'two_pass',
        });
        const p8Aug = buildP8EcoClosureAugmentation({
          state,
          p7: p7Aug,
          executionUncertainty,
          probabilisticStability,
          bayesianObservationLikelihood: bayesianCausal.observationLikelihood,
        });
        const p9Aug = buildP9EcoClosureAugmentation({
          executionUncertainty,
          contractionProof,
          recursiveReasoning: p8Aug.recursiveReasoning,
          selfModel: p8Aug.selfModel,
          bayesianCausal,
          probabilisticTailMass: probabilisticStability?.probabilityBelowEpsilon ?? 0,
        });
        const p10Aug = buildP10EcoClosureAugmentation({
          state,
          p7: p7Aug,
          p8: p8Aug,
          p9: p9Aug,
          contractionProof,
        });
        eco.digest = mergeEcoClosureIntoDigest(
          eco.digest,
          finalizeEcoClosureDigestSlice(
            {
              neptunePasses: 2,
              beforeRetry,
              final: closureEval,
              correctionPath: correctionStrategy,
              ...(correctionStrategy === 'minimal_patch_then_neptune'
                ? { appliedMinimalPatches }
                : {}),
              convergence,
              fixedPoint,
              convergenceProof: buildConvergenceProofSketch(
                [beforeRetry, closureEval],
                [fpPass1.residualDelta, fixedPoint.residualDelta],
                maxExtra + 1,
              ),
              lyapunov,
              contractionProof,
              oscillationBound,
              executionUncertainty,
              disturbanceModel,
              stochasticLyapunov,
              bayesianCausal,
              probabilisticStability,
              probabilisticFixedPoint,
              ...p7Aug,
              ...p8Aug,
              ...p9Aug,
              ...p10Aug,
            },
            ecoIdentityPriorLedger,
          ),
        );
      } else {
        const lyapunov = evaluateLyapunov(null, closureToLyapunovCarrier(closureEval, 0));
        const contractionProof = evaluateContraction(null, formalSnapPass1);
        const oscillationBound = evaluateOscillationBound({
          contractionRate: fpPass1.contractionRate,
          k: contractionProof.lipschitzConstant,
          patchDecreasing: true,
        });
        const singlePassConvergence = evaluateSinglePassConvergence(closureEval, convergenceOpts);
        const executionUncertainty = buildExecutionUncertainty(state);
        const disturbanceModel = buildDisturbanceModel(state);
        const stochasticLyapunov = evaluateStochasticLyapunov(
          null,
          closureToLyapunovCarrier(closureEval, 0),
          disturbanceModel,
        );
        const bayesianCausal = evaluateBayesianCausalUpdate(state.signals.reflectiveCausalModel);
        const probabilisticStability = evaluateProbabilisticStability({
          meanEnergy: stochasticLyapunov.expectedNextEnergy,
          energyVariance: stochasticLyapunov.energyVarianceNext,
          epsilon: P6_LYAPUNOV_ENERGY_EPSILON,
          tau: P6_CERTAINTY_TAU,
        });
        const epsilonResidual =
          convergenceOpts?.epsilonResidual ??
          singlePassConvergence.epsilonResidual ??
          0.06;
        const probabilisticFixedPoint = evaluateProbabilisticFixedPointSketch({
          residualDelta: fpPass1.residualDelta,
          epsilonResidual,
          residualVariance: estimateResidualVariance(executionUncertainty, disturbanceModel),
          tau: P6_CERTAINTY_TAU,
        });
        const p7Aug = buildP7EcoClosureAugmentation({
          state,
          lyapunov,
          probabilisticStability,
          convergenceOpts,
          iterationKind: 'single_pass',
        });
        const p8Aug = buildP8EcoClosureAugmentation({
          state,
          p7: p7Aug,
          executionUncertainty,
          probabilisticStability,
          bayesianObservationLikelihood: bayesianCausal.observationLikelihood,
        });
        const p9Aug = buildP9EcoClosureAugmentation({
          executionUncertainty,
          contractionProof,
          recursiveReasoning: p8Aug.recursiveReasoning,
          selfModel: p8Aug.selfModel,
          bayesianCausal,
          probabilisticTailMass: probabilisticStability?.probabilityBelowEpsilon ?? 0,
        });
        const p10Aug = buildP10EcoClosureAugmentation({
          state,
          p7: p7Aug,
          p8: p8Aug,
          p9: p9Aug,
          contractionProof,
        });
        eco.digest = mergeEcoClosureIntoDigest(
          eco.digest,
          finalizeEcoClosureDigestSlice(
            {
              neptunePasses: 1,
              final: closureEval,
              convergence: singlePassConvergence,
              fixedPoint: fpPass1,
              convergenceProof: buildConvergenceProofSketch([closureEval], [fpPass1.residualDelta], 1),
              lyapunov,
              contractionProof,
              oscillationBound,
              executionUncertainty,
              disturbanceModel,
              stochasticLyapunov,
              bayesianCausal,
              probabilisticStability,
              probabilisticFixedPoint,
              ...p7Aug,
              ...p8Aug,
              ...p9Aug,
              ...p10Aug,
            },
            ecoIdentityPriorLedger,
          ),
        );
      }

      commitEcoWorldModelUpdate(state, eco);
      applyEcoIdentityDriftAlert(state, eco.digest.ecoClosure);
      commitEcoIdentityLedger(state, eco.digest.ecoClosure, state.policies?.ecoClosure);
      await this.persistEcoIdentityLedgerToStorage(state);
    }

    return repaired;
  }

  private getReadinessService(): ReadinessService | null {
    if (!this.readinessService) {
      try {
        this.readinessService = this.moduleRef.get(ReadinessService, { strict: false });
      } catch (error) {
        this.logger.warn('无法获取 ReadinessService，准备度检查功能将不可用');
        return null;
      }
    }
    return this.readinessService || null;
  }

  /**
   * 懒加载获取 ReadinessAgentService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getReadinessAgent(): ReadinessAgentService | null {
    if (!this.readinessAgent) {
      try {
        this.readinessAgent = this.moduleRef.get(ReadinessAgentService, { strict: false });
      } catch (error) {
        this.logger.warn('无法获取 ReadinessAgentService，准备度代理功能将不可用');
        return null;
      }
    }
    return this.readinessAgent || null;
  }

  /**
   * 生成初始计划
   */
  async generatePlan(
    state: TripWorldState,
    requestId?: string
  ): Promise<{
    plan: TripPlan;
    log: DecisionRunLog;
    readiness?: TravelReadinessResult;
    /** Phase 3：启用 `REALITY_ENFORCEMENT=1` 时返回 Snapshot-bound 上下文 */
    decisionContext?: DecisionContextV0;
  }> {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }

    applyEcoLedgerTripContext(state);

    await this.hydrateEcoIdentityLedgerFromStorage(state);

    // 创建观测 trace
    const traceRequestId = requestId || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (this.observabilityService) {
      this.observabilityService.createTrace(traceRequestId);
      
      // 记录初始 POI pool 大小
      const initialPoolSize = Object.values(state.candidatesByDate).reduce(
        (sum, candidates) => sum + candidates.length,
        0
      );
      this.observabilityService.recordPoiPoolSize(traceRequestId, initialPoolSize, 'initial');
    }

    /** Phase 3：同一 planning tick 内传播 bound DecisionContext（早期快照 + ALS） */
    const bindRealityAls =
      isRealityEnforcementEnabled() || isRealityReadBoundaryEnabled();
    if (bindRealityAls) {
      const earlySnap = buildShadowRealitySnapshotV0(state, { traceRequestId });
      const horizon = computePlanningHorizonFromTripContext(state.context);
      const earlyCtx = buildDecisionContextV0(earlySnap, horizon);
      this.logger.debug(
        `[RealityKernel][als_bind] snapshot_id=${earlyCtx.snapshot_id} validity=${earlyCtx.reality.validity.status}`,
      );
      return await runWithDecisionContextAsync(earlyCtx, () =>
        this.executeGeneratePlanTick(state, requestId, traceRequestId),
      );
    }

    return await this.executeGeneratePlanTick(state, requestId, traceRequestId);
  }

  /**
   * Reality Execution Gate — {@link ExecutionGate.resolve} is the only authority for ALLOW / DEGRADE / BLOCK.
   * Appends one causal row on BLOCK; otherwise leaves `_decisionCausalityDraft` for flush at plan return.
   */
  private applyRealityPlanningExecutionGate(
    state: TripWorldState,
    executionKind: 'planning_tick' | 'repair',
    traceRequestId: string,
  ): void {
    const causalityId = buildDecisionCausalityId();
    const startedAt = new Date().toISOString();
    const tickKind = executionKind === 'planning_tick' ? 'generate_plan' : 'repair_plan';

    const boundForValidity = getBoundDecisionContext();
    const planningPolicy = evaluatePlanningTick(boundForValidity);
    const execDecision = ExecutionGate.resolve({
      executionType: executionKind,
      decisionContext: boundForValidity,
      policyResult: planningPolicy,
    });
    if (boundForValidity) {
      state.signals.realityExecutionContract = {
        verdict: planningPolicy.verdict,
        snapshot_id: boundForValidity.snapshot_id,
        policy_codes: planningPolicy.codes,
        reasons: planningPolicy.reasons,
        evaluated_at: new Date().toISOString(),
        execution: planningPolicy.execution,
      };
    }
    appendRealityExecutionTrace(state, {
      kind: 'planning_policy',
      verdict: planningPolicy.verdict,
      snapshot_id: boundForValidity?.snapshot_id,
      codes: planningPolicy.codes,
      detail: JSON.stringify({
        policy: planningPolicy.verdict,
        gate: execDecision,
        causality_id: causalityId,
      }),
    });
    if (execDecision.type === 'BLOCK') {
      this.logger.warn(
        `[RealityKernel][ExecutionGate] BLOCK snapshot_id=${boundForValidity?.snapshot_id} gate=${execDecision.reason}`,
      );
      const blockedRec = buildBlockedAtGateCausalityRecordV1(
        {
          causality_id: causalityId,
          started_at: startedAt,
          tick_kind: tickKind,
          trace_request_id: traceRequestId,
          reality: {
            snapshot_id: boundForValidity?.snapshot_id,
            validity_status: boundForValidity?.reality.validity.status,
            region: boundForValidity?.reality.domain.region,
          },
          policy_engine: {
            verdict: planningPolicy.verdict,
            codes: planningPolicy.codes,
            reasons: planningPolicy.reasons,
          },
          execution_gate: execDecision,
        },
        state,
      );
      appendDecisionCausality(state, blockedRec);
      state.signals.lastDecisionCausalityId = blockedRec.causality_id;
      void this.emitCausalityToTravelEventStore(state, blockedRec, traceRequestId);
    }
    enforceExecutionDecision(execDecision, { snapshotId: boundForValidity?.snapshot_id });
    bindExecutionDecisionToContext(boundForValidity, execDecision);
    if (boundForValidity) {
      state.signals.realityExecutionMode =
        execDecision.type === 'DEGRADE' ? 'DEGRADED' : 'NORMAL';
      state.signals.realityDegradeStrategy =
        execDecision.type === 'DEGRADE' ? execDecision.strategy : undefined;
    }
    if (execDecision.type !== 'BLOCK') {
      state.signals._decisionCausalityDraft = {
        causality_id: causalityId,
        started_at: startedAt,
        tick_kind: tickKind,
        trace_request_id: traceRequestId,
        reality: {
          snapshot_id: boundForValidity?.snapshot_id,
          validity_status: boundForValidity?.reality.validity.status,
          region: boundForValidity?.reality.domain.region,
        },
        policy_engine: {
          verdict: planningPolicy.verdict,
          codes: planningPolicy.codes,
          reasons: planningPolicy.reasons,
        },
        execution_gate: execDecision,
      };
    }
    if (
      execDecision.type === 'DEGRADE' &&
      boundForValidity?.reality.validity.status === 'STALE'
    ) {
      const sid = boundForValidity.snapshot_id;
      const notes = boundForValidity.reality.validity.invalidation_reasons;
      this.logger.warn(
        `[RealityKernel][ExecutionGate] DEGRADED runtime snapshot_id=${sid}` +
          (notes?.length ? ` notes=${JSON.stringify(notes)}` : ''),
      );
      if (!state.signals.alerts) state.signals.alerts = [];
      state.signals.alerts.push({
        code: 'REALITY_SNAPSHOT_STALE',
        severity: 'warn',
        message: `Execution Gate: snapshot STALE (${sid}); strategy=${execDecision.type === 'DEGRADE' ? execDecision.strategy : 'unknown'}`,
      });
    }
  }

  /** Append Policy→Gate→Plan causal record and clear draft (single exit helper). */
  private flushDecisionCausalityChain(
    state: TripWorldState,
    outcome: {
      phase: 'completed' | 'constraint_rejected';
      log: DecisionRunLog;
      plan: TripPlan | null;
    },
  ): void {
    const draft = state.signals._decisionCausalityDraft;
    if (!draft) return;
    attachIcelandAssessmentToState(
      state,
      buildIcelandAssessmentFromTripState(state, outcome.plan),
    );
    const finalized = finalizeDecisionCausalityRecordV1(draft, outcome, state);
    appendDecisionCausality(state, finalized);
    state.signals.lastDecisionCausalityId = finalized.causality_id;
    state.signals.causalPersonaProjection =
      buildCausalPersonaProjection({
        worldState: state,
        icelandAssessment: state.signals.icelandSelfDriveCausalAssessment,
        causalityRecord: finalized,
      }) ?? undefined;
    delete state.signals._decisionCausalityDraft;
    void this.emitCausalityToTravelEventStore(
      state,
      finalized,
      draft.trace_request_id,
    );
  }

  /** Server-side causal session for Agent OPS / P5 join (no client state round-trip). */
  private captureCausalRuntimeSession(
    state: TripWorldState,
    meta?: { requestId?: string; traceRequestId?: string },
  ): void {
    this.causalRuntimeSession?.capture({
      state,
      requestId: meta?.requestId,
      traceRequestId: meta?.traceRequestId,
    });
  }

  /** Fail-open dual-write to Travel Event Store (DECISION segment). */
  private async emitCausalityToTravelEventStore(
    state: TripWorldState,
    record: import('../causal-runtime/decision-causality-v1.types').DecisionCausalityRecord,
    requestId?: string,
  ): Promise<void> {
    const tripId = state.context.tripId;
    if (!tripId || !this.causalTravelEventEmitter) return;
    await this.causalTravelEventEmitter.emitDecisionCausalityRecord({
      tripId,
      record,
      requestId,
    });
  }

  /**
   * P-OPS-2 + Phase-1 causality：persist prediction row then attach `ops_reality_snapshot_id` onto the
   * finalized chain row (same tick as `lastDecisionCausalityId`).
   */
  private async maybeRecordOpsAuditAndAttachCausality(
    state: TripWorldState,
    params: {
      traceRequestId: string;
      log: DecisionRunLog;
      finalPlan: TripPlan;
      weatherPipeline: WeatherEvidencePipelineResult | undefined;
    },
  ): Promise<void> {
    if (!this.opsRealityAudit) return;
    try {
      const snapshotId = await this.opsRealityAudit.recordPrediction({
        tripId: state.context.tripId,
        requestId: params.traceRequestId,
        decisionRunId: params.log.runId,
        frames: state.signals.executionOverlayFrames,
        weatherPipeline: params.weatherPipeline,
        plan: params.finalPlan,
      });
      const cid = state.signals.lastDecisionCausalityId?.trim();
      if (snapshotId && cid) {
        const ok = attachOutcomeToCausalityRecord(state, cid, {
          ops_reality_snapshot_id: snapshotId,
        });
        if (!ok) {
          this.logger.debug(
            `[P-OPS-2] causality attach skipped (no chain row for ${cid}); snapshot_id=${snapshotId}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `[P-OPS-2] recordPrediction / causality attach failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Planning tick body —可选由 `generatePlan` 在 ALS-bound DecisionContext 下调用。
   */
  private async executeGeneratePlanTick(
    state: TripWorldState,
    requestId: string | undefined,
    traceRequestId: string,
  ): Promise<{
    plan: TripPlan;
    log: DecisionRunLog;
    readiness?: TravelReadinessResult;
    decisionContext?: DecisionContextV0;
  }> {
    const planGenerateStartTime = Date.now();

    this.applyRealityPlanningExecutionGate(state, 'planning_tick', traceRequestId);

    // 可选：运行准备度检查（使用 Pack + 能力包 + 地理特征增强）
    const readinessService = this.getReadinessService();
    if (readinessService) {
      try {
        const context = readinessService.extractTripContext(state);
        
        // 获取起始位置坐标（用于地理特征增强）
        // 优先使用第一天的酒店位置，如果没有则尝试从候选活动中获取
        const startLocation = state.context.anchors?.hotelLocationsByDate?.[state.context.startDate] ||
          state.candidatesByDate[state.context.startDate]?.[0]?.location?.point;
        
        const readinessResult = await readinessService.checkFromDestination(
          state.context.destination,
          context,
          {
            enhanceWithGeo: !!startLocation, // 只有有坐标时才启用地理特征增强
            geoLat: startLocation?.lat,
            geoLng: startLocation?.lng,
          }
        );
        
        // 记录准备度检查结果
        if (readinessResult.summary.totalBlockers > 0) {
          this.logger.warn(
            `Readiness check found ${readinessResult.summary.totalBlockers} blockers for destination ${state.context.destination}`
          );
        }
        
        if (readinessResult.summary.totalMust > 0) {
          this.logger.log(
            `Readiness check found ${readinessResult.summary.totalMust} must items for destination ${state.context.destination}`
          );
        }
        
        // 将 Readiness Findings 转换为 Constraints，影响决策
        const readinessConstraints = await readinessService.getConstraints(readinessResult);
        
        // 将 readiness 约束信息存储到 state 中，供后续决策使用
        // 通过 state.signals.alerts 传递准备度信息
        if (!state.signals.alerts) {
          state.signals.alerts = [];
        }
        
        // 添加准备度相关的 alerts
        for (const constraint of readinessConstraints) {
          if (constraint.type === 'hard' && constraint.severity === 'error') {
            state.signals.alerts.push({
              code: constraint.id,
              severity: 'critical' as const,
              message: constraint.message,
            });
          } else if (constraint.severity === 'warning') {
            state.signals.alerts.push({
              code: constraint.id,
              severity: 'warn' as const,
              message: constraint.message,
            });
          }
        }
        
        // 存储 readiness 结果到 state 中，供后续约束检查使用
        // 注意：这里使用了一个临时字段，实际应该扩展 TripWorldState 接口
        (state as any).readinessResult = readinessResult;
      } catch (error) {
        this.logger.warn(`Readiness check failed: ${error}`);
        // 不阻断计划生成，只记录警告
      }
    }

    // Step 0: 读取用户画像并注入决策参数（如果可用）
    const userId = (state.context as any).userId;
    let decisionParams = null;
    if (userId) {
      try {
        decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);
        // 注入约束到 world model
        this.decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);
        this.logger.log(`Injected decision params for user ${userId}`);
      } catch (error) {
        this.logger.warn(`Failed to load/inject decision params: ${error}`);
      }
    }

    // Step 1: 选择路线方向（如果支持）
    let selectedRouteDirection: any = null;
    if (this.routeDirectionSelector) {
      try {
        const countryCode = this.extractCountryCode(state.context.destination);
        const month = this.extractMonth(state.context.startDate);
        const userIntent: UserIntent = {
          preferences: this.extractPreferences(state.context.preferences),
          pace: state.context.preferences.pace,
          riskTolerance: state.context.preferences.riskTolerance,
          durationDays: state.context.durationDays,
          userId: userId, // 传递 userId 以便 RouteDirectionSelectorService 使用
          tripId: state.context.tripId,
        };

        const recommendations = await this.routeDirectionSelector.pickRouteDirections(
          userIntent,
          countryCode,
          month,
          traceRequestId
        );

        // 保存 recommendations 到 state 中，供后续保存决策记忆使用
        (state as any).routeDirectionRecommendations = recommendations;

        if (recommendations.length > 0) {
          selectedRouteDirection = recommendations[0]; // 选择 Top 1
          this.logger.log(
            `选择了路线方向: ${selectedRouteDirection.routeDirection.name} (score: ${selectedRouteDirection.score})`
          );

          // 将约束注入到 world model
          if (selectedRouteDirection.constraints) {
            const constraintsInjectStartTime = Date.now();
            this.injectConstraints(state, selectedRouteDirection.constraints);
            if (this.observabilityService) {
              this.observabilityService.recordConstraintsInjectLatency(
                traceRequestId,
                Date.now() - constraintsInjectStartTime
              );
            }
          }

          // 生成合规检查清单（如果支持）
          if (this.compliancePlugin) {
            try {
              const complianceChecklist = this.compliancePlugin.generateChecklist(
                selectedRouteDirection,
                undefined, // itinerary draft 将在计划生成后更新
                selectedRouteDirection.routeDirection.regions,
                undefined, // poiTypes 可以从 state 中提取
                (state.context as any).complianceStatus // 用户合规状态
              );

              // 如果用户明确拒绝办理，且存在 hard 项，触发降级
              if (complianceChecklist.userActionRequired.hard.length > 0 && 
                  complianceChecklist.downgradeOptions) {
                this.logger.warn(
                  `用户拒绝办理合规项，触发降级：${complianceChecklist.downgradeOptions.reason}`
                );
                // 将降级选项存储到 state 中，供后续策略使用
                (state as any).complianceDowngrade = complianceChecklist.downgradeOptions;
              }

              // 将合规检查清单存储到 state 中
              (state as any).complianceChecklist = complianceChecklist;
            } catch (error) {
              this.logger.warn(`合规检查失败: ${error}`);
            }
          }

          // 生成交通模式检查清单（如果支持）
          if (this.transportPlugin) {
            try {
              const transportChecklist = this.transportPlugin.generateChecklist(
                selectedRouteDirection,
                undefined, // itinerary draft 将在计划生成后更新
                undefined, // availableModes 可以从外部系统获取
                (state.context as any).transportBookingStatus // 用户交通预订状态
              );

              // 如果有不可用的交通模式，触发 Neptune 修复
              if (transportChecklist.summary.unavailableModes && 
                  transportChecklist.summary.unavailableModes.length > 0) {
                this.logger.warn(
                  `交通模式不可用: ${transportChecklist.summary.unavailableModes.join(', ')}，将触发 Neptune 修复`
                );
                // 将交通修复动作存储到 state 中，供 Neptune 使用
                (state as any).transportNeptuneActions = transportChecklist.neptuneActions;
              }

              // 将交通检查清单存储到 state 中
              (state as any).transportChecklist = transportChecklist;
            } catch (error) {
              this.logger.warn(`交通模式检查失败: ${error}`);
            }
          }

          // P1.1.2: 对RouteDirection的corridor进行自动拆段分析
          let routeSegmentation = null;
          if (this.demRouteSegmentationService && selectedRouteDirection.routeDirection.corridorGeom) {
            try {
              const segmentationStartTime = Date.now();
              routeSegmentation = await this.demRouteSegmentationService.segmentRoute(
                selectedRouteDirection.routeDirection.corridorGeom,
                {
                  samplingInterval: 100, // 每100米采样一次
                  steepSlopeThreshold: 15, // 坡度>15%为过陡段
                  steepSectionMinLength: 500, // 过陡段最小长度500米
                  energyBreakpointThreshold: 70, // 体力消耗>70为断点
                  highAltitudeThreshold: 3000, // 高海拔阈值3000米
                  consecutiveAscentThreshold: 1200, // 连续上升>1200米触发休息
                  baseCostPerKm: 5,
                  ascentFactor: 0.1,
                }
              );
              
              const segmentationLatency = Date.now() - segmentationStartTime;
              this.logger.log(
                `路线拆段分析完成: ${routeSegmentation.steepSections.length}个过陡段, ` +
                `${routeSegmentation.energyBreakpoints.length}个体力断点, ` +
                `${routeSegmentation.mandatoryRestPoints.length}个强制休息点 ` +
                `(耗时: ${segmentationLatency}ms)`
              );

              // 将拆段结果存储到state中，供后续决策使用
              (state as any).routeSegmentation = routeSegmentation;
            } catch (error) {
              this.logger.warn(`路线拆段分析失败: ${error}`);
              // 不阻断计划生成，继续执行
            }
          }

          // 根据路线方向生成候选 POI
          if (this.routeDirectionPoiGenerator) {
            const poiPoolQueryStartTime = Date.now();
            const routePois = await this.routeDirectionPoiGenerator.generateCandidatePois(
              selectedRouteDirection,
              selectedRouteDirection.routeDirection.regions
            );
            
            if (this.observabilityService) {
              this.observabilityService.recordPoiPoolQueryLatency(
                traceRequestId,
                Date.now() - poiPoolQueryStartTime
              );
              
              // 记录 POI pool 过滤
              const afterRdFilterSize = Object.values(state.candidatesByDate).reduce(
                (sum, candidates) => sum + candidates.length,
                0
              );
              this.observabilityService.recordPoiPoolSize(traceRequestId, afterRdFilterSize, 'afterRdFilter');
            }

            // 将路线方向的 POI 添加到候选池
            this.mergeCandidatePois(state, routePois);
            enrichTripWorldStateInventoryPlaceholders(state);

            if (this.observabilityService) {
              const afterMergeSize = Object.values(state.candidatesByDate).reduce(
                (sum, candidates) => sum + candidates.length,
                0
              );
              this.observabilityService.recordPoiPoolSize(traceRequestId, afterMergeSize, 'afterConstraints');
            }

            if (this.trailPlanningAdapter && selectedRouteDirection?.routeDirection) {
              try {
                await attachHardTrekTrailPlanToState(
                  state,
                  selectedRouteDirection.routeDirection,
                  this.trailPlanningAdapter,
                );
              } catch (trailErr) {
                this.logger.warn(`Hard trek trail plan attach skipped: ${trailErr}`);
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Route direction selection failed: ${error}`);
        // 不阻断计划生成，继续使用原有候选池
      }
    }

    // 可选：获取 POI Features（用于决策优化）
    // let poiFeatures: PoiFeatures | null = null;
    // if (this.poiFeaturesAdapter) {
    //   try {
    //     poiFeatures = await this.poiFeaturesAdapter.getPoiFeatures({
    //       destination: state.context.destination,
    //     });
    //     if (poiFeatures) {
    //       this.logger.log(`Loaded POI Features for destination: ${state.context.destination}`);
    //     }
    //   } catch (error) {
    //     this.logger.warn(`Failed to load POI Features: ${error}`);
    //     // 不阻断计划生成，只记录警告
    //   }
    // }

    const now = new Date().toISOString();
    
    // 根据 pace 调整日程时间窗口和缓冲时间
    const pace = state.context.preferences.pace || 'moderate';
    const paceMultiplier = this.getPaceMultiplier(pace);
    
    // relaxed: 更晚开始，更早结束，更多缓冲
    // intense: 更早开始，更晚结束，更少缓冲
    const dayStart = pace === 'relaxed' 
      ? '09:00' 
      : pace === 'intense'
        ? '07:00'
        : (state.policies?.dayStart ?? '08:30');
    const dayEnd = pace === 'relaxed'
      ? '19:00'
      : pace === 'intense'
        ? '22:00'
        : (state.policies?.dayEnd ?? '20:30');
    const buffer = Math.round((state.policies?.bufferMinBetweenActivities ?? 10) * paceMultiplier.buffer);

    const days: TripPlan['days'] = [];
    const dailyEnergyBudgets: Array<{ day: number; budget: DailyEnergyBudget }> = [];

    for (let i = 0; i < state.context.durationDays; i++) {
      const date = addDays(state.context.startDate, i);
      const pool = state.candidatesByDate[date] || [];

      // Abu: choose what to keep under daily limits (rough by pace)
      // 根据 pace 和策略配置调整每日活动时间限制
      void getPolicyProfile(pace); // 预留：策略画像微调 Abu 时间预算
      
      // 基础时间限制
      let maxActiveMin =
        pace === 'relaxed'
          ? 240
          : pace === 'intense'
            ? 420
            : 330;
      
      // 根据策略配置微调（考虑 abuConfig 的影响）
      // relaxed 时更保守，intense 时更激进
      if (pace === 'relaxed') {
        maxActiveMin = Math.round(maxActiveMin * 0.9); // 再降低 10%
      } else if (pace === 'intense') {
        maxActiveMin = Math.round(maxActiveMin * 1.1); // 再提高 10%
      }

      // 如果存在合规降级选项，调整候选池（降级为城市/轻线）
      let adjustedPool = pool;
      if ((state as any).complianceDowngrade) {
        // 过滤掉需要许可/向导的 POI，只保留城市/轻线 POI
        adjustedPool = this.filterPoolForComplianceDowngrade(pool);
        this.logger.log(`合规降级：从 ${pool.length} 个候选 POI 过滤到 ${adjustedPool.length} 个`);
      }

      // 应用决策参数的策略偏好（如果可用）
      // 注意：当前 Abu/Dr.Dre/Neptune 是固定顺序执行的
      // 策略权重主要用于未来扩展（如动态选择策略）
      // 当前实现中，策略权重影响的是约束和修复策略的选择
      
      // PART 2: 在 Abu 选择前，检查是否有需要避免的 HARD violation
      // 如果有前一天的 demEvidence，检查是否可以忽略 violation
      if (this.demEvidenceEnforcer && i > 0 && (state as any).previousDayDemEvidence) {
        const prevDayEvidence = (state as any).previousDayDemEvidence as DemDecisionEvidence[];
        for (const evidence of prevDayEvidence) {
          if (evidence.violation === 'HARD') {
            const canIgnore = this.demEvidenceEnforcer.canAbuIgnoreViolation(
              evidence.segmentId,
              { segmentEvidences: prevDayEvidence } as DemEvidencePipelineResult
            );
            if (!canIgnore.allowed) {
              this.logger.warn(
                `Abu 不能忽略前一天的 HARD violation (${evidence.segmentId}): ${canIgnore.reason}，今天将更保守地选择活动`
              );
              // 调整 limits，使 Abu 更保守
              maxActiveMin = Math.round(maxActiveMin * 0.9); // 减少10%的时间预算
            }
          }
        }
      }

      const abu = abuSelectCoreActivities(state, date, adjustedPool, {
        maxActiveMin,
        maxCost: state.context.budget?.amount,
      });

      // DrDre: schedule them into a day timeline
      const hotelPoint =
        state.context.anchors?.hotelLocationsByDate?.[date] ||
        (this.tools.getHotelPointForDate
          ? await this.tools.getHotelPointForDate(date)
          : undefined);

      // P1.1.3: 计算风险权重（用于Dr.Dre优先级调整）
      const riskWeights = new Map<string, number>();
      let previousElevation: number | undefined;
      
      if (this.demRiskScoringService && i > 0) {
        // 获取前一天的最后一个活动的海拔（用于计算连续上升风险）
        const prevDay = days[i - 1];
        if (prevDay.timeSlots.length > 0) {
          const lastSlot = prevDay.timeSlots[prevDay.timeSlots.length - 1];
          if (lastSlot.coordinates && this.demRiskScoringService) {
            // 通过DEMRiskScoringService内部的DEMElevationService获取海拔
            // 这里简化处理，直接使用前一天的terrainFacts中的maxElevation
            previousElevation = prevDay.terrainFacts?.maxElevation;
          }
        }
      }

      // 为每个候选活动计算风险权重
      if (this.demRiskScoringService) {
        for (const activity of abu.kept) {
          try {
            const riskWeight = await this.demRiskScoringService.getRiskWeightForDrDre(
              activity,
              previousElevation
            );
            riskWeights.set(activity.id, riskWeight);
          } catch (error) {
            this.logger.warn(`计算活动 ${activity.id} 风险权重失败: ${error}`);
          }
        }
      }

      const slots = await drdreBuildDaySchedule(
        state,
        {
          date,
          startTime: dayStart,
          endTime: dayEnd,
          bufferMin: buffer,
          startPoint: hotelPoint,
          riskWeights,
          previousElevation,
        },
        abu.kept,
        this.tools.getTravelLeg
      );

      // 计算简化的 terrainFacts（从 RouteDirection 约束或候选 POI 中提取）
      // P1.1.2: 利用拆段结果增强terrainFacts
      const terrainFacts = this.computeDayTerrainFacts(
        selectedRouteDirection,
        abu.kept,
        slots,
        (state as any).routeSegmentation
      );

      // DEM驱动的每日体力预算计算（如果启用）
      let dailyEnergyBudget = undefined;
      if (this.demDailyEnergyService && slots.length > 0) {
        try {
          const dayPlan: PlanDay = {
            day: i + 1,
            date,
            timeSlots: slots,
            terrainFacts,
          };
          dailyEnergyBudget = await this.demDailyEnergyService.calculateDynamicDailyBudget(
            dayPlan,
            selectedRouteDirection?.routeDirection,
            pace
          );

          // 如果体力预算超限，记录警告
          if (dailyEnergyBudget.totalEnergyCost > dailyEnergyBudget.maxEnergyCost) {
            this.logger.warn(
              `Day ${i + 1} 体力预算超限: 消耗 ${dailyEnergyBudget.totalEnergyCost.toFixed(1)}, 预算 ${dailyEnergyBudget.maxEnergyCost}`
            );
          }

          // 将体力预算信息添加到terrainFacts
          if (terrainFacts) {
            terrainFacts.effortLevel = this.inferEffortLevel(dailyEnergyBudget);
          }

          // 保存每日体力预算，用于证据链生成
          dailyEnergyBudgets.push({ day: i + 1, budget: dailyEnergyBudget });
        } catch (error) {
          this.logger.warn(`Day ${i + 1} DEM体力预算计算失败: ${error}`);
        }
      }

      days.push({ 
        day: i + 1, 
        date, 
        timeSlots: slots,
        terrainFacts,
      });
    }

    const plan: TripPlan = {
      version: 'planner-0.1',
      createdAt: now,
      days,
    };

    // Dry-run: 在输出前模拟执行，找出可能失败的点
    let dryRunResult: any = null;
    if (this.dryRunPlanner) {
      try {
        dryRunResult = await this.dryRunPlanner.simulatePlan(state, plan, decisionParams || undefined);
        
        if (dryRunResult.willFail) {
          this.logger.warn(
            `Dry-run detected potential failure on day ${dryRunResult.failureDay}: ${dryRunResult.failureReason}`
          );
          
          // 生成调整建议
          const suggestions = this.dryRunPlanner.generateAdjustmentSuggestions(dryRunResult);
          this.logger.warn(`Dry-run suggestions: ${suggestions.join('; ')}`);
          
          // 如果失败风险高，可以考虑自动调整或警告用户
          // 这里暂时只记录，不自动调整（避免过度干预）
        } else {
          this.logger.debug(`Dry-run passed: no critical issues detected`);
        }
      } catch (error) {
        this.logger.warn(`Dry-run simulation failed: ${error}`);
      }
    }

    // P1.1.4: 生成路线规划的证据链
    let planRiskScore: PlanRiskScore | undefined;
    if (this.demRiskScoringService) {
      try {
        planRiskScore = await this.demRiskScoringService.calculatePlanRiskScore(
          plan,
          (state as any).routeSegmentation
        );
      } catch (error) {
        this.logger.warn(`计算计划风险评分失败: ${error}`);
      }
    }

    let evidenceChain: any;
    if (this.demEvidenceChainService) {
      try {
        evidenceChain = this.demEvidenceChainService.generateEvidenceChain(
          plan,
          (state as any).routeSegmentation,
          planRiskScore,
          dailyEnergyBudgets,
          selectedRouteDirection
        );
        this.logger.log(`生成了路线规划证据链：${evidenceChain.dailyEvidences.length}天的证据`);
      } catch (error) {
        this.logger.warn(`生成证据链失败: ${error}`);
      }
    }

    // PART 2: DEM Decision Evidence Pipeline（强制检查）
    let demEvidenceResult: DemEvidencePipelineResult | undefined;
    
    // 优先使用新的 DemDecisionEvidenceService（如果可用）
    if (this.demDecisionEvidenceService) {
      try {
        const routeSegmentation = (state as any).routeSegmentation;
        const routeDirectionData = selectedRouteDirection?.routeDirection;
        
        demEvidenceResult = await this.demDecisionEvidenceService.generateEvidencePipeline(
          plan,
          routeDirectionData,
          routeSegmentation
        );

        this.logger.log(
          `DEM决策证据生成完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
          `HARD违规: ${demEvidenceResult.hasHardViolation}, ` +
          `SOFT违规: ${demEvidenceResult.hasSoftViolation}, ` +
          `可通过: ${demEvidenceResult.canProceed}`
        );

        // 强制检查：没有 DEM evidence 的 plan 不允许 finalize
        const validation = this.demDecisionEvidenceService.validatePlanHasEvidence(
          plan,
          demEvidenceResult.segmentEvidences
        );
        
        if (!validation.valid) {
          this.logger.warn(`计划验证失败: ${validation.reason}`);
          // 记录到 log，但不阻断返回（让调用方决定如何处理）
        }

        // 如果有硬约束违反，记录警告
        if (demEvidenceResult.hasHardViolation) {
          this.logger.error(
            `计划存在硬约束违反，不能 finalize。失败原因: ${demEvidenceResult.explainableFailure?.reason || '未知'}`
          );
        }

        // 如果有连续疲劳，记录建议并应用 Dr.Dre 修复
        if (demEvidenceResult.rollingFatigue?.detected) {
          this.logger.warn(
            `检测到连续疲劳：${demEvidenceResult.rollingFatigue.explanation}，建议：${demEvidenceResult.rollingFatigue.suggestedAction}`
          );

          // PART 2: Dr.Dre 策略集成 - 根据连续疲劳检测结果插入休息日
          if (demEvidenceResult.rollingFatigue.suggestedAction === 'INSERT_REST_DAY') {
            const restDay = demEvidenceResult.rollingFatigue.startDay! + 1; // 在疲劳开始后插入
            if (restDay <= plan.days.length) {
              this.logger.log(`Dr.Dre 自动插入休息日：第 ${restDay} 天`);
              
              // 将指定天的活动替换为休息日
              const dayToRest = plan.days[restDay - 1];
              if (dayToRest && dayToRest.timeSlots.length > 0) {
                // 保留第一个和最后一个 slot（通常是酒店），中间替换为休息
                const firstSlot = dayToRest.timeSlots[0];
                const lastSlot = dayToRest.timeSlots[dayToRest.timeSlots.length - 1];
                
                const restSlot: PlanSlot = {
                  id: `rest_${dayToRest.date}_${restDay}`,
                  time: firstSlot.time,
                  endTime: lastSlot.endTime || lastSlot.time,
                  title: '休息日 / 自由活动',
                  type: 'rest',
                  reasons: [
                    `Dr.Dre 自动插入：检测到连续疲劳（第 ${demEvidenceResult.rollingFatigue.startDay}-${demEvidenceResult.rollingFatigue.endDay} 天累计爬升 ${demEvidenceResult.rollingFatigue.rollingAscent3Days.toFixed(0)}m）`,
                  ],
                };

                dayToRest.timeSlots = [firstSlot, restSlot, lastSlot];
                this.logger.log(`已将第 ${restDay} 天的活动替换为休息日`);
              }
            }
          }
        }

        // 如果有走廊质量评分，记录
        if (demEvidenceResult.corridorQuality) {
          this.logger.log(
            `走廊质量评分: ${demEvidenceResult.corridorQuality.totalScore.toFixed(1)}/100 ` +
            `(${demEvidenceResult.corridorQuality.explanation})`
          );
        }
      } catch (error) {
        this.logger.error(`DEM决策证据生成失败: ${error}`);
        // 不阻断计划生成，但记录错误
      }
    } else if (this.demEvidencePipeline) {
      // 回退到旧的 pipeline service
      try {
        // 从 decisionParams 提取用户约束
        const userConstraints = decisionParams ? {
          maxDailyAscentM: decisionParams.constraints.maxDailyAscentM,
          maxElevationM: decisionParams.constraints.maxElevationM,
          maxSlopePct: decisionParams.constraints.maxSlopePct,
          rollingAscent3DaysThreshold: 2000, // 默认 2000m，可以从 user profile 获取
        } : undefined;

        demEvidenceResult = await this.demEvidencePipeline.generateEvidenceForPlan(
          plan,
          userConstraints
        );

        this.logger.log(
          `DEM证据管道完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
          `HARD违规: ${demEvidenceResult.hasHardViolation}, ` +
          `SOFT违规: ${demEvidenceResult.hasSoftViolation}`
        );

        // 强制检查：不能 finalize 有 HARD violation 的计划
        if (this.demEvidenceEnforcer) {
          const canFinalize = this.demEvidenceEnforcer.canFinalizePlan(demEvidenceResult);
          if (!canFinalize.allowed) {
            this.logger.warn(`计划不能 finalize: ${canFinalize.reason}`);
            // 记录到 log，但不阻断返回（让调用方决定如何处理）
          }

          // 如果有连续疲劳，记录建议
          if (demEvidenceResult.rollingFatigue?.detected) {
            this.logger.warn(
              `检测到连续疲劳：${demEvidenceResult.rollingFatigue.explanation}`
            );
          }
        }
      } catch (error) {
        this.logger.error(`DEM证据管道失败: ${error}`);
        // 不阻断计划生成，但记录错误
      }
    }

    /** 实况观测镜像（可选持久化）；决策/准备度天气语义以 signals.executionSemanticView 为准 */
    let weatherEvidenceForWorld: WeatherObservationEvidence[] | undefined;
    let weatherPipelineSnapshot: WeatherEvidencePipelineResult | undefined;
    if (this.weatherDecisionEvidence) {
      try {
        const weatherCtx = this.buildWeatherEvidenceContext(state, plan);
        const weatherPipeline = await this.weatherDecisionEvidence.generateEvidencePipeline(
          plan,
          undefined,
          weatherCtx,
        );
        weatherPipelineSnapshot = weatherPipeline;
        weatherEvidenceForWorld = weatherPipeline.segmentEvidences.map(e => ({
          segmentId: e.segmentId,
          date: e.date,
          windSpeedMs: e.windSpeed,
          windGustMs: e.metadata?.windGustMs,
          windDirectionDeg: e.windDirection,
          visibilityM:
            e.visibility !== undefined ? Math.round(e.visibility * 1000) : undefined,
          precipitationMm: e.precipitation,
          violation: e.violation,
          crosswindRisk: e.crosswindRisk,
          explanation: e.explanation,
          metadata: {
            ...e.metadata,
            suggestedAction: e.suggestedAction,
            hazards: e.hazards,
            executionState: e.executionState,
            executionQuality: e.executionQuality,
            weatherPipelineSummary: {
              canProceed: weatherPipeline.canProceed,
              hasHardViolation: weatherPipeline.hasHardViolation,
              hasSoftViolation: weatherPipeline.hasSoftViolation,
            },
          },
        }));
        if (weatherPipeline.hasHardViolation) {
          this.promMetrics?.recordOpsWeatherEvidenceHard(weatherPipeline.explainableFailure?.reason);
          this.logger.warn(
            `天气证据 HARD: ${weatherPipeline.explainableFailure?.reason ?? 'weather risk'}`,
          );
        }
      } catch (err: unknown) {
        this.promMetrics?.recordOpsWeatherEvidencePipelineException();
        this.logger.warn(
          `天气证据管道异常: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.applyOperationalGovernanceAfterWeather(state, weatherPipelineSnapshot);

    /** P4-A++：走廊物理投影 overlay（不替换 TravelLeg）；drift 并入同一 temporal 流水线 */
    this.attachRouteExecutionOverlaysToPlan(plan, state);
    const routePhysicsDrifts = this.collectRoutePhysicsDriftsFromPlan(plan);

    // P2：executionQuality → plan.metrics；逐日 overlay → PlanDay；摘要 → signals（时空传播上游）
    if (weatherPipelineSnapshot?.segmentEvidences?.length) {
      const wxMetrics = this.aggregateWeatherExecutionMetrics(
        weatherPipelineSnapshot.segmentEvidences,
      );
      plan.metrics = { ...plan.metrics, ...wxMetrics };
      const baseTravel = plan.metrics?.estTravelMinutes;
      if (
        typeof baseTravel === 'number' &&
        baseTravel > 0 &&
        (wxMetrics.weatherDelayFactorMax ?? 1) > 1
      ) {
        plan.metrics!.estTravelMinutesWeatherAdjusted = Math.round(
          baseTravel * (wxMetrics.weatherDelayFactorMax ?? 1),
        );
      }
      this.applyWeatherExecutionToPlanDays(plan, weatherPipelineSnapshot.segmentEvidences);
      const temporalOutcome = applyWeatherDriveDelayAndEmitDrifts(plan);
      plan.temporal = {
        timeDrifts: [...temporalOutcome.drifts, ...routePhysicsDrifts],
        constraintEdges: temporalOutcome.constraintEdges,
        emittedAt: new Date().toISOString(),
      };
      const sequencePropagation = propagateSequenceDriftsToDownstreamSlots(plan);
      plan.temporal.downstreamShiftedSlotIds = sequencePropagation.shiftedSlotIds;

      const crossDayDrifts = emitCrossDayHandoffDrifts(plan);
      plan.temporal.timeDrifts = [...plan.temporal.timeDrifts, ...crossDayDrifts];
      plan.temporal.constraintEdges = [
        ...plan.temporal.constraintEdges,
        ...buildCrossDayHandoffEdges(plan),
      ];
      const crossDayPropagation = propagateCrossDayDriftsToNextDaySlots(plan);
      plan.temporal.crossDayShiftedSlotIds = crossDayPropagation.shiftedSlotIds;

      applyAccumulatedGlobalSlackToPlanDays(plan);
      const operationalDayWindow = applyOperationalDayWindowFeasibility(plan, {
        dayStart: state.policies?.dayStart,
        dayEnd: state.policies?.dayEnd,
      });
      const daylightAnchor = this.resolveDaylightAnchorFromWeatherEvidences(
        weatherPipelineSnapshot.segmentEvidences,
      );
      const daylightUtcOffset =
        typeof state.policies?.daylightUtcOffsetMinutes === 'number'
          ? state.policies.daylightUtcOffsetMinutes
          : 0;
      const daylightFeasibility = daylightAnchor
        ? applyDaylightFeasibilityHints(plan, {
            latitudeDeg: daylightAnchor.lat,
            longitudeDeg: daylightAnchor.lng,
            utcOffsetMinutes: daylightUtcOffset,
          })
        : undefined;
      this.applyTemporalPhysicsSignals(
        state,
        plan,
        daylightAnchor,
        daylightUtcOffset,
      );
      plan.temporal.unifiedConstraintGraph = buildUnifiedConstraintGraph(plan, {
        hotelCheckinLatest: state.policies?.microRepair?.hotelCheckinLatest,
      });
      await this.hydrateAuroraNightSignals(
        state,
        plan,
        weatherPipelineSnapshot.segmentEvidences,
      );
      this.mergeWeatherDecisionEvidenceIntoSignals(
        state,
        weatherPipelineSnapshot.segmentEvidences,
        plan,
      );

      this.hydrateFuelReachability(state, plan);

      const overlayFramesPass1 = augmentOverlayFramesWithPedestrianGaps(
        plan,
        buildExecutionOverlay({
          plan,
          weatherByDate: state.signals.weatherByDate,
          timeDrifts: plan.temporal?.timeDrifts,
          crossDayShiftedSlotIds: plan.temporal?.crossDayShiftedSlotIds,
          legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
          fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
          worldConstraintSnapshot: this.worldConstraintSnapshotFromSignals(state),
        }),
        { persistSyntheticTravelLegsOnPlan: true },
      );

      this.attachRouteExecutionOverlaysToPlan(plan, state);

      assertOverlayOnly(plan, overlayFramesPass1, state.policies, 'TripDecisionEngine.weatherFusion');

      let physicsIndexForRepair:
        | import('../physics/unified-physics-field-index.types').PhysicsFieldIndex
        | undefined;
      let framesForRepairPipeline = overlayFramesPass1;

      if (overlayFramesPass1.length > 0) {
        const legDatesPre = buildLegDateIndexFromPlan(plan);
        const physicsRowsPrePass = buildUnifiedPhysicsField({
          executionOverlayFrames: overlayFramesPass1,
          legDateByLegId: legDatesPre,
        });
        physicsIndexForRepair = buildPhysicsFieldIndex(physicsRowsPrePass);
        framesForRepairPipeline = applyPhysicsAuthorityToOverlayFrames(
          overlayFramesPass1,
          physicsIndexForRepair,
        );
      }

      if (framesForRepairPipeline.length > 0) {
        state.signals.overnightRestructuringPressures = deriveOvernightFromOverlay(
          plan,
          framesForRepairPipeline,
        );
      } else {
        this.applyOvernightRestructuringPressureSignals(state, plan, operationalDayWindow);
      }

      const dagForRepairEvaluator =
        framesForRepairPipeline.length > 0
          ? buildExecutionTruthDAG({ plan, overlayFrames: framesForRepairPipeline })
          : undefined;

      const executionIRPass1 = dagForRepairEvaluator
        ? compileDAGToIR(dagForRepairEvaluator)
        : undefined;

      /** P8-3：IR 为唯一执行真相时，禁止 repair 层消费 daylight / night 信号并行路径。 */
      const useIrExecutionTruth = Boolean(executionIRPass1 && dagForRepairEvaluator);

      const repairEvaluation = evaluateMinimalRepairs({
        plan,
        timeDrifts: plan.temporal.timeDrifts,
        unifiedConstraintGraph: plan.temporal.unifiedConstraintGraph,
        daylightFeasibility: useIrExecutionTruth ? undefined : daylightFeasibility,
        nightObservationFeasibility: useIrExecutionTruth
          ? undefined
          : state.signals.nightObservationFeasibility,
        opportunityMigrationEvaluations: state.signals.opportunityMigrationEvaluations,
        overnightRestructuringPressures: state.signals.overnightRestructuringPressures,
        legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
        policies: state.policies,
        executionOverlayFrames: framesForRepairPipeline,
        executionTruthDAG: dagForRepairEvaluator,
        executionIR: executionIRPass1,
        fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
        physicsFieldIndex: physicsIndexForRepair,
      });

      state.signals.executionOverlayFrames = stampOverlayAnnotationsFromSignals(
        plan,
        state,
        mergeRepairHintsIntoFrames(framesForRepairPipeline, repairEvaluation.repairs),
      );

      const stampedFrames = state.signals.executionOverlayFrames ?? [];
      if (stampedFrames.length === 0) {
        delete state.signals.unifiedPhysicsFieldByLegId;
        delete state.signals.physicsFieldIndex;
      } else {
        const legDates = buildLegDateIndexFromPlan(plan);
        const physicsRows = buildUnifiedPhysicsField({
          executionOverlayFrames: stampedFrames,
          legDateByLegId: legDates,
        });
        const physicsIndex = buildPhysicsFieldIndex(physicsRows);
        state.signals.physicsFieldIndex = physicsIndex;
        state.signals.unifiedPhysicsFieldByLegId = physicsIndex.byLegId;
        state.signals.executionOverlayFrames = applyPhysicsAuthorityToOverlayFrames(
          stampedFrames,
          physicsIndex,
        );
        if (
          typeof process !== 'undefined' &&
          process.env?.TRIP_PHYSICS_OVERLAY_CONSISTENCY === '1'
        ) {
          assertOverlayFieldConsistency(
            state.signals.executionOverlayFrames,
            physicsRows,
            'TripDecisionEngine.weatherFusion.physicsConsistency',
          );
        }
      }

      state.signals.executionTruthDAG = buildExecutionTruthDAG({
        plan,
        overlayFrames: state.signals.executionOverlayFrames,
        temporalWindowsBySlot: state.signals.temporalExecutionWindowsBySlotId,
        repairs: repairEvaluation.repairs,
      });
      if (planHasInboundTravelLeg(plan)) {
        assertOnlyDAGIsDecisionSource(
          state.signals.executionTruthDAG,
          state.policies,
          'TripDecisionEngine.weatherFusion',
        );
      }
      state.signals.executionIR = compileDAGToIR(state.signals.executionTruthDAG);
      assertIRCreatedOnlyByCompiler(state.signals.executionIR, 'TripDecisionEngine.weatherFusion');
      state.signals.operationalDayWindow = operationalDayWindow;
      if (daylightFeasibility) {
        state.signals.daylightFeasibility = daylightFeasibility;
      } else {
        delete state.signals.daylightFeasibility;
      }
      if (
        repairEvaluation.repairs.length > 0 ||
        (repairEvaluation.overnightRestructuringProposals?.length ?? 0) > 0
      ) {
        state.signals.repairEvaluation = repairEvaluation;
      } else {
        delete state.signals.repairEvaluation;
      }
    } else {
      delete state.signals.executionOverlayFrames;
      delete state.signals.executionTruthDAG;
      delete state.signals.executionIR;
      delete state.signals.overnightRestructuringPressures;
    }

    /** Layer A：事件归约（全量重建 + lineage；增量事件后续在同 reducer 扩展） */
    state.signals.executionSemanticView = reduceSemanticRuntimeView(
      state.signals.executionSemanticView,
      [
        {
          kind: 'ENGINE_FULL_REBUILD',
          id: `engine_pass_${plan.temporal?.emittedAt ?? Date.now()}`,
          at: new Date().toISOString(),
          payload: {
            weatherByDate: state.signals.weatherByDate ?? {},
            auroraOpportunityByDate: state.signals.auroraOpportunityByDate ?? {},
            temporalPropagationSummary: state.signals.temporalPropagation,
            alerts: state.signals.alerts,
            planDates: plan.days.map(d => d.date),
            /** 因果链：保留上一轮世界 SSOT 挂载，避免全量重建丢 world */
            ...(state.signals.executionSemanticView?.world !== undefined
              ? { worldOverlay: state.signals.executionSemanticView.world }
              : {}),
          },
        },
      ],
    );

    this.mergeWorldOverlayIntoExecutionOverlayIfPresent(plan, state);

    // PART 3: 集成三人格策略（Abu → Dr.Dre → Neptune）
    let strategyLogs: DecisionLogEntry[] = [];
    let finalPlan = plan;
    let routeDirectionExplanation: string | undefined;
    let cgusDsoSnapshot: any | undefined;
    let cgusDsoSnapshotNote: string | undefined;

    if (this.strategyOrchestrator && this.planConverter && selectedRouteDirection) {
      try {
        // 1. 从用户偏好提取决策参数
        // 将 intents (Record<string, number>) 转换为 preferences (string[])
        const intentKeys = state.context.preferences.intents 
          ? Object.keys(state.context.preferences.intents).filter(k => (state.context.preferences.intents[k] || 0) > 0.3)
          : [];
        const personaKeywords = extractPersonaKeywordsFromPreferences({
          pace: state.context.preferences.pace,
          preferences: intentKeys, // 转换为 string[]
          riskTolerance: state.context.preferences.riskTolerance,
        });
        void mapUserPersonaToDecisionParams(personaKeywords); // 预留：注入 orchestrator / 约束

        // 2. 构建 WorldModelContext
        const countryCode = this.extractCountryCode(state.context.destination);
        const month = this.extractMonth(state.context.startDate);

        // 转换 DEM 证据（使用正确的字段名）
        const demEvidence: any[] = [];
        if (demEvidenceResult?.segmentEvidences) {
          for (const evidence of demEvidenceResult.segmentEvidences) {
            demEvidence.push({
              segmentId: evidence.segmentId,
              elevationProfile: evidence.elevationProfile || [],
              cumulativeAscent: evidence.cumulativeAscent || 0, // 使用 cumulativeAscent
              maxSlopePct: evidence.maxSlopePct || 0,
              rollingAscent3Days: evidence.rollingAscent3Days || 0, // 使用 rollingAscent3Days
              fatigueIndex: evidence.fatigueIndex || 0, // 使用 fatigueIndex
              violation: evidence.violation || 'NONE',
              explanation: evidence.explanation || '', // 使用 explanation
              metadata: evidence.metadata || {},
            });
          }
        }

        // 转换合规证据
        const complianceEvidence: any[] = [];
        if (selectedRouteDirection.constraints?.hard) {
          complianceEvidence.push({
            requiresPermit: selectedRouteDirection.constraints.hard.requiresPermit || false,
            requiresGuide: selectedRouteDirection.constraints.hard.requiresGuide || false,
            valid: true, // 假设已通过 RouteDirection 选择
            violation: 'NONE',
          });
        }

        // 构建三段式 WorldModelContext
        // 1. PhysicalRealityModel
        const physical = {
          demEvidence,
          roadStates: [], // TODO: 从实际数据获取
          hazardZones: [], // TODO: 从实际数据获取
          ferryStates: [], // TODO: 从实际数据获取
          weatherEvidence: weatherEvidenceForWorld,
          daylightFeasibilitySignal: state.signals.daylightFeasibility,
          countryCode,
          month,
        };

        // 2. HumanCapabilityModel
        const human = createHumanCapabilityModelFromProfile(
          `user_${(state.context as any).userId || 'anonymous'}`,
          {
            pace: state.context.preferences.pace === 'relaxed' ? 'slow' : 
                  state.context.preferences.pace === 'intense' ? 'fast' : 'normal',
            fitness: 'medium', // TODO: 从用户画像获取
            riskTolerance: state.context.preferences.riskTolerance === 'low' ? 'low' :
                          state.context.preferences.riskTolerance === 'high' ? 'high' : 'medium',
          }
        );

        // 3. RouteDirectionWithPhilosophy
        const routeDirection = {
          ...selectedRouteDirection.routeDirection,
        };

        const worldContext: WorldModelContext = {
          physical,
          human,
          routeDirection,
          complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
          executionSemanticView: state.signals.executionSemanticView,
        };

        // 3. 转换为 RoutePlanDraft
        const tripId = state.context.tripId || `trip_${Date.now()}`;
        const routeDirectionId = selectedRouteDirection.routeDirection.uuid || 
          String(selectedRouteDirection.routeDirection.id);
        const routePlanDraft = this.planConverter.convertTripPlanToRoutePlanDraft(
          plan,
          tripId,
          routeDirectionId
        );

        // 4. 调用 StrategyOrchestrator
        this.logger.log('开始执行三人格策略编排（Abu → Dr.Dre → Neptune）');
        const strategyResult = await this.strategyOrchestrator.run(worldContext, routePlanDraft);

        strategyLogs = strategyResult.logs;

        // 5. 处理结果
        if (!strategyResult.allowed || !strategyResult.plan) {
          // 被拒绝
          this.logger.warn(`计划被三人格策略拒绝: ${strategyResult.finalAction}`);
          
          const log: DecisionRunLog = {
            runId: `run_${Date.now()}`,
            at: now,
            trigger: 'initial_generate',
            plannerVersion: plan.version,
            strategyMix: ['abu', 'drdre', 'neptune'],
            inputDigest: {
              destination: state.context.destination,
              startDate: state.context.startDate,
              durationDays: state.context.durationDays,
              signalUpdatedAt: state.signals.lastUpdatedAt,
            },
            chosenActions: [],
            explanation: strategyLogs[0]?.explanation || '计划被拒绝',
            routeDirection: selectedRouteDirection
              ? {
                  selected: {
                    id: selectedRouteDirection.routeDirection.id,
                    uuid: selectedRouteDirection.routeDirection.uuid,
                    name: selectedRouteDirection.routeDirection.name,
                    nameCN: selectedRouteDirection.routeDirection.nameCN,
                  },
                }
              : undefined,
            strategyLogs: strategyLogs,
            ...(state.signals.opsOperationalGovernance
              ? { opsOperationalGovernance: state.signals.opsOperationalGovernance }
              : {}),
          };

          return {
            plan: null as any, // 被拒绝，返回 null
            log,
          };
        }

        // 6. 应用策略调整后的计划
        finalPlan = this.planConverter.applyRoutePlanDraftToTripPlan(
          strategyResult.plan,
          plan,
          state
        );

        // Build a minimal DecisionState-like snapshot for offline CGUS replay.
        // We intentionally keep it small and self-contained.
        try {
          const draftFinal = this.planConverter.convertTripPlanToRoutePlanDraft(
            finalPlan,
            tripId,
            routeDirectionId,
          );
          const itineraryDays: any[] = [];
          const segments = Array.isArray((draftFinal as any)?.segments) ? (draftFinal as any).segments : [];
          for (const s of segments) {
            const dayIndex = typeof s.dayIndex === 'number' ? s.dayIndex : 0;
            while (itineraryDays.length <= dayIndex) itineraryDays.push({ items: [] });
            const md = (s.metadata ?? {}) as any;
            itineraryDays[dayIndex].items.push({
              id: s.segmentId,
              type: md.type ?? 'poi',
              start_window: md.startTime ? { start: md.startTime, end: md.startTime } : undefined,
              end_window: md.endTime ? { start: md.endTime, end: md.endTime } : undefined,
              location_ref: {
                place_id: md.poiId,
                name: md.name,
                coordinates: md.startLocation,
              },
              metadata: {
                distance_meters: Math.round((s.distanceKm ?? 0) * 1000),
                travel_duration_min_from_prev: md.travelDurationMinFromPrev,
              },
            });
          }

          cgusDsoSnapshot = {
            requestId: requestId ?? traceRequestId,
            systemState: { requestId: requestId ?? traceRequestId },
            environmentState: {
              countryCode: this.extractCountryCode(state.context.destination),
              month: this.extractMonth(state.context.startDate),
              routeDirectionId,
            },
            tripState: { planDraft: { days: itineraryDays } },
            constraints: { violations: [] },
          };
          cgusDsoSnapshotNote =
            'captured from TripDecisionEngineService output (final plan converted to planDraft via PlanConverter)';
        } catch {
          // Best-effort; do not break plan generation.
        }

        // 7. 生成 RouteDirection 解释
        if (selectedRouteDirection.reasons && selectedRouteDirection.reasons.length > 0) {
          routeDirectionExplanation = selectedRouteDirection.reasons.join('；');
        } else {
          routeDirectionExplanation = `选择了 ${selectedRouteDirection.routeDirection.nameCN || selectedRouteDirection.routeDirection.name} 路线方向`;
        }

        this.logger.log(
          `三人格策略执行完成: ${strategyResult.finalAction}, ` +
          `调整数: ${strategyLogs.filter(l => l.action !== 'ALLOW').length}`
        );
      } catch (error) {
        this.logger.error(`三人格策略执行失败: ${error}`);
        // 不阻断返回，但记录错误
      }
    }

    const log: DecisionRunLog = {
      runId: `run_${Date.now()}`,
      at: now,
      trigger: 'initial_generate',
      plannerVersion: finalPlan.version,
      strategyMix: ['abu', 'drdre', 'neptune'],
      inputDigest: {
        destination: state.context.destination,
        startDate: state.context.startDate,
        durationDays: state.context.durationDays,
        signalUpdatedAt: state.signals.lastUpdatedAt,
      },
      chosenActions: [
        {
          actionType: 'prioritize',
          reasonCodes: ['RISK_BASED'],
          payload: { days: state.context.durationDays },
        },
      ],
      explanation:
        'Generated plan using Abu(core selection) + DrDre(day scheduling) + Neptune(spatial repair).',
      // 记录 RouteDirection 选择信息
      routeDirection: selectedRouteDirection
        ? {
            selected: {
              id: selectedRouteDirection.routeDirection.id,
              uuid: selectedRouteDirection.routeDirection.uuid,
              name: selectedRouteDirection.routeDirection.name,
              nameCN: selectedRouteDirection.routeDirection.nameCN,
            },
            scoreBreakdown: selectedRouteDirection.scoreBreakdown,
            constraints: selectedRouteDirection.constraints,
            matchedSignals: selectedRouteDirection.matchedSignals,
          }
        : undefined,
      // P1.1.4: 记录证据链（用于前端展示和解释）
      evidenceChain: evidenceChain,
      // Dry-run 结果
      dryRunResult: dryRunResult,
      // PART 2: DEM Decision Evidence（强制检查结果）
      demEvidence: demEvidenceResult,
      // PART 3: 三人格策略日志
      strategyLogs: strategyLogs,
      // RouteDirection 解释
      routeDirectionExplanation: routeDirectionExplanation,
      hardTrekTrailPlan: state.signals.hardTrekTrailPlan,
      ...(cgusDsoSnapshot ? { cgusDsoSnapshot, cgusDsoSnapshotNote } : {}),
      ...(state.signals.opsOperationalGovernance
        ? { opsOperationalGovernance: state.signals.opsOperationalGovernance }
        : {}),
    };

    // Winner-Protected MC Rerank / CGUS replay tooling requires a minimal planDraft snapshot.
    // Produce a fallback snapshot even when planConverter / strategyOrchestrator is not available.
    if (!log.cgusDsoSnapshot) {
      try {
        const itineraryDays = (finalPlan?.days ?? []).map((d) => ({
          items: (d.timeSlots ?? []).map((s) => ({
            id: s.id,
            type: s.type ?? 'poi',
            start_window: s.time ? { start: s.time, end: s.time } : undefined,
            end_window: s.endTime ? { start: s.endTime, end: s.endTime } : undefined,
            location_ref: {
              place_id: s.poiId,
              name: s.title,
              coordinates: s.coordinates,
            },
            metadata: {
              travel_duration_min_from_prev: s.travelLegFromPrev?.durationMin,
            },
          })),
        }));
        log.cgusDsoSnapshot = {
          requestId: requestId ?? traceRequestId,
          systemState: { requestId: requestId ?? traceRequestId },
          environmentState: {
            countryCode: this.extractCountryCode(state.context.destination),
            month: this.extractMonth(state.context.startDate),
            routeDirectionId: selectedRouteDirection?.routeDirection?.uuid
              ? String(selectedRouteDirection.routeDirection.uuid)
              : selectedRouteDirection?.routeDirection?.id !== undefined
                ? String(selectedRouteDirection.routeDirection.id)
                : 'unknown',
          },
          tripState: { planDraft: { days: itineraryDays } },
          constraints: { violations: [] },
        };
        log.cgusDsoSnapshotNote =
          'fallback snapshot from TripPlan (no planConverter/orchestrator); env + planDraft(days/items) only';
      } catch {
        // best effort
      }
    }

    // L2：经 MemoryWritePipeline 统一落库（emit → @OnEvent）
    if (selectedRouteDirection && userId) {
      try {
        const countryCode = this.extractCountryCode(state.context.destination);
        const month = this.extractMonth(state.context.startDate);

        const rejectedIds: number[] = [];
        if (selectedRouteDirection && (state as any).routeDirectionRecommendations) {
          const recommendations = (state as any).routeDirectionRecommendations as any[];
          rejectedIds.push(...recommendations.slice(1, 4).map(r => r.routeDirection.id));
        }

        this.eventEmitter.emit(AGENT_MEMORY_DECISION_COMPLETED, {
          kind: 'route_direction' as const,
          id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          tripId: state.context.tripId,
          countryCode,
          month,
          selectedRouteDirectionId: selectedRouteDirection.routeDirection.id,
          rejectedRouteDirectionIds: rejectedIds,
          keyConstraints: selectedRouteDirection.constraints || {},
          scoreBreakdown: selectedRouteDirection.scoreBreakdown || {},
          explanation: {
            whySelected: selectedRouteDirection.reasons?.join('; ') || '基于评分选择',
            whyRejected: rejectedIds.map(id => ({
              id,
              reason: '评分较低',
            })),
            riskPoints: selectedRouteDirection.routeDirection.riskProfile
              ? Object.keys(selectedRouteDirection.routeDirection.riskProfile)
                  .filter(k => (selectedRouteDirection.routeDirection.riskProfile as any)[k])
                  .map(k => k)
              : [],
            adjustmentSuggestions: dryRunResult?.recommendations || [],
          },
          createdAt: new Date(),
        });
        this.logger.debug(`Emitted L2 route_direction decision memory event for user ${userId}`);
      } catch (error) {
        this.logger.warn(`Failed to emit decision memory event: ${error}`);
      }
    }

    // 记录观测指标
    if (this.observabilityService) {
      const planGenerateLatency = Date.now() - planGenerateStartTime;
      this.observabilityService.recordPlanGenerateLatency(traceRequestId, planGenerateLatency);
      
      // 记录最终 POI pool 大小
      const finalPoolSize = Object.values(state.candidatesByDate).reduce(
        (sum, candidates) => sum + candidates.length,
        0
      );
      this.observabilityService.recordPoiPoolSize(traceRequestId, finalPoolSize, 'final');
      
      // 记录约束命中次数
      const hardConstraintsHit = log.violations?.filter(v => v.code.includes('HARD')).length || 0;
      const softConstraintsHit = log.violations?.filter(v => v.code.includes('SOFT')).length || 0;
      if (hardConstraintsHit > 0) {
        this.observabilityService.recordHardConstraintsHit(traceRequestId, hardConstraintsHit);
      }
      if (softConstraintsHit > 0) {
        this.observabilityService.recordSoftConstraintsHit(traceRequestId, softConstraintsHit);
      }
      
      // 记录修复动作次数
      const repairActionCount = log.chosenActions?.length || 0;
      if (repairActionCount > 0) {
        this.observabilityService.recordRepairActionCount(traceRequestId, repairActionCount);
      }
      
      // 完成 trace
      this.observabilityService.completeTrace(traceRequestId);
    }

    // 生成准备度检查清单（如果 ReadinessAgent 可用且有 worldContext）
    let readiness: TravelReadinessResult | undefined;
    const readinessAgent = this.getReadinessAgent();
    if (readinessAgent && selectedRouteDirection) {
      try {
        // 重新构建 worldContext（如果之前已经构建过）
        // 注意：这里简化处理，实际上应该将 worldContext 提升到外部作用域
        const countryCode = this.extractCountryCode(state.context.destination);
        const month = this.extractMonth(state.context.startDate);
        
        // 构建简化的 worldContext（只包含必要字段）
        // TODO: 优化：将 worldContext 提升到方法级别，避免重复构建
        const demEvidence: any[] = [];
        if (demEvidenceResult?.segmentEvidences) {
          for (const evidence of demEvidenceResult.segmentEvidences) {
            demEvidence.push({
              segmentId: evidence.segmentId,
              elevationProfile: evidence.elevationProfile || [],
              cumulativeAscent: evidence.cumulativeAscent || 0,
              maxSlopePct: evidence.maxSlopePct || 0,
              rollingAscent3Days: evidence.rollingAscent3Days || 0,
              fatigueIndex: evidence.fatigueIndex || 0,
              violation: evidence.violation || 'NONE',
              explanation: evidence.explanation || '',
              metadata: evidence.metadata || {},
            });
          }
        }

        const physical = {
          demEvidence,
          roadStates: [], // TODO: 从实际数据获取
          hazardZones: [], // TODO: 从实际数据获取
          ferryStates: [], // TODO: 从实际数据获取
          weatherEvidence: weatherEvidenceForWorld,
          daylightFeasibilitySignal: state.signals.daylightFeasibility,
          countryCode,
          month,
        };

        const human = createHumanCapabilityModelFromProfile(
          `user_${(state.context as any).userId || 'anonymous'}`,
          {
            pace: state.context.preferences.pace === 'relaxed' ? 'slow' : 
                  state.context.preferences.pace === 'intense' ? 'fast' : 'normal',
            fitness: 'medium',
            riskTolerance: state.context.preferences.riskTolerance === 'low' ? 'low' :
                          state.context.preferences.riskTolerance === 'high' ? 'high' : 'medium',
          }
        );

        const routeDirection = {
          ...selectedRouteDirection.routeDirection,
        };

        const worldContextForReadiness: WorldModelContext = {
          physical,
          human,
          routeDirection,
          executionSemanticView: state.signals.executionSemanticView,
        };

        readiness = readinessAgent.run(worldContextForReadiness, finalPlan);
        this.logger.log(`生成准备度检查清单: ${readiness.items.length} 项`);
      } catch (error) {
        this.logger.warn(`准备度检查清单生成失败: ${error}`);
        // 不阻断返回，只记录警告
      }
    }

    // 检测约束冲突（如果冲突解析器可用）
    if (this.conflictResolver) {
      try {
        const constraintDSL = (state.policies as any)?.constraintDSL;
        if (constraintDSL) {
          const conflictResult = await this.conflictResolver.detectAndExplainConflicts(
            constraintDSL,
            finalPlan,
            state
          );
          
          // 将冲突信息添加到决策日志
          if (conflictResult.has_conflicts) {
            log.conflicts = conflictResult.conflicts;
            this.logger.log(
              `检测到 ${conflictResult.conflicts.length} 个约束冲突: critical=${conflictResult.critical_count}, high=${conflictResult.high_count}, medium=${conflictResult.medium_count}, low=${conflictResult.low_count}`
            );
          }
        }
      } catch (error) {
        this.logger.warn(`约束冲突检测失败: ${error instanceof Error ? error.message : String(error)}`);
        // 不阻断返回，只记录警告
      }
    }

    // Phase 0：约束前置 - 硬约束违规即淘汰，不返回方案
    if (this.constraintEngine) {
      try {
        const feasibilityResult = await this.constraintEngine.isFeasible(state, finalPlan);
        if (!feasibilityResult.feasible) {
          this.logger.warn(
            `方案因硬约束违规被淘汰: ${feasibilityResult.infeasibilityExplanation?.summary || '详见 violations'}`,
          );
          log.constraintEngineRejection = {
            infeasibilityExplanation: feasibilityResult.infeasibilityExplanation,
            violations: feasibilityResult.violations.map(v => ({
              code: v.code,
              severity: v.severity,
              message: v.message,
            })),
          };
          log.explanation =
            feasibilityResult.infeasibilityExplanation?.summary ||
            '方案违反硬约束，已被淘汰';
          this.flushDecisionCausalityChain(state, {
            phase: 'constraint_rejected',
            log,
            plan: null,
          });
          return { plan: null as any, log, readiness, decisionContext: undefined };
        }
      } catch (error) {
        this.logger.warn(`约束引擎检查失败: ${error instanceof Error ? error.message : String(error)}`);
        // 不阻断返回，降级为放行
      }
    }

    try {
      if (shouldRunEcoPipeline(state)) {
        const hadWeatherFusionFrames = (state.signals.executionOverlayFrames?.length ?? 0) > 0;
        if (!hadWeatherFusionFrames) {
          this.ensureExecutionTruthOverlayForEco(state, finalPlan);
        }
        if ((state.signals.executionOverlayFrames?.length ?? 0) > 0) {
          if (hadWeatherFusionFrames) {
            const frames = state.signals.executionOverlayFrames ?? [];
            const repairs = state.signals.repairEvaluation?.repairs;
            state.signals.executionTruthDAG = buildExecutionTruthDAG({
              plan: finalPlan,
              overlayFrames: frames,
              temporalWindowsBySlot: state.signals.temporalExecutionWindowsBySlotId,
              repairs,
            });
            if (planHasInboundTravelLeg(finalPlan)) {
              assertOnlyDAGIsDecisionSource(
                state.signals.executionTruthDAG,
                state.policies,
                'TripDecisionEngine.generatePlan.ecoClosure',
              );
            }
            state.signals.executionIR = compileDAGToIR(state.signals.executionTruthDAG);
            assertIRCreatedOnlyByCompiler(
              state.signals.executionIR,
              'TripDecisionEngine.generatePlan.ecoClosure',
            );
          }
          const dag = state.signals.executionTruthDAG;
          const ir = state.signals.executionIR;
          if (
            dag &&
            dag.nodes.length > 0 &&
            ir &&
            ir.steps.length > 0
          ) {
            const ecoRepair = await this.runNeptuneStabilityAndEcoClosure(state, finalPlan);
            finalPlan = ecoRepair.plan;
            state.signals.executionStabilityBaseline = buildExecutionStabilityBaseline({
              dag,
              ir,
              neptuneTriggerCount: ecoRepair.triggers.length,
            });
            if (state.signals.ecoOrchestrationDigest) {
              log.ecoOrchestration = state.signals.ecoOrchestrationDigest;
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn(`generatePlan ECO closure skipped: ${String(e)}`);
    }

    /** Reality Kernel：单次构建快照；shadow 旁路 + optional Phase 3 enforcement 绑定 */
    let decisionContext: DecisionContextV0 | undefined;
    const rsShadow = String(process.env.REALITY_SNAPSHOT_SHADOW ?? '').trim().toLowerCase();
    const shadowOn = rsShadow === '1' || rsShadow === 'true' || rsShadow === 'yes';
    const enforcementOn = isRealityEnforcementEnabled();

    if (shadowOn || enforcementOn) {
      try {
        const snap = buildShadowRealitySnapshotV0(state, {
          decisionRunId: log.runId,
          traceRequestId,
          plan: finalPlan,
        });
        const horizon = computePlanningHorizonFromTripContext(state.context);

        if (shadowOn) {
          log.realityKernelShadow = {
            snapshot_id: snap.snapshot_id,
            schema: snap.schema,
            degraded: snap.consistency.degraded,
            max_staleness_sec: snap.consistency.max_staleness_sec,
            valid_at: snap.valid_at,
            generated_at: snap.generated_at,
          };
          this.logger.debug(
            `[RealityKernel][shadow] snapshot_id=${snap.snapshot_id} degraded=${snap.consistency.degraded} staleness_sec=${snap.consistency.max_staleness_sec}`,
          );
          const logJson = String(process.env.REALITY_SNAPSHOT_SHADOW_LOG_JSON ?? '')
            .trim()
            .toLowerCase();
          if (logJson === '1' || logJson === 'true') {
            this.logger.debug(`[RealityKernel][shadow_json] ${JSON.stringify(snap)}`);
          }
        }

        if (enforcementOn) {
          decisionContext = buildDecisionContextV0(snap, horizon);
          log.snapshotBoundDecision = {
            schema: decisionContext.schema,
            snapshot_id: snap.snapshot_id,
            planning_horizon: horizon,
            enforcement: 'bound_v0',
            consistency_degraded: snap.consistency.degraded,
          };
          this.logger.debug(
            `[RealityKernel][bound] snapshot_id=${snap.snapshot_id} horizon=${horizon.start_at.slice(0, 10)}..${horizon.end_at.slice(0, 10)}`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `[RealityKernel] snapshot build failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    this.flushDecisionCausalityChain(state, {
      phase: 'completed',
      log,
      plan: finalPlan,
    });

    await this.maybeRecordOpsAuditAndAttachCausality(state, {
      traceRequestId,
      log,
      finalPlan,
      weatherPipeline: weatherPipelineSnapshot,
    });

    this.captureCausalRuntimeSession(state, { requestId, traceRequestId });

    return { plan: finalPlan, log, readiness, decisionContext };
  }

  /**
   * 生成多个方案变体（不同权衡策略）
   * 
   * 可选功能：生成保守、平衡、激进三种方案供用户选择
   */
  async generateMultiplePlans(
    state: TripWorldState,
    requestId?: string
  ): Promise<{ variants: PlanVariant[]; log: DecisionRunLog }> {
    if (!this.multiPlanGenerator) {
      throw new Error('MultiPlanGenerator is required for multi-plan generation');
    }

    // 获取约束DSL
    const constraintDSL = (state.policies as any)?.constraintDSL;
    if (!constraintDSL) {
      throw new Error('ConstraintDSL is required for multi-plan generation');
    }

    // 生成多个方案
    const variants = await this.multiPlanGenerator.generateMultiplePlans(
      state,
      constraintDSL
    );

    // 创建决策日志
    const log: DecisionRunLog = {
      runId: requestId || `multi_plan_${Date.now()}`,
      at: new Date().toISOString(),
      trigger: 'initial_generate',
      plannerVersion: '1.0.0',
      strategyMix: ['abu', 'drdre', 'neptune'],
      inputDigest: {
        destination: state.context.destination,
        startDate: state.context.startDate,
        durationDays: state.context.durationDays,
        signalUpdatedAt: state.signals.lastUpdatedAt || new Date().toISOString(),
      },
      chosenActions: [],
      explanation: `生成了 ${variants.length} 个方案变体：${variants.map(v => v.id).join(', ')}`,
    };

    return { variants, log };
  }

  /**
   * 修复计划（当世界状态变化时）
   */
  async repairPlan(
    state: TripWorldState,
    plan: TripPlan,
    trigger: DecisionTrigger = 'signal_update'
  ): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }
    if (!plan) {
      throw new Error('Invalid plan: plan is required');
    }

    applyEcoLedgerTripContext(state);

    await this.hydrateEcoIdentityLedgerFromStorage(state);

    const traceRequestId = `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const bindRealityAls =
      isRealityEnforcementEnabled() || isRealityReadBoundaryEnabled();
    if (bindRealityAls) {
      const earlySnap = buildShadowRealitySnapshotV0(state, { traceRequestId });
      const horizon = computePlanningHorizonFromTripContext(state.context);
      const earlyCtx = buildDecisionContextV0(earlySnap, horizon);
      this.logger.debug(
        `[RealityKernel][als_bind_repair] snapshot_id=${earlyCtx.snapshot_id} validity=${earlyCtx.reality.validity.status}`,
      );
      return await runWithDecisionContextAsync(earlyCtx, () =>
        this.executeRepairPlanTick(state, plan, trigger, traceRequestId),
      );
    }

    return await this.executeRepairPlanTick(state, plan, trigger, traceRequestId);
  }

  /** Repair body — runs under ALS when enforcement/boundary flags are on. */
  private async executeRepairPlanTick(
    state: TripWorldState,
    plan: TripPlan,
    trigger: DecisionTrigger,
    traceRequestId: string,
  ): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    this.applyRealityPlanningExecutionGate(state, 'repair', traceRequestId);

    const now = new Date().toISOString();

    // PART 2: 生成 DEM evidence（用于强制规则检查）
    let demEvidenceResult: DemEvidencePipelineResult | undefined;
    
    // 优先使用新的 DemDecisionEvidenceService（如果可用）
    if (this.demDecisionEvidenceService) {
      try {
        const routeSegmentation = (state as any).routeSegmentation;
        const routeDirectionData = (state as any).selectedRouteDirection?.routeDirection;
        
        demEvidenceResult = await this.demDecisionEvidenceService.generateEvidencePipeline(
          plan,
          routeDirectionData,
          routeSegmentation
        );

        this.logger.log(
          `修复前 DEM决策证据生成完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
          `HARD违规: ${demEvidenceResult.hasHardViolation}`
        );

        // 强制规则：Neptune 不允许修复没有 DEM evidence 的 segment
        const validation = this.demDecisionEvidenceService.validatePlanHasEvidence(
          plan,
          demEvidenceResult.segmentEvidences
        );
        
        if (!validation.valid) {
          this.logger.warn(
            `Neptune 修复前验证失败: ${validation.reason}。Neptune 不能修复没有 DEM 证据的路径。`
          );
          // 可以选择跳过修复，或抛出错误
        }

        // 检查需要修复的 segments 是否有 evidence
        const segmentsWithHardViolation = demEvidenceResult.segmentEvidences.filter(
          e => e.violation === 'HARD'
        );
        
        for (const evidence of segmentsWithHardViolation) {
          this.logger.warn(
            `Neptune 不能修复 segment ${evidence.segmentId}: 存在硬约束违反 - ${evidence.explanation}`
          );
          // 可以选择跳过该 segment 的修复
        }
      } catch (error) {
        this.logger.warn(`修复前 DEM决策证据生成失败: ${error}`);
      }
    } else if (this.demEvidencePipeline) {
      // 回退到旧的 pipeline service
      try {
        const userId = (state.context as any).userId;
        const decisionParams = userId
          ? await this.decisionParamsInjector.getDecisionParamsForUser(userId)
          : null;
        
        const userConstraints = decisionParams ? {
          maxDailyAscentM: decisionParams.constraints.maxDailyAscentM,
          maxElevationM: decisionParams.constraints.maxElevationM,
          maxSlopePct: decisionParams.constraints.maxSlopePct,
          rollingAscent3DaysThreshold: 2000,
        } : undefined;

        demEvidenceResult = await this.demEvidencePipeline.generateEvidenceForPlan(
          plan,
          userConstraints
        );
      } catch (error) {
        this.logger.warn(`修复前 DEM evidence 生成失败: ${error}`);
      }
    }

    // PART 2: 在 Neptune 修复前检查强制规则（使用旧的 enforcer，如果可用）
    if (this.demEvidenceEnforcer && demEvidenceResult) {
      // 检查需要修复的 segments 是否有 evidence
      const segmentsRequiringRepair = this.demEvidenceEnforcer.getSegmentsRequiringRepair(demEvidenceResult);
      for (const segment of segmentsRequiringRepair) {
        const canRepair = this.demEvidenceEnforcer.canNeptuneRepairSegment(
          segment.segmentId,
          demEvidenceResult
        );
        if (!canRepair.allowed) {
          this.logger.warn(
            `Neptune 不能修复 segment ${segment.segmentId}: ${canRepair.reason}`
          );
          // 可以选择跳过该 segment 的修复，或抛出错误
        }
      }
    }

    if (!state.signals.executionTruthDAG?.nodes?.length) {
      this.ensureExecutionTruthOverlayForEco(state, plan);
    }

    if (!state.signals.executionTruthDAG?.nodes?.length) {
      throw new Error('NO_EXECUTION_TRUTH_SOURCE');
    }
    if (!state.signals.executionIR?.steps?.length) {
      throw new Error('[NEPTUNE] IR required');
    }

    const repaired = await this.runNeptuneStabilityAndEcoClosure(state, plan);

    state.signals.executionStabilityBaseline = buildExecutionStabilityBaseline({
      dag: state.signals.executionTruthDAG,
      ir: state.signals.executionIR,
      neptuneTriggerCount: repaired.triggers.length,
    });

    const log: DecisionRunLog = {
      runId: `run_${Date.now()}`,
      at: now,
      trigger,
      plannerVersion: plan.version,
      strategyMix: ['neptune'],
      inputDigest: {
        destination: state.context.destination,
        startDate: state.context.startDate,
        durationDays: state.context.durationDays,
        signalUpdatedAt: state.signals.lastUpdatedAt,
      },
      violations: repaired.triggers.map(t => ({
        code: t.code,
        date: t.date,
        slotId: t.slotId,
        details: t.details,
      })),
      chosenActions: [
        ...mapGuardianRepairsToChosenActions(
          state.signals.repairEvaluation?.repairs,
          repaired.guardianAppliedRepairIds ?? [],
        ),
        ...repaired.changedSlotIds.map((id) => ({
          actionType: 'swap' as const,
          reasonCodes: ['MIN_EDIT_REPAIR'],
          payload: { slotId: id },
        })),
      ],
      diff: {
        changedSlots: repaired.changedSlotIds.length,
        movedSlots: 0,
        removedSlots: 0,
        addedSlots: 0,
        editDistanceScore: repaired.changedSlotIds.length, // MVP
      },
      explanation: repaired.explanation,
      ...(shouldRunEcoPipeline(state) && state.signals.ecoOrchestrationDigest
        ? { ecoOrchestration: state.signals.ecoOrchestrationDigest }
        : {}),
      // PART 2: DEM Decision Evidence
      demEvidence: demEvidenceResult ? {
        segmentEvidences: demEvidenceResult.segmentEvidences.map(e => ({
          segmentId: e.segmentId,
          violation: e.violation,
          explanation: e.explanation,
        })),
        hasHardViolation: demEvidenceResult.hasHardViolation,
        hasSoftViolation: demEvidenceResult.hasSoftViolation,
        rollingFatigue: demEvidenceResult.rollingFatigue ? {
          detected: demEvidenceResult.rollingFatigue.detected,
          startDay: demEvidenceResult.rollingFatigue.startDay,
          endDay: demEvidenceResult.rollingFatigue.endDay,
          suggestedAction: demEvidenceResult.rollingFatigue.suggestedAction,
          explanation: demEvidenceResult.rollingFatigue.explanation,
        } : undefined,
        canProceed: demEvidenceResult.canProceed,
      } : undefined,
      ...(state.signals.opsOperationalGovernance
        ? { opsOperationalGovernance: state.signals.opsOperationalGovernance }
        : {}),
      ...(state.signals.guardianRepairHints
        ? { guardianRepairHints: state.signals.guardianRepairHints }
        : {}),
    };

    this.flushDecisionCausalityChain(state, {
      phase: 'completed',
      log,
      plan: repaired.plan,
    });

    this.captureCausalRuntimeSession(state, { traceRequestId });

    return { plan: repaired.plan, log };
  }

  /**
   * P-OPS-3 — versioned operational policy on weather pipeline aggregate (audit + optional HARD block alert).
   */
  private applyOperationalGovernanceAfterWeather(
    state: TripWorldState,
    weatherPipeline: WeatherEvidencePipelineResult | undefined,
  ): void {
    if (!this.operationalPolicy) return;
    const policy = this.operationalPolicy.getEffectivePolicy();
    const snapshot = evaluateGeneratePlanGovernance({ policy, weatherPipeline });
    state.signals.opsOperationalGovernance = snapshot;
    const w = snapshot.weather;
    if (w) {
      this.promMetrics?.recordOpsOperationalGovernanceResolution(w.branch, w.action);
    }
    if (
      policy.weather.enforceHardBlock === true &&
      w?.action === 'BLOCK_FINALIZE' &&
      weatherPipeline?.hasHardViolation
    ) {
      const msg =
        w.detail?.trim() ||
        weatherPipeline.explainableFailure?.reason?.trim() ||
        'Weather HARD: operational policy requires block.';
      if (!state.signals.alerts) state.signals.alerts = [];
      state.signals.alerts.push({
        code: 'OPS_WEATHER_POLICY_HARD_BLOCK',
        severity: 'critical',
        message: msg,
      });
    }
  }

  /**
   * 构建天气管道上下文：空间锚点 + 车型（ policies / vehicleClass ）
   */
  private buildWeatherEvidenceContext(
    state: TripWorldState,
    plan: TripPlan,
  ): WeatherEvidenceLocationContext | undefined {
    const fb = this.resolveWeatherEvidenceFallback(state, plan);
    const vp = this.resolveVehicleProfile(state);
    if (!fb && !vp) {
      return undefined;
    }
    return {
      ...(fb ?? {}),
      ...(vp ? { vehicleProfile: vp } : {}),
    };
  }

  /**
   * 从 world.policies 解析车型（支持 vehicleProfile 或兼容字符串 vehicleClass）
   */
  private resolveVehicleProfile(state: TripWorldState): VehicleProfile | undefined {
    const pol = state.policies as
      | {
          vehicleProfile?: VehicleProfile;
          vehicleClass?: string;
        }
      | undefined;
    if (pol?.vehicleProfile?.vehicleClass) {
      return pol.vehicleProfile;
    }
    const raw = pol?.vehicleClass;
    if (!raw || typeof raw !== 'string') {
      return undefined;
    }
    const u = raw.toUpperCase().replace(/[\s-]/g, '_');
    const map: Record<string, VehicleClass> = {
      SEDAN: 'SEDAN',
      SUV: 'SUV_4WD',
      SUV_4WD: 'SUV_4WD',
      '4WD': 'SUV_4WD',
      FWD: 'SEDAN',
      CAMPERVAN: 'CAMPERVAN',
      CAMPER: 'CAMPERVAN',
      CAMPER_VAN: 'CAMPERVAN',
      RV: 'CAMPERVAN',
      MOTORHOME: 'CAMPERVAN',
      EV_CAMPERVAN: 'EV_CAMPERVAN',
      EV: 'EV_CAMPERVAN',
    };
    const vc = map[u];
    return vc ? { vehicleClass: vc } : undefined;
  }

  /**
   * 无天气融合路径时，用走廊物理 + `buildExecutionOverlay` 物化 overlay / DAG / IR，供首轮 `generatePlan` 走 ECO 闭环。
   * 若已有 `executionOverlayFrames` 则不应调用（由调用方保证）。
   */
  private ensureExecutionTruthOverlayForEco(state: TripWorldState, plan: TripPlan): boolean {
    if ((state.signals.executionOverlayFrames?.length ?? 0) > 0) {
      return true;
    }

    this.attachRouteExecutionOverlaysToPlan(plan, state);

    if (!plan.temporal) {
      plan.temporal = {
        timeDrifts: [],
        constraintEdges: [],
        emittedAt: new Date().toISOString(),
      };
    }
    const routeDrifts = this.collectRoutePhysicsDriftsFromPlan(plan);
    plan.temporal.timeDrifts = [...(plan.temporal.timeDrifts ?? []), ...routeDrifts];
    plan.temporal.unifiedConstraintGraph = buildUnifiedConstraintGraph(plan, {
      hotelCheckinLatest: state.policies?.microRepair?.hotelCheckinLatest,
    });

    this.hydrateFuelReachability(state, plan);

    const overlayFramesPass1 = augmentOverlayFramesWithPedestrianGaps(
      plan,
      buildExecutionOverlay({
        plan,
        weatherByDate: state.signals.weatherByDate,
        timeDrifts: plan.temporal.timeDrifts,
        crossDayShiftedSlotIds: plan.temporal.crossDayShiftedSlotIds,
        legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
        fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
        worldConstraintSnapshot: this.worldConstraintSnapshotFromSignals(state),
      }),
      { persistSyntheticTravelLegsOnPlan: true },
    );

    this.attachRouteExecutionOverlaysToPlan(plan, state);

    assertOverlayOnly(plan, overlayFramesPass1, state.policies, 'TripDecisionEngine.ecoFallbackOverlay');

    let physicsIndexForRepair:
      | import('../physics/unified-physics-field-index.types').PhysicsFieldIndex
      | undefined;
    let framesForRepairPipeline = overlayFramesPass1;

    if (overlayFramesPass1.length > 0) {
      const legDatesPre = buildLegDateIndexFromPlan(plan);
      const physicsRowsPrePass = buildUnifiedPhysicsField({
        executionOverlayFrames: overlayFramesPass1,
        legDateByLegId: legDatesPre,
      });
      physicsIndexForRepair = buildPhysicsFieldIndex(physicsRowsPrePass);
      framesForRepairPipeline = applyPhysicsAuthorityToOverlayFrames(
        overlayFramesPass1,
        physicsIndexForRepair,
      );
    }

    if (framesForRepairPipeline.length > 0) {
      state.signals.overnightRestructuringPressures = deriveOvernightFromOverlay(
        plan,
        framesForRepairPipeline,
      );
    }

    const dagForRepairEvaluator =
      framesForRepairPipeline.length > 0
        ? buildExecutionTruthDAG({ plan, overlayFrames: framesForRepairPipeline })
        : undefined;
    const executionIRPass1 = dagForRepairEvaluator
      ? compileDAGToIR(dagForRepairEvaluator)
      : undefined;
    const useIrExecutionTruth = Boolean(executionIRPass1 && dagForRepairEvaluator);

    const repairEvaluation = evaluateMinimalRepairs({
      plan,
      timeDrifts: plan.temporal.timeDrifts,
      unifiedConstraintGraph: plan.temporal.unifiedConstraintGraph,
      daylightFeasibility: useIrExecutionTruth ? undefined : state.signals.daylightFeasibility,
      nightObservationFeasibility: useIrExecutionTruth
        ? undefined
        : state.signals.nightObservationFeasibility,
      opportunityMigrationEvaluations: state.signals.opportunityMigrationEvaluations,
      overnightRestructuringPressures: state.signals.overnightRestructuringPressures,
      legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
      policies: state.policies,
      executionOverlayFrames: framesForRepairPipeline,
      executionTruthDAG: dagForRepairEvaluator,
      executionIR: executionIRPass1,
      fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
      physicsFieldIndex: physicsIndexForRepair,
    });

    state.signals.executionOverlayFrames = stampOverlayAnnotationsFromSignals(
      plan,
      state,
      mergeRepairHintsIntoFrames(framesForRepairPipeline, repairEvaluation.repairs),
    );

    const stampedFrames = state.signals.executionOverlayFrames ?? [];
    if (stampedFrames.length === 0) {
      delete state.signals.unifiedPhysicsFieldByLegId;
      delete state.signals.physicsFieldIndex;
    } else {
      const legDates = buildLegDateIndexFromPlan(plan);
      const physicsRows = buildUnifiedPhysicsField({
        executionOverlayFrames: stampedFrames,
        legDateByLegId: legDates,
      });
      const physicsIndex = buildPhysicsFieldIndex(physicsRows);
      state.signals.physicsFieldIndex = physicsIndex;
      state.signals.unifiedPhysicsFieldByLegId = physicsIndex.byLegId;
      state.signals.executionOverlayFrames = applyPhysicsAuthorityToOverlayFrames(
        stampedFrames,
        physicsIndex,
      );
    }

    state.signals.executionTruthDAG = buildExecutionTruthDAG({
      plan,
      overlayFrames: state.signals.executionOverlayFrames ?? [],
      temporalWindowsBySlot: state.signals.temporalExecutionWindowsBySlotId,
      repairs: repairEvaluation.repairs,
    });
    if (planHasInboundTravelLeg(plan)) {
      assertOnlyDAGIsDecisionSource(
        state.signals.executionTruthDAG,
        state.policies,
        'TripDecisionEngine.ecoFallbackOverlay',
      );
    }
    state.signals.executionIR = compileDAGToIR(state.signals.executionTruthDAG);
    assertIRCreatedOnlyByCompiler(state.signals.executionIR, 'TripDecisionEngine.ecoFallbackOverlay');

    if (
      repairEvaluation.repairs.length > 0 ||
      (repairEvaluation.overnightRestructuringProposals?.length ?? 0) > 0
    ) {
      state.signals.repairEvaluation = repairEvaluation;
    } else {
      delete state.signals.repairEvaluation;
    }

    return (state.signals.executionOverlayFrames?.length ?? 0) > 0;
  }

  /**
   * 将走廊物理引擎投影挂到 slot（runtime overlay）；`travelLegFromPrev` 保持规划器基准不变。
   */
  private attachRouteExecutionOverlaysToPlan(plan: TripPlan, state: TripWorldState): void {
    const vp = this.resolveVehicleProfile(state) ?? { vehicleClass: 'SEDAN' as VehicleClass };
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        const leg = slot.travelLegFromPrev;
        if (!leg) {
          delete slot.routeExecutionOverlay;
          continue;
        }
        const geometry =
          leg.from && leg.to
            ? { coordinates: [leg.from, leg.to] as Array<{ lat: number; lng: number }> }
            : {};
        const proj = projectRouteExecutionHazards({
          legId: slot.id,
          geometry,
          elevationProfile: { samples: [] },
          weatherGrid: { samples: [] },
          roadCondition: { fRoad: false },
          vehicleProfile: vp,
          timeWindow: {
            startIso: `${day.date}T06:00:00.000Z`,
            endIso: `${day.date}T22:00:00.000Z`,
          },
          baselineDurationMin: leg.durationMin,
        });
        slot.routeExecutionOverlay = buildExecutionEnrichedTravelLeg(leg, proj);
      }
    }
  }

  private collectRoutePhysicsDriftsFromPlan(plan: TripPlan): TimeDrift[] {
    const out: TimeDrift[] = [];
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        const overlay = slot.routeExecutionOverlay;
        if (!overlay) {
          continue;
        }
        out.push(
          ...routeExecutionToTemporalDrifts({
            date: day.date,
            sourceSlotId: slot.id,
            enriched: overlay,
          }),
        );
      }
    }
    return out;
  }

  /**
   * Temporal Physics：leg 级安全抵达、effective 驾驶窗、slot 执行窗、golden hour 机会域（与 daylight 摘要同源锚点）。
   */
  private applyTemporalPhysicsSignals(
    state: TripWorldState,
    plan: TripPlan,
    daylightAnchor: { lat: number; lng: number } | null,
    utcOffsetMinutes: number,
  ): void {
    if (!daylightAnchor) {
      delete state.signals.legTemporalSafetyAssessments;
      delete state.signals.effectiveDrivableWindowByDate;
      delete state.signals.temporalExecutionWindowsBySlotId;
      delete state.signals.goldenHourOpportunityByDate;
      return;
    }
    const { lat, lng } = daylightAnchor;
    const effectiveByDate: Partial<Record<ISODate, EffectiveDrivableWindow>> = {};
    const goldenByDate: Partial<Record<ISODate, GoldenHourOpportunitySignal>> = {};

    for (const day of plan.days) {
      const civil = approximateCivilTwilightLocal(
        day.date,
        lat,
        lng,
        utcOffsetMinutes,
      );
      if (civil && !civil.ambiguous) {
        const eff = buildEffectiveDrivableWindowForDay(day.date, civil, day);
        if (eff) {
          effectiveByDate[day.date] = eff;
        }
      }
      const gh = buildGoldenHourOpportunitySignal(
        day.date,
        lat,
        lng,
        utcOffsetMinutes,
      );
      if (gh) {
        goldenByDate[day.date] = gh;
      }
    }

    state.signals.legTemporalSafetyAssessments = buildLegTemporalSafetyAssessments(plan, {
      latitudeDeg: lat,
      longitudeDeg: lng,
      utcOffsetMinutes,
    });
    state.signals.effectiveDrivableWindowByDate =
      Object.keys(effectiveByDate).length > 0 ? effectiveByDate : undefined;
    state.signals.temporalExecutionWindowsBySlotId = buildTemporalExecutionWindowsBySlot(
      plan,
      effectiveByDate,
    );
    state.signals.goldenHourOpportunityByDate =
      Object.keys(goldenByDate).length > 0 ? goldenByDate : undefined;
  }

  /**
   * Legacy：无 corridor overlay 帧时，由 raw temporal + leg 评估 + 营运窗 合成压力。
   * 有 `ExecutionOverlayFrame` 时由 {@link deriveOvernightFromOverlay} 替代（P5-2-A）。
   */
  private applyOvernightRestructuringPressureSignals(
    state: TripWorldState,
    plan: TripPlan,
    operationalDayWindow: OperationalDayWindowSignalSummary | undefined,
  ): void {
    const pressures = buildOvernightRestructuringPressures({
      plan,
      legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
      timeDrifts: plan.temporal?.timeDrifts ?? [],
      operationalDayWindow,
      effectiveDrivableWindowByDate: state.signals.effectiveDrivableWindowByDate,
    });
    state.signals.overnightRestructuringPressures = pressures;
  }

  private isLikelyIcelandDestination(destination: string): boolean {
    const d = destination.toLowerCase();
    return (
      d.includes('iceland') ||
      d.includes('冰岛') ||
      d.includes('reykjavik') ||
      d.includes('reykjavík') ||
      d.includes('ísland')
    );
  }

  /**
   * 极光解析锚点：酒店 > 当日天气证据坐标 > 当日首个候选 POI。
   */
  private resolveAuroraAnchorForDate(
    state: TripWorldState,
    date: ISODate,
    evidences: WeatherDecisionEvidence[],
  ): GeoPoint | undefined {
    const hotel = state.context.anchors?.hotelLocationsByDate?.[date];
    if (hotel) {
      return hotel;
    }
    const ev = evidences.find(e => e.date === date);
    const lat = ev?.metadata?.resolvedLat;
    const lng = ev?.metadata?.resolvedLng;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return { lat, lng };
    }
    const first = state.candidatesByDate[date]?.find(c => c.location?.point)?.location?.point;
    return first;
  }

  /** P-FUEL-1：自驾走廊续航 vs 下一补给点 → signals.fuelReachabilityByLegId（纯几何桩；OSM arc 距离可由上游 enrichment）。 */
  private hydrateFuelReachability(state: TripWorldState, plan: TripPlan): void {
    const vehicle = state.policies?.vehicleFuelProfile ?? DEFAULT_VEHICLE_FUEL_PROFILE;
    const pois = extractFuelPoiIndexFromCandidates(state.candidatesByDate);
    const map = summarizeFuelReachabilityForPlan(plan, pois, vehicle);
    if (Object.keys(map).length > 0) {
      state.signals.fuelReachabilityByLegId = map;
    } else {
      delete state.signals.fuelReachabilityByLegId;
    }
  }

  /**
   * 写入 auroraByDate + nightObservationFeasibility（冰岛行程拉取 IcelandAuroraAdapter；亦可由调用方事先填入 signals）。
   */
  private async hydrateAuroraNightSignals(
    state: TripWorldState,
    plan: TripPlan,
    evidences: WeatherDecisionEvidence[],
  ): Promise<void> {
    const prev = state.signals.auroraByDate ?? {};
    const merged: Partial<Record<ISODate, AuroraNightObservationSignal>> = { ...prev };

    if (this.isLikelyIcelandDestination(state.context.destination)) {
      let adapter: IcelandAuroraAdapter | undefined;
      try {
        adapter = this.moduleRef.get(IcelandAuroraAdapter, { strict: false });
      } catch {
        adapter = undefined;
      }

      if (adapter) {
        const ts = new Date().toISOString();
        for (const day of plan.days) {
          const anchor = this.resolveAuroraAnchorForDate(state, day.date, evidences);
          if (!anchor) {
            continue;
          }
          try {
            const kp = await adapter.getAuroraKPIndex();
            const cloud = await adapter.getCloudCover(anchor.lat, anchor.lng);
            const visibility = await adapter.calculateAuroraVisibility(
              anchor.lat,
              anchor.lng,
              kp,
              cloud,
            );
            merged[day.date] = buildAuroraNightObservationSignal({
              kpIndex: kp,
              cloudCoveragePct: cloud,
              visibility,
              resolvedLat: anchor.lat,
              resolvedLng: anchor.lng,
              source: 'iceland_aurora_adapter',
              updatedAt: ts,
            });
          } catch (e: unknown) {
            this.logger.debug(
              `极光信号 ${day.date} 跳过: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    }

    if (Object.keys(merged).length > 0) {
      state.signals.auroraByDate = merged;
      state.signals.nightObservationFeasibility = buildNightObservationFeasibilitySummary(
        plan,
        merged,
      );
      state.signals.auroraOpportunityByDate = buildAuroraOpportunityByDate(merged);
      state.signals.opportunityMigrationEvaluations = evaluateOpportunityMigrationsForPlan(
        plan,
        state.signals.auroraOpportunityByDate,
        {
          stance: migrationStanceFromAuroraIntentWeight(
            state.context.preferences.intents?.aurora,
          ),
        },
      );
      const rawProposals = materializeProposedCorridorMigrations(
        state.signals.opportunityMigrationEvaluations,
      );
      if (rawProposals.length > 0) {
        state.signals.proposedCorridorMigrations = enrichProposalsWithSimulation(
          rawProposals,
          plan,
        );
      } else {
        delete state.signals.proposedCorridorMigrations;
      }
    } else {
      delete state.signals.auroraByDate;
      delete state.signals.nightObservationFeasibility;
      delete state.signals.auroraOpportunityByDate;
      delete state.signals.opportunityMigrationEvaluations;
      delete state.signals.proposedCorridorMigrations;
    }
  }

  /**
   * 天气证据中的 resolvedLat/Lng → 民用晨光/暮光锚点（缺失则跳过日照提示）
   */
  private resolveDaylightAnchorFromWeatherEvidences(
    evidences: WeatherDecisionEvidence[],
  ): { lat: number; lng: number } | null {
    for (const e of evidences) {
      const lat = e.metadata?.resolvedLat;
      const lng = e.metadata?.resolvedLng;
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        return { lat, lng };
      }
    }
    return null;
  }

  /**
   * 将逐日天气证据挂到 PlanDay（供 daylight / 分段 ETA 读取）
   */
  private applyWeatherExecutionToPlanDays(
    plan: TripPlan,
    evidences: WeatherDecisionEvidence[],
  ): void {
    const byDate = new Map(evidences.map(e => [e.date, e]));
    for (const day of plan.days) {
      const ev = byDate.get(day.date);
      if (!ev) continue;
      day.weatherExecution = {
        executionState: ev.executionState,
        executionQuality: ev.executionQuality
          ? {
              safeScore: ev.executionQuality.safeScore,
              delayFactor: ev.executionQuality.delayFactor,
              visibilityPenalty: ev.executionQuality.visibilityPenalty,
              fatigueCost: ev.executionQuality.fatigueCost,
              riskBudget: ev.executionQuality.riskBudget,
            }
          : undefined,
        violation: ev.violation,
        hazardKinds: ev.hazards?.map(h => h.kind),
        crosswindRisk: ev.crosswindRisk,
        suggestedAction: ev.suggestedAction,
        explanation: ev.explanation,
      };
    }
  }

  /**
   * 合并到 ExternalSignalsState.weatherByDate（Agent / 约束层统一读）
   */
  private mergeWeatherDecisionEvidenceIntoSignals(
    state: TripWorldState,
    evidences: WeatherDecisionEvidence[],
    plan: TripPlan,
  ): void {
    const prev = state.signals.weatherByDate ?? {};
    const next: Partial<Record<ISODate, WeatherExecutionSignal>> = { ...prev };
    const ts = new Date().toISOString();
    for (const e of evidences) {
      const overlay = plan.days.find(d => d.date === e.date)?.weatherExecution;
      next[e.date] = {
        executionState: e.executionState,
        executionQuality: e.executionQuality,
        violation: e.violation,
        hazardKinds: e.hazards?.map(h => h.kind) ?? [],
        hazards: e.hazards,
        windSpeedMs: e.windSpeed,
        windDirectionDeg: e.windDirection,
        visibilityKm: e.visibility,
        precipitationMm: e.precipitation,
        crosswindRisk: e.crosswindRisk,
        suggestedAction: e.suggestedAction,
        explanation: e.explanation,
        weatherSource: e.metadata?.weatherSource,
        resolvedLat: e.metadata?.resolvedLat,
        resolvedLng: e.metadata?.resolvedLng,
        recommendedExtraDriveMinutes: overlay?.recommendedExtraDriveMinutes,
        accumulatedGlobalSlackMinutes: overlay?.accumulatedGlobalSlackMinutes,
        updatedAt: ts,
        source: 'weather_decision_evidence',
      };
    }
    state.signals.weatherByDate = next;
    state.signals.temporalPropagation =
      summarizeTemporalPropagationForSignals(plan.temporal);
    state.signals.lastUpdatedAt = ts;
  }

  /**
   * 多日 executionQuality → 单一计划层指标（最差日主导）
   */
  private aggregateWeatherExecutionMetrics(evidences: WeatherDecisionEvidence[]): {
    weatherDelayFactorMax: number;
    weatherRiskBudgetMin: number;
    weatherSafeScoreMin: number;
    weatherWorstExecutionState?: ExecutionState;
  } {
    const stateRank: ExecutionState[] = [
      'EXECUTABLE',
      'DEGRADED',
      'HIGH_RISK',
      'BLOCKED',
    ];
    let maxDelay = 1;
    let minRisk = 1;
    let minSafe = 1;
    let worst: ExecutionState | undefined;

    for (const e of evidences) {
      const q = e.executionQuality;
      if (q) {
        maxDelay = Math.max(maxDelay, q.delayFactor);
        minRisk = Math.min(minRisk, q.riskBudget);
        minSafe = Math.min(minSafe, q.safeScore);
      }
      if (e.executionState) {
        if (
          !worst ||
          stateRank.indexOf(e.executionState) > stateRank.indexOf(worst)
        ) {
          worst = e.executionState;
        }
      }
    }

    return {
      weatherDelayFactorMax: Math.round(maxDelay * 1000) / 1000,
      weatherRiskBudgetMin: Math.round(minRisk * 1000) / 1000,
      weatherSafeScoreMin: Math.round(minSafe * 1000) / 1000,
      weatherWorstExecutionState: worst,
    };
  }

  /**
   * 天气查询锚点：优先入住锚点 → 计划内坐标 → 目的地默认 centroid（最小集）
   */
  private resolveWeatherEvidenceFallback(
    state: TripWorldState,
    plan: TripPlan,
  ): WeatherEvidenceLocationContext | undefined {
    const anchor = state.context.anchors?.hotelLocationsByDate?.[state.context.startDate];
    if (
      anchor &&
      typeof anchor.lat === 'number' &&
      typeof anchor.lng === 'number' &&
      !Number.isNaN(anchor.lat + anchor.lng)
    ) {
      return { fallbackLat: anchor.lat, fallbackLng: anchor.lng };
    }
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        const c = slot.coordinates;
        if (
          c &&
          typeof c.lat === 'number' &&
          typeof c.lng === 'number' &&
          !Number.isNaN(c.lat + c.lng)
        ) {
          return { fallbackLat: c.lat, fallbackLng: c.lng };
        }
      }
    }
    const cc = this.extractCountryCode(state.context.destination);
    if (cc === 'IS') {
      return { fallbackLat: 64.1466, fallbackLng: -21.9426 };
    }
    if (cc === 'NZ') {
      return { fallbackLat: -41.2865, fallbackLng: 174.7762 };
    }
    if (cc === 'NO') {
      return { fallbackLat: 59.9139, fallbackLng: 10.7522 };
    }
    return undefined;
  }

  /**
   * 从目的地提取国家代码
   */
  private extractCountryCode(destination: string): string {
    // 支持格式：NZ, NP, CN_XZ, IS-REYKJAVIK, SVALBARD_LONGYEARBYEN
    if (destination.startsWith('CN_')) {
      return destination.split('_')[0] + '_' + destination.split('_')[1];
    }
    if (destination.includes('-')) {
      return destination.split('-')[0];
    }
    if (destination.includes('_')) {
      const parts = destination.split('_');
      return parts[0];
    }
    return destination.substring(0, 2).toUpperCase();
  }

  /**
   * 从日期提取月份
   */
  private extractMonth(date: string): number {
    // date 格式：YYYY-MM-DD
    const parts = date.split('-');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10);
    }
    return new Date().getMonth() + 1;
  }

  /**
   * 从用户偏好提取标签
   */
  private extractPreferences(preferences: any): string[] {
    const tags: string[] = [];
    
    // 从 intents 中提取
    if (preferences.intents && typeof preferences.intents === 'object') {
      Object.keys(preferences.intents).forEach(key => {
        if (preferences.intents[key] > 0.5) {
          tags.push(key);
        }
      });
    }

    return tags;
  }

  /**
   * 将约束注入到 world model（区分硬约束/软约束/目标函数权重）
   * 根据 pace 调整约束值，并应用目标权重
   * 
   * 支持新DSL格式和旧格式（向后兼容）
   */
  private injectConstraints(state: TripWorldState, constraints: any): void {
    // 将约束存储到 state 的 metadata 中，供后续策略使用
    if (!state.policies) {
      state.policies = {};
    }

    const policies = state.policies as any;

    // 获取 pace 偏好
    const pace = state.context.preferences.pace || 'moderate';
    
    // 获取策略配置（根据 pace）
    const policyProfile = getPolicyProfile(pace);
    
    // 应用策略配置到 policies
    policies.objectiveWeights = policyProfile.objectiveWeights;
    policies.abuConfig = policyProfile.abuConfig;
    policies.drdreConfig = policyProfile.drdreConfig;

    // 使用DSL编译器（如果可用）或回退到旧逻辑
    if (this.constraintDSLCompiler) {
      try {
        const compiled = this.constraintDSLCompiler.compile(constraints, state);
        
        // 合并编译后的约束
        policies.hardConstraints = {
          ...policies.hardConstraints,
          ...compiled.hardConstraints,
        };
        policies.softConstraints = {
          ...policies.softConstraints,
          ...compiled.softConstraints,
        };
        policies.objectives = {
          ...policies.objectives,
          ...compiled.objectives,
        };

        // 保存原始DSL到metadata（用于冲突检测）
        if (constraints.hard_constraints || constraints.soft_constraints) {
          policies.constraintDSL = constraints as ConstraintDSL;
        }

        this.logger.log(
          `使用DSL编译器注入了约束 (pace=${pace}): hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`
        );
        return;
      } catch (error) {
        this.logger.warn(`DSL编译失败，回退到旧逻辑: ${error instanceof Error ? error.message : String(error)}`);
        // 继续执行旧逻辑
      }
    }

    // 旧逻辑（向后兼容）
    const hardConstraints = constraints.hard || {};
    const softConstraints = constraints.soft || {};
    const objectives = constraints.objectives || {};

    // 根据 pace 调整约束值
    const paceMultiplier = this.getPaceMultiplier(pace);

    // 硬约束（违反就必须修复/降级）
    if (hardConstraints.maxDailyRapidAscentM !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.maxDailyRapidAscentM = hardConstraints.maxDailyRapidAscentM;
    }
    if (hardConstraints.maxSlopePct !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.maxSlopePct = hardConstraints.maxSlopePct;
    }
    if (hardConstraints.rapidAscentForbidden !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.rapidAscentForbidden = hardConstraints.rapidAscentForbidden;
    }
    if (hardConstraints.requiresPermit !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.requiresPermit = hardConstraints.requiresPermit;
    }
    if (hardConstraints.requiresGuide !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.requiresGuide = hardConstraints.requiresGuide;
    }

    // 软约束（尽量满足，超了就加惩罚）
    // 根据 pace 调整约束值
    if (softConstraints.maxDailyAscentM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 降低 30%, moderate: 不变, intense: 提高 20%
      policies.softConstraints.maxDailyAscentM = Math.round(
        softConstraints.maxDailyAscentM * paceMultiplier.ascent
      );
    }
    if (softConstraints.maxElevationM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 降低 20%, moderate: 不变, intense: 提高 10%
      policies.softConstraints.maxElevationM = Math.round(
        softConstraints.maxElevationM * paceMultiplier.elevation
      );
    }
    if (softConstraints.bufferTimeMin !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 增加缓冲时间 50%, moderate: 不变, intense: 减少缓冲时间 30%
      policies.softConstraints.bufferTimeMin = Math.round(
        softConstraints.bufferTimeMin * paceMultiplier.buffer
      );
    }

    // 目标函数权重（影响排序）
    if (objectives.preferViewpoints !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferViewpoints = objectives.preferViewpoints;
    }
    if (objectives.preferHotSpring !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferHotSpring = objectives.preferHotSpring;
    }
    if (objectives.preferPhotography !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferPhotography = objectives.preferPhotography;
    }

    // 兼容旧版本字段（如果没有新格式，使用旧格式）
    if (!constraints.hard && !constraints.soft) {
      if (constraints.maxElevationM) {
        policies.softConstraints = policies.softConstraints || {};
        policies.softConstraints.maxElevationM = Math.round(
          constraints.maxElevationM * paceMultiplier.elevation
        );
      }
      if (constraints.maxDailyAscentM) {
        policies.softConstraints = policies.softConstraints || {};
        policies.softConstraints.maxDailyAscentM = Math.round(
          constraints.maxDailyAscentM * paceMultiplier.ascent
        );
      }
      if (constraints.maxSlope) {
        policies.hardConstraints = policies.hardConstraints || {};
        policies.hardConstraints.maxSlopePct = constraints.maxSlope;
      }
      if (constraints.rapidAscentForbidden) {
        policies.hardConstraints = policies.hardConstraints || {};
        policies.hardConstraints.rapidAscentForbidden = constraints.rapidAscentForbidden;
      }
    }

    this.logger.log(
      `注入了约束 (pace=${pace}): hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`
    );
  }

  /**
   * 根据 pace 获取约束调整倍数
   */
  private getPaceMultiplier(pace: 'relaxed' | 'moderate' | 'intense'): {
    ascent: number;      // 爬升倍数
    elevation: number;   // 海拔倍数
    buffer: number;     // 缓冲时间倍数
  } {
    switch (pace) {
      case 'relaxed':
        return {
          ascent: 0.7,      // 降低 30%
          elevation: 0.8,   // 降低 20%
          buffer: 1.5,      // 增加 50%
        };
      case 'intense':
        return {
          ascent: 1.2,      // 提高 20%
          elevation: 1.1,   // 提高 10%
          buffer: 0.7,      // 减少 30%
        };
      case 'moderate':
      default:
        return {
          ascent: 1.0,
          elevation: 1.0,
          buffer: 1.0,
        };
    }
  }

  /**
   * 合并候选 POI
   */
  private mergeCandidatePois(state: TripWorldState, routePois: any[]): void {
    // 将路线方向的 POI 添加到每日候选池
    for (let i = 0; i < state.context.durationDays; i++) {
      const date = addDays(state.context.startDate, i);
      if (!state.candidatesByDate[date]) {
        state.candidatesByDate[date] = [];
      }

      // 添加路线方向的 POI（避免重复）
      for (const poi of routePois) {
        if (!state.candidatesByDate[date].find(c => c.id === poi.id)) {
          state.candidatesByDate[date].push(poi);
        }
      }
    }

    this.logger.log(`合并了 ${routePois.length} 个路线方向 POI 到候选池`);
  }

  /**
   * 计算一天的 terrainFacts（简化版，用于 E2E 测试）
   */
  private computeDayTerrainFacts(
    selectedRouteDirection: any,
    keptActivities: ActivityCandidate[],
    slots: PlanSlot[],
    routeSegmentation?: any
  ): PlanDay['terrainFacts'] {
    // 从 RouteDirection 约束中提取
    const constraints = selectedRouteDirection?.constraints || selectedRouteDirection?.routeDirection?.constraints;
    const maxElevation = constraints?.maxElevationM || constraints?.soft?.maxElevationM || constraints?.hard?.maxElevationM;
    const maxDailyAscent = constraints?.maxDailyAscentM || constraints?.soft?.maxDailyAscentM;

    // 从候选 POI 中提取海拔信息（如果有）
    let minElevation: number | undefined;
    let maxElevationFromPois: number | undefined;
    
    for (const activity of keptActivities) {
      // 假设 POI 的 metadata 中包含海拔信息
      const elevation = (activity as any).metadata?.elevationM || (activity as any).metadata?.altitudeM;
      if (elevation !== undefined) {
        if (minElevation === undefined || elevation < minElevation) {
          minElevation = elevation;
        }
        if (maxElevationFromPois === undefined || elevation > maxElevationFromPois) {
          maxElevationFromPois = elevation;
        }
      }
    }

    // P1.1.2: 如果存在拆段结果，优先使用拆段结果中的海拔信息
    if (routeSegmentation && routeSegmentation.elevationProfile && routeSegmentation.elevationProfile.length > 0) {
      const elevations = routeSegmentation.elevationProfile.map((p: any) => p.elevation);
      const segMaxElevation = Math.max(...elevations);
      const segMinElevation = Math.min(...elevations);
      
      // 使用拆段结果中的海拔信息（更准确）
      if (!maxElevationFromPois || segMaxElevation > maxElevationFromPois) {
        maxElevationFromPois = segMaxElevation;
      }
      if (!minElevation || segMinElevation < minElevation) {
        minElevation = segMinElevation;
      }
    }

    // 使用 RouteDirection 的 maxElevation 或从 POI/拆段结果中提取的
    const finalMaxElevation = maxElevation || maxElevationFromPois;

    // 计算简化的 totalAscent（基于 maxElevation 和 minElevation 的差值，或使用约束值）
    let totalAscent: number | undefined;
    if (maxDailyAscent) {
      totalAscent = maxDailyAscent;
    } else if (routeSegmentation) {
      // P1.1.2: 使用拆段结果中的总爬升（更准确）
      totalAscent = routeSegmentation.totalAscent;
    } else if (finalMaxElevation && minElevation) {
      totalAscent = finalMaxElevation - minElevation;
    }

    // 确定 effortLevel（基于约束或默认值）
    let effortLevel: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME' | undefined;
    if (maxDailyAscent && maxDailyAscent > 1000) {
      effortLevel = 'CHALLENGE';
    } else if (maxDailyAscent && maxDailyAscent > 500) {
      effortLevel = 'MODERATE';
    } else if (maxDailyAscent && maxDailyAscent <= 500) {
      effortLevel = 'RELAX';
    }

    // 生成风险标志（基于约束和拆段结果）
    const riskFlags: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];
    
    // 基础风险标志（基于约束）
    if (finalMaxElevation && finalMaxElevation > 3500) {
      riskFlags.push({
        type: 'HIGH_ALTITUDE',
        severity: 'HIGH',
        message: `最高海拔 ${finalMaxElevation}m，存在高反风险`,
      });
    }
    if (maxDailyAscent && maxDailyAscent > 500) {
      riskFlags.push({
        type: 'RAPID_ASCENT',
        severity: maxDailyAscent > 1000 ? 'HIGH' : 'MEDIUM',
        message: `每日爬升 ${maxDailyAscent}m，需注意适应`,
      });
    }

    // P1.1.2: 从拆段结果中添加风险标志
    if (routeSegmentation) {
      // 检查过陡段
      if (routeSegmentation.steepSections && routeSegmentation.steepSections.length > 0) {
        const highSeveritySteepSections = routeSegmentation.steepSections.filter(
          (s: any) => s.severity === 'HIGH'
        );
        if (highSeveritySteepSections.length > 0) {
          riskFlags.push({
            type: 'STEEP_SECTIONS',
            severity: 'HIGH',
            message: `路线包含 ${highSeveritySteepSections.length} 个高难度过陡段（平均坡度>25%）`,
          });
        } else {
          const mediumSeveritySteepSections = routeSegmentation.steepSections.filter(
            (s: any) => s.severity === 'MEDIUM'
          );
          if (mediumSeveritySteepSections.length > 0) {
            riskFlags.push({
              type: 'STEEP_SECTIONS',
              severity: 'MEDIUM',
              message: `路线包含 ${mediumSeveritySteepSections.length} 个中等难度过陡段（平均坡度>20%）`,
            });
          }
        }
      }

      // 检查强制休息点
      if (routeSegmentation.mandatoryRestPoints && routeSegmentation.mandatoryRestPoints.length > 0) {
        const highSeverityRestPoints = routeSegmentation.mandatoryRestPoints.filter(
          (r: any) => r.severity === 'HIGH'
        );
        if (highSeverityRestPoints.length > 0) {
          riskFlags.push({
            type: 'MANDATORY_REST_POINTS',
            severity: 'HIGH',
            message: `路线包含 ${highSeverityRestPoints.length} 个强制休息点（高海拔或连续上升>2000m）`,
          });
        }
      }

      // 检查体力断点
      if (routeSegmentation.energyBreakpoints && routeSegmentation.energyBreakpoints.length > 0) {
        riskFlags.push({
          type: 'ENERGY_BREAKPOINTS',
          severity: 'MEDIUM',
          message: `路线包含 ${routeSegmentation.energyBreakpoints.length} 个体力断点，建议合理安排休息`,
        });
      }
    }

    if (!finalMaxElevation && !totalAscent) {
      // 如果没有足够信息，返回 undefined（测试中会检查）
      return undefined;
    }

    return {
      maxElevation: finalMaxElevation,
      totalAscent,
      minElevation,
      effortLevel,
      riskFlags: riskFlags.length > 0 ? riskFlags : undefined,
    };
  }

  /**
   * 为合规降级过滤候选 POI 池
   * 移除需要许可/向导的 POI，只保留城市/轻线 POI
   */
  private filterPoolForComplianceDowngrade(pool: ActivityCandidate[]): ActivityCandidate[] {
    return pool.filter(candidate => {
      // 过滤掉高海拔、徒步、限制区域等类型的 POI
      const tags = candidate.intentTags || [];
      const category = (candidate as any).category || '';

      // 保留城市、文化、轻松类型的 POI
      const keepTags = ['城市', '文化', '博物馆', '餐厅', '购物', 'city', 'culture', 'museum', 'restaurant'];
      const excludeTags = ['徒步', '登山', '高海拔', '限制区域', 'hiking', 'mountaineering', 'high_altitude'];

      const hasKeepTag = keepTags.some(tag => 
        tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase())
      );
      const hasExcludeTag = excludeTags.some(tag => 
        tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase())
      );

      // 如果有保留标签且没有排除标签，则保留
      return hasKeepTag && !hasExcludeTag;
    });
  }

  /** Layer A world SSOT → `buildExecutionOverlay` 走廊可行性（与语义视图同一约束快照）。 */
  private worldConstraintSnapshotFromSignals(
    state: TripWorldState,
  ): WorldConstraintStoreSnapshot | undefined {
    return state.signals.executionSemanticView?.world?.constraints;
  }

  /**
   * `ENGINE_FULL_REBUILD` 归约后若已有 world.constraints，使 overlay / physics / DAG / IR 与该快照一致。
   * 无帧时走 ECO 物化路径（由 `ensureExecutionTruthOverlayForEco` 消费同一 snapshot）。
   */
  private mergeWorldOverlayIntoExecutionOverlayIfPresent(
    plan: TripPlan,
    state: TripWorldState,
  ): void {
    const worldSnapshot = this.worldConstraintSnapshotFromSignals(state);
    if (!worldSnapshot) {
      return;
    }

    if (!plan.temporal) {
      return;
    }

    const hadFrames = (state.signals.executionOverlayFrames?.length ?? 0) > 0;
    if (!hadFrames) {
      void this.ensureExecutionTruthOverlayForEco(state, plan);
      return;
    }

    this.hydrateFuelReachability(state, plan);

    const overlayFramesPass1 = augmentOverlayFramesWithPedestrianGaps(
      plan,
      buildExecutionOverlay({
        plan,
        weatherByDate: state.signals.weatherByDate,
        timeDrifts: plan.temporal.timeDrifts,
        crossDayShiftedSlotIds: plan.temporal.crossDayShiftedSlotIds,
        legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
        fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
        worldConstraintSnapshot: worldSnapshot,
      }),
      { persistSyntheticTravelLegsOnPlan: true },
    );

    this.attachRouteExecutionOverlaysToPlan(plan, state);

    assertOverlayOnly(plan, overlayFramesPass1, state.policies, 'TripDecisionEngine.worldOverlayMerge');

    let physicsIndexForRepair:
      | import('../physics/unified-physics-field-index.types').PhysicsFieldIndex
      | undefined;
    let framesForRepairPipeline = overlayFramesPass1;

    if (overlayFramesPass1.length > 0) {
      const legDatesPre = buildLegDateIndexFromPlan(plan);
      const physicsRowsPrePass = buildUnifiedPhysicsField({
        executionOverlayFrames: overlayFramesPass1,
        legDateByLegId: legDatesPre,
      });
      physicsIndexForRepair = buildPhysicsFieldIndex(physicsRowsPrePass);
      framesForRepairPipeline = applyPhysicsAuthorityToOverlayFrames(
        overlayFramesPass1,
        physicsIndexForRepair,
      );
    }

    const operationalDayWindow = state.signals.operationalDayWindow;

    if (framesForRepairPipeline.length > 0) {
      state.signals.overnightRestructuringPressures = deriveOvernightFromOverlay(
        plan,
        framesForRepairPipeline,
      );
    } else {
      this.applyOvernightRestructuringPressureSignals(state, plan, operationalDayWindow);
    }

    const dagForRepairEvaluator =
      framesForRepairPipeline.length > 0
        ? buildExecutionTruthDAG({ plan, overlayFrames: framesForRepairPipeline })
        : undefined;

    const executionIRPass1 = dagForRepairEvaluator
      ? compileDAGToIR(dagForRepairEvaluator)
      : undefined;

    const useIrExecutionTruth = Boolean(executionIRPass1 && dagForRepairEvaluator);

    const daylightFeasibility = state.signals.daylightFeasibility;

    const repairEvaluation = evaluateMinimalRepairs({
      plan,
      timeDrifts: plan.temporal.timeDrifts,
      unifiedConstraintGraph: plan.temporal.unifiedConstraintGraph,
      daylightFeasibility: useIrExecutionTruth ? undefined : daylightFeasibility,
      nightObservationFeasibility: useIrExecutionTruth
        ? undefined
        : state.signals.nightObservationFeasibility,
      opportunityMigrationEvaluations: state.signals.opportunityMigrationEvaluations,
      overnightRestructuringPressures: state.signals.overnightRestructuringPressures,
      legTemporalSafetyAssessments: state.signals.legTemporalSafetyAssessments,
      policies: state.policies,
      executionOverlayFrames: framesForRepairPipeline,
      executionTruthDAG: dagForRepairEvaluator,
      executionIR: executionIRPass1,
      fuelReachabilityByLegId: state.signals.fuelReachabilityByLegId,
      physicsFieldIndex: physicsIndexForRepair,
    });

    state.signals.executionOverlayFrames = stampOverlayAnnotationsFromSignals(
      plan,
      state,
      mergeRepairHintsIntoFrames(framesForRepairPipeline, repairEvaluation.repairs),
    );

    const stampedFrames = state.signals.executionOverlayFrames ?? [];
    if (stampedFrames.length === 0) {
      delete state.signals.unifiedPhysicsFieldByLegId;
      delete state.signals.physicsFieldIndex;
    } else {
      const legDates = buildLegDateIndexFromPlan(plan);
      const physicsRows = buildUnifiedPhysicsField({
        executionOverlayFrames: stampedFrames,
        legDateByLegId: legDates,
      });
      const physicsIndex = buildPhysicsFieldIndex(physicsRows);
      state.signals.physicsFieldIndex = physicsIndex;
      state.signals.unifiedPhysicsFieldByLegId = physicsIndex.byLegId;
      state.signals.executionOverlayFrames = applyPhysicsAuthorityToOverlayFrames(
        stampedFrames,
        physicsIndex,
      );
      if (
        typeof process !== 'undefined' &&
        process.env?.TRIP_PHYSICS_OVERLAY_CONSISTENCY === '1'
      ) {
        assertOverlayFieldConsistency(
          state.signals.executionOverlayFrames,
          physicsRows,
          'TripDecisionEngine.worldOverlayMerge.physicsConsistency',
        );
      }
    }

    state.signals.executionTruthDAG = buildExecutionTruthDAG({
      plan,
      overlayFrames: state.signals.executionOverlayFrames,
      temporalWindowsBySlot: state.signals.temporalExecutionWindowsBySlotId,
      repairs: repairEvaluation.repairs,
    });
    if (planHasInboundTravelLeg(plan)) {
      assertOnlyDAGIsDecisionSource(
        state.signals.executionTruthDAG,
        state.policies,
        'TripDecisionEngine.worldOverlayMerge',
      );
    }
    state.signals.executionIR = compileDAGToIR(state.signals.executionTruthDAG);
    assertIRCreatedOnlyByCompiler(state.signals.executionIR, 'TripDecisionEngine.worldOverlayMerge');

    if (
      repairEvaluation.repairs.length > 0 ||
      (repairEvaluation.overnightRestructuringProposals?.length ?? 0) > 0
    ) {
      state.signals.repairEvaluation = repairEvaluation;
    } else {
      delete state.signals.repairEvaluation;
    }
  }

  /**
   * 根据每日体力预算推断努力等级
   */
  private inferEffortLevel(budget: any): 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME' {
    const ratio = budget.totalEnergyCost / budget.maxEnergyCost;
    if (ratio >= 0.9) {
      return 'EXTREME';
    } else if (ratio >= 0.7) {
      return 'CHALLENGE';
    } else if (ratio >= 0.5) {
      return 'MODERATE';
    } else {
      return 'RELAX';
    }
  }
}

// minimal date helper (local date math: YYYY-MM-DD)
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

