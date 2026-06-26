/**
 * PlanningWorkbenchKernelBridgeService
 *
 * 将规划工作台 PlanState 与 Decision Kernel（DSO + Phase Executors）对齐。
 * 支持 legacy / shadow / native 三种模式（PLANNING_WORKBENCH_KERNEL_MODE）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { ConstraintReport, DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  GateResultLike,
  PhaseExecutorContext,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import type { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { GateStatus, PlanContext, PlanState, PlanSkeleton, OptionComparison } from '../../skills/plan/shared/plan-state.types';
import type { RoutePlanDraft, RouteSegment } from '../../trips/decision/shared/world-model.types';
import { PlanGateRunThreeGuardiansSkill } from '../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { DecisionRunThreeGuardiansSkill } from '../../skills/decision/decision-run-three-guardians.skill';
import { DecisionExplainForHumanSkill } from '../../skills/decision/decision-explain-for-human.skill';
import type { PersonaShellOutput } from './persona-shell.service';
import { buildPersonaPresentation } from './persona-lead-speaker.util';
import type { PlanningWorkbenchRequest } from './planning-workbench-agent.service';
import { FeatureFlagService } from './feature-flag.service';
import type {
  KernelShadowDiff,
  PlanningWorkbenchKernelBridgeInput,
  PlanningWorkbenchKernelGateOutcome,
  PlanningWorkbenchKernelMetadata,
  PlanningWorkbenchKernelMode,
  CompareKernelGateEvalResult,
  SkeletonOptionGateEvalDelta,
} from './planning-workbench-kernel-bridge.types';
import {
  computeBridgeSessionConsistencyScore,
  emitDecisionOsAuditReport,
} from '../contracts/decision-os-audit-emitter';

const GATE_SEVERITY: Record<GateStatus['status'], number> = {
  ALLOW: 0,
  NEED_CONFIRM: 1,
  SUGGEST_REPLACE: 2,
  REJECT: 3,
};

@Injectable()
export class PlanningWorkbenchKernelBridgeService {
  private readonly logger = new Logger(PlanningWorkbenchKernelBridgeService.name);

  constructor(
    @Optional() private readonly decisionKernel?: DecisionKernelService,
    @Optional() private readonly gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill,
    @Optional() private readonly decisionRunThreeGuardians?: DecisionRunThreeGuardiansSkill,
    @Optional() private readonly decisionExplainForHuman?: DecisionExplainForHumanSkill,
    @Optional() private readonly featureFlags?: FeatureFlagService,
  ) {}

  resolveMode(): PlanningWorkbenchKernelMode {
    const fromFlag = this.featureFlags?.getFlags().planningWorkbenchKernelMode;
    if (fromFlag) return fromFlag;
    const raw = (process.env.PLANNING_WORKBENCH_KERNEL_MODE ?? 'legacy').trim().toLowerCase();
    if (raw === 'shadow' || raw === 'native') return raw;
    return 'legacy';
  }

  isActive(): boolean {
    return this.resolveMode() !== 'legacy' && Boolean(this.decisionKernel);
  }

  /**
   * native 模式：Kernel GATE_EVAL + 始终 runThreeGuardians
   */
  async runNativeGatePipeline(
    input: PlanningWorkbenchKernelBridgeInput,
  ): Promise<PlanningWorkbenchKernelGateOutcome> {
    const requestId = input.requestId ?? `pwb-kernel-${randomUUID()}`;
    const { gateStatus, metadata, dso } = await this.executeKernelGateAndGuardians(
      input,
      requestId,
    );
    const audit = emitDecisionOsAuditReport(this.logger, {
      request_id: requestId,
      phase: 'PLANNING_WORKBENCH_NATIVE_GATE',
      terminal: true,
      dominant_cid: metadata.dominantCid ?? this.dominantCidFromGateStatus(gateStatus),
      session_consistency_score: this.sessionScoreFromGateStatus(gateStatus.status),
      delta_reason: 'aligned',
      delta_utility: 0,
      extra: { mode: 'native', gate_status: gateStatus.status },
    });
    return {
      gateStatus,
      confirmations: gateStatus.requiredUserConfirmations,
      metadata: {
        ...metadata,
        mode: 'native',
        requestId,
        decisionOsAudit: audit.audit_report,
      },
      dso,
    };
  }

  /**
   * shadow 模式：对比 legacy gate 与 kernel gate，不改变对外 gate 结果
   */
  async runShadowComparison(
    input: PlanningWorkbenchKernelBridgeInput,
    legacyGate: GateStatus,
    legacyGuardianTriggered: boolean,
  ): Promise<PlanningWorkbenchKernelMetadata> {
    const requestId = input.requestId ?? `pwb-shadow-${randomUUID()}`;
    const { gateStatus: kernelGate, metadata } = await this.executeKernelGateAndGuardians(
      input,
      requestId,
    );

    const shadowDiff = this.buildShadowDiff(
      legacyGate,
      kernelGate,
      legacyGuardianTriggered,
      true,
    );

    if (shadowDiff.diverged) {
      this.logger.warn(
        `[KernelBridge/shadow] gate diverged legacy=${legacyGate.status} kernel=${kernelGate.status} notes=${shadowDiff.notes.join('; ')}`,
      );
    } else {
      this.logger.debug(
        `[KernelBridge/shadow] gate aligned status=${legacyGate.status} requestId=${requestId}`,
      );
    }

    const severityGap = Math.abs(
      GATE_SEVERITY[legacyGate.status] - GATE_SEVERITY[kernelGate.status],
    );
    const audit = emitDecisionOsAuditReport(this.logger, {
      request_id: requestId,
      phase: 'PLANNING_WORKBENCH_SHADOW',
      terminal: true,
      dominant_cid:
        metadata.dominantCid ??
        (shadowDiff.diverged ? 'LEGACY_KERNEL_GATE_MISMATCH' : 'ALIGNED'),
      session_consistency_score: computeBridgeSessionConsistencyScore({
        diverged: shadowDiff.diverged,
        severityGap,
      }),
      delta_reason: shadowDiff.diverged ? 'legacy_kernel_gate_diverged' : 'aligned',
      delta_utility: shadowDiff.diverged ? -severityGap * 0.05 : 0,
      extra: { mode: 'shadow', shadow_diff: shadowDiff },
    });

    return {
      ...metadata,
      mode: 'shadow',
      requestId,
      shadowDiff,
      decisionOsAudit: audit.audit_report,
    };
  }

  /**
   * 用 DecisionLog 丰富 PersonaShell（P2 骨架：有日志则覆盖 narrative）
   */
  async enrichPersonasFromKernelLogs(
    personas: PersonaShellOutput | undefined,
    planState: PlanState,
  ): Promise<PersonaShellOutput | undefined> {
    const bridgeMeta = planState.metadata?.kernelBridge as PlanningWorkbenchKernelMetadata | undefined;
    const logs = bridgeMeta?.allLogs;
    if (!logs?.length || !this.decisionExplainForHuman) {
      return personas;
    }

    try {
      const explained = await this.decisionExplainForHuman.execute({
        decisionLog: logs,
        world: planState.world,
        tripId: planState.itinerary?.tripId,
      });

      if (!personas) {
        return personas;
      }

      const patchExplanation = (
        existing: PersonaShellOutput['personas']['abu'],
        narrative: string,
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
      ) => {
        if (!existing || !narrative || narrative.startsWith('暂无')) {
          return existing;
        }
        return {
          ...existing,
          explanation: narrative,
          evidence:
            existing.evidence.length > 0
              ? existing.evidence
              : explained.riskHighlights.slice(0, 2).map((r) => ({
                  source: `${persona} DecisionLog`,
                  excerpt: r.explanation,
                  relevance: r.risk,
                })),
        };
      };

      const patchedPersonas = {
        abu: patchExplanation(personas.personas.abu, explained.userFacingNarrative.abuSection, 'ABU'),
        drdre: patchExplanation(
          personas.personas.drdre,
          explained.userFacingNarrative.drdreSection,
          'DR_DRE',
        ),
        neptune: patchExplanation(
          personas.personas.neptune,
          explained.userFacingNarrative.neptuneSection,
          'NEPTUNE',
        ),
      };

      const presentation = buildPersonaPresentation({
        abu: patchedPersonas.abu
          ? {
              persona: 'ABU',
              icon: patchedPersonas.abu.icon,
              name: 'Abu',
              verdict: patchedPersonas.abu.verdict,
              explanation: patchedPersonas.abu.explanation,
            }
          : null,
        drdre: patchedPersonas.drdre
          ? {
              persona: 'DR_DRE',
              icon: patchedPersonas.drdre.icon,
              name: 'Dr.Dre',
              verdict: patchedPersonas.drdre.verdict,
              explanation: patchedPersonas.drdre.explanation,
            }
          : null,
        neptune: patchedPersonas.neptune
          ? {
              persona: 'NEPTUNE',
              icon: patchedPersonas.neptune.icon,
              name: 'Neptune',
              verdict: patchedPersonas.neptune.verdict,
              explanation: patchedPersonas.neptune.explanation,
            }
          : null,
      });

      return {
        ...personas,
        personas: patchedPersonas,
        presentation,
        consolidatedDecision: {
          ...personas.consolidatedDecision,
          summary: presentation.headline || explained.summary || personas.consolidatedDecision.summary,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[KernelBridge] enrichPersonas 跳过: ${msg}`);
      return personas;
    }
  }

  buildInitialDso(
    request: PlanningWorkbenchRequest,
    planState: PlanState,
    requestId: string,
  ): DecisionState {
    const ctx = request.context;
    const destinationLabel = this.formatDestination(ctx);

    return {
      userIntent: {
        destination: destinationLabel,
        days: ctx.days ?? planState.constraints.time.days,
        mode: this.mapTravelMode(ctx.travelMode ?? planState.constraints.travelMode),
        budget: ctx.constraints?.budget?.total ?? planState.constraints.budget?.total,
        constraints: {
          mustDo: ctx.mustDo,
          mustAvoid: ctx.mustAvoid,
          budget: planState.constraints.budget,
          fitness: planState.constraints.fitness,
        },
        preferences: {
          travelMode: ctx.travelMode,
          mustDo: ctx.mustDo,
        },
      },
      tripState: {
        planDraft: planState.itinerary,
        planVersion: planState.plan_version,
        budgetOverrun: planState.budget.overrun
          ? planState.budget.overrun.overrunAmount /
            Math.max(planState.constraints.budget?.total ?? 1, 1)
          : undefined,
      },
      environmentState: {
        countryCode: ctx.destination.country,
        routeDirectionId: planState.itinerary.routeDirectionId,
      },
      systemState: {
        requestId,
        currentPhase: 'GATE_EVAL',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
      travelOntologyState: request.tripId ? { tripId: request.tripId } : undefined,
      requestId,
    };
  }

  buildPhaseContext(
    request: PlanningWorkbenchRequest,
    planState: PlanState,
    requestId: string,
    tripRunId?: string | null,
  ): PhaseExecutorContext {
    const metadata = (request as PlanningWorkbenchRequest & { metadata?: Record<string, unknown> })
      .metadata;
    const destinationLabel = this.formatDestination(request.context);

    return {
      requestId,
      userId: typeof metadata?.userId === 'string' ? metadata.userId : undefined,
      tripPlanRequest: {
        destination: destinationLabel,
        days: request.context.days ?? planState.constraints.time.days,
        trip_id: request.tripId,
        total_budget: planState.constraints.budget?.total,
        budget: planState.constraints.budget,
        party: planState.constraints.companions?.count
          ? { count: planState.constraints.companions.count }
          : undefined,
        message: `规划工作台: ${destinationLabel}`,
      },
      researchData: planState.world ? { worldModel: planState.world } : undefined,
    };
  }

  gateResultToGateStatus(
    gateResult: GateResultLike,
    constraints?: ConstraintReport,
  ): GateStatus {
    const status = this.mapKernelGateResultToPlanStatus(gateResult.gate_result);
    const reasons: string[] = [];
    const missingEvidence: string[] = [];

    for (const v of gateResult.violations ?? []) {
      reasons.push(`${v.type}: ${v.detail}`);
    }
    for (const adj of gateResult.required_adjustments ?? []) {
      reasons.push(`${adj.action}: ${adj.why}`);
    }
    if (constraints && !constraints.feasible && reasons.length === 0) {
      reasons.push('约束引擎判定不可行');
    }

    if (gateResult.gate_result === 'NEED_USER_CONFIRM' && reasons.length === 0) {
      missingEvidence.push('kernel_gate_confirm');
    }

    return {
      status,
      reasons,
      missingEvidence,
      consolidatedVerdict:
        status === 'ALLOW' ? 'ALLOW' : status === 'REJECT' ? 'REJECT' : 'NEED_CONFIRM',
      requiredUserConfirmations:
        status === 'NEED_CONFIRM' ? reasons.slice(0, 5) : undefined,
    };
  }

  mapGuardiansOutputToGateStatus(
    guardians: Awaited<ReturnType<DecisionRunThreeGuardiansSkill['execute']>>,
  ): GateStatus {
    return {
      status: guardians.allowed ? 'ALLOW' : 'NEED_CONFIRM',
      reasons: [],
      missingEvidence: [],
      guardianResults: {
        abu: {
          verdict: guardians.abuResult.allowed ? 'ALLOW' : 'REJECT',
          evidence: guardians.abuResult.violations.map((v) => v.explanation ?? String(v)),
        },
        drdre: {
          verdict: guardians.drdreResult.adjusted ? 'ADJUST' : 'ALLOW',
          evidence: guardians.drdreResult.changes?.map((c) => c.reason ?? '') ?? [],
        },
        neptune: {
          verdict: guardians.neptuneResult.repaired ? 'REPLACE' : 'ALLOW',
          evidence: guardians.neptuneResult.replacements?.map((r) => r.explanation ?? '') ?? [],
        },
      },
      consolidatedVerdict: guardians.allowed ? 'ALLOW' : 'NEED_CONFIRM',
      requiredUserConfirmations: [],
    };
  }

  mergeGateStatuses(kernelGate: GateStatus, guardianGate: GateStatus): GateStatus {
    const status =
      GATE_SEVERITY[kernelGate.status] >= GATE_SEVERITY[guardianGate.status]
        ? kernelGate.status
        : guardianGate.status;

    const confirmations = [
      ...(kernelGate.requiredUserConfirmations ?? []),
      ...(guardianGate.requiredUserConfirmations ?? []),
    ];

    return {
      status,
      reasons: [...new Set([...kernelGate.reasons, ...guardianGate.reasons])],
      missingEvidence: [...new Set([...kernelGate.missingEvidence, ...guardianGate.missingEvidence])],
      guardianResults: guardianGate.guardianResults ?? kernelGate.guardianResults,
      consolidatedVerdict:
        status === 'ALLOW' ? 'ALLOW' : status === 'REJECT' ? 'REJECT' : 'NEED_CONFIRM',
      requiredUserConfirmations: confirmations.length ? [...new Set(confirmations)] : undefined,
    };
  }

  /**
   * P3: 对 compare 中的每个 skeleton option 并行执行 Kernel GATE_EVAL（+ native 时三人格）
   */
  async runCompareGateEvalForOptions(input: {
    request: PlanningWorkbenchRequest;
    planState: PlanState;
    options: PlanSkeleton[];
    tripRunId?: string | null;
    requestId?: string;
    llmRecommendedOptionId?: string;
  }): Promise<CompareKernelGateEvalResult | null> {
    if (!this.isActive() || !this.decisionKernel || input.options.length < 2) {
      return null;
    }

    const requestId = input.requestId ?? `pwb-compare-${randomUUID()}`;
    const includeGuardians = this.resolveMode() === 'native';

    const optionDeltas = await this.mapWithConcurrency(
      input.options,
      (option) =>
        this.evaluateSingleOptionGate(input, option, requestId, includeGuardians),
      3,
    );

    const recommendedByGate = this.rankOptionsByGate(optionDeltas);
    const recommendedDelta = optionDeltas.find((d) => d.optionId === recommendedByGate);
    const llmId = input.llmRecommendedOptionId;
    const diverges =
      Boolean(recommendedByGate && llmId && recommendedByGate !== llmId);

    const audit = emitDecisionOsAuditReport(this.logger, {
      request_id: requestId,
      phase: 'PLANNING_WORKBENCH_COMPARE',
      terminal: true,
      dominant_cid:
        recommendedDelta?.dominantCid ??
        (diverges ? 'KERNEL_LLM_COMPARE_MISMATCH' : 'ALIGNED'),
      session_consistency_score: computeBridgeSessionConsistencyScore({
        diverged: diverges,
        severityGap: diverges ? 2 : 0,
      }),
      delta_reason: diverges ? 'kernel_gate_override_llm' : 'aligned',
      delta_utility: diverges ? -0.1 : 0,
      intent_revision_flag: diverges,
      extra: {
        recommended_by_gate: recommendedByGate,
        llm_recommended: llmId,
        option_count: optionDeltas.length,
      },
    });

    return {
      optionDeltas,
      recommendedByGate,
      recommendedDominantCid: recommendedDelta?.dominantCid,
      divergesFromLlmRecommendation: diverges,
      llmRecommendedOptionId: llmId,
      appliedAt: new Date().toISOString(),
      decisionOsAudit: audit.audit_report,
    };
  }

  /**
   * 将 Kernel 门控增量合并进 LLM compare 结果
   */
  enrichComparisonWithGateDeltas(
    comparison: OptionComparison,
    kernelCompare: CompareKernelGateEvalResult,
    options?: { overrideRecommendation?: boolean },
  ): OptionComparison {
    const deltaMap = new Map(kernelCompare.optionDeltas.map((d) => [d.optionId, d]));
    const overrideRecommendation = options?.overrideRecommendation ?? false;

    const enrichedOptions = comparison.options.map((opt) => {
      const delta = deltaMap.get(opt.optionId);
      if (!delta) return opt;
      const gateHint = `[Kernel Gate: ${delta.gateStatus}, 违规 ${delta.violationCount}`;
      const cidHint = delta.dominantCid ? `, dominant_cid=${delta.dominantCid}` : '';
      const guardianHint =
        delta.guardiansAllowed === false
          ? '] [三人格: 未通过]'
          : delta.guardiansAllowed === true
            ? '] [三人格: 通过]'
            : ']';
      return {
        ...opt,
        summary: `${opt.summary} ${gateHint}${cidHint}${guardianHint}`.trim(),
        // 不修改 LLM scores — 门控增量仅通过 kernelGateEval + summary 注解呈现
      };
    });

    let recommendation = comparison.recommendation;
    const gateRecDelta = kernelCompare.recommendedByGate
      ? deltaMap.get(kernelCompare.recommendedByGate)
      : undefined;

    if (
      overrideRecommendation &&
      kernelCompare.recommendedByGate &&
      kernelCompare.divergesFromLlmRecommendation
    ) {
      const dominant = kernelCompare.recommendedDominantCid ?? gateRecDelta?.dominantCid ?? 'MIXED';
      const violations = gateRecDelta?.violationTypes?.join(',') || '无';
      recommendation = {
        optionId: kernelCompare.recommendedByGate,
        reason:
          `[Gate覆盖LLM推荐] dominant_cid=${dominant}；Kernel推荐 ${kernelCompare.recommendedByGate}（违规: ${violations}）。` +
          `原LLM推荐 ${comparison.recommendation?.optionId ?? '无'}：${comparison.recommendation?.reason ?? ''}`.trim(),
      };
    } else if (
      kernelCompare.recommendedByGate &&
      kernelCompare.divergesFromLlmRecommendation &&
      comparison.recommendation
    ) {
      const dominant = kernelCompare.recommendedDominantCid ?? 'MIXED';
      recommendation = {
        ...comparison.recommendation,
        reason: `${comparison.recommendation.reason} [Kernel门控更倾向 ${kernelCompare.recommendedByGate}, dominant_cid=${dominant}]`.trim(),
      };
    }

    return {
      ...comparison,
      options: enrichedOptions,
      recommendation,
      kernelGateEval: kernelCompare,
    };
  }

  skeletonToRoutePlanDraft(skeleton: PlanSkeleton, base: RoutePlanDraft): RoutePlanDraft {
    const segments: RouteSegment[] = (skeleton.dayThemes ?? []).map((theme) => {
      const dayPoi = skeleton.pois?.find((p) => p.day === theme.day);
      return {
        segmentId: `day_${theme.day}_segment_1`,
        dayIndex: theme.day - 1,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: {
          theme: theme.theme,
          description: theme.description,
          day: theme.day,
          skeletonId: skeleton.id,
          skeletonName: skeleton.name,
          ...(dayPoi?.accommodation && { accommodation: dayPoi.accommodation }),
          ...(dayPoi?.restaurants?.length && { restaurants: dayPoi.restaurants }),
          ...(dayPoi?.attractions?.length && { attractions: dayPoi.attractions }),
        },
      };
    });

    return {
      ...base,
      segments,
    };
  }

  private async executeKernelGateAndGuardians(
    input: PlanningWorkbenchKernelBridgeInput,
    requestId: string,
  ): Promise<{
    gateStatus: GateStatus;
    metadata: Omit<PlanningWorkbenchKernelMetadata, 'mode' | 'requestId' | 'shadowDiff'>;
    dso?: DecisionState;
  }> {
    if (!this.decisionKernel) {
      throw new Error('DecisionKernelService 未注入');
    }

    let dso = this.buildInitialDso(input.request, input.planState, requestId);
    const ctx = this.buildPhaseContext(
      input.request,
      input.planState,
      requestId,
      input.tripRunId,
    );

    let kernelGate: GateStatus;
    let kernelGateResult: GateResultLike['gate_result'] = 'ALLOW';
    let dominantCid: string | undefined;

    try {
      const outcome = await this.decisionKernel.executeGateEval(dso, ctx);
      dso = outcome.newState;
      kernelGateResult = outcome.gateResult.gate_result;
      kernelGate = this.gateResultToGateStatus(outcome.gateResult, outcome.constraints);
      dominantCid = this.pickDominantCid(outcome.gateResult.violations ?? []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[KernelBridge] executeGateEval 失败: ${msg}`);
      kernelGate = {
        status: 'NEED_CONFIRM',
        reasons: [`Kernel GATE_EVAL 异常: ${msg}`],
        missingEvidence: [],
      };
      kernelGateResult = 'NEED_USER_CONFIRM';
    }

    let guardianGate: GateStatus = {
      status: 'NEED_CONFIRM',
      reasons: ['三人格评审未执行'],
      missingEvidence: [],
    };
    let allLogs: DecisionLogEntry[] = [];
    let guardianDecisionSummary: string | undefined;

    if (this.decisionRunThreeGuardians) {
      try {
        const guardians = await this.decisionRunThreeGuardians.execute({
          world: input.planState.world,
          planCandidate: input.planState.itinerary,
          tripId: input.request.tripId,
        });
        guardianGate = this.mapGuardiansOutputToGateStatus(guardians);
        allLogs = guardians.allLogs ?? [];
        guardianDecisionSummary = guardians.decisionSummary.summary;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[KernelBridge] decision.runThreeGuardians 失败: ${msg}`);
        guardianGate.reasons.push(msg);
      }
    } else if (this.gateRunThreeGuardians) {
      try {
        const guardiansWrapped = await this.gateRunThreeGuardians.execute({
          planState: input.planState,
          tripId: input.request.tripId,
        });
        guardianGate = guardiansWrapped.gateStatus;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[KernelBridge] plan.gate.runThreeGuardians 失败: ${msg}`);
        guardianGate.reasons.push(msg);
      }
    }

    const merged = this.mergeGateStatuses(kernelGate, guardianGate);

    return {
      gateStatus: merged,
      dso,
      metadata: {
        kernelGateResult,
        guardianDecisionSummary,
        allLogs,
        dominantCid,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  private dominantCidFromGateStatus(gate: GateStatus): string {
    if (gate.status === 'REJECT') return 'GATE_REJECT';
    if (gate.status === 'NEED_CONFIRM') return 'GATE_NEED_CONFIRM';
    return 'ALIGNED';
  }

  private sessionScoreFromGateStatus(status: GateStatus['status']): number {
    switch (status) {
      case 'ALLOW':
        return 95;
      case 'NEED_CONFIRM':
        return 85;
      case 'SUGGEST_REPLACE':
        return 75;
      case 'REJECT':
        return 60;
      default:
        return 80;
    }
  }

  private buildShadowDiff(
    legacyGate: GateStatus,
    kernelGate: GateStatus,
    legacyGuardianTriggered: boolean,
    kernelGuardianRan: boolean,
  ): KernelShadowDiff {
    const notes: string[] = [];
    if (legacyGate.status !== kernelGate.status) {
      notes.push(`status: legacy=${legacyGate.status} kernel=${kernelGate.status}`);
    }
    if (legacyGuardianTriggered !== kernelGuardianRan) {
      notes.push(
        `guardians: legacyTriggered=${legacyGuardianTriggered} kernelRan=${kernelGuardianRan}`,
      );
    }
    const legacyReasons = new Set(legacyGate.reasons);
    const kernelOnly = kernelGate.reasons.filter((r) => !legacyReasons.has(r));
    if (kernelOnly.length) {
      notes.push(`kernel-only-reasons: ${kernelOnly.slice(0, 3).join(' | ')}`);
    }

    return {
      legacyStatus: legacyGate.status,
      kernelStatus: kernelGate.status,
      legacyGuardianTriggered,
      kernelGuardianRan,
      diverged: legacyGate.status !== kernelGate.status || legacyGuardianTriggered !== kernelGuardianRan,
      notes,
    };
  }

  private mapKernelGateResultToPlanStatus(
    gateResult: GateResultLike['gate_result'],
  ): GateStatus['status'] {
    switch (gateResult) {
      case 'ALLOW':
        return 'ALLOW';
      case 'BLOCK':
        return 'REJECT';
      case 'ADJUST_REQUIRED':
      case 'NEED_USER_CONFIRM':
        return 'NEED_CONFIRM';
      default:
        return 'NEED_CONFIRM';
    }
  }

  private formatDestination(ctx: PlanContext): string {
    const parts = [ctx.destination.city, ctx.destination.region, ctx.destination.country].filter(
      Boolean,
    );
    return parts.join(', ') || 'unknown';
  }

  private mapTravelMode(
    mode?: PlanContext['travelMode'],
  ): 'walk' | 'drive' | 'transit' | 'mixed' | undefined {
    switch (mode) {
      case 'self_drive':
        return 'drive';
      case 'public_transit':
        return 'transit';
      case 'walking':
        return 'walk';
      case 'mixed':
        return 'mixed';
      default:
        return undefined;
    }
  }

  private async evaluateSingleOptionGate(
    input: {
      request: PlanningWorkbenchRequest;
      planState: PlanState;
      tripRunId?: string | null;
    },
    skeleton: PlanSkeleton,
    requestId: string,
    includeGuardians: boolean,
  ): Promise<SkeletonOptionGateEvalDelta> {
    const optionPlanState: PlanState = {
      ...input.planState,
      itinerary: this.skeletonToRoutePlanDraft(skeleton, input.planState.itinerary),
    };

    const optionRequestId = `${requestId}:${skeleton.id}`;
    let dso = this.buildInitialDso(input.request, optionPlanState, optionRequestId);
    const ctx = this.buildPhaseContext(
      input.request,
      optionPlanState,
      optionRequestId,
      input.tripRunId,
    );

    let gateStatus: GateStatus['status'] = 'NEED_CONFIRM';
    let kernelGateResult: GateResultLike['gate_result'] = 'NEED_USER_CONFIRM';
    let violationTypes: string[] = [];
    let topReasons: string[] = [];
    let dominantCid: string | undefined;
    let l3Evidence: SkeletonOptionGateEvalDelta['l3Evidence'];

    try {
      const outcome = await this.decisionKernel!.executeGateEval(dso, ctx);
      dso = outcome.newState;
      kernelGateResult = outcome.gateResult.gate_result;
      const mapped = this.gateResultToGateStatus(outcome.gateResult, outcome.constraints);
      gateStatus = mapped.status;
      topReasons = mapped.reasons.slice(0, 5);
      const violations = outcome.gateResult.violations ?? [];
      violationTypes = violations
        .map((v) => String(v.type ?? ''))
        .filter(Boolean);
      dominantCid = this.pickDominantCid(violations);
      l3Evidence = violations.slice(0, 5).map((v) => ({
        cid: String(v.constraint ?? v.type ?? 'UNKNOWN'),
        detail: String(v.detail ?? ''),
        severity: v.severity,
        slack: typeof v.degree === 'number' ? v.degree : undefined,
        limit: v.severity === 'HARD' ? 0 : undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[KernelBridge/compare] option=${skeleton.id} gate failed: ${msg}`);
      topReasons = [`GATE_EVAL 异常: ${msg}`];
    }

    let guardiansAllowed: boolean | undefined;
    let expectedUtility: number | undefined;

    if (includeGuardians && this.decisionRunThreeGuardians) {
      try {
        const guardians = await this.decisionRunThreeGuardians.execute({
          world: optionPlanState.world ?? input.planState.world,
          planCandidate: optionPlanState.itinerary,
          tripId: input.request.tripId,
        });
        guardiansAllowed = guardians.allowed;
        expectedUtility = guardians.drdreResult.expectedUtility;
        if (!guardians.allowed && GATE_SEVERITY[gateStatus] < GATE_SEVERITY.NEED_CONFIRM) {
          gateStatus = 'NEED_CONFIRM';
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[KernelBridge/compare] option=${skeleton.id} guardians failed: ${msg}`);
      }
    }

    return {
      optionId: skeleton.id,
      optionName: skeleton.name,
      gateStatus,
      kernelGateResult,
      violationCount: violationTypes.length,
      violationTypes,
      topReasons,
      dominantCid,
      l3Evidence,
      guardiansAllowed,
      expectedUtility,
    };
  }

  private pickDominantCid(
    violations: Array<{ type?: string; severity?: string; constraint?: string }>,
  ): string | undefined {
    if (!violations.length) return undefined;
    const hard = violations.find((v) => v.severity === 'HARD');
    const top = hard ?? violations[0];
    return String(top.constraint ?? top.type ?? 'MIXED');
  }

  private rankOptionsByGate(deltas: SkeletonOptionGateEvalDelta[]): string | undefined {
    if (!deltas.length) return undefined;
    const sorted = [...deltas].sort((a, b) => {
      const statusDiff = GATE_SEVERITY[a.gateStatus] - GATE_SEVERITY[b.gateStatus];
      if (statusDiff !== 0) return statusDiff;
      if (a.violationCount !== b.violationCount) return a.violationCount - b.violationCount;
      const aGuard = a.guardiansAllowed === false ? 1 : 0;
      const bGuard = b.guardiansAllowed === false ? 1 : 0;
      if (aGuard !== bGuard) return aGuard - bGuard;
      return (b.expectedUtility ?? 0) - (a.expectedUtility ?? 0);
    });
    return sorted[0]?.optionId;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    limit: number,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = items.slice(i, i + limit);
      const batchResults = await Promise.all(batch.map(fn));
      results.push(...batchResults);
    }
    return results;
  }
}
