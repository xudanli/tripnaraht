/**
 * Tripnara Query Rewriting 纯函数：两阶段管道、Prompt/Schema、规则降级、参数合并。
 */

import { QUERY_REWRITE_STAGE1_SCHEMA } from '../schemas/query-rewrite.schema';
import {
  KNOWLEDGE_GRAPH_ALIASES,
  KNOWLEDGE_GRAPH_SPELL_CORRECTIONS,
} from '../data/query-rewriting-knowledge-graph';
import type { ExactEntityResolution } from '../interfaces/standard-entity.types';
import type {
  QueryRewriteInput,
  QueryRewriteResult,
  QueryRewriteScene,
  QueryRewriteStage1Result,
  StandardizedQuery,
} from './query-rewriting.types';
import { resolveTripTemporalAnchor } from './trip-temporal-anchor.util';
import { applyPoiContextEnrichment } from './query-rewriting-poi-context.util';
import { shouldPassthroughQueryRewriteForOrchestrationNl } from './query-rewrite-orchestration-guard.util';

export { expansionRoutesToVariants } from './query-rewriting-multi-route.util';
export {
  applyPoiContextEnrichment,
  buildContextualPoiSearchQuerySuffix,
  buildPoiContextExpansionTerms,
  buildPoiContextSuffixString,
  buildPoiSearchPlanFromContext,
  buildPoiSearchQueryFromContext,
  rewritePoiSearchQuerySync,
} from './query-rewriting-poi-context.util';
export type { PoiSearchPlan } from './query-rewriting-poi-context.util';

const ACCOMMODATION_CATEGORY_TERMS = ['酒店', '旅馆', '宾馆', '民宿', '客栈', '住宿', 'lodging', 'hotel'];
const PET_FRIENDLY_TERMS = ['宠物', '带狗', '带猫', 'pet'];
const ROMANTIC_SCENARIO_TERMS = ['结婚纪念日', '纪念日', '蜜月', '浪漫', '求婚', '周年'];
const DESTINATION_SWITCH_RE = /算了|改成|改去|换成|还是去|不去.{0,8}了|改去/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

export function applyAliasAndSpellCorrection(query: string): string {
  let result = query;
  for (const [wrong, right] of Object.entries(KNOWLEDGE_GRAPH_SPELL_CORRECTIONS)) {
    result = result.replace(new RegExp(wrong, 'g'), right);
  }
  for (const entry of KNOWLEDGE_GRAPH_ALIASES) {
    if (/^[\u4e00-\u9fa5]+$/.test(entry.alias)) {
      result = result.replace(new RegExp(entry.alias, 'g'), entry.standard);
    } else {
      result = result.replace(new RegExp(`\\b${entry.alias}\\b`, 'gi'), entry.standard);
    }
  }
  return normalizeWhitespace(result);
}

export function detectDestinationSwitch(query: string): boolean {
  return DESTINATION_SWITCH_RE.test(query);
}

function extractLastUserQueryFromHistory(
  history?: QueryRewriteInput['session'] extends infer S
    ? S extends { messageHistory?: infer H }
      ? H
      : never
    : never,
): string | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role === 'user' && turn.content.trim()) {
      return turn.content.trim();
    }
  }
  return undefined;
}

