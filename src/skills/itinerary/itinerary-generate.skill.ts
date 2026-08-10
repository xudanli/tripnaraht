// src/skills/itinerary/itinerary-generate.skill.ts
/**
 * itinerary.generate Skill
 * 
 * 生成结构化行程草案
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripPlanRequest, ItineraryDay, ItineraryItem, GateResult } from '../../agent/interfaces/trip-plan.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { PlanningWorkbenchAgentService } from '../../agent/services/planning-workbench-agent.service';
import { IncrementalItineraryGeneratorService } from '../../agent/context-engine/services/incremental-itinerary-generator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { applyTripPoiEvidencePatch, loadTripPoiEvidencePatch } from './itinerary-trip-poi-hydration.util';
import { mergeItineraryAdjustPreserveNonTargetDays } from '../../agent/utils/itinerary-trip-neighbor-anchor-load.util';
import { injectCorridorDriveLegsIntoDays } from './itinerary-segment-tagger.util';
import { resolveSparsePoiDayAllocation } from '../../agent/context-engine/utils/sparse-poi-day-allocation.util';
import {
  buildOpeningHoursByPoiId,
  resolvePoiVisitWindow,
} from '../../agent/context-engine/utils/poi-visit-schedule.util';
import { buildSparseCatalogRestDayPoiSearchHints } from '../../agent/utils/research-poi-retrieval-geography-hint.util';
import { DateTime } from 'luxon';
import type { ResolvedPolicies } from '../runtime-os/types/runtime-os.types';
import {
  applyExecutionPolicyHookToItineraryDays,
  shouldSuppressCorridorDriveInjection,
  type ItineraryGovernanceApplyResult,
} from './itinerary-execution-policy-hook.util';
import type {
  ExecutionDecision,
  ItineraryGenerateResultType,
  PartialExecutionState,
} from '../../world/operational/execution-governance.contract';
import { composeExecutionDecision } from '../../world/operational/execution-governance.contract';
import {
  buildExecutionGovernanceMemoryRecord,
  type ExecutionGovernanceMemoryRecord,
} from '../../agent/memory/execution/build-execution-governance-memory.util';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { compactGovernanceSnapshot } from '../../governance/snapshot/compact-governance-snapshot.util';
import { validateGovernanceRecovery } from '../../governance/runtime-state-machine/validate-governance-recovery.util';
import { completeGovernanceRecoveryTransition } from '../../governance/runtime-state-machine/complete-governance-recovery-transition.util';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';

/** 环境状态（专利实施例 2：含替代航班等） */
export interface ItineraryGenerateEnvironmentState {
  flights?: Array<{ flight?: string; status?: string; price?: number }>;
}

export interface ItineraryGenerateInput extends SkillInput {
  request: TripPlanRequest;
  research_data?: Record<string, any>;
  gate_result?: GateResult;
  /** 环境状态（如 REPLAN 后的替代航班），供 Day1 行程使用 */
  environment_state?: ItineraryGenerateEnvironmentState;
  /** policy.resolve 的 executionPolicyHook；编排可从先前步骤自动注入 */
  executionPolicyHook?: NonNullable<ResolvedPolicies['executionPolicyHook']>;
}

export interface ItineraryGenerateOutput extends SkillOutput {
  request_id: string;
  days: ItineraryDay[];
  resultType: ItineraryGenerateResultType;
  partialExecutionState: PartialExecutionState;
  executionDecision: ExecutionDecision;
  /** decision.memory.execution — 供后续记忆管线消费 */
  executionGovernanceMemory?: ExecutionGovernanceMemoryRecord;
  metadata?: {
    total_days: number;
    total_cost_estimate?: number;
    robustness_score?: number;
    mode?: string;
    /** 当传入 executionPolicyHook 并由生成路径消费时为 true（兼容字段；控制面见 executionDecision） */
    execution_policy_hook_applied?: boolean;
  };
}

