/**
 * Skill/Action 输入准备（从 ClaudeOrchestrator 迁出）。
 */

import type {
  AgentContext,
  ExecutionStep,
} from '../interfaces/claude-orchestration.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { SkillInputIntentSnapshot } from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import type {
  OrchestrationStep,
  SubAgentType,
  TripPlanRequest,
} from '../interfaces/trip-plan.interface';
import { SKILL_VALIDATION_RULES } from '../services/skill-validation-rules.config';
import {
  collectRepairAlternativesFromStepResults,
  mergeRepairAlternativesBundles,
} from '../utils/collect-repair-alternatives-from-step-results.util';
import {
  mergeWorldBuildIntoResearchData,
  resolveNorwaySubregionForWorldBuild,
} from '../../skills/world/utils/world-model-production-guards.util';
import { rssRefinedItemsToSafetravelRouteAlerts } from '../../skills/world/safetravel-rss-to-route-verify-alerts.util';
import { hasValue } from './dag-validate-inputs.runner';
import type { PrepareSkillInputHost } from './prepare-skill-input.host';

export function skillValidationRequiresPlanState(skillName?: string): boolean {
  if (!skillName) return false;
  const rule = SKILL_VALIDATION_RULES[skillName];
  return !!rule?.dependencies?.some((d) => d.param === 'planState');
}

/** 从已执行步骤结果中提取最近一次出现的 planState（供编排链传递） */
export function extractPlanStateFromStepResults(results: Record<string, any>): PlanState | undefined {
  const keys = Object.keys(results);
  for (let i = keys.length - 1; i >= 0; i--) {
    const r = results[keys[i]];
    if (r && typeof r === 'object' && 'planState' in r && hasValue((r as any).planState)) {
      return (r as any).planState as PlanState;
    }
  }
  return undefined;
}

/**
 * 从用户消息中提取天数（轻量规则，与 INTAKE 解析一致思路；用于编排缺省 PlanState）
 */
export function extractDaysFromMessageForPlanBootstrap(message: string): number | undefined {
  if (!message) return undefined;
  const patterns = [/(\d+)\s*天/, /(\d+)\s*日/, /(\d+)\s*days?/i];
  for (const pattern of patterns) {
    const m = message.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 60) return n;
    }
  }
  const zh: Array<[RegExp, number]> = [
    [/七日|七天/, 7],
    [/六日|六天/, 6],
    [/五日|五天/, 5],
    [/四日|四天/, 4],
    [/三日|三天/, 3],
    [/两日|两天|二日|二天/, 2],
    [/一日|一天/, 1],
  ];
  for (const [re, val] of zh) {
    if (re.test(message)) return val;
  }
  return undefined;
}

export function mergeSkillOutputWithPlanStateInput(
  input: { planState?: PlanState } | null | undefined,
  result: any,
): any {
  if (
    input?.planState &&
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    !('planState' in result)
  ) {
    return { ...result, planState: input.planState };
  }
  return result;
}

export function mergePriorWorldBuildIntoResearchData(
  existing: Record<string, any> | undefined,
  results: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...(existing ?? {}) };
  for (const stepResult of Object.values(results)) {
    if (
      stepResult &&
      typeof stepResult === 'object' &&
      !Array.isArray(stepResult) &&
      (stepResult as any).world &&
      (stepResult as any).missingPieces !== undefined
    ) {
      mergeWorldBuildIntoResearchData(out, stepResult as any);
    }
  }
  return out;
}

export function mergePriorSafetravelIntoResearchData(
  existing: Record<string, any> | undefined,
  results: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...(existing ?? {}) };
  const collected: any[] = [];
  for (const stepResult of Object.values(results)) {
    if (!stepResult || typeof stepResult !== 'object' || Array.isArray(stepResult)) continue;
    if ('safetravel_alerts' in stepResult && Array.isArray((stepResult as any).safetravel_alerts)) {
      const pre = (stepResult as any).safetravel_alerts as unknown[];
      if (pre.length > 0) collected.push(...pre);
      continue;
    }
    const rss = (stepResult as any).rss_refined;
    if (Array.isArray(rss) && rss.length > 0) {
      collected.push(...rssRefinedItemsToSafetravelRouteAlerts(rss));
    }
  }
  const prior = Array.isArray(out.safetravel_alerts) ? out.safetravel_alerts : [];
  const merged = [...prior, ...collected];
  const byId = new Map<string, any>();
  for (const a of merged) {
    const id = typeof a?.id === 'string' && a.id.length > 0 ? a.id : JSON.stringify(a).slice(0, 120);
    byId.set(id, a);
  }
  out.safetravel_alerts = [...byId.values()];
  return out;
}