function lacksDestinationSignal(query: string, destination?: string): boolean {
  if (!destination) return true;
  const d = destination.trim();
  if (!d) return true;
  return !query.includes(d);
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveRelativeDayLabel(query: string, anchorYmd: string): string | undefined {
  if (/明天|翌日/.test(query)) return addDaysYmd(anchorYmd, 1);
  if (/后天/.test(query)) return addDaysYmd(anchorYmd, 2);
  return undefined;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inferCategory(query: string, scene: QueryRewriteScene): string | undefined {
  if (scene === 'accommodation' || scene === 'hotel' || containsAny(query, ACCOMMODATION_CATEGORY_TERMS)) {
    return '酒店';
  }
  return undefined;
}

export function buildScenarioExpansions(query: string): string[] {
  const expansions: string[] = [];
  if (containsAny(query, PET_FRIENDLY_TERMS)) {
    expansions.push('允许携带宠物', '宠物友好');
  }
  if (containsAny(query, ROMANTIC_SCENARIO_TERMS)) {
    expansions.push('浪漫', '蜜月套房', '高星酒店', '海景');
  }
  if (/亲子|带娃|带孩子/.test(query)) {
    expansions.push('亲子酒店', '儿童乐园', '婴儿床');
  }
  if (/温泉/.test(query)) {
    expansions.push('温泉度假村', '温泉门票');
  }
  if (/机加酒|机\+酒/.test(query)) {
    expansions.push('机票+酒店', '自由行套餐');
  }
  if (/平价民宿|经济型/.test(query)) {
    expansions.push('经济型客栈', '青年旅舍', 'B&B');
  }
  return [...new Set(expansions)].slice(0, 5);
}

export function buildSynonymExpansions(query: string, scene: QueryRewriteScene): string[] {
  const synonyms: string[] = [];
  if (scene === 'accommodation' || scene === 'hotel') {
    if (query.includes('酒店')) synonyms.push(query.replace(/酒店/g, '宾馆'));
    if (query.includes('民宿')) synonyms.push(query.replace(/民宿/g, '客栈'));
    if (query.includes('旅馆')) synonyms.push(query.replace(/旅馆/g, '酒店'));
  }
  if (scene === 'poi') {
    if (/attraction|sightseeing/i.test(query)) {
      synonyms.push(query.replace(/attractions?/gi, 'landmarks'));
    }
    if (query.includes('景点')) synonyms.push(query.replace(/景点/g, '地标'));
    if (query.includes('博物馆')) synonyms.push(query.replace(/博物馆/g, '展馆'));
  }
  if (query.includes('日本深度游')) {
    synonyms.push('东京旅游', '大阪旅游', '京都旅游');
  }
  return [...new Set(synonyms.filter((s) => s && s !== query))].slice(0, 3);
}

export function buildHyponymExpansions(query: string, destination?: string): string[] {
  const hyponyms: string[] = [];
  if (/日本深度游|日本游/.test(query) || destination === '日本') {
    hyponyms.push('东京', '大阪', '京都', '北海道', '镰仓');
  }
  if (/长隆水上乐园/.test(query)) {
    hyponyms.push('广州旅游', '水上乐园', '主题公园');
  }
  return hyponyms.slice(0, 5);
}

function extractDestinationFromQuery(query: string): string | undefined {
  if (/上海.*迪士尼|迪士尼.*上海/.test(query)) return '上海';
  if (/大坂|大阪/.test(query)) return '大阪';
  if (/东京|大阪|京都/.test(query)) {
    const city = query.match(/(东京|大阪|京都)/)?.[1];
    if (city) return city;
  }

  const m =
    query.match(/(?:想去|要去|去|到|在)([\u4e00-\u9fa5A-Za-z]{2,8})(?:的|住|玩|游|周边|附近|迪士尼)?/) ??
    query.match(/^([\u4e00-\u9fa5A-Za-z]{2,8})(?:\s|海景|酒店|温泉|迪士尼)/);
  const raw = m?.[1]?.trim();
  if (!raw || ['附近', '周边', '明天', '后天', '过几天', '上海迪士尼'].includes(raw)) return undefined;
  return raw;
}

function extractPoiFromQuery(query: string): string | undefined {
  if (query.includes('迪士尼')) return '迪士尼乐园';
  if (query.includes('自由女神')) return '自由女神像';
  if (query.includes('纪念碑') && query.includes('香格里拉')) return '香格里拉红军长征博物馆';
  if (/新宿/.test(query)) return '新宿';
  return undefined;
}

function extractRankLevel(query: string): string | undefined {
  if (/稍微好点|高档|豪华|五星|5星|四星|4星/.test(query)) return '4星/5星/高档';
  if (/经济|平价|便宜/.test(query)) return '经济型';
  return undefined;
}

function extractFilters(query: string): Record<string, unknown> | undefined {
  const filters: Record<string, unknown> = {};
  if (containsAny(query, PET_FRIENDLY_TERMS)) filters.pet_friendly = true;
  return Object.keys(filters).length ? filters : undefined;
}

function resolveTemporalAnchorYmd(input: QueryRewriteInput): string {
  const now = input.spatioTemporal?.now ?? new Date();
  const anchor = resolveTripTemporalAnchor({
    startDateYmd: input.spatioTemporal?.tripStartYmd,
    endDateYmd: input.spatioTemporal?.tripEndYmd,
    now,
  });
  return anchor?.anchorYmd ?? now.toISOString().slice(0, 10);
}

/** Stage 1 规则降级（无 LLM） */
export function rewriteQueryWithRules(input: QueryRewriteInput): QueryRewriteStage1Result {
  const scene = input.scene ?? 'general';
  const original = normalizeWhitespace(input.query);
  const tripDateRange =
    input.spatioTemporal?.tripStartYmd != null
      ? {
          start_date: input.spatioTemporal.tripStartYmd,
          end_date: input.spatioTemporal.tripEndYmd,
        }
      : undefined;

  /** 行程操作句（选日/改排/重规划）勿按检索 query 改写，避免 prepend 目的地破坏语义 */
  if (shouldPassthroughQueryRewriteForOrchestrationNl(original, tripDateRange)) {
    return {
      original_query: original,
      contextualized_query: original,
      standardized_query: {
        category: inferCategory(original, scene),
        filters: extractFilters(original),
      },
      confidence: 1,
    };
  }

  let working = applyAliasAndSpellCorrection(original);
  const switched = detectDestinationSwitch(original);

  const sessionDest = switched ? undefined : input.session?.selectedDestination?.trim();
  const lastUserQuery = extractLastUserQueryFromHistory(input.session?.messageHistory);
  const inheritedContext =
    !switched && lastUserQuery && lastUserQuery !== original ? lastUserQuery : undefined;

  if (sessionDest && lacksDestinationSignal(working, sessionDest)) {
    working = normalizeWhitespace(`${sessionDest} ${working}`);
  } else if (inheritedContext && lacksDestinationSignal(working, extractDestinationFromQuery(inheritedContext))) {
    const inheritedDest = extractDestinationFromQuery(inheritedContext);
    if (inheritedDest && lacksDestinationSignal(working, inheritedDest)) {
      const inheritedCore = inheritedContext
        .replace(/推荐|酒店|hotel|找|搜索|住宿/gi, '')
        .trim();
      working = normalizeWhitespace(`${inheritedDest} ${inheritedCore} ${working}`);
    }
  }

  const anchorYmd = resolveTemporalAnchorYmd(input);
  const locationLabel = input.spatioTemporal?.locationLabel?.trim() || sessionDest;
  if (locationLabel && /周边|附近/.test(working) && !working.includes(locationLabel)) {
    working = working.replace(/周边|附近/g, `${locationLabel}周边`);
  }

  const relativeDay = resolveRelativeDayLabel(working, anchorYmd);
  if (relativeDay && !working.includes(relativeDay)) {
    working = normalizeWhitespace(`${working} ${relativeDay}`);
  }

  if (containsAny(working, PET_FRIENDLY_TERMS) && !/允许携带宠物|宠物友好/.test(working)) {
    working = normalizeWhitespace(working.replace(/要带宠物的|带宠物|宠物/g, '允许携带宠物'));
  }

  const standardized: StandardizedQuery = {
    destination: extractDestinationFromQuery(working) ?? sessionDest ?? locationLabel,
    poi: extractPoiFromQuery(working),
    category: inferCategory(working, scene),
    rank_level: extractRankLevel(working),
    time_range: relativeDay,
    filters: extractFilters(working),
  };

  return {
    original_query: original,
    contextualized_query: working,
    standardized_query: standardized,
    discard_previous_destination: switched,
    confidence: sessionDest || inheritedContext ? 0.75 : 0.55,
  };
}

/**
 * Redis 精确别名命中：跳过 Stage 1 LLM，走确定性 Stage 1 结果。
 */
export function buildStage1FromExactEntity(
  input: QueryRewriteInput,
  resolution: ExactEntityResolution,
): QueryRewriteStage1Result {
  const scene = input.scene ?? 'general';
  const original = normalizeWhitespace(input.query);
  let working = applyAliasAndSpellCorrection(original);
  const { entity } = resolution;

  if (entity.type === 'destination' && !working.includes(entity.name)) {
    working = normalizeWhitespace(`${entity.name} ${working}`);
  } else if (entity.type === 'poi' && !working.toLowerCase().includes(entity.name.toLowerCase())) {
    working = normalizeWhitespace(`${working} ${entity.name}`);
  }

  const sessionDest = input.session?.selectedDestination?.trim();
  const standardized: StandardizedQuery = {
    destination:
      entity.type === 'destination'
        ? entity.name
        : entity.parent_destination ?? sessionDest,
    poi: entity.type === 'poi' ? entity.name : extractPoiFromQuery(working),
    category: inferCategory(working, scene),
    rank_level: extractRankLevel(working),
    time_range: resolveRelativeDayLabel(working, resolveTemporalAnchorYmd(input)),
    filters: extractFilters(working),
  };

  return {
    original_query: original,
    contextualized_query: working,
    standardized_query: standardized,
    confidence: resolution.confidence,
  };
}

export function buildStage1Prompt(
  input: QueryRewriteInput,
  candidateEntities: string[],
  knowledgeGraphSection?: string,
): string {
  const scene = input.scene ?? 'general';
  const history = (input.session?.messageHistory ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');
  const now = (input.spatioTemporal?.now ?? new Date()).toISOString();
  const anchorYmd = resolveTemporalAnchorYmd(input);
  const location = input.spatioTemporal?.locationLabel ?? input.session?.selectedDestination ?? '未知';
  const kgBlock = knowledgeGraphSection?.trim() || `【知识图谱词表约束】
合法候选目的地/POI：[${candidateEntities.join(', ') || '（无候选，destination 不确定时省略）'}]`;

  const poiCtx = input.poiContext;
  const poiCtxLine = poiCtx
    ? `POI 上下文: destination=${poiCtx.destination}, pacing=${poiCtx.pacing ?? 'n/a'}, fatigue=${poiCtx.fatigueScore ?? 'n/a'}, novelty=${poiCtx.noveltyBias ?? 'n/a'}, weather=${poiCtx.weather?.condition ?? 'n/a'}`
    : '';

  const sceneHints: Record<string, string> = {
    accommodation: '住宿搜索：关注城市、POI 周边、星级、宠物/亲子等硬性偏好。',
    hotel: '酒店搜索：关注城市、POI 周边、星级、宠物/亲子等硬性偏好。',
    rag: '攻略/知识检索：保留路线、季节、签证、路况等专业术语。',
    poi: '景点检索：优先标准 POI 名与所属城市；结合行程节奏/疲劳/天气注入检索拓展词。',
    general: '通用旅游搜索。',
  };

  return `Role: 你是 Tripnara 旅游搜索专家。完成 Stage 1「上下文补全 + 结构化解析」，不要输出 expansion_routes。

Scene: ${scene} — ${sceneHints[scene] ?? sceneHints.general}

【会话继承硬约束】
- 必须检查 Session history。若上一轮目的地为「东京」，本轮「我想去新宿吃拉面」，contextualized_query 须补全「东京」。
- 若本轮明确更换目的地（如「算了，改去大阪吧」），设置 discard_previous_destination=true，且不得保留旧目的地。

${kgBlock}
- standardized_query.destination 必须从上述候选词表中选择；无法匹配则省略该字段，严禁编造城市。
- 别名必须使用知识图谱中的标准名（见别名映射参考）。

【时空锚点】
- 当前时间(ISO): ${now}
- 相对日锚点(YMD): ${anchorYmd}
- 用户位置语境: ${location}
- Session 已选目的地: ${input.session?.selectedDestination ?? '无'}
${poiCtxLine ? `- ${poiCtxLine}` : ''}

Session history:
${history || '（无历史）'}

Current query: "${input.query}"

Few-shot:
- 历史「三亚海景酒店」+「要带宠物的」→ contextualized_query: "三亚 允许携带宠物 海景酒店"
- 东京会话 +「我想去新宿吃拉面」→ contextualized_query: "东京 新宿 拉面"
- 「算了，改去大阪吧」→ discard_previous_destination: true, destination: "大阪"
- 「过几天想去上海迪士尼住一晚稍微好点的酒店」→ destination: "上海", poi: "迪士尼乐园", rank_level: "4星/5星/高档"

仅返回 JSON 对象，无解释文字。`;
}

export function getQueryRewriteStage1Schema(): Record<string, unknown> {
  return QUERY_REWRITE_STAGE1_SCHEMA;
}

export function getQueryRewriteJsonSchema(): Record<string, unknown> {
  return QUERY_REWRITE_STAGE1_SCHEMA;
}

function cleanJsonString(raw: string): string {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    const lines = jsonStr.split('\n');
    jsonStr = lines.slice(1, -1).join('\n');
  }
  if (jsonStr.startsWith('json\n')) {
    jsonStr = jsonStr.substring(4);
  }
  return jsonStr.trim();
}

export function parseStage1Response(
  response: string | Record<string, unknown>,
  fallbackInput: QueryRewriteInput,
): QueryRewriteStage1Result {
  const fallback = rewriteQueryWithRules(fallbackInput);
  try {
    const parsed =
      typeof response === 'string'
        ? (JSON.parse(cleanJsonString(response)) as Record<string, unknown>)
        : response;

    const contextualized = String(parsed.contextualized_query ?? '').trim();
    if (!contextualized) return fallback;

    const std = (parsed.standardized_query ?? {}) as Record<string, unknown>;
    return {
      original_query: String(parsed.original_query ?? fallbackInput.query),
      contextualized_query: applyAliasAndSpellCorrection(contextualized),
      standardized_query: {
        destination: std.destination ? String(std.destination) : undefined,
        poi: std.poi ? String(std.poi) : undefined,
        category: std.category ? String(std.category) : undefined,
        rank_level: std.rank_level ? String(std.rank_level) : undefined,
        duration: std.duration ? String(std.duration) : undefined,
        time_range: std.time_range ? String(std.time_range) : undefined,
        filters:
          std.filters && typeof std.filters === 'object'
            ? (std.filters as Record<string, unknown>)
            : undefined,
      },
      discard_previous_destination: Boolean(parsed.discard_previous_destination),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || fallback.confidence)),
    };
  } catch {
    return fallback;
  }
}

