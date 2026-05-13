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
        }),
      )
      .optional()
      .describe('路线点数组（≥2 点）；与 destination / origin 二选一或组合'),
    destination: z
      .union([z.string(), z.object({ lat: z.number(), lng: z.number() })])
      .optional()
      .describe('目的地坐标或含 "lat,lng" 的字符串（RESEARCH 链路）'),
    origin: z
      .union([z.string(), z.object({ lat: z.number(), lng: z.number() })])
      .optional()
      .describe('起点（与 destination 均为坐标时可连成剖面）'),
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

export function buildDecisionRequestApprovalSchema() {
  return {
    action: z.object({
      type: z.string().describe('操作类型'),
      description: z.string().describe('操作描述'),
      details: z.record(z.any()).describe('操作详情'),
    }),
    context: z.object({
      tripId: z.string().optional().describe('行程 ID'),
      userId: z.string().optional().describe('用户 ID'),
      decisionReason: z.string().optional().describe('决策原因'),
      alternatives: z.array(z.object({
        option: z.string(),
        description: z.string(),
        pros: z.array(z.string()).optional(),
        cons: z.array(z.string()).optional(),
      })).optional().describe('替代方案'),
    }).optional(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('风险等级'),
    required: z.boolean().optional().describe('是否必需'),
    expiresAt: z.string().optional().describe('审批过期时间（ISO 8601）'),
    autoApproveAfter: z.number().optional().describe('自动审批延迟（秒）'),
  };
}

export function buildDecisionCheckApprovalSchema() {
  return {
    approvalId: z.string().describe('审批 ID'),
  };
}

export function buildDecisionStageSchema() {
  return {
    tripId: z.string().optional().describe('Trip ID'),
    routeDirectionId: z.string().optional().describe('路线方向 ID'),
    countryCode: z.string().optional().describe('国家代码'),
    stage: z
      .enum([
        'ROUTE_PICK',
        'DEM_EVIDENCE',
        'ABU_GATE',
        'PACE_ADJUST',
        'SPATIAL_REPAIR',
        'READINESS',
        'FINALIZE',
      ])
      .optional()
      .describe('决策阶段过滤（可选）'),
    startDate: z.string().optional().describe('开始日期（ISO 8601）'),
    endDate: z.string().optional().describe('结束日期（ISO 8601）'),
    limit: z.number().optional().describe('返回数量限制'),
  };
}

export function buildDecisionReplaySchema() {
  return {
    caseId: z.string().optional().describe('E2E Case ID（可选，如果提供则从存储加载）'),
    testCase: z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        input: z.record(z.any()),
        expected: z.record(z.any()).optional(),
      })
      .optional()
      .describe('直接提供 E2E Case（如果 caseId 未提供）'),
    inputs: z
      .object({
        tripId: z.string().optional(),
        countryCode: z.string(),
        userProfile: z.record(z.any()),
        season: z.number().optional(),
        userQuery: z.string().optional(),
      })
      .optional()
      .describe('或者直接提供输入（简化版）'),
    expectedLogs: z.array(z.record(z.any())).optional().describe('可选的期望日志（用于 diff）'),
  };
}

export function buildContextCompilePackageSchema() {
  return {
    inputContext: z
      .object({
        userQuery: z.string().describe('用户请求'),
        planningPhase: z.string().optional().describe('规划阶段（可选）'),
        currentState: z
          .object({
            tripId: z.string().optional(),
            phase: z.string().optional(),
            agent: z.string().optional(),
            constraints: z.array(z.string()).optional(),
          })
          .optional()
          .describe('当前状态（可选）'),
        constraints: z.array(z.string()).optional().describe('约束列表（可选）'),
      })
      .describe('输入上下文'),
    options: z
      .object({
        enableCompression: z.boolean().optional().describe('是否启用压缩（默认 false）'),
        enableEvaluation: z.boolean().optional().describe('是否启用评估（默认 false）'),
        enableToolSelection: z.boolean().optional().describe('是否启用工具选择（默认 true）'),
        maxTokens: z.number().optional().describe('最大 token 数（可选）'),
        targetCompressionRatio: z.number().min(0).max(1).optional().describe('目标压缩比（0-1，可选）'),
        tokenBudget: z.number().optional().describe('Token 预算（用于 context-build，默认 3600）'),
        includePrivate: z.boolean().optional().describe('是否包含私有块（用于 context-build，默认 false）'),
      })
      .optional()
      .describe('编译选项'),
  };
}