export function buildBootstrapPlanState(
host: PrepareSkillInputHost,
context: AgentContext,
request: RouteAndRunRequestDto,
): PlanState {
  const tripId = context.tripId || request.trip_id || undefined;
  const days =
    extractDaysFromMessageForPlanBootstrap(request.message || '') ??
    (/行程|路线|规划|出行|itinerary|route/i.test(request.message || '') ? 7 : 5);
  const countryHint = host.extractCountryCodeFromMessage(request.message || '');
  return {
    plan_id: `plan_${Date.now()}`,
    plan_version: 1,
    constraints: {
      time: { days },
      budget: {},
      fitness: {},
    },
    itinerary: {
      tripId: tripId || `trip_${Date.now()}`,
      routeDirectionId: `route_${Date.now()}`,
      segments: [],
    },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: {
      status: 'NEED_CONFIRM',
      reasons: ['编排引导初始状态'],
      missingEvidence: [],
    },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
    metadata: {
      ...(countryHint ? { destination: { country: countryHint } } : {}),
      orchestratorBootstrap: true,
    },
  };
}

export function prepareSkillInput(
  host: PrepareSkillInputHost,
  step: ExecutionStep,
  results: Record<string, any>,
  context: AgentContext,
  request: RouteAndRunRequestDto,
  intentSnapshot?: SkillInputIntentSnapshot,
): any {
  // 使用步骤中定义的输入，或从前面步骤的结果中提取
  let input: any = {};
  
  if (step.input) {
    // 替换结果引用（例如：${step1.result}）
    const inputStr = JSON.stringify(step.input);
    const processedInput = inputStr.replace(/\$\{(\w+)\}/g, (match, key) => {
      return results[key] ? JSON.stringify(results[key]) : match;
    });
    input = JSON.parse(processedInput);
  }
  
  // 从上下文和请求中提取实际值，替换占位符
  const actualTripId = context.tripId || request.trip_id;
  const actualUserId = context.userId || request.user_id;
  
  // 递归替换占位符
  input = replacePlaceholders(input, {
    tripId: actualTripId,
    trip_id: actualTripId,
    userId: actualUserId,
    user_id: actualUserId,
    requestId: context.requestId || request.request_id,
  });
  
  // 如果 input 中没有 tripId，但 context 中有，自动添加
  if (actualTripId && !input.tripId && !input.trip_id) {
    input.tripId = actualTripId;
  }
  
  // 为特定 Skills 提供智能默认值
  if (step.skillName === 'routeDirection.pickForIntent') {
    const optAny = (request.options ?? {}) as Record<string, unknown>;
    // 确保 userIntentTags 是数组
    if (!Array.isArray(input.userIntentTags)) {
      input.userIntentTags = input.userIntentTags ? [input.userIntentTags] : [];
    }
    
    // 如果没有 countryCode，尝试从请求中提取
    if (!input.countryCode && request.message) {
      const countryCode = host.extractCountryCodeFromMessage(request.message);
      if (countryCode) {
        input.countryCode = countryCode;
      }
    }
    
    // 如果没有 season，尝试从消息中提取日期，或使用当前月份作为默认值
    if (!input.season || typeof input.season !== 'number') {
      const extractedMonth = extractMonthFromMessage(request.message);
      if (extractedMonth) {
        input.season = extractedMonth;
      } else {
        // 使用当前月份作为默认值
        input.season = new Date().getMonth() + 1;
      }
    }

    const tpReq = optAny.trip_plan_request as TripPlanRequest | undefined;
    if (tpReq) {
      input.tripPlanRequest = tpReq;
    }
  }
  
  // 为 world.buildContext 提供智能默认值
  if (step.skillName === 'world.buildContext') {
    // 尝试从前面步骤的结果中提取 countryCode
    if (!input.countryCode || input.countryCode === 'none') {
      // 查找 routeDirection.pickForIntent 的结果
      for (const [stepId, stepResult] of Object.entries(results)) {
        if (stepResult && typeof stepResult === 'object') {
          // 方法1: 如果前面步骤返回了 routeDirectionId，可以从中提取国家代码
          if (stepResult.routeDirectionId && typeof stepResult.routeDirectionId === 'string') {
            // routeDirectionId 可能是 "default-IS-1" 这样的格式
            const match = stepResult.routeDirectionId.match(/default-([A-Z]{2})-\d+/);
            if (match) {
              input.countryCode = match[1];
              host.logger.debug(`从前面步骤 ${stepId} 的 routeDirectionId 提取 countryCode: ${input.countryCode}`);
              break;
            }
          }
          
          // 方法2: 如果前面步骤直接返回了 countryCode
          if (stepResult.countryCode && typeof stepResult.countryCode === 'string') {
            input.countryCode = stepResult.countryCode;
            host.logger.debug(`从前面步骤 ${stepId} 直接获取 countryCode: ${input.countryCode}`);
            break;
          }
        }
      }
    }
    
    // 如果还是没有 countryCode，尝试从用户消息中提取
    if ((!input.countryCode || input.countryCode === 'none') && request.message) {
      const countryCode = host.extractCountryCodeFromMessage(request.message);
      if (countryCode) {
        input.countryCode = countryCode;
        host.logger.debug(`从用户消息提取 countryCode: ${input.countryCode}`);
      }
    }
    
    // 清理无效值
    if (input.countryCode === 'none' || input.countryCode === 'undefined' || input.countryCode === 'null') {
      delete input.countryCode;
    }

    // Emergency constraint injection (auto-heal): pass through to world.buildContext so physical.roadStates can be overlaid.
    if ((request as any).emergency_constraints && !(input as any).emergency_constraints) {
      (input as any).emergency_constraints = (request as any).emergency_constraints;
    }
  }
  
  // 为 decision.runThreeGuardians 提供智能默认值
  if (step.skillName === 'decision.runThreeGuardians') {
    // 如果没有 world 和 tripId，尝试从前面步骤的结果中提取
    if (!input.world && !input.tripId) {
      // 查找 world.buildContext 的结果
      for (const [stepId, stepResult] of Object.entries(results)) {
        if (stepResult && typeof stepResult === 'object') {
          // 如果前面步骤返回了 world 字段
          if (stepResult.world) {
            input.world = stepResult.world;
            host.logger.debug(`从前面步骤 ${stepId} 提取 world 对象`);
            break;
          }
        }
      }
    }
    
    // 如果还是没有 world，但 context 中有 tripId，使用 tripId
    if (!input.world && !input.tripId && actualTripId) {
      input.tripId = actualTripId;
      host.logger.debug(`使用 context 中的 tripId: ${input.tripId}`);
    }
    
    // 注意：如果没有 world 和 tripId，不自动构建，让 skill 抛出错误，系统会统一返回澄清问题
    // 这样用户可以明确知道缺少什么信息
  }

  // PlanState 链：校验阶段 results 为空时也必须能通过 SKILL_VALIDATION_RULES；运行时从上一步合并（见 executePlan）
  if (step.skillName && skillValidationRequiresPlanState(step.skillName) && !hasValue(input.planState)) {
    const fromPrior = extractPlanStateFromStepResults(results);
    if (fromPrior) {
      input.planState = fromPrior;
    } else {
      input.planState = buildBootstrapPlanState(host, context, request);
    }
  }

  // plan.budget.estimateBaseline 还需要 destination；避免仅因缺省参数卡住校验
  if (step.skillName === 'plan.budget.estimateBaseline') {
    const dest = input.destination;
    const destEmpty =
      !dest ||
      (typeof dest === 'object' &&
        !hasValue(dest.country) &&
        !hasValue(dest.city) &&
        !hasValue((dest as any).region));
    if (destEmpty) {
      const cc = host.extractCountryCodeFromMessage(request.message || '');
      input.destination = {
        country: cc || undefined,
      };
    }
  }

  if (step.skillName === 'itinerary.smart_update') {
    if (!hasValue(input.itinerary)) {
      for (const stepResult of Object.values(results)) {
        if (
          stepResult &&
          typeof stepResult === 'object' &&
          !Array.isArray(stepResult) &&
          Array.isArray((stepResult as any).days) &&
          typeof (stepResult as any).request_id === 'string'
        ) {
          input.itinerary = stepResult as any;
          host.logger.debug('[Claude Orchestrator] smart_update: 从先前步骤结果注入 itinerary');
          break;
        }
      }
    }
    if (!input.user_change_intent && typeof request.message === 'string' && request.message.trim()) {
      input.user_change_intent = request.message.trim();
    }
  }

  if (step.skillName === 'itinerary.smart_update' || step.skillName === 'repair.apply') {
    const fromPrior = collectRepairAlternativesFromStepResults(results as Record<string, unknown>);
    const nPoi = fromPrior.alternative_pois.length;
    const nRt = fromPrior.alternative_routes.length;
    input.alternatives = mergeRepairAlternativesBundles(input.alternatives, fromPrior);
    if (nPoi > 0 || nRt > 0) {
      host.logger.debug(
        `[Claude Orchestrator] ${step.skillName}: merged prior-step alternatives (pois=${nPoi}, routes=${nRt})`,
      );
    }
  }

  if (
    step.skillName === 'itinerary.smart_update' ||
    step.skillName === 'itinerary.verify' ||
    step.skillName === 'itinerary.generate'
  ) {
    input.research_data = mergePriorSafetravelIntoResearchData(input.research_data, results);
    input.research_data = mergePriorWorldBuildIntoResearchData(input.research_data, results);
  }

  if (step.skillName === 'world.buildContext' && input.countryCode === 'NO' && !input.subregion) {
    const poiNames: string[] = [];
    for (const stepResult of Object.values(results)) {
      if (stepResult && typeof stepResult === 'object') {
        const names = (stepResult as any).poi_names ?? (stepResult as any).poiNames;
        if (Array.isArray(names)) poiNames.push(...names.map(String));
      }
    }
    const resolved = resolveNorwaySubregionForWorldBuild({
      countryCode: input.countryCode,
      userMessage: request.message,
      poiNames,
    });
    if (resolved) {
      input.subregion = resolved;
      host.logger.debug(`[Claude Orchestrator] world.buildContext: NO → subregion=${resolved} (keyword/explicit)`);
    }
  }

  if (step.skillName === 'worldState.summarize') {
    if (!input.world) {
      for (const stepResult of Object.values(results)) {
        if (stepResult && typeof stepResult === 'object' && (stepResult as any).world) {
          input.world = (stepResult as any).world;
          host.logger.debug('[Claude Orchestrator] worldState.summarize: 注入先前步骤的 world');
          break;
        }
      }
    }
  }

  if (step.skillName === 'policy.resolve') {
    for (const stepResult of Object.values(results)) {
      if (!stepResult || typeof stepResult !== 'object') continue;
      const sr = stepResult as Record<string, unknown>;
      if (!input.operationalWorldState && sr.operationalWorldState) {
        input.operationalWorldState = sr.operationalWorldState;
        host.logger.debug('[Claude Orchestrator] policy.resolve: 注入 operationalWorldState');
      }
      if (!input.operationalArbitration && sr.operationalArbitration) {
        input.operationalArbitration = sr.operationalArbitration;
        host.logger.debug('[Claude Orchestrator] policy.resolve: 注入 operationalArbitration');
      }
      if (input.operationalWorldState && input.operationalArbitration) {
        break;
      }
    }
  }

  if (step.skillName === 'itinerary.generate') {
    if (!input.executionPolicyHook) {
      for (const stepResult of Object.values(results)) {
        if (!stepResult || typeof stepResult !== 'object') continue;
        const sr = stepResult as Record<string, unknown>;
        if (sr.executionPolicyHook) {
          input.executionPolicyHook = sr.executionPolicyHook;
          host.logger.debug('[Claude Orchestrator] itinerary.generate: 注入 executionPolicyHook');
          break;
        }
      }
    }
  }

  // P0: Skills 内 LLM 打点 - 注入 tokenContext（skillName → state_machine_step 映射）
  const requestId = context.requestId || request.request_id;
  if (requestId && step.skillName) {
    const stateStep = mapSkillNameToStep(step.skillName);
    input.tokenContext = {
      request_id: requestId,
      state_machine_step: stateStep,
      sub_agent: mapSkillNameToSubAgent(step.skillName),
    };
  }

  if (intentSnapshot?.intent_hints && (step.skillName === 'itinerary.verify' || step.skillName === 'itinerary.smart_update')) {
    input.intent_hints = { ...intentSnapshot.intent_hints, ...(input.intent_hints ?? {}) };
  }

  return host.sanitizeOrchestrationHandoff(request, input);
}

