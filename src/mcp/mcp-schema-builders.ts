// src/mcp/mcp-schema-builders.ts
/**
 * MCP Schema Builders
 * 
 * 为每个 Skill 生成准确的 JSON Schema
 */

// MCP SDK 的高阶 API 期望 `inputSchema` 是 Zod raw shape / schema，而不是 JSON Schema。
// 如果传 JSON Schema，会触发 `v3Schema.safeParseAsync is not a function`。
import { z } from 'zod';

export function buildDemGetProfileSchema() {
  return {
    polyline: z
      .array(
        z.object({
          lat: z.number(),
          lng: z.number(),
        })
      )
      .describe('路线点数组（polyline）'),
    samples: z.number().optional().describe('采样间隔（米），默认 100'),
  };
}

export function buildDecisionAbuCheckSchema() {
  return {
    world: z.record(z.any()).describe('世界模型上下文（包含 physical, human, routeDirection）'),
    candidatePlan: z.record(z.any()).describe('候选计划'),
  };
}

export function buildDecisionDrdrePaceSchema() {
  return {
    world: z.record(z.any()).describe('世界模型上下文'),
    draftPlan: z.record(z.any()).describe('草案计划'),
  };
}

export function buildDecisionNeptuneRepairSchema() {
  return {
    world: z.record(z.any()).describe('世界模型上下文'),
    brokenPlan: z.record(z.any()).describe('损坏的计划'),
    issue: z.string().optional().describe('问题描述（可选）'),
  };
}

export function buildRouteDirectionPickForIntentSchema() {
  return {
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .describe('国家代码（ISO 3166-1 alpha-2）'),
    season: z.number().min(1).max(12).describe('季节（月份 1-12）'),
    userIntentTags: z.array(z.string()).describe('用户意图标签'),
    userIntent: z
      .object({
        preferences: z.array(z.string()).optional(),
        pace: z.enum(['relaxed', 'moderate', 'intense']).optional(),
        riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
        durationDays: z.number().optional(),
      })
      .partial()
      .optional()
      .describe('其他用户意图参数（可选）'),
  };
}

