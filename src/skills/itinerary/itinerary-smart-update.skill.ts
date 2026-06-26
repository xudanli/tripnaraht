/**
 * itinerary.smart_update — Composite Skill
 *
 * 编排：Verify →（可选 Neptune 空间建议）→ 由 issues 推导 adjustments → repair.apply
 * 部分失败：Apply 抛错时回退到 verify 后的行程快照（补偿语义）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import type { Itinerary, RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
import type { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { ItineraryVerifySkill, type ItineraryVerifyOutput } from './itinerary-verify.skill';
import { ItineraryTemporalOptimizeSkill } from './temporal-constraint-optimizer.skill';
import type { IcelandVehicleIntentHints } from './iceland-vehicle-terrain-arbitrator.util';
import { RepairApplySkill } from './repair-apply.skill';
import { DecisionNeptuneRepairSkill } from '../decision/decision-neptune-repair.skill';
import { mapVerifyIssuesToRequiredAdjustments } from './verify-issues-to-required-adjustments.util';
import { decomposeUserChangeIntentLite } from './user-change-intent-decompose-lite.util';

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item })),
    })),
  };
}

export interface ItinerarySmartUpdateInput extends SkillInput {
  itinerary: Itinerary;
  research_data?: Record<string, any>;
  /** 与 Gate / 用户意图对齐的额外调整，合并进 repair 输入 */
  extra_adjustments?: RequiredAdjustment[];
  alternatives?: {
    alternative_pois?: Array<{
      poi_id: string;
      name: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
    alternative_routes?: Array<{
      route_id: string;
      description: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
  };
  /** 为 true 时 VERIFY 的 WARNING 也会生成 adjustments */
  include_verify_warnings?: boolean;
  /** 同时提供时执行 decision.neptuneRepair（结果写入 telemetry，不直接合并到 Itinerary） */
  world?: WorldModelContext;
  route_plan_draft?: RoutePlanDraft;
  /** 打点 / 幂等键（当前仅透传到 telemetry） */
  idempotency_key?: string;
  /** 自然语言修改意图，供观测与后续 LLM 扩展 */
  user_change_intent?: string;
  /** 与 TripPlanRequest.constraints.vehicle_type 对齐；无 Booking 行时参与冰岛虚拟租车仲裁 */
  intent_hints?: IcelandVehicleIntentHints;
  /** 时间优化上下文（时区、睡眠锁定期覆盖等） */
  environment_context?: {
    timezone?: string;
    sleep_lock_start_min?: number;
    sleep_lock_end_min?: number;
  };
  party_profile?: {
    has_elderly?: boolean;
    has_children?: boolean;
    low_stamina?: boolean;
  };
}

export interface ItinerarySmartUpdatePhaseTelemetry {
  ok: boolean;
  duration_ms: number;
  error?: string;
}

export interface ItinerarySmartUpdateOutput extends SkillOutput {
  itinerary: Itinerary;
  verified: boolean;
  verify_summary?: { total_issues: number; error_count: number; warning_count: number; info_count?: number };
  adjustments: RequiredAdjustment[];
  repair?: {
    repaired: boolean;
    applied_fixes: Array<{ adjustment_type: string; target?: string; description: string }>;
  };
  telemetry: {
    verify: ItinerarySmartUpdatePhaseTelemetry;
    neptune?: ItinerarySmartUpdatePhaseTelemetry & {
      skipped_reason?: string;
      replacements_count?: number;
      philosophy_valid?: boolean;
    };
    apply: ItinerarySmartUpdatePhaseTelemetry;
    narrative: string;
    idempotency_key?: string;
    user_change_intent?: string;
    /** 轻量意图切片（无 LLM），便于压测与排障 */
    intent_bullets?: string[];
    intent_bullet_count?: number;
  };
  /** 内嵌 verify 的 issues（与独立 `itinerary.verify` 同形），供结构化面板消费 */
  verify_issues?: ItineraryVerifyOutput['issues'];
  /** 时间优化 changelog（itinerary.temporalOptimize） */
  temporal_changelog?: Array<{ action: string; item_id: string; day?: string; detail: string }>;
  needs_regeneration?: { reason: string; suggested_extra_days?: number };
  compensation?: {
    apply_failed: boolean;
    restored_to_post_verify_snapshot: boolean;
  };
}

@SkillDecorator({
  name: 'itinerary.smart_update',
  description:
    '一键改行程：验证可行性 →（可选）Neptune 空间修复建议 → 由校验问题推导调整并 repair.apply；含分阶段 telemetry 与 Apply 失败回退。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItinerarySmartUpdateSkill implements Skill<ItinerarySmartUpdateInput, ItinerarySmartUpdateOutput> {
  private readonly logger = new Logger(ItinerarySmartUpdateSkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.smart_update',
    description:
    '一键改行程：itinerary.temporalOptimize → itinerary.verify →（可选）decision.neptuneRepair → 推导 adjustments → repair.apply；支持部分失败回退与分阶段观测。',
    version: '1.0.0',
    category: 'trip',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: ['itinerary'],
      typeChecks: { itinerary: { type: 'object' } },
      extractors: {
        itinerary: {
          type: 'step',
          stepId: 'itinerary.generate',
          path: 'result.itinerary',
        },
      },
    },
  };

  constructor(
    private readonly itineraryVerify: ItineraryVerifySkill,
    private readonly repairApply: RepairApplySkill,
    @Optional() private readonly temporalOptimize?: ItineraryTemporalOptimizeSkill,
    @Optional() private readonly neptuneRepair?: DecisionNeptuneRepairSkill,
  ) {
    this.logger.log('[ItinerarySmartUpdateSkill] initialized');
  }

  async execute(input: ItinerarySmartUpdateInput): Promise<ItinerarySmartUpdateOutput> {
    const t0 = Date.now();
    const intentBullets = decomposeUserChangeIntentLite(input.user_change_intent);
    let working = cloneItinerary(input.itinerary);

    let temporalChangelog: ItinerarySmartUpdateOutput['temporal_changelog'];
    let needsRegeneration: ItinerarySmartUpdateOutput['needs_regeneration'];
    if (this.temporalOptimize) {
      try {
        const temporal = await this.temporalOptimize.execute({
          itinerary: working,
          party_profile: input.party_profile,
          environment_context: input.environment_context,
          tokenContext: input.tokenContext,
        });
        working = temporal.itinerary;
        temporalChangelog = temporal.changelog;
        needsRegeneration = temporal.needs_regeneration;
      } catch (e: any) {
        this.logger.warn(`itinerary.smart_update: temporalOptimize failed: ${e?.message ?? e}`);
      }
    }

    const verifyTelemetry: ItinerarySmartUpdatePhaseTelemetry = { ok: false, duration_ms: 0 };
    const applyTelemetry: ItinerarySmartUpdatePhaseTelemetry = { ok: false, duration_ms: 0 };
    let neptuneTelemetry:
      | (ItinerarySmartUpdatePhaseTelemetry & {
          skipped_reason?: string;
          replacements_count?: number;
          philosophy_valid?: boolean;
        })
      | undefined;

    let verifyResult: Awaited<ReturnType<ItineraryVerifySkill['execute']>> | undefined;
    const vStart = Date.now();
    try {
      verifyResult = await this.itineraryVerify.execute({
        itinerary: working,
        research_data: input.research_data,
        user_query: input.user_change_intent,
        intent_hints: input.intent_hints,
        tokenContext: input.tokenContext,
      });
      verifyTelemetry.ok = true;
    } catch (e: any) {
      verifyTelemetry.error = e?.message ?? String(e);
      this.logger.warn(`itinerary.smart_update: verify failed: ${verifyTelemetry.error}`);
    } finally {
      verifyTelemetry.duration_ms = Date.now() - vStart;
    }

    const verified = verifyResult?.verified ?? false;
    const verifySummary = verifyResult?.summary;

    // Neptune：仅当世界模型 + 路线草案齐全且服务存在时调用（输出不直接写回 Itinerary）
    if (input.world && input.route_plan_draft && this.neptuneRepair) {
      const nStart = Date.now();
      neptuneTelemetry = { ok: false, duration_ms: 0 };
      try {
        const neptuneOut = await this.neptuneRepair.execute({
          world: input.world,
          brokenPlan: input.route_plan_draft,
          issue: input.user_change_intent,
          tokenContext: input.tokenContext,
        });
        neptuneTelemetry.ok = true;
        neptuneTelemetry.replacements_count = neptuneOut.replacements?.length ?? 0;
        neptuneTelemetry.philosophy_valid = neptuneOut.philosophyCheck?.valid;
      } catch (e: any) {
        neptuneTelemetry.ok = false;
        neptuneTelemetry.error = e?.message ?? String(e);
        this.logger.warn(`itinerary.smart_update: neptune failed: ${neptuneTelemetry.error}`);
      } finally {
        neptuneTelemetry.duration_ms = Date.now() - nStart;
      }
    } else {
      neptuneTelemetry = {
        ok: true,
        duration_ms: 0,
        skipped_reason: !input.world
          ? 'missing_world'
          : !input.route_plan_draft
            ? 'missing_route_plan_draft'
            : !this.neptuneRepair
              ? 'neptune_skill_unavailable'
              : undefined,
      };
    }

    const fromIssues = verifyResult?.issues?.length
      ? mapVerifyIssuesToRequiredAdjustments(verifyResult.issues, {
          includeWarnings: input.include_verify_warnings === true,
        })
      : [];

    const adjustments: RequiredAdjustment[] = [...(input.extra_adjustments ?? []), ...fromIssues];

    const postVerifySnapshot = cloneItinerary(working);

    let finalItinerary = working;
    let repairBlock: ItinerarySmartUpdateOutput['repair'];
    let applyFailed = false;
    let restored = false;

    const aStart = Date.now();
    if (adjustments.length > 0) {
      try {
        const repairResult = await this.repairApply.execute({
          itinerary: working,
          adjustments,
          alternatives: input.alternatives ?? { alternative_pois: [], alternative_routes: [] },
          tokenContext: input.tokenContext,
        });
        applyTelemetry.ok = true;
        finalItinerary = repairResult.itinerary;
        repairBlock = {
          repaired: repairResult.repaired,
          applied_fixes: repairResult.applied_fixes,
        };
      } catch (e: any) {
        applyFailed = true;
        applyTelemetry.ok = false;
        applyTelemetry.error = e?.message ?? String(e);
        finalItinerary = postVerifySnapshot;
        restored = true;
        this.logger.warn(`itinerary.smart_update: repair.apply failed, restored post-verify snapshot: ${applyTelemetry.error}`);
      }
    } else {
      applyTelemetry.ok = true;
      repairBlock = { repaired: false, applied_fixes: [] };
    }
    applyTelemetry.duration_ms = Date.now() - aStart;

    const errN = verifyResult?.summary?.error_count ?? 0;
    const warnN = verifyResult?.summary?.warning_count ?? 0;
    const adjN = adjustments.length;
    const fixN = repairBlock?.applied_fixes?.length ?? 0;
    const reachMsgs =
      verifyResult?.issues
        ?.filter((i) => i.type === 'REACHABILITY_ISSUE')
        .map((i) => {
          const seg = i.violation?.entityRef?.id;
          return seg ? `${i.message} [segment=${seg}]` : i.message;
        })
        .filter(Boolean) ?? [];
    const reachTail = reachMsgs.length ? `; reachability: ${reachMsgs.join(' | ')}` : '';

    const narrative =
      `Verify: ${verifyTelemetry.ok ? (verified ? 'clean' : `${errN} errors, ${warnN} warnings`) : 'failed'}; ` +
      `Neptune: ${neptuneTelemetry?.skipped_reason ? `skipped (${neptuneTelemetry.skipped_reason})` : neptuneTelemetry?.ok ? 'ok' : 'failed'}; ` +
      `Adjustments: ${adjN}; Apply: ${applyTelemetry.ok ? (fixN ? `applied ${fixN}` : 'noop') : 'failed'}; ` +
      `intent_bullets=${intentBullets.length}; total ${Date.now() - t0}ms` +
      reachTail;

    return {
      itinerary: finalItinerary,
      verified,
      verify_summary: verifySummary,
      verify_issues: verifyResult?.issues,
      adjustments,
      repair: repairBlock,
      telemetry: {
        verify: verifyTelemetry,
        neptune: neptuneTelemetry,
        apply: applyTelemetry,
        narrative,
        idempotency_key: input.idempotency_key,
        user_change_intent: input.user_change_intent,
        intent_bullets: intentBullets.length ? intentBullets : undefined,
        intent_bullet_count: intentBullets.length,
      },
      ...(applyFailed ? { compensation: { apply_failed: true, restored_to_post_verify_snapshot: restored } } : {}),
      ...(temporalChangelog?.length ? { temporal_changelog: temporalChangelog } : {}),
      ...(needsRegeneration ? { needs_regeneration: needsRegeneration } : {}),
    };
  }
}