export function mapSkillNameToStep(skillName?: string): OrchestrationStep {
  if (!skillName) return 'INTAKE';
  if (skillName === 'policy.resolve' || skillName === 'worldState.summarize' || skillName === 'readiness.assess') {
    return 'GATE_EVAL';
  }
  if (skillName.includes('gate') || skillName.includes('runThreeGuardians') || skillName.includes('precheck')) {
    return 'GATE_EVAL';
  }
  if (skillName.includes('itinerary.generate') || skillName.includes('plan.') || skillName.includes('architect') || skillName.includes('transit') || skillName.includes('budget') || skillName.includes('pace') || skillName.includes('constraints')) return 'PLAN_GEN';
  if (skillName === 'itinerary.smart_update') return 'REPAIR';
  if (skillName.includes('verify')) return 'VERIFY';
  if (skillName.includes('repair') || skillName.includes('alternatives')) return 'REPAIR';
  if (skillName.includes('narrate') || skillName.includes('explain')) return 'NARRATE';
  return 'RESEARCH'; // 默认
}

export function mapSkillNameToSubAgent(skillName?: string): SubAgentType {
  if (!skillName) return 'Planner';
  if (skillName.includes('gate')) return 'Gatekeeper';
  if (skillName === 'itinerary.smart_update') return 'LocalInsight';
  if (skillName.includes('narrate') || skillName.includes('explain')) return 'Narrator';
  return 'Planner';
}

