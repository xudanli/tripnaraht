import { Injectable } from '@nestjs/common';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import type { PolicyOverrideEvaluation, PolicyTraceEntry } from './policy-dsl.types';
import type { RoutePlanningPolicyOutcome } from './route-planning-policy.types';
import { RoutePlanningPolicyConfigService } from './route-planning-policy-config.service';

/**
 * P6 Control Plane：运行时仅依赖 Policy Configuration Plane 提供的参数（策略即数据 + 热评估）。
 */
@Injectable()
export class RoutePlanningPolicyEngineService {
  constructor(private readonly policyConfig: RoutePlanningPolicyConfigService) {}

  /**
   * Override 策略：是否绕过 RD selection 缓存。
   */
  evaluateOverrides(ctx: ExecutionPlanningContext | null): PolicyOverrideEvaluation {
    const active = this.policyConfig.getActiveParameters(ctx);

    if (!ctx) {
      return {
        bypassSelectionCache: false,
        trace: [],
        policyRevision: active.revision,
        policyConfigSources: active.sources,
        policyBundleId: active.activeBundleId,
        policyRoutingRuleId: active.activeRoutingRuleId,
      };
    }

    const trace: PolicyTraceEntry[] = [
      {
        ruleId: 'POLICY_CONFIG_ACTIVE_REVISION',
        kind: 'override',
        priority: 2,
        message: policyConfigTraceMessage(active),
      },
    ];

    if (ctx.tripId) {
      trace.push({
        ruleId: 'POLICY_OVERRIDE_BYPASS_CACHE_TRIP_BOUNDARY',
        kind: 'override',
        priority: 10,
        message:
          '存在 tripId（行程绑定）：覆盖默认缓存策略，强制刷新 RD selection 以纳入执行记忆。',
      });
    }

    if (ctx.tripExecutionHistory.length > 0) {
      trace.push({
        ruleId: 'POLICY_OVERRIDE_BYPASS_CACHE_TRIP_EXECUTION_HISTORY',
        kind: 'override',
        priority: 20,
        message: `Trip.metadata 含该国 ${ctx.tripExecutionHistory.length} 条决策执行摘要，禁用缓存以免陈旧排序。`,
      });
    }

    if (ctx.lastCountryDispatchFact) {
      trace.push({
        ruleId: 'POLICY_OVERRIDE_BYPASS_CACHE_WORLD_DISPATCH_SIGNAL',
        kind: 'override',
        priority: 30,
        message:
          '存在 country:{CC}:execution_route_dispatch_last 派生事实：覆盖缓存以对齐 World 执行信号。',
      });
    }

    const bypassSelectionCache = Boolean(
      ctx.tripId || ctx.tripExecutionHistory.length > 0 || ctx.lastCountryDispatchFact,
    );

    return {
      bypassSelectionCache,
      trace,
      policyRevision: active.revision,
      policyConfigSources: active.sources,
      policyBundleId: active.activeBundleId,
      policyRoutingRuleId: active.activeRoutingRuleId,
    };
  }

