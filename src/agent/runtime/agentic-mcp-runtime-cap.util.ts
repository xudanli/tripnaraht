import { AGENTIC_MCP_LLM_EXPOSE_WHITELIST } from '../assistants/planning-assistant/services/mcp-openai-tools.adapter';

const ALL_AGENTIC_MCP = [...AGENTIC_MCP_LLM_EXPOSE_WHITELIST] as readonly string[];

/**
 * Skill / 上下文条目标识 → 审计白名单内的 MCP toolName（可多对多）。
 * 仅覆盖 tools.select 常见项；未命中映射的条目仍可走「原名即 MCP」或 `mcp.*` 前缀规则。
 */
export const SKILL_NAME_TO_AGENTIC_MCP_TOOLS: Record<string, readonly string[]> = {
  'weather.search': ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
  'world.weatherPrediction': ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
  'iceland.weatherSeverityClassifier': ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
  'routeDirection.pickForIntent': ['rail.searchRoutes', 'rail.getSchedule'],
  'routeDirection.listForCountry': ['rail.searchRoutes', 'rail.getSchedule'],
  'readiness.assess': ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
  'readiness.generateChecklist': ['exa.webSearch', 'weather.getCurrentWeather'],
  'readiness.summarizeRisks': ['exa.webSearch', 'exa.webSearchAdvanced'],
  'experience.communityEvidence': [
    'xiaohongshu.search_feeds',
    'xiaohongshu.get_feed_detail',
    'xiaohongshu.user_profile',
  ],
};

/** 非标准 skill id → MCP service 前缀（展开为白名单内所有 `prefix.*` 工具） */
export const SKILL_ALIAS_TO_AGENTIC_MCP_SERVICE: Record<string, string> = {
  weather_service: 'weather',
  exa_search: 'exa',
  xhs_search: 'xiaohongshu',
  xiaohongshu_search: 'xiaohongshu',
  fliggy_search: 'fliggy',
  flyai_search: 'fliggy',
};

/**
 * 将 Context metadata.toolAllowlist（或网关透传的 skill 名列表）展开为 MCP toolName 集合（仅含审计白名单内项）。
 */
export function expandSkillAllowlistToMcpToolNames(
  skillAllowlist?: Array<{ name: string }> | null,
): Set<string> {
  const out = new Set<string>();
  if (!skillAllowlist?.length) return out;

  for (const row of skillAllowlist) {
    const raw = String(row?.name ?? '').trim();
    if (!raw) continue;

    let key = raw;
    if (key.toLowerCase().startsWith('mcp.')) {
      key = key.slice(4);
    }

    if (AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(key)) {
      out.add(key);
    }

    const mapped = SKILL_NAME_TO_AGENTIC_MCP_TOOLS[key];
    if (mapped) {
      for (const m of mapped) {
        if (AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(m)) out.add(m);
      }
    }

    const servicePrefix = SKILL_ALIAS_TO_AGENTIC_MCP_SERVICE[key];
    if (servicePrefix) {
      const prefix = `${servicePrefix}.`;
      for (const name of ALL_AGENTIC_MCP) {
        if (name.startsWith(prefix)) out.add(name);
      }
    }
  }
  return out;
}

/** 请求 / TripTask.constraints 上可选的 tool allowlist 形状（轻量透传） */
export function extractAgenticSkillAllowlistForMcpCap(
  request: { options?: { agentic_runtime_tool_allowlist?: string[] } | null },
  memory?: {
    activeTripState?: { constraints?: Record<string, unknown> } | null;
  } | null,
): Array<{ name: string }> | undefined {
  const fromOptions = request.options?.agentic_runtime_tool_allowlist;
  if (fromOptions?.length) {
    const names = fromOptions.map((n) => String(n).trim()).filter(Boolean);
    if (names.length) return names.map((name) => ({ name }));
  }

  const raw = memory?.activeTripState?.constraints?.toolAllowlist;
  if (Array.isArray(raw) && raw.length > 0) {
    const out: Array<{ name: string }> = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const n = item.trim();
        if (n) out.push({ name: n });
      } else if (item && typeof item === 'object' && 'name' in item) {
        const n = String((item as { name?: unknown }).name ?? '').trim();
        if (n) out.push({ name: n });
      }
    }
    if (out.length) return out;
  }

  return undefined;
}

/**
 * 相位 → 允许暴露给 LLM 的 MCP 工具名（须为 {@link AGENTIC_MCP_LLM_EXPOSE_WHITELIST} 子集）。
 * 键均为小写，与 `phase.toLowerCase()` 对齐。
 */