export function extractMonthFromMessage(message: string): number | undefined {
  if (!message) {
    return undefined;
  }
  
  // 尝试匹配月份关键词
  const monthKeywords: Record<string, number> = {
    '一月': 1, '1月': 1, 'january': 1, 'jan': 1,
    '二月': 2, '2月': 2, 'february': 2, 'feb': 2,
    '三月': 3, '3月': 3, 'march': 3, 'mar': 3,
    '四月': 4, '4月': 4, 'april': 4, 'apr': 4,
    '五月': 5, '5月': 5, 'may': 5,
    '六月': 6, '6月': 6, 'june': 6, 'jun': 6,
    '七月': 7, '7月': 7, 'july': 7, 'jul': 7,
    '八月': 8, '8月': 8, 'august': 8, 'aug': 8,
    '九月': 9, '9月': 9, 'september': 9, 'sep': 9, 'sept': 9,
    '十月': 10, '10月': 10, 'october': 10, 'oct': 10,
    '十一月': 11, '11月': 11, 'november': 11, 'nov': 11,
    '十二月': 12, '12月': 12, 'december': 12, 'dec': 12,
  };
  
  const lowerMessage = message.toLowerCase();
  for (const [key, month] of Object.entries(monthKeywords)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      return month;
    }
  }
  
  // 尝试匹配日期格式（YYYY-MM-DD 或类似格式）
  const datePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const dateMatch = message.match(datePattern);
  if (dateMatch) {
    const month = parseInt(dateMatch[2], 10);
    if (month >= 1 && month <= 12) {
      return month;
    }
  }
  
  return undefined;
}