@SkillDecorator({
  name: 'itinerary.generate',
  description: '生成结构化 itinerary 草案（按天活动与交通骨架）。在 PLAN_GEN 阶段、RESEARCH 已完成且需首版行程时调用。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryGenerateSkill implements Skill<ItineraryGenerateInput, ItineraryGenerateOutput> {
  private readonly logger = new Logger(ItineraryGenerateSkill.name);

  metadata = {
    name: 'itinerary.generate',
    description: '生成结构化 itinerary 草案（按天活动与交通骨架）。在 PLAN_GEN 阶段、RESEARCH 已完成且需首版行程时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request'],
    },
  };

  constructor(
    @Optional() private readonly planningWorkbench?: PlanningWorkbenchAgentService,
    @Optional() private readonly incrementalGenerator?: IncrementalItineraryGeneratorService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly governanceLedger?: GovernanceLedgerStoreService,
  ) {
    this.logger.log(
      `[ItineraryGenerateSkill] 已初始化, incrementalGenerator=${!!incrementalGenerator}, prisma=${!!this.prisma}, governanceLedger=${!!this.governanceLedger}`,
    );
  }

  async execute(input: ItineraryGenerateInput): Promise<ItineraryGenerateOutput> {
    const requestId = (input.request as any).request_id ?? 'unknown';
    this.logger.debug(`执行 itinerary.generate: request_id=${requestId}`);

    try {
      const { request, research_data, gate_result, environment_state, executionPolicyHook } = input;

      const tripId =
        request.trip_id ??
        (request as { tripId?: string }).tripId ??
        request.ontology_context?.trip_id;
      let effectiveResearch = research_data;
      if (tripId && this.prisma) {
        try {
          const tripPatch = await loadTripPoiEvidencePatch(this.prisma, tripId);
          effectiveResearch = applyTripPoiEvidencePatch(research_data, tripPatch) ?? research_data;
          if (tripPatch) {
            this.logger.debug(`[itinerary.generate] 已合并 trip_id=${tripId} 的 TripDay/ItineraryItem 到 poi_evidence`);
          }
        } catch (e: any) {
          this.logger.warn(`[itinerary.generate] 读取 trip_id=${tripId} POI 失败，回退仅用 research_data: ${e?.message}`);
        }
      } else if (tripId && !this.prisma) {
        this.logger.warn(`[itinerary.generate] 请求含 trip_id=${tripId} 但 PrismaService 未注入，无法读取行程库 POI`);
      }

      // 分段规划 POC: 当 days >= 3 时使用 Day1→Day2→Day3 迭代生成
      const useIncremental =
        this.incrementalGenerator &&
        process.env.INCREMENTAL_ITINERARY_POC !== 'false';
      if (useIncremental) {
        const days = this.computeDays(request);
        if (days >= 3) {
          const planningText = [request.message, (request as { intake_user_message?: string }).intake_user_message]
            .filter(Boolean)
            .join('\n');
          const destHint =
            typeof request.destination === 'string' ? request.destination : planningText;
          const result = await this.incrementalGenerator.generateIncremental({
            request: { ...request, request_id: requestId } as TripPlanRequest,
            research_data: effectiveResearch,
            gate_result,
            environment_state,
            minDaysToTrigger: 3,
            sparsePoiDayAllocation: resolveSparsePoiDayAllocation(planningText, undefined, {
              countryCode:
                (request as { country_code?: string }).country_code ??
                request.ontology_context?.destination?.country_code,
              destinationHint: destHint,
            }),
            executionPolicyHook,
            governance_runtime_state: request.governance_runtime_state,
          });
          const adjustTargetIso =
            effectiveResearch?.__itinerary_full_trip_replan === true
              ? undefined
              : typeof effectiveResearch?.__itinerary_adjust_target_date_iso === 'string'
                ? effectiveResearch.__itinerary_adjust_target_date_iso
                : undefined;
          if (adjustTargetIso && tripId && this.prisma) {
            result.governanceApply.days = await mergeItineraryAdjustPreserveNonTargetDays(
              this.prisma,
              tripId,
              adjustTargetIso,
              result.governanceApply.days,
              requestId,
            );
          }
          return await this.finalizeGovernedOutput({
            request: { ...request, request_id: requestId } as TripPlanRequest,
            requestId,
            gov: result.governanceApply,
            hook: executionPolicyHook,
            gate_result,
            generator: 'incremental_itinerary_generator',
            metadata: {
              total_days: result.governanceApply.days.length,
              mode: result.mode,
              execution_policy_hook_applied: Boolean(executionPolicyHook),
              ...(adjustTargetIso ? { itinerary_adjust_target_date_iso: adjustTargetIso } : {}),
            },
          });
        }
      }

      // 1. 计算天数
      const days = this.computeDays(request);

      // 2. 获取起始日期
      let startDate: DateTime;
      if (request.date_range) {
        startDate = DateTime.fromISO(request.date_range.start_date);
      } else if (request.start_date) {
        startDate = DateTime.fromISO(request.start_date);
      } else {
        startDate = DateTime.now().plus({ days: 1 }); // 默认明天
      }

      // 3. 提取 POI 证据
      const poiEvidence = effectiveResearch?.poi_evidence;
      const pois = Array.isArray(poiEvidence) 
        ? poiEvidence 
        : (poiEvidence?.pois || []);

      // 4. 生成每日行程（时长/时间窗接证据；POI 偏稀时后置日留白并给检索提示）
      const itineraryDays: ItineraryDay[] = [];
      const itemsPerDay = pois.length === 0 ? 0 : Math.max(1, Math.ceil(pois.length / days));
      const openingHoursByPoi = buildOpeningHoursByPoiId(effectiveResearch);
      const planningText = [request.message, (request as { intake_user_message?: string }).intake_user_message]
        .filter(Boolean)
        .join('\n');

      // 专利实施例 2：替代航班（environment_state.flights）优先用于 Day1
      const scheduledFlights = (environment_state?.flights ?? []).filter(
        (f) => (f?.status ?? '').toLowerCase() === 'scheduled',
      );
      const firstFlight = scheduledFlights[0];
      const hasOriginDest =
        request.origin && request.destination && request.origin !== request.destination;

      for (let dayIndex = 0; dayIndex < days; dayIndex++) {
        const currentDate = startDate.plus({ days: dayIndex });
        const dayItems: ItineraryItem[] = [];

        // Day1 且有替代航班时，在首位加入航班行程项
        if (dayIndex === 0 && firstFlight?.flight && hasOriginDest) {
          dayItems.push({
            id: `${request.request_id}_day1_flight`,
            type: 'TRANSIT',
            start_window: '08:00',
            end_window: '14:00',
            location_ref: {
              name: `${request.origin} → ${request.destination}（${firstFlight.flight}）`,
            },
            evidence_refs: [],
            verified: false,
            verification_status: 'ASSUMPTION',
            metadata: { flight: firstFlight.flight, price: firstFlight.price },
          });
        }

        // 为每一天分配 POI（不循环复用：切片耗尽后留白）
        const startPoiIndex = dayIndex * itemsPerDay;
        const endPoiIndex = Math.min(startPoiIndex + itemsPerDay, pois.length);
        const dayPois = startPoiIndex < pois.length ? pois.slice(startPoiIndex, endPoiIndex) : [];
        let dayCursorMinutes = 9 * 60;

        for (let i = 0; i < dayPois.length; i++) {
          const poi = dayPois[i];
          const poiId = poi.poi_id || poi.id || `poi_${startPoiIndex + i}`;
          const poiName = poi.name || poi.nameCN || poi.nameEN || '未知地点';
          const poiCoords = poi.coordinates || (poi.lat && poi.lng ? { lat: poi.lat, lng: poi.lng } : undefined);

          const visit = resolvePoiVisitWindow({
            poi,
            slotIndex: i,
            poiId: String(poiId),
            openingHoursByPoi,
            dayCursorMinutes,
          });
          dayCursorMinutes = visit.nextDayCursorMinutes;

          const item: ItineraryItem = {
            id: `${request.request_id}_day${dayIndex + 1}_item${i + 1}`,
            type: 'POI',
            start_window: visit.startTime,
            end_window: visit.endTime,
            location_ref: {
              place_id: poiId,
              name: poiName,
              coordinates: poiCoords,
              address: poi.address,
            },
            evidence_refs: poi.evidence_id ? [poi.evidence_id] : [],
            verified: false,
            verification_status: 'UNVERIFIED',
            metadata: {
              duration_minutes: visit.durationMinutes,
              duration_source: visit.durationSource,
              time_source: visit.timeSource,
            },
          };

          dayItems.push(item);
        }

        // 无 POI：占位；稀疏目录后置日附建议检索
        if (dayItems.length === 0 || (dayItems.length === 1 && dayItems[0]?.type === 'TRANSIT')) {
          const sparseGap = pois.length > 0 && pois.length < days && startPoiIndex >= pois.length;
          const destStr = typeof request.destination === 'string' ? request.destination.trim() : 'destination';
          const suggestedQueries = sparseGap
            ? buildSparseCatalogRestDayPoiSearchHints({
                tripDestination: destStr,
                userMessage: planningText,
                dayNumber1Based: dayIndex + 1,
                totalDays: days,
              })
            : [];
          dayItems.push({
            id: `${request.request_id}_day${dayIndex + 1}_placeholder`,
            type: 'REST',
            start_window: '09:00',
            end_window: '18:00',
            location_ref: {
              name: '待安排',
            },
            ...(sparseGap
              ? {
                  notes:
                    '研究阶段参考点不足以铺满行程，本日留白；请补充检索后再排点。' +
                    (suggestedQueries.length
                      ? ` 建议检索：${suggestedQueries.slice(0, 3).join('；')}`
                      : ''),
                }
              : {}),
            evidence_refs: [],
            verified: false,
            verification_status: 'ASSUMPTION',
            ...(sparseGap
              ? {
                  metadata: {
                    placeholder_reason: 'sparse_poi_catalog_gap',
                    ...(suggestedQueries.length
                      ? { suggested_poi_search_queries: suggestedQueries }
                      : {}),
                  },
                }
              : {}),
          });
        }

        itineraryDays.push({
          date: currentDate.toISODate() || currentDate.toFormat('yyyy-MM-dd'),
          items: dayItems,
        });
      }

      // 5. 计算总成本估算（如果有预算信息）
      let totalCostEstimate: number | undefined;
      if (request.constraints?.budget?.total) {
        // 简单估算：将预算按天数分配
        totalCostEstimate = request.constraints.budget.total;
      }

      // 6. 计算鲁棒性评分
      const robustnessScore = this.calculateRobustnessScore(pois, gate_result, effectiveResearch);

      const suppressed = shouldSuppressCorridorDriveInjection(executionPolicyHook);
      const withDrives = suppressed
        ? itineraryDays
        : injectCorridorDriveLegsIntoDays(itineraryDays, request.request_id);
      const gov = applyExecutionPolicyHookToItineraryDays(withDrives, executionPolicyHook, suppressed);

      return await this.finalizeGovernedOutput({
        request,
        requestId: request.request_id,
        gov,
        hook: executionPolicyHook,
        gate_result,
        generator: 'itinerary.generate',
        metadata: {
          total_days: gov.days.length,
          total_cost_estimate: totalCostEstimate,
          robustness_score: robustnessScore,
          execution_policy_hook_applied: Boolean(executionPolicyHook),
        },
      });
    } catch (error: any) {
      this.logger.error(`itinerary.generate 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private async finalizeGovernedOutput(args: {
    request: TripPlanRequest;
    requestId: string;
    gov: ItineraryGovernanceApplyResult;
    hook: ItineraryGenerateInput['executionPolicyHook'];
    gate_result?: GateResult;
    generator: ExecutionGovernanceMemoryRecord['affectedGenerator'];
    metadata: ItineraryGenerateOutput['metadata'];
  }): Promise<ItineraryGenerateOutput> {
    const executionDecision = composeExecutionDecision(args.hook, args.gov);
    const executionGovernanceMemory =
      args.hook || args.gov.suppressionApplied
        ? buildExecutionGovernanceMemoryRecord({
            affectedGenerator: args.generator,
            hook: args.hook,
            suppressionApplied: args.gov.suppressionApplied,
            resultType: args.gov.resultType,
            partialExecutionState: args.gov.partialExecutionState,
            recoverySuggested: executionDecision.recoveryOptions,
          })
        : undefined;
    const out: ItineraryGenerateOutput = {
      request_id: args.requestId,
      days: args.gov.days,
      resultType: args.gov.resultType,
      partialExecutionState: args.gov.partialExecutionState,
      executionDecision,
      metadata: args.metadata,
      executionGovernanceMemory,
    };
    await this.tryCompleteGovernanceRecoveryClosure({
      request: args.request,
      requestId: args.requestId,
      gov: args.gov,
      gateResult: args.gate_result,
    });
    this.governanceLedger?.appendFromItineraryGenerate(args.request, {
      resultType: out.resultType,
      partialExecutionState: out.partialExecutionState,
      executionDecision: out.executionDecision,
      executionGovernanceMemory: out.executionGovernanceMemory,
    });
    return out;
  }

  /** RCC: RECOVERING → NORMAL after governed itinerary + RVL (single write authority). */
  private async tryCompleteGovernanceRecoveryClosure(args: {
    request: TripPlanRequest;
    requestId: string;
    gov: ItineraryGovernanceApplyResult;
    gateResult?: GateResult;
  }): Promise<void> {
    const tripId =
      args.request.trip_id ?? (args.request as { tripId?: string }).tripId ?? args.request.ontology_context?.trip_id;
    if (!this.governanceLedger || !tripId?.trim()) return;
    if (args.request.governance_runtime_state !== 'RECOVERING') return;
    if (args.gateResult?.gate_result === 'BLOCK') return;
    if (args.gov.resultType !== 'itinerary') return;

    let snap;
    try {
      const events = await this.governanceLedger.replayGovernanceTimeline(tripId.trim());
      snap = compactGovernanceSnapshot(events, { tripId: tripId.trim() });
    } catch (e: any) {
      this.logger.warn(`[RCC] replay snapshot failed trip_id=${tripId}: ${e?.message}`);
      return;
    }

    const validation = validateGovernanceRecovery({
      itineraryDays: args.gov.days,
      bannedCorridorRefs: [],
      activeWorldRiskHints: snap.latestWorldRisks,
      snapshotActiveRestrictions: snap.activeRestrictions,
    });

    const directive: RuntimeBranchDirective = {
      branchType: 'replanning',
      sourceActivationIds: ['governance.rcc.closure@v1'],
      replanningIntent: {
        trigger: 'execution_block',
        requiredActions: [],
        preservedConstraints: [],
        forbiddenStrategies: [],
        replanningScope: 'trip',
      },
    };

    const r = await completeGovernanceRecoveryTransition(this.governanceLedger, {
      tripId: tripId.trim(),
      requestId: args.requestId,
      validation,
      directiveForOutcome: directive,
    });
    if (r.applied) {
      this.logger.log(
        `[RCC] recovery closure applied trip_id=${tripId} resolved_blocks=${r.resolvedBlockIds.length} toState=${r.toState}`,
      );
    } else if (r.skipReason === 'rvl_not_clear_for_normal') {
      this.logger.debug(`[RCC] skipped (${r.skipReason}) trip_id=${tripId}`);
    }
  }

  /**
   * 计算行程天数
   */
  private computeDays(request: TripPlanRequest): number {
    if (request.days) return request.days;
    if (request.date_range) {
      const start = DateTime.fromISO(request.date_range.start_date);
      const end = DateTime.fromISO(request.date_range.end_date);
      return end.diff(start, 'days').days + 1;
    }
    if ((request as any).start_date) return (request as any).days || 5;
    return 5;
  }

  /**
   * 计算鲁棒性评分（0..1）
   */
  private calculateRobustnessScore(
    pois: any[],
    gateResult?: GateResult,
    researchData?: Record<string, any>,
  ): number {
    let score = 0.5; // 基础分

    // 有 POI 证据加分
    if (pois && pois.length > 0) {
      score += 0.2;
    }

    // 有交通证据加分
    if (researchData?.transport_evidence) {
      score += 0.1;
    }

    // 有开放时间证据加分
    if (researchData?.opening_hours_evidence) {
      score += 0.1;
    }

    // Gate 结果影响评分
    if (gateResult) {
      if (gateResult.gate_result === 'ALLOW') {
        score += 0.1;
      } else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
        score -= 0.1;
      } else if (gateResult.gate_result === 'BLOCK') {
        score -= 0.3;
      }
    }

    return Math.max(0, Math.min(1, score));
  }
}
