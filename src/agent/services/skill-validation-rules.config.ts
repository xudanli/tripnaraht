// src/agent/services/skill-validation-rules.config.ts
/**
 * Skill 验证规则配置
 * 
 * 定义每个 skill 的输入参数验证规则
 * 用于在执行 plan 之前提前识别缺失参数
 */

import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';

export interface SkillValidationRule {
  /** 依赖关系：参数之间的依赖和替代关系 */
  dependencies?: Array<{
    param: string; // 参数名
    alternatives?: string[]; // 替代参数（如果这些参数存在，该参数可选）
  }>;
  /** 参数提取器：从 context/request 中提取参数 */
  extractors?: Record<string, (context: AgentContext, request: RouteAndRunRequestDto) => any>;
}

/**
 * Skill 验证规则配置
 * 
 * 每个 skill 的验证规则定义：
 * - dependencies: 定义参数之间的依赖和替代关系
 * - extractors: 定义如何从 context/request 中提取参数
 */
export const SKILL_VALIDATION_RULES: Record<string, SkillValidationRule> = {
  'decision.runThreeGuardians': {
    dependencies: [
      { param: 'world', alternatives: ['tripId'] },
      { param: 'tripId', alternatives: ['world'] },
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
    },
  },
  
  'world.buildContext': {
    dependencies: [
      { param: 'countryCode', alternatives: ['tripId'] },
      { param: 'tripId', alternatives: ['countryCode'] },
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
      countryCode: (_context, _request) => {
        // 从消息中提取 countryCode 的逻辑将在调用时注入
        return undefined;
      },
    },
  },
  
  'routeDirection.pickForIntent': {
    dependencies: [
      { param: 'countryCode' }, // 必需参数
    ],
    extractors: {
      countryCode: (_context, _request) => {
        // 从消息中提取 countryCode 的逻辑将在调用时注入
        return undefined;
      },
    },
  },
  
  'itinerary.generate': {
    dependencies: [
      { param: 'request' }, // 必需参数：TripPlanRequest
    ],
    // request 通常由 LLM 在 plan 编排时提供，这里只做基本检查
  },
  
  'itinerary.verify': {
    dependencies: [
      { param: 'itinerary' }, // 必需参数：Itinerary
    ],
    // itinerary 通常来自前面步骤（itinerary.generate）的结果
  },
  
  'transport.search': {
    dependencies: [
      { param: 'origin' }, // 必需参数
      { param: 'destination' }, // 必需参数
    ],
  },
  
  'poi.search': {
    dependencies: [
      { param: 'query' }, // 必需参数：搜索关键词
    ],
    // query 通常由 LLM 在 plan 编排时提供
  },
  
  'readiness.generateChecklist': {
    dependencies: [
      { param: 'world', alternatives: ['tripId'] }, // 需要 world 或 tripId
      { param: 'tripId', alternatives: ['world'] },
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
    },
  },
  
  'opening_hours.get': {
    dependencies: [
      { param: 'poi_ids' }, // 必需参数：POI ID 数组
    ],
    // poi_ids 通常由 LLM 在 plan 编排时提供，或来自前面步骤的结果
  },
  
  'repair.apply': {
    dependencies: [
      { param: 'itinerary' }, // 必需参数：Itinerary
      { param: 'adjustments' }, // 必需参数：RequiredAdjustment[]
    ],
    // itinerary 通常来自前面步骤（itinerary.generate）的结果
    // adjustments 通常来自前面步骤（itinerary.verify）的结果
  },
  
  'plan.gate.runThreeGuardians': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
    },
    // tripId 是可选的，但如果 planState.world 不存在，需要 tripId 来构建 world
  },
  
  'plan.gate.precheck': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
    ],
    // 用于快速门控检查
  },
  
  'plan.architect.generateSkeleton': {
    dependencies: [
      { param: 'context' }, // 必需参数：PlanContext
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
    },
    // tripId 和 world 是可选的，但如果需要构建世界模型，需要 tripId
  },
  
  'plan.budget.estimateBaseline': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
      { param: 'destination' }, // 必需参数：{ country?: string; city?: string }
    ],
    // destination 通常由 LLM 在 plan 编排时提供，或从 context 中提取
  },
  
  'plan.budget.detectOverrun': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
    ],
    // changes 是可选的
  },
  
  'plan.budget.proposeTradeoffs': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
      { param: 'targetSavings' }, // 必需参数：number
    ],
  },
  
  'geo.findNearbyPOI': {
    dependencies: [
      { param: 'location' }, // 必需参数：{ lat: number; lng: number }
      { param: 'radius' }, // 必需参数：number
    ],
  },
  
  'readiness.summarizeRisks': {
    dependencies: [
      { param: 'world', alternatives: ['tripId'] }, // 需要 world 或 tripId
      { param: 'tripId', alternatives: ['world'] },
    ],
    extractors: {
      tripId: (context, request) => context.tripId || request.trip_id,
    },
  },
  
  'plan.pace.computeTimeWindows': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
    ],
  },
  
  'plan.gate.proposeSafeAlternatives': {
    dependencies: [
      { param: 'planState' }, // 必需参数：PlanState
      { param: 'issue' }, // 必需参数：string
    ],
  },
  
  'dem.getProfile': {
    dependencies: [
      { param: 'polyline' }, // 必需参数：Array<{ lat: number; lng: number }>
    ],
    // samples 是可选的，默认 100
  },
  
  'routeDirection.listForCountry': {
    dependencies: [
      { param: 'countryCode' }, // 必需参数：string
    ],
    extractors: {
      countryCode: (_context, _request) => {
        // 从消息中提取 countryCode 的逻辑将在调用时注入
        return undefined;
      },
    },
    // season, intentTags, difficultyLevel 都是可选的
  },
};