export function replacePlaceholders(input: any, replacements: Record<string, any>): any {
  if (typeof input === 'string') {
    // 替换常见的占位符文本
    const placeholderPatterns = [
      /需要从用户请求中提取/gi,
      /none/gi,
      /undefined/gi,
      /null/gi,
    ];
    
    let result = input;
    for (const pattern of placeholderPatterns) {
      if (pattern.test(result)) {
        // 如果包含占位符，尝试从 replacements 中获取值
        if (result.toLowerCase().includes('trip') && replacements.tripId) {
          result = replacements.tripId;
        } else if (result.toLowerCase().includes('user') && replacements.userId) {
          result = replacements.userId;
        } else if (result.toLowerCase().includes('request') && replacements.requestId) {
          result = replacements.requestId;
        }
      }
    }
    
    return result;
  } else if (Array.isArray(input)) {
    return input.map(item => replacePlaceholders(item, replacements));
  } else if (input && typeof input === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(input)) {
      // 特殊处理 tripId 相关字段
      if ((key === 'tripId' || key === 'trip_id') && 
          (typeof value === 'string' && 
           (value === 'none' || value === 'undefined' || value === 'null' || 
            value.includes('需要从用户请求中提取')))) {
        result[key] = replacements.tripId || replacements.trip_id;
      } else if ((key === 'userId' || key === 'user_id') && 
                 (typeof value === 'string' && 
                  (value === 'none' || value === 'undefined' || value === 'null'))) {
        result[key] = replacements.userId || replacements.user_id;
      } else {
        result[key] = replacePlaceholders(value, replacements);
      }
    }
    return result;
  }
  
  return input;
}

export function prepareActionInput(
  host: PrepareSkillInputHost,
  step: ExecutionStep,
  results: Record<string, any>,
  context: AgentContext,
  request: RouteAndRunRequestDto,
): any {
  return prepareSkillInput(host, step, results, context, request, undefined);
}