  /**
   * 对单次 RD 打分应用策略链（参数来自 Configuration Plane，每次调用热加载）。
   */
  apply(
    baseScore: number,
    routeDirectionId: string | number,
    planningContext: ExecutionPlanningContext | null,
  ): RoutePlanningPolicyOutcome {
    const active = this.policyConfig.getActiveParameters(planningContext);
    const cfg = active.params;
    const trace: PolicyTraceEntry[] = [
      {
        ruleId: 'POLICY_CONFIG_ACTIVE_REVISION',
        kind: 'override',
        priority: 2,
        message: policyConfigTraceMessage(active),
      },
    ];

    if (!planningContext) {
      return {
        score: Math.max(0, Math.round(baseScore * 100) / 100),
        excluded: false,
        appliedRuleIds: [],
        reasons: [],
        trace,
        policyRevision: active.revision,
        policyBundleId: active.activeBundleId,
        policyRoutingRuleId: active.activeRoutingRuleId,
      };
    }

    const key = String(routeDirectionId);
    const degradeCount = planningContext.hints.routeDegradeCountByRouteDirectionId[key] ?? 0;
    const ambient = Math.min(planningContext.hints.ambientDegradeEvents, cfg.ambientCap);

    const appliedRuleIds: string[] = [];
    const reasons: string[] = [];

    if (degradeCount >= cfg.excludeAtCount) {
      const msg = `硬约束：该 RD 在近期记录中出现 ${degradeCount} 次 ROUTE_DEGRADE（≥${cfg.excludeAtCount}），排除出 Top 候选。`;
      appliedRuleIds.push('POLICY_EXCLUDE_EXTREME_REPEATED_ROUTE_DEGRADE');
      reasons.push(msg);
      trace.push({
        ruleId: 'POLICY_EXCLUDE_EXTREME_REPEATED_ROUTE_DEGRADE',
        kind: 'hard_constraint',
        priority: 5,
        message: msg,
      });
      return {
        score: 0,
        excluded: true,
        appliedRuleIds,
        reasons,
        trace,
        policyRevision: active.revision,
        policyBundleId: active.activeBundleId,
        policyRoutingRuleId: active.activeRoutingRuleId,
      };
    }

    let s = baseScore;

    if (degradeCount > 0) {
      const softStacks = Math.min(degradeCount, cfg.softStackCap);
      s *= Math.pow(cfg.softFactorPerStack, softStacks);
      const msg = `软偏置：渐进 degrade（${degradeCount} 次记录），应用 ${softStacks} 档 ×${cfg.softFactorPerStack}。`;
      appliedRuleIds.push('POLICY_GRADUATED_SOFT_DEGRADE');
      reasons.push(msg);
      trace.push({
        ruleId: 'POLICY_GRADUATED_SOFT_DEGRADE',
        kind: 'soft_bias',
        priority: 50,
        message: msg,
      });
    }

    if (degradeCount > cfg.hardPenaltyAfterCount) {
      s *= cfg.hardMultiplier;
      const msg = `硬惩罚：degrade 次数 > ${cfg.hardPenaltyAfterCount}，额外 ×${cfg.hardMultiplier}。`;
      appliedRuleIds.push('POLICY_HARD_PENALTY_AFTER_THREE_DEGRADES');
      reasons.push(msg);
      trace.push({
        ruleId: 'POLICY_HARD_PENALTY_AFTER_THREE_DEGRADES',
        kind: 'hard_constraint',
        priority: 40,
        message: msg,
      });
    }

    if (ambient > 0) {
      s *= Math.pow(cfg.ambientFactor, ambient);
      const msg = `软偏置（环境）：国家级执行压力 ambient=${ambient}，×${cfg.ambientFactor}^${ambient}。`;
      appliedRuleIds.push('POLICY_AMBIENT_EXECUTION_STRESS');
      reasons.push(msg);
      trace.push({
        ruleId: 'POLICY_AMBIENT_EXECUTION_STRESS',
        kind: 'soft_bias',
        priority: 60,
        message: msg,
      });
    }

    const score = Math.max(0, Math.round(s * 100) / 100);

    return {
      score,
      excluded: false,
      appliedRuleIds,
      reasons,
      trace,
      policyRevision: active.revision,
      policyBundleId: active.activeBundleId,
      policyRoutingRuleId: active.activeRoutingRuleId,
    };
  }
}

function policyConfigTraceMessage(active: {
  revision: string;
  sources: string[];
  activeBundleId?: string;
  activeRoutingRuleId?: string;
  policyBundleSelectionReason?: string;
}): string {
  const bundle = active.activeBundleId ? `bundleId=${active.activeBundleId}; ` : '';
  const route = active.activeRoutingRuleId ? `routingRule=${active.activeRoutingRuleId}; ` : '';
  const sel = active.policyBundleSelectionReason ? `selection=${active.policyBundleSelectionReason}; ` : '';
  return `Configuration Plane：${bundle}${route}${sel}revision=${active.revision}；sources=[${active.sources.join(', ')}]`;
}