export function buildGeoFindNearbyPOISchema() {
  return {
    location: z
      .object({
        lat: z.number().min(-90).max(90).describe('纬度'),
        lng: z.number().min(-180).max(180).describe('经度'),
      })
      .describe('位置'),
    radius: z.number().positive().describe('搜索半径（米）'),
    category: z
      .array(
        z.enum(['RESTAURANT', 'ATTRACTION', 'SHOPPING', 'HOTEL', 'NATURE', 'VIEWPOINT', 'HISTORIC_SITE']),
      )
      .optional()
      .describe('POI 类别过滤（可选）'),
    filters: z
      .object({
        minRating: z.number().min(0).max(5).optional().describe('最小评分'),
        hasOpeningHours: z.boolean().optional().describe('是否有营业时间信息'),
        paymentMethods: z.array(z.string()).optional().describe('支持的支付方式'),
      })
      .optional()
      .describe('额外过滤条件（可选）'),
    limit: z.number().positive().max(100).optional().describe('返回数量限制（默认 50，最大 100）'),
  };
}

export function buildGeoSampleElevationProfileSchema() {
  return {
    polyline: z
      .array(
        z.object({
          lat: z.number().min(-90).max(90).describe('纬度'),
          lng: z.number().min(-180).max(180).describe('经度'),
        }),
      )
      .min(2)
      .describe('路线点数组（polyline）'),
    samplingInterval: z.number().positive().max(1000).optional().describe('采样间隔（米），默认 100，最大 1000'),
    maxSamples: z.number().positive().max(5000).optional().describe('最大采样点数量（默认 1000，最大 5000）'),
  };
}