export const PHASE_AGENTIC_MCP_CAP: Record<string, readonly string[]> = {
  planning: ALL_AGENTIC_MCP,
  decision: [
    'weather.getCurrentWeather',
    'weather.getWeatherByDatetimeRange',
    'exa.webSearch',
    'exa.webSearchAdvanced',
    'xiaohongshu.search_feeds',
    'xiaohongshu.get_feed_detail',
    'hotel.search',
    'hotel.getDetails',
    'rail.searchRoutes',
    'rail.getSchedule',
    'fliggy.search_hotel',
    'fliggy.search_poi',
    'fliggy.search_flight',
    'fliggy.keyword_search',
  ],
  adjustment: [
    'weather.getCurrentWeather',
    'weather.getWeatherByDatetimeRange',
    'rail.searchRoutes',
    'rail.getSchedule',
    'hotel.search',
    'hotel.getDetails',
    'exa.webSearch',
    'fliggy.search_hotel',
    'fliggy.search_poi',
    'fliggy.search_flight',
    'fliggy.keyword_search',
  ],
  repair: [
    'weather.getCurrentWeather',
    'weather.getWeatherByDatetimeRange',
    'rail.searchRoutes',
    'rail.getSchedule',
  ],
  readiness: [
    'weather.getCurrentWeather',
    'weather.getWeatherByDatetimeRange',
    'exa.webSearch',
    'exa.webSearchAdvanced',
    'exa.deepSearch',
    'xiaohongshu.search_feeds',
    'xiaohongshu.get_feed_detail',
    'xiaohongshu.user_profile',
    'xiaohongshu.list_feeds',
  ],
  countrypack: [
    'exa.webSearch',
    'exa.webSearchAdvanced',
    'exa.deepSearch',
    'xiaohongshu.search_feeds',
    'xiaohongshu.get_feed_detail',
  ],
};

export interface AgenticMcpEmergencyConstraints {
  forbidden_modes?: Array<'DRIVE' | 'MOTORCYCLE' | 'TRANSIT' | 'RAIL' | 'FERRY' | string>;
}

/**
 * 根据应急约束从当前允许集中剔除 MCP 工具（当前白名单内仅 rail.* 与 RAIL 强相关）。
 */
export function applyEmergencyConstraintsToMcpAllowlist(
  allowed: Set<string>,
  emergency?: AgenticMcpEmergencyConstraints | null,
): void {
  const forbidden = (emergency?.forbidden_modes ?? []).map((m) => String(m).toUpperCase());
  if (forbidden.length === 0) return;
  const forbidRail = forbidden.includes('RAIL');
  if (!forbidRail) return;
  for (const name of [...allowed]) {
    if (name.startsWith('rail.')) allowed.delete(name);
  }
}

export interface DeriveAgenticMcpRuntimeAllowlistInput {
  /** 与 context / tools.select 对齐的 planning phase（小写） */
  phase?: string | null;
  /**
   * metadata.toolAllowlist 或网关透传：skill 名 / `mcp.*` / 与 MCP 同名字段；
   * 经 {@link expandSkillAllowlistToMcpToolNames} 后与相位允许集求交（交为空则保留相位集并打标 skipped）。
   */
  skillAllowlist?: Array<{ name: string }> | null;
  emergency?: AgenticMcpEmergencyConstraints | null;
}

export interface DeriveAgenticMcpRuntimeAllowlistResult {
  allowedMcpToolNames: Set<string>;
  /** 简短溯源，便于日志与 ADR 对照 */
  provenance: string;
}

/**
 * Runtime Capability Snapshot（MCP 子集）— Agentic 快路径第二道闸：审计白名单之后、再按相位 / 应急 / 精确 skill 名收窄。
 */
export function deriveAgenticMcpRuntimeAllowlist(
  input: DeriveAgenticMcpRuntimeAllowlistInput,
): DeriveAgenticMcpRuntimeAllowlistResult {
  const phaseKey = String(input.phase ?? 'planning')
    .trim()
    .toLowerCase();
  const phaseList = PHASE_AGENTIC_MCP_CAP[phaseKey] ?? PHASE_AGENTIC_MCP_CAP.planning;

  let allowed = new Set(phaseList.filter((t) => AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(t)));

  const expandedFromAllowlist = expandSkillAllowlistToMcpToolNames(input.skillAllowlist);
  let provenance = `phase:${phaseKey}`;

  if (expandedFromAllowlist.size > 0) {
    const narrowed = new Set([...allowed].filter((x) => expandedFromAllowlist.has(x)));
    if (narrowed.size > 0) {
      allowed = narrowed;
      provenance += '+toolAllowlist_intersect';
    } else {
      provenance += '+toolAllowlist_intersect_skipped_empty';
    }
  }

  applyEmergencyConstraintsToMcpAllowlist(allowed, input.emergency ?? undefined);
  if ((input.emergency?.forbidden_modes?.length ?? 0) > 0) {
    provenance += '+emergency';
  }

  return { allowedMcpToolNames: allowed, provenance };
}
