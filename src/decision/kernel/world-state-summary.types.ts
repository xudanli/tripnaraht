/**
 * 世界模型三段式结构（专利显式建模）
 *
 * Scheme C: 专利要求世界模型采用「物理环境、用户能力、路线规则」三段式
 * 显式化增强专利可追溯性
 *
 * 参考: docs/CHIEF_SCIENTIST_TECHNICAL_PROPOSAL.md 方案 C
 */

/** 物理环境状态（PhysicalRealityModel 摘要） */
export interface WorldStatePhysicalSummary {
  /** 道路状态摘要 */
  roadStates?: Record<string, unknown>;
  /** DEM 证据摘要（高程、坡度） */
  demEvidence?: { elevationProfile?: unknown; maxSlope?: number; accessibilityScore?: number };
  /** 气候季节性（可达性评分） */
  climateSeasonality?: { accessibilityScore?: number; month?: number };
  /** 危险区域 */
  hazardZones?: Array<{ type: string; level: string }>;
  /** 渡轮/交通服务状态 */
  ferryStates?: Record<string, unknown>;
  /** 国家代码 */
  countryCode?: string;
  /** 月份 */
  month?: number;
}

/** 用户能力状态（HumanCapabilityModel 摘要） */
export interface WorldStateHumanSummary {
  /** 体能等级 */
  fitnessLevel?: string;
  /** 风险承受度 */
  riskTolerance?: string;
  /** 节奏偏好 */
  pacingPreference?: string;
  /** 同行人画像 */
  partyProfile?: unknown;
  /** 人数 */
  partyCount?: number;
}

/** 路线规则状态（RouteDirectionWithPhilosophy 摘要） */
export interface WorldStateRouteSummary {
  /** 路线 ID */
  routeDirectionId?: string;
  /** 路线哲学/不可违反规则 */
  routePhilosophy?: string;
  /** 硬约束规则列表 */
  hardRules?: string[];
  /** 走廊区域主标签（如半岛/国家公园名称） */
  regionLabel?: string;
  /** 走廊几何 WKT（可审计/工具用） */
  corridorWkt?: string | null;
  /** POI 类型/意图提示 */
  poiHints?: string[];
  /** nature | city | mixed — 影响 fallback 与节奏 */
  regionType?: string;
}

/** world.buildContext 输出结构（用于 worldModelContextToWorldStateSummary 入参） */
export interface WorldModelContextLike {
  physical?: { demEvidence?: unknown[]; roadStates?: unknown[]; hazardZones?: unknown[]; ferryStates?: unknown[]; countryCode?: string; month?: number; climateSeasonality?: unknown };
  human?: { maxDailyAscentM?: number; riskTolerance?: string; preferredPace?: string };
  routeDirection?: { id?: string; philosophy?: string; constraints?: unknown };
}

/** 世界状态摘要（三段式，写入 DSO） */
export interface WorldStateSummary {
  physical?: WorldStatePhysicalSummary;
  human?: WorldStateHumanSummary;
  route?: WorldStateRouteSummary;
}

/**
 * 从 DSO 构建世界状态摘要（Scheme C）
 * 将 environmentState、userIntent 映射为三段式结构
 * P3 增强：可选 researchData 补全 hazardZones、demEvidence、ferryStates
 * P3 增强：可选 worldModelContext（world.buildContext 输出）优先于 research_data，减少 stub
 */