export function buildHitlCreateApprovalTaskSchema() {
  return {
    taskType: z
      .enum(['DECISION_REJECT', 'PLAN_REPLACEMENT', 'RISK_CONFIRMATION', 'CUSTOM'])
      .describe('任务类型'),
    title: z.string().describe('任务标题'),
    description: z.string().describe('任务描述'),
    payload: z
      .object({
        decisionLogId: z.string().optional().describe('关联的决策日志 ID（可选）'),
        tripId: z.string().optional().describe('Trip ID（可选）'),
        routeDirectionId: z.string().optional().describe('路线方向 ID（可选）'),
        context: z.record(z.any()).describe('审批上下文'),
      })
      .describe('任务负载'),
    options: z
      .object({
        required: z.boolean().optional().describe('是否必需（默认 true）'),
        expiresAt: z.string().optional().describe('过期时间（ISO 8601 格式）'),
        notifyChannels: z.array(z.string()).optional().describe('通知渠道'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('优先级'),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('风险等级'),
        threadId: z.string().optional().describe('会话/线程 ID（用于 Agent 恢复上下文）'),
        toolCallId: z.string().optional().describe('LLM 工具调用的 ID（用于回填结果）'),
      })
      .optional()
      .describe('选项'),
  };
}

export function buildHitlResolveApprovalTaskSchema() {
  return {
    taskId: z.string().describe('任务 ID'),
    action: z.enum(['approve', 'reject', 'request_changes']).describe('操作：approve / reject / request_changes'),
    feedback: z.string().optional().describe('用户反馈（可选）'),
    userId: z.string().optional().describe('审批人 ID（可选）'),
  };
}

export function buildRoutePackNewSkeletonSchema() {
  return {
    routeDirectionId: z.number().optional().describe('路线方向 ID（可选）'),
    routeDirectionUuid: z.string().optional().describe('路线方向 UUID（可选）'),
    countryCode: z.string().length(2).describe('国家代码（ISO 3166-1 alpha-2）'),
    routeDirectionName: z.string().optional().describe('路线方向名称（如果未提供 routeDirectionId）'),
    routeDirectionNameCN: z.string().optional().describe('路线方向中文名称（可选）'),
    routeDirectionNameEN: z.string().optional().describe('路线方向英文名称（可选）'),
    version: z.string().optional().describe('Pack 版本（默认 "1.0.0"）'),
  };
}

export function buildRoutePackValidateSchema() {
  return {
    pack: z
      .object({
        metadata: z
          .object({
            packId: z.string(),
            routeDirectionId: z.number().optional(),
            routeDirectionUuid: z.string().optional(),
            countryCode: z.string(),
            version: z.string(),
            lastVerifiedAt: z.string(),
          })
          .describe('Pack 元数据'),
        blocks: z
          .array(
            z.object({
              blockId: z.string(),
              type: z.enum(['constraint', 'preference', 'safety', 'logistics', 'seasonality', 'risk']),
              content: z.string(),
              evidence: z.array(z.any()).optional(),
              source: z.string().optional(),
              lastVerifiedAt: z.string().optional(),
              metadata: z.record(z.any()).optional(),
            }),
          )
          .describe('Pack 块列表'),
      })
      .describe('RoutePack 数据'),
  };
}

export function buildRoutePackGenerateRegressionTestsSchema() {
  return {
    pack: z
      .object({
        metadata: z.any(),
        blocks: z.array(z.any()),
      })
      .describe('RoutePack 数据'),
    testScenarios: z
      .array(
        z.object({
          name: z.string(),
          context: z.object({
            countryCode: z.string(),
            season: z.number().min(1).max(12).optional(),
            userProfile: z
              .object({
                pacePreference: z.enum(['SLOW', 'MEDIUM', 'FAST']).optional(),
                altitudeTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
                riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
              })
              .optional(),
          }),
          expectedOutcomes: z.array(z.string()).optional(),
        }),
      )
      .optional()
      .describe('测试场景（可选，默认生成标准场景）'),
  };
}

export function buildGeoFindCandidateWithinCorridorSchema() {
  return {
    originalLocation: z
      .object({
        lat: z.number().min(-90).max(90).describe('纬度'),
        lng: z.number().min(-180).max(180).describe('经度'),
      })
      .describe('原始位置'),
    corridorGeom: z
      .union([z.string(), z.any()])
      .describe('路线走廊几何（WKT 格式或 PostGIS geometry）'),
    countryCode: z.string().length(2).describe('国家代码（ISO 3166-1 alpha-2）'),
    bufferRadius: z.number().min(1).max(50000).optional().describe('缓冲半径（米，默认 20000m，最大 50000m）'),
    candidateType: z.enum(['POI', 'ENTRY', 'BOTH']).optional().describe('候选类型（默认 BOTH）'),
    poiCategory: z.array(z.string()).optional().describe('POI 类别过滤（可选）'),
    limit: z.number().min(1).max(100).optional().describe('返回数量限制（默认 50，最大 100）'),
  };
}

export function buildGeoCheckHazardZonesSchema() {
  return {
    route: z
      .array(
        z.object({
          lat: z.number().min(-90).max(90).describe('纬度'),
          lng: z.number().min(-180).max(180).describe('经度'),
        }),
      )
      .min(2)
      .describe('路线点数组（至少 2 个点）'),
    countryCode: z.string().length(2).describe('国家代码（ISO 3166-1 alpha-2）'),
    month: z.number().min(1).max(12).optional().describe('月份（1-12，用于季节性过滤）'),
    minLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional().describe('危险等级过滤（可选）'),
    hazardTypes: z
      .array(z.enum(['AVALANCHE', 'MUDSLIDE', 'FLOOD', 'ICE', 'VOLCANIC', 'OTHER']))
      .optional()
      .describe('危险类型过滤（可选）'),
    bufferRadius: z.number().min(1).max(10000).optional().describe('缓冲半径（米，默认 1000m，最大 10000m）'),
  };
}

/** P0 Runtime OS — worldState.summarize */
export function buildWorldStateSummarizeSchema() {
  return {
    tripId: z.string().optional().describe('行程 ID；与 world / slices 三选一'),
    world: z.record(z.any()).optional().describe('已构建的 WorldModelContext（physical/human/routeDirection）'),
    slices: z
      .object({
        weather: z.any().optional(),
        road: z.any().optional(),
        safeTravel: z.any().optional(),
        rental: z.any().optional(),
        daylight: z.any().optional(),
      })
      .optional()
      .describe('各域工具原始结果切片（无 trip 时的保守合并）'),
    gatherIcelandDomainSlices: z
      .boolean()
      .optional()
      .describe('tripId+冰岛时是否拉取 SafeTravel/rental/daylight/fRoad（默认 true）'),
    routeBrief: z
      .object({
        includesFRoad: z.boolean().optional(),
        includesHighlands: z.boolean().optional(),
      })
      .optional()
      .describe('裁决器用路线摘要'),
    vehiclePolicy: z
      .object({
        drivetrain: z.enum(['2WD', '4WD', 'AWD', 'unknown']).optional(),
        camper: z.boolean().optional(),
      })
      .optional()
      .describe('裁决器用车辆策略'),
  };
}

/** P0 Runtime OS — readiness.assess */
export function buildReadinessAssessSchema() {
  return {
    vehicle: z
      .object({
        class: z.string().optional(),
        drivetrain: z.enum(['2WD', '4WD', 'AWD', 'unknown']).optional(),
        studdedTires: z.boolean().optional(),
      })
      .optional(),
    weather: z
      .object({
        severity: z.enum(['low', 'medium', 'high']).optional(),
        windMps: z.number().optional(),
        summary: z.string().optional(),
      })
      .optional(),
    route: z
      .object({
        includesFRoad: z.boolean().optional(),
        includesHighlands: z.boolean().optional(),
        maxRoadGradePct: z.number().optional(),
        summary: z.string().optional(),
      })
      .optional(),
    daylight: z
      .object({
        nightDrivingRisk: z.enum(['low', 'medium', 'high']).optional(),
        usableDaylightH: z.number().optional(),
      })
      .optional(),
    experience: z
      .object({
        winterDriving: z.enum(['none', 'some', 'strong']).optional(),
        fRoadExperience: z.boolean().optional(),
      })
      .optional(),
  };
}

/** P0 Runtime OS — policy.resolve */
export function buildPolicyResolveSchema() {
  return {
    strategy: z.record(z.any()).optional(),
    userPreference: z.record(z.any()).optional(),
    operationalWorldState: z
      .object({
        operationalRisk: z.enum(['low', 'medium', 'high']),
        blockingFactors: z.array(z.string()),
        warnings: z.array(z.string()),
        recommendedPolicies: z.array(z.string()),
        confidence: z.number(),
      })
      .optional(),
    operationalArbitration: z
      .object({
        executionStatus: z.enum(['safe', 'caution', 'dangerous', 'blocked']),
        blockingReasons: z.array(z.string()),
        recommendedActions: z.array(z.string()),
        enforcedPolicies: z.array(z.string()),
        confidence: z.number(),
        rawSeverity: z.string(),
      })
      .optional()
      .describe('来自 worldState.summarize 的运行裁决；传入时 policy.resolve 写入 executionPolicyHook'),
    readiness: z
      .object({
        executable: z.boolean(),
        blockers: z.array(z.string()),
        warnings: z.array(z.string()),
        mitigationActions: z.array(z.string()),
      })
      .optional(),
  };
}

/** P0 Runtime OS — decision.compress */
export function buildDecisionCompressSchema() {
  return {
    toolResults: z
      .array(
        z.object({
          tool: z.string().optional(),
          ok: z.boolean().optional(),
          summary: z.string().optional(),
          data: z.any().optional(),
        }),
      )
      .optional(),
    conversationSnippet: z.array(z.string()).optional(),
    maxFacts: z.number().min(4).max(60).optional(),
  };
}

export function getSchemaForSkill(skillName: string): any {
  const schemaMap: Record<string, () => any> = {
    'dem.get_profile': buildDemGetProfileSchema,
    'dem.get.profile': buildDemGetProfileSchema,
    'dem.getProfile': buildDemGetProfileSchema,
    'decision.abuCheck': buildDecisionAbuCheckSchema,
    'decision.drdrePace': buildDecisionDrdrePaceSchema,
    'decision.neptuneRepair': buildDecisionNeptuneRepairSchema,
    'decision.runThreeGuardians': buildDecisionRunThreeGuardiansSchema,
    'decision.explainForHuman': buildDecisionExplainForHumanSchema,
    'decision.requestApproval': buildDecisionRequestApprovalSchema,
    'decision.checkApproval': buildDecisionCheckApprovalSchema,
    'decision.stage': buildDecisionStageSchema,
    'decision.replay': buildDecisionReplaySchema,
    'context.compilePackage': buildContextCompilePackageSchema,
    'geo.findNearbyPOI': buildGeoFindNearbyPOISchema,
    'geo.sampleElevationProfile': buildGeoSampleElevationProfileSchema,
    'hitl.createApprovalTask': buildHitlCreateApprovalTaskSchema,
    'hitl.resolveApprovalTask': buildHitlResolveApprovalTaskSchema,
    'routePack.newSkeleton': buildRoutePackNewSkeletonSchema,
    'routePack.validate': buildRoutePackValidateSchema,
    'routePack.generateRegressionTests': buildRoutePackGenerateRegressionTestsSchema,
    'geo.findCandidateWithinCorridor': buildGeoFindCandidateWithinCorridorSchema,
    'geo.checkHazardZones': buildGeoCheckHazardZonesSchema,
    'routeDirection.pickForIntent': buildRouteDirectionPickForIntentSchema,
    'routeDirection.listForCountry': buildRouteDirectionListForCountrySchema,
    'readiness.generateChecklist': buildReadinessGenerateChecklistSchema,
    'readiness.summarizeRisks': buildReadinessSummarizeRisksSchema,
    'readiness.checkVisaWindow': buildReadinessCheckVisaWindowSchema,
    'world.buildContext': buildWorldBuildContextSchema,
    'worldState.summarize': buildWorldStateSummarizeSchema,
    'readiness.assess': buildReadinessAssessSchema,
    'policy.resolve': buildPolicyResolveSchema,
    'decision.compress': buildDecisionCompressSchema,
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