export function buildReadinessGenerateChecklistSchema() {
  return {
    world: z.record(z.any()).describe('世界模型上下文'),
    routeDirection: z.record(z.any()).optional().describe('路线方向（可选）'),
    userProfile: z
      .object({
        nationality: z.string().optional(),
        residencyCountry: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .partial()
      .optional()
      .describe('用户画像（可选）'),
    plan: z.record(z.any()).optional().describe('行程计划（可选）'),
  };
}

export function buildCountryPackNewSkeletonSchema() {
  return {
    countryCode: z.string().regex(/^[A-Z]{2}$/).describe('国家代码（ISO 3166-1 alpha-2）'),
    countryName: z.string().describe('国家名称'),
    countryNameCN: z.string().optional().describe('国家中文名称（可选）'),
    packType: z.enum(['readiness', 'routeDirection']).describe('Pack 类型'),
    regions: z.array(z.string()).optional().describe('区域列表（可选，用于 RouteDirection）'),
    supportedSeasons: z
      .array(
        z.enum([
          'polar_night',
          'polar_day',
          'shoulder',
          'winter',
          'summer',
          'rainy',
          'dry',
          'hurricane',
          'monsoon',
          'all',
        ])
      )
      .optional()
      .describe('支持的季节（可选，用于 ReadinessPack）'),
  };
}

export function buildCountryPackValidateSchema() {
  return {
    pack: z.record(z.any()).describe('Pack 数据（ReadinessPack 或 ImportCountryPackDto）'),
    packType: z.enum(['readiness', 'routeDirection']).describe('Pack 类型'),
  };
}

export function buildCountryPackGenerateRegressionTestsSchema() {
  return {
    pack: z.record(z.any()).describe('Pack 数据'),
    packType: z.enum(['readiness', 'routeDirection']).describe('Pack 类型'),
    testScenarios: z
      .array(
        z.object({
          name: z.string(),
          context: z.record(z.any()),
          expectedOutcomes: z.array(z.string()),
        })
      )
      .optional()
      .describe('测试场景（可选，默认生成标准场景）'),
  };
}

export function buildWorldBuildContextSchema() {
  return {
    tripId: z.string().optional().describe('行程 ID（如果有）'),
    countryCode: z.string().optional().describe('国家代码（ISO 3166-1 alpha-2）'),
    season: z.number().min(1).max(12).optional().describe('季节（月份 1-12）'),
    duration: z.number().positive().optional().describe('行程天数'),
    partyProfile: z
      .object({
        mobilityProfile: z.string().optional(),
        riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
        fitness: z.enum(['low', 'medium', 'high']).optional(),
        pace: z.enum(['relaxed', 'moderate', 'intense']).optional(),
      })
      .optional()
      .describe('团队画像'),
    routeDirectionId: z.string().optional().describe('路线方向 ID（可选）'),
  };
}

export function buildDecisionRunThreeGuardiansSchema() {
  return {
    tripId: z.string().optional().describe('行程 ID（如果有）'),
    world: z.record(z.any()).optional().describe('已构建的 WorldModelContext（可选）'),
    planCandidate: z.record(z.any()).describe('候选计划'),
  };
}

export function buildDecisionExplainForHumanSchema() {
  return {
    tripId: z.string().optional().describe('行程 ID（如果有）'),
    decisionLog: z
      .array(
        z.object({
          persona: z.string(),
          action: z.string(),
          explanation: z.string(),
          reasonCodes: z.array(z.string()).optional(),
          timestamp: z.string().optional(),
        })
      )
      .optional()
      .describe('决策日志（如果提供 tripId 会自动获取）'),
    world: z.record(z.any()).optional().describe('世界模型上下文（可选）'),
  };
}

export function buildReadinessSummarizeRisksSchema() {
  return {
    tripId: z.string().optional().describe('行程 ID（如果有）'),
    world: z.record(z.any()).optional().describe('世界模型上下文（可选）'),
    finalPlan: z.record(z.any()).optional().describe('最终计划（可选）'),
  };
}

export function buildRouteDirectionListForCountrySchema() {
  return {
    countryCode: z.string().regex(/^[A-Z]{2}$/).describe('国家代码（ISO 3166-1 alpha-2）'),
    season: z.number().min(1).max(12).optional().describe('季节（月份 1-12，可选）'),
    intentTags: z.array(z.string()).optional().describe('用户意图标签（可选）'),
    difficultyLevel: z.enum(['easy', 'medium', 'hard']).optional().describe('难度等级（可选）'),
  };
}

export function buildTripQuickEvaluateSchema() {
  return {
    tripId: z.string().describe('行程 ID'),
  };
}

export function buildCountryPackSuggestImprovementsSchema() {
  return {
    countryCode: z.string().regex(/^[A-Z]{2}$/).describe('国家代码（ISO 3166-1 alpha-2）'),
    packType: z.enum(['readiness', 'routeDirection']).describe('Pack 类型'),
    currentPackSnapshot: z.record(z.any()).describe('当前 Pack 快照'),
  };
}

export function buildReadinessCheckVisaWindowSchema() {
  return {
    tripMeta: z
      .object({
        departureCountryCode: z.string().regex(/^[A-Z]{2}$/).describe('出发国家代码'),
        destinationCountryCode: z.string().regex(/^[A-Z]{2}$/).describe('目的国家代码'),
        departureDate: z.string().describe('出发日期（ISO date string）'),
        returnDate: z.string().describe('返回日期（ISO date string）'),
        nationality: z.string().optional().describe('用户国籍（可选，默认 CN）'),
      })
      .describe('行程元数据'),
  };
}

export function getSchemaForSkill(skillName: string): any {
  const schemaMap: Record<string, () => any> = {
    'dem.getProfile': buildDemGetProfileSchema,
    'decision.abuCheck': buildDecisionAbuCheckSchema,
    'decision.drdrePace': buildDecisionDrdrePaceSchema,
    'decision.neptuneRepair': buildDecisionNeptuneRepairSchema,
    'decision.runThreeGuardians': buildDecisionRunThreeGuardiansSchema,
    'decision.explainForHuman': buildDecisionExplainForHumanSchema,
    'routeDirection.pickForIntent': buildRouteDirectionPickForIntentSchema,
    'routeDirection.listForCountry': buildRouteDirectionListForCountrySchema,
    'readiness.generateChecklist': buildReadinessGenerateChecklistSchema,
    'readiness.summarizeRisks': buildReadinessSummarizeRisksSchema,
    'readiness.checkVisaWindow': buildReadinessCheckVisaWindowSchema,
    'world.buildContext': buildWorldBuildContextSchema,
    'trip.quickEvaluate': buildTripQuickEvaluateSchema,
    'countryPack.suggestImprovements': buildCountryPackSuggestImprovementsSchema,
    'countryPack.newSkeleton': buildCountryPackNewSkeletonSchema,
    'countryPack.validate': buildCountryPackValidateSchema,
    'countryPack.generateRegressionTests': buildCountryPackGenerateRegressionTestsSchema,
  };

  const builder = schemaMap[skillName];
  if (!builder) {
    // 默认 schema（接受任意 object）
    return {};
  }

  return builder();
}