/** @deprecated 使用 parseStage1Response + assembleQueryRewriteResult */
export function parseQueryRewriteResponse(
  response: string | Record<string, unknown>,
  fallbackInput: QueryRewriteInput,
): QueryRewriteResult {
  const stage1 = parseStage1Response(response, fallbackInput);
  return assembleQueryRewriteResult(stage1, fallbackInput, {
    stage1_source: 'llm',
    stage2_deterministic: true,
    stage2_generative: false,
  });
}

export interface PostProcessOptions {
  normalizeEntity: (raw: string | undefined) => string | undefined;
  constrainDestination: (dest: string | undefined, candidates: string[]) => string | undefined;
  candidateEntities: string[];
}

/** Stage 2a：确定性图谱映射 + 静态扩展 */
export function postProcessStandardization(
  stage1: QueryRewriteStage1Result,
  input: QueryRewriteInput,
  dict: PostProcessOptions,
): QueryRewriteResult {
  const scene = input.scene ?? 'general';
  let contextualized = applyAliasAndSpellCorrection(stage1.contextualized_query);
  const std = { ...stage1.standardized_query };

  if (std.destination) {
    const normalized = dict.normalizeEntity(std.destination);
    std.destination = dict.constrainDestination(normalized, dict.candidateEntities);
  }
  if (std.poi) {
    std.poi = dict.normalizeEntity(std.poi) ?? std.poi;
  }
  if (std.destination && !contextualized.includes(std.destination)) {
    contextualized = normalizeWhitespace(`${std.destination} ${contextualized}`);
  }
  if (std.poi && !contextualized.includes(std.poi)) {
    contextualized = normalizeWhitespace(`${contextualized} ${std.poi}`);
  }

  const filters = { ...(std.filters ?? {}) };
  if (containsAny(contextualized, PET_FRIENDLY_TERMS)) {
    filters.pet_friendly = true;
  }
  if (Object.keys(filters).length) std.filters = filters;

  let result: QueryRewriteResult = {
    original_query: stage1.original_query,
    contextualized_query: contextualized,
    expansion_routes: {
      synonym: buildSynonymExpansions(contextualized, scene),
      hyponym: buildHyponymExpansions(contextualized, std.destination),
      scenario: buildScenarioExpansions(contextualized),
    },
    standardized_query: std,
    confidence: stage1.confidence,
    pipeline: {
      stage1_source: 'llm',
      stage2_deterministic: true,
      stage2_generative: false,
    },
  };

  if (scene === 'poi' && input.poiContext) {
    result = applyPoiContextEnrichment(result, input.poiContext);
  }
  return result;
}