export function buildWorldStateSummaryFromDso(
  state: {
    environmentState?: unknown;
    userIntent?: unknown;
    research_data?: Record<string, unknown>;
  },
  researchData?: Record<string, unknown>,
  worldModelContext?: WorldModelContextLike,
): WorldStateSummary {
  // P3: world.buildContext 优先，完整 WorldModelContext 减少 dsoToMinimalWorldModelContext stub
  if (worldModelContext && (worldModelContext.physical || worldModelContext.human || worldModelContext.routeDirection)) {
    const fromWorld = worldModelContextToWorldStateSummary(worldModelContext);
    if (Object.keys(fromWorld).length > 0) {
      return fromWorld;
    }
  }
  const env = (state.environmentState ?? {}) as Record<string, unknown>;
  const intent = (state.userIntent ?? {}) as Record<string, unknown>;
  const rd = researchData ?? (state.research_data as Record<string, unknown> | undefined) ?? {};
  const summary: WorldStateSummary = {};

  // Physical: 从 environmentState 映射，researchData 补全 hazardZones、demEvidence、ferryStates
  const hasPhysical =
    env.countryCode ||
    env.month !== undefined ||
    env.weatherRisk !== undefined ||
    env.roadConditions ||
    rd.risk_assessment ||
    rd.avalanche_hazard_zones ||
    rd.dem_metrics ||
    rd.geo_terrain;

  if (hasPhysical) {
    summary.physical = {
      countryCode: env.countryCode as string,
      month: env.month as number,
      climateSeasonality: {
        accessibilityScore: env.weatherRisk !== undefined ? Math.max(0.1, 1 - (env.weatherRisk as number)) : 0.7,
        month: env.month as number,
      },
      roadStates: env.roadConditions as Record<string, unknown>,
    };

    // P3: 从 research_data 补全 hazardZones
    const hazardZones = extractHazardZonesFromResearch(rd);
    if (hazardZones.length > 0) {
      summary.physical.hazardZones = hazardZones;
    }

    // P3: 从 research_data 补全 demEvidence
    const demEvidence = extractDemEvidenceFromResearch(rd);
    if (demEvidence) {
      summary.physical.demEvidence = demEvidence;
    }

    // P3: 从 research_data 补全 ferryStates（若有）
    const ferryStates = extractFerryStatesFromResearch(rd);
    if (ferryStates && Object.keys(ferryStates).length > 0) {
      summary.physical.ferryStates = ferryStates;
    }
  }

  // Human: 从 userIntent.party 映射
  const party = intent.party as Record<string, unknown> | undefined;
  if (party || intent.constraints || intent.preferences) {
    summary.human = {
      fitnessLevel: party?.fitnessLevel as string,
      riskTolerance: party?.riskTolerance as string,
      pacingPreference: (intent as any).strategyMode as string,
      partyProfile: party,
      partyCount: party?.count as number,
    };
  }

  // Route: 从 environmentState.routeDirectionId + routeCorridorWorld 映射
  const routeDirectionId = env.routeDirectionId as string | undefined;
  const rcw = env.routeCorridorWorld as
    | {
        routeDirectionId?: string;
        regionLabel?: string;
        corridorWkt?: string | null;
        poiHints?: string[];
        regionType?: string;
        constraints?: Record<string, unknown>;
      }
    | undefined;
  const effectiveRdId = routeDirectionId ?? rcw?.routeDirectionId;
  if (effectiveRdId || rcw) {
    const hints = rcw?.poiHints;
    summary.route = {
      routeDirectionId: effectiveRdId,
      routePhilosophy: rcw?.regionLabel,
      hardRules: Array.isArray(hints) ? hints.map((h) => String(h)) : [],
      regionLabel: rcw?.regionLabel,
      corridorWkt: rcw?.corridorWkt,
      poiHints: Array.isArray(hints) ? hints.map((h) => String(h)) : undefined,
      regionType: rcw?.regionType,
    };
  }

  return Object.keys(summary).length > 0 ? summary : {};
}

/** 从 research_data 提取 hazardZones（risk_assessment / avalanche_hazard_zones） */
function extractHazardZonesFromResearch(rd: Record<string, unknown>): Array<{ type: string; level: string }> {
  const out: Array<{ type: string; level: string }> = [];
  const risk = rd.risk_assessment as { hazardZones?: Array<{ type?: string; level?: string }> } | undefined;
  if (risk?.hazardZones?.length) {
    risk.hazardZones.forEach((z) => {
      out.push({ type: z.type ?? 'OTHER', level: z.level ?? 'LOW' });
    });
  }
  const avalanche = rd.avalanche_hazard_zones as Array<{ type?: string; level?: string }> | undefined;
  if (avalanche?.length) {
    avalanche.forEach((z) => {
      out.push({ type: z.type ?? 'AVALANCHE', level: z.level ?? 'MEDIUM' });
    });
  }
  return out;
}

/** 从 research_data 提取 demEvidence（dem_metrics / geo_terrain） */
function extractDemEvidenceFromResearch(
  rd: Record<string, unknown>,
): { elevationProfile?: unknown; maxSlope?: number; accessibilityScore?: number } | undefined {
  const dem = rd.dem_metrics as { elevation_profile?: unknown; max_slope_pct?: number; total_ascent_m?: number } | undefined;
  if (dem) {
    return {
      elevationProfile: dem.elevation_profile,
      maxSlope: dem.max_slope_pct ?? (dem as any).maxSlopePct,
      accessibilityScore: dem.total_ascent_m != null ? undefined : undefined,
    };
  }
  const geo = rd.geo_terrain as { elevationProfile?: unknown; maxSlopePct?: number } | undefined;
  if (geo) {
    return {
      elevationProfile: geo.elevationProfile,
      maxSlope: geo.maxSlopePct ?? (geo as any).max_slope_pct,
    };
  }
  return undefined;
}

/** 从 research_data 提取 ferryStates（若有 ferry 相关数据） */
function extractFerryStatesFromResearch(rd: Record<string, unknown>): Record<string, unknown> | undefined {
  const ferry = rd.ferry_states ?? rd.ferryStates;
  if (ferry && typeof ferry === 'object' && !Array.isArray(ferry)) {
    return ferry as Record<string, unknown>;
  }
  return undefined;
}

/**
 * 将 WorldModelContext（world.buildContext 输出）转为 WorldStateSummary
 * P3: world.buildContext 与 DSO 打通，减少 dsoToMinimalWorldModelContext stub 使用
 *
 * 当 RESEARCH 或 Skills 流程中调用了 world.buildContext 时，可将完整 WorldModelContext
 * 转为 WorldStateSummary 写入 DSO，供 dsoToMinimalWorldModelContext 优先使用
 */
export function worldModelContextToWorldStateSummary(world: WorldModelContextLike): WorldStateSummary {
  const summary: WorldStateSummary = {};
  const p = world.physical;
  if (p) {
    summary.physical = {
      countryCode: p.countryCode,
      month: p.month,
      climateSeasonality: p.climateSeasonality as WorldStatePhysicalSummary['climateSeasonality'],
      roadStates: p.roadStates ? (Array.isArray(p.roadStates) ? {} : (p.roadStates as Record<string, unknown>)) : undefined,
      demEvidence: p.demEvidence?.length
        ? {
            elevationProfile: (p.demEvidence as any)[0]?.elevationProfile ?? (p.demEvidence as any)[0],
            maxSlope: (p.demEvidence as any)[0]?.maxSlopePct,
          }
        : undefined,
      hazardZones: Array.isArray(p.hazardZones)
        ? (p.hazardZones as Array<{ type?: string; level?: string }>).map((z) => ({
            type: (z as any).type ?? 'OTHER',
            level: (z as any).level ?? 'LOW',
          }))
        : undefined,
      ferryStates: p.ferryStates?.length ? { items: p.ferryStates } : undefined,
    };
  }
  const h = world.human;
  if (h) {
    summary.human = {
      fitnessLevel: (h as any).fitnessLevel,
      riskTolerance: h.riskTolerance,
      pacingPreference: h.preferredPace,
      partyProfile: h,
      partyCount: undefined,
    };
  }
  const r = world.routeDirection;
  if (r?.id) {
    summary.route = {
      routeDirectionId: r.id,
      routePhilosophy: typeof r.philosophy === 'string' ? r.philosophy : (r.philosophy as any)?.summary,
      hardRules: Array.isArray(r.constraints) ? (r.constraints as any[]).map((c) => String(c)) : [],
    };
  }
  return Object.keys(summary).length > 0 ? summary : {};
}