export function assembleQueryRewriteResult(
  stage1: QueryRewriteStage1Result,
  input: QueryRewriteInput,
  pipeline: QueryRewriteResult['pipeline'],
  extraScenario: string[] = [],
): QueryRewriteResult {
  const scene = input.scene ?? 'general';
  const contextualized = applyAliasAndSpellCorrection(stage1.contextualized_query);
  const std = { ...stage1.standardized_query };
  const scenario = [...new Set([...buildScenarioExpansions(contextualized), ...extraScenario])].slice(0, 6);

  let result: QueryRewriteResult = {
    original_query: stage1.original_query,
    contextualized_query: contextualized,
    expansion_routes: {
      synonym: buildSynonymExpansions(contextualized, scene),
      hyponym: buildHyponymExpansions(contextualized, std.destination),
      scenario,
    },
    standardized_query: std,
    confidence: stage1.confidence,
    pipeline,
  };

  if (scene === 'poi' && input.poiContext) {
    result = applyPoiContextEnrichment(result, input.poiContext);
  }
  return result;
}

/** 将改写结果合并进 MCP / Hotel 搜索参数 */
export function applyQueryRewriteToToolParams(
  toolParams: Record<string, unknown>,
  rewrite: QueryRewriteResult,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...toolParams };
  const std = rewrite.standardized_query;

  if (rewrite.contextualized_query) {
    next.query = rewrite.contextualized_query;
    next.naturalLanguage = rewrite.contextualized_query;
  }
  next.queryRewriteResult = rewrite;
  if (std.destination && !next.destination) {
    next.destination = std.destination;
  }
  if (std.poi) {
    const q = String(next.query ?? '');
    if (!q.includes(std.poi)) {
      next.query = normalizeWhitespace(`${q} ${std.poi}`);
    }
  }
  if (std.rank_level && /高档|5星|4星/.test(std.rank_level) && next.minRating == null) {
    next.minRating = 4;
  }
  next.skipQueryRewrite = true;
  if (std.filters && typeof std.filters === 'object') {
    next.filters = {
      ...(typeof next.filters === 'object' && next.filters ? next.filters : {}),
      ...std.filters,
    };
    next.preferences = {
      ...(typeof next.preferences === 'object' && next.preferences ? next.preferences : {}),
      ...std.filters,
    };
  }
  return next;
}

export function shouldEnableGenerativeExpansion(input: QueryRewriteInput): boolean {
  if (input.options?.enableGenerativeExpansion != null) {
    return input.options.enableGenerativeExpansion;
  }
  return input.profile !== 'agent_internal';
}

export function isAccommodationRewriteScene(scene?: QueryRewriteScene): boolean {
  return scene === 'accommodation' || scene === 'hotel';
}
