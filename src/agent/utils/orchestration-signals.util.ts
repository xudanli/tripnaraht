// src/agent/utils/orchestration-signals.util.ts

import type { IntentMode } from '../constants/intent-mode.constants';
import { INTENT_MODE_VALUES } from '../constants/intent-mode.constants';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { isExecutableFlightInventoryQuery } from './flight-inventory-signals.util';
import { matchesAnyDataLookupProfile } from '../intent/intent-profile-registry';
import { detectItineraryDayViewIntent } from './itinerary-day-view.util';
import { detectItineraryAdjustIntent, detectFullTripReplanIntent } from './itinerary-adjust-intent.util';
import { normalizeLiveTools } from './live-tools.util';
import { isAgentTripComprehensiveAnalysisMessage } from './agent-readiness-phase.util';
import { isTeamStructuredDiscussionQuery } from './team-structured-discussion.util';
import { resolveRouteAndRunUserMessage } from './resolve-route-and-run-message.util';

/**
 * 任务类型
 */
export type TaskType =
  | 'TRIP_PLANNING'
  | 'CRUD'
  | 'DATA_LOOKUP'
  | 'CUSTOMER_SUPPORT'
  | 'RAG_QA'
  | 'BOOKING_WORKFLOW'
  | 'GENERIC_QA';

/**
 * 风险级别
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 复杂度级别
 */
export type ComplexityLevel = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

/**
 * route_and_run 产品能力面：用于 eval 固定“用户想做哪类事”，不要只看 taskType。
 */
export type RouteRunCapability =
  | 'PLANNING_AND_REVISION'
  | 'FAST_QA'
  | 'CRUD_EDIT'
  | 'SAFETY_NEGOTIATION'
  | 'DELIVERY'
  | 'CLARIFICATION';

export type RouteRunActionKind =
  | 'FULL_TRIP_PLANNING'
  | 'EXISTING_TRIP_ROUTE_OPTIMIZATION'
  | 'LOCAL_ITINERARY_EDIT'
  | 'TRIP_SCOPED_CONSULTATION'
  | 'BOOKING_OR_DELIVERY_HANDOFF'
  | 'SAFETY_OR_TRADEOFF_REVIEW'
  | 'TEAM_STRUCTURED_DISCUSSION'
  | 'CLARIFICATION_RESPONSE'
  | 'GENERIC';

/**
 * 路由信号（从请求中提取的信号）
 */
export interface RoutingSignals {
  taskType: TaskType;
  capability: RouteRunCapability;
  actionKind: RouteRunActionKind;
  risk: RiskLevel;
  needsAudit: boolean;
  latencyBudgetMs: number;
  complexity: ComplexityLevel;
  requiresStructuredOutput: boolean;
  expectsToolCalls: boolean;
  legacyWellSupported: boolean;
  /** options.intent_mode，缺省为 AUTO */
  intent_mode_requested: IntentMode;
  /** AUTO 推断或显式 intent 对应的展示档位（与 RouteDecision.task_type 对齐） */
  intent_mode_resolved: 'TRIP_PLANNING' | 'DATA_LOOKUP' | 'GENERIC_QA';
}

const DEFAULT_MAX_SECONDS = 60;

/**
 * 明确「改行程 / 生成日程」意图（有 trip_id 时用于与「行程内咨询」分流）。
 * 须早于 `isTripScopedConsultationQuery` 内的交通/路况等子串判断：否则「自驾返回…」会先命中用车咨询而误判 DATA_LOOKUP。
 */
const EXPLICIT_TRIP_PLANNING_VERBS_ZH: readonly string[] = [
  '生成',
  '安排',
  '规划',
  '修改',
  '调整',
  '重排',
  '替换',
  '删掉',
  '删去',
  '加上',
  '减去',
  '加一天',
  '减一天',
  '预订行程',
  '生成行程',
  '做行程',
  '排行程',
  '改行程',
  '换酒店',
  '换景点',
  '订票',
  '订酒店',
  '插入',
  '更新',
  '移动',
  '新增',
  '去掉',
];

const EXPLICIT_TRIP_PLANNING_VERBS_EN: readonly string[] = [
  'create itinerary',
  'create a new itinerary',
  'generate itinerary',
  'generate a new itinerary',
  'itinerary json',
  'plan my trip',
  'plan a trip',
  'plan the trip',
  'modify itinerary',
  'modify the itinerary',
  'update itinerary',
  'update the itinerary',
  'change itinerary',
  'change the itinerary',
  'edit itinerary',
  'edit the itinerary',
  'adjust itinerary',
  'adjust the itinerary',
  'revise itinerary',
  'replan',
  'replan my trip',
  'replan the trip',
  'apply the compromise',
  'apply compromise',
  'change day',
  'replace poi',
  'remove day',
  'add day',
  'book hotel',
  'book flight',
  'reschedule',
];

function hasExplicitTripPlanningIntent(msg: string, msgLower: string): boolean {
  if (
    EXPLICIT_TRIP_PLANNING_VERBS_ZH.some((v) => msg.includes(v)) ||
    EXPLICIT_TRIP_PLANNING_VERBS_EN.some((v) => msgLower.includes(v))
  ) {
    return true;
  }
  if (/plan\s+a\s+(?:\d|\w+\s+day|\w+\s+minimal|\w+\s+short)/i.test(msgLower)) {
    return true;
  }
  if (/\d+\s*[- ]?\s*day\s+trip/i.test(msgLower)) {
    return true;
  }
  if (/天游|环岛/.test(msg)) {
    return true;
  }
  return false;
}

/**
 * 西峡湾路段：用户陈述「这段不开车/想坐小飞机/到了再租车」等接驳偏好，意在可行性咨询而非整表重排。
 * 须优先于 `hasReplanningEditSignalBeforeTransportConsult`（否则会因 `hasSegmentTransportModeReplanningSignal` 误判 TRIP_PLANNING）。
 * 显式「这段改成…/从 A 到 B 改成…」仍走规划钳位。
 */
/** 导出供轻量问答等路径复用：避免与「强改稿」分流重复实现。 */
export function isWestfjordsLegTransportPreferenceConsultation(msg: string, msgLower: string): boolean {
  if (hasExplicitTripPlanningIntent(msg, msgLower)) {
    return false;
  }
  if (
    /(?:修改|调整|重排|替换|改行程|换酒店|换景点|加一天|减一天|删掉|删去|加上|减去|订票|订酒店|插入|更新|移动|新增|去掉|生成行程|做行程|排行程|预订行程|折中方案)/.test(
      msg,
    )
  ) {
    return false;
  }
  if (/(?:生成|重排|替换)(?:\s|的|了|过|新|一下|一份|个)?(?:行程|日程|计划|草案|json|itinerary)/i.test(msg)) {
    return false;
  }
  if (/这段.{0,18}?(?:改成|改为|改(?:乘|坐)|换乘|换掉)/.test(msg)) {
    return false;
  }
  if (/(?:从|由).{2,22}?(?:到|往|至).{2,22}.{0,28}?(?:我想|我要)?(?:改成|改为|改(?:乘|坐)|换乘)/.test(msg)) {
    return false;
  }

  const westfjords =
    /西峡湾|西部峡湾|韦斯特峡湾/i.test(msg) ||
    /\bwestfjords\b|\bísafjörður\b|\bisafjordur\b|\bvestfirðir\b/i.test(msgLower);
  if (!westfjords) {
    return false;
  }

  const segWishZh =
    /(?:这段|这一?段).{0,20}?(?:不开(?:了)?车|不想开|不开了|不自驾)|(?:不开(?:了)?车|不想开|不开了|不自驾).{0,35}?(?:小)?(?:飞机|航班|直飞)|想坐.{0,10}?(?:小)?(?:飞机|直升机)|后面再租车|之后再租车|到(?:了)?那边再租车|分段租车/i.test(
      msg,
    );
  const segWishEn =
    /\b(?:won't|will\s+not|not)\s+driv(?:e|ing)\b.{0,40}?\b(?:plane|flight)\b|\btake\s+(?:a\s+)?(?:small\s+)?plane\b|\brent(?:\s+a\s+car)?\s+(?:later|after)\b/i.test(
      msgLower,
    );
  if (!segWishZh && !segWishEn) {
    return false;
  }

  return true;
}

/** 路段改接驳时允许匹配的运载方式（须与「这段/不开车/改乘/从 A 到 B」等锚点组合，见 hasSegmentTransportModeReplanningSignal） */
const SEGMENT_TRANSPORT_MODALITY_ZH =
  '飞机|航班|小飞机|直飞|渡轮|轮渡|渡船|邮轮|大巴|长途车|巴士|公交车?|火车|高铁|动车|磁悬浮|船|客运|地铁|轻轨|有轨电车|直升机|网约车|拼车|顺风车|缆车|索道|观光车|接驳车|区间车|电瓶车|快艇|摩托艇|水上巴士|水上出租|共享单车|共享电单车|电动滑板车|滑板车';

/**
 * 路段上「改交通方式」（不开车改飞机/渡轮/大巴等）：语义是改接驳/重排，不应被句中句末「租车」「自驾」
 * 子串单独命中 `transportConsultZh` 打成纯 DATA_LOOKUP；与显式动词并列，仍**不含**泛用「规划/安排」。
 *
 * 刻意不把裸「想坐大巴」等单独成条，以免「怎么坐大巴」类纯咨询误判 TRIP_PLANNING；依赖「这段/从 A 到 B/不开车/改乘」等锚点。
 */
function hasSegmentTransportModeReplanningSignal(msg: string, msgLower: string): boolean {
  const m = SEGMENT_TRANSPORT_MODALITY_ZH;
  const zhRe = new RegExp(
    `这段.{0,16}?(?:不开(?:了)?车|不想开|不开了|不自驾)|(?:不开(?:了)?车|不想开|不开了|不自驾).{0,28}?(?:${m})|想坐.{0,8}?(?:小)?(?:飞机|直升机|渡轮|缆车|快艇|摩托艇)|(?:改(?:乘|坐)|换乘|改走).{0,12}?(?:${m})|支线(?:航班|飞机)|(?:坐飞机|乘飞机|搭飞机|坐地铁|乘地铁|搭地铁|坐缆车|乘索道|坐快艇|搭快艇)(?:去|的)?|(?:从|由).{2,22}?(?:到|往|至).{2,22}.{0,18}?(?:不开(?:了)?车|不想开|不开了|不自驾)|这段.{0,20}?(?:改成|改为|改(?:乘|坐)|换乘|换).{0,14}?(?:${m})|(?:从|由).{2,22}?(?:到|往|至).{2,22}.{0,28}?(?:我想|我要)?(?:改成|改为|改(?:乘|坐)|换乘).{0,12}?(?:${m})`,
  );
  const en =
    /\b(?:won't|will\s+not|not)\s+driv(?:e|ing)\b|\b(?:take|switch|change)\s+to\s+(?:a\s+)?(?:the\s+)?(?:small\s+)?plane\b|\btake\s+(?:a\s+)?(?:small\s+)?plane\b|\b(?:internal|domestic|regional)\s+flights?\b|\b(?:fly|flying)\s+(?:this\s+)?(?:leg|segment)\b|\b(?:switch|change)\s+to\s+(?:a\s+)?(?:the\s+)?(?:ferry|buses|bus|trains|train|coaches|coach|subway|metro|light\s+rail|streetcar|tram|helicopter|rideshare|cable\s+car|gondola|funicular|ropeway|shuttle(?:\s+bus)?|airport\s+shuttle|hotel\s+shuttle|maglev|water\s+taxi|speedboats?|motorboats?|e-?scooters?|bike-?share)\b/i.test(
      msgLower,
    );
  return zhRe.test(msg) || en;
}

/**
 * 早于「交通/用车咨询」中的「自驾」等子串判断：专用于改稿话术，**不含**单字「规划/安排」，
 * 以免「行程规划情况」「目前安排怎么样」被当成重规划。
 */
function hasReplanningEditSignalBeforeTransportConsult(msg: string, msgLower: string): boolean {
  if (
    /(?:修改|调整|重排|替换|改行程|换酒店|换景点|加一天|减一天|删掉|删去|删除|移除|加上|减去|订票|订酒店|插入|更新|移动|新增|去掉|生成行程|做行程|排行程|预订行程|折中方案)/.test(
      msg,
    )
  ) {
    return true;
  }
  if (/(?:生成|重排|替换)(?:\s|的|了|过|新|一下|一份|个)?(?:行程|日程|计划|草案|json|itinerary)/i.test(msg)) {
    return true;
  }
  if (hasSegmentTransportModeReplanningSignal(msg, msgLower)) {
    return true;
  }
  if (/不要改|仍按原|坚持.{0,8}(?:计划|方案)|按原计划/i.test(msg)) {
    return true;
  }
  return EXPLICIT_TRIP_PLANNING_VERBS_EN.some((v) => msgLower.includes(v));
}

/**
 * 从请求中提取路由信号
 * 
 * @param req 路由请求 DTO
 * @returns 路由信号
 */
export function signalsFromRequest(req: RouteAndRunRequestDto): RoutingSignals {
  const msg = resolveRouteAndRunUserMessage(req);
  const msgLower = msg.toLowerCase();

  const options = req.options ?? {};
  const ctx = req.conversation_context ?? {};
  const recentCount = ctx.recent_messages?.length ?? 0;

  // 归一化延迟预算（毫秒）
  const latencyBudgetMs = clampInt((options.max_seconds ?? DEFAULT_MAX_SECONDS) * 1000, 0, 5 * 60_000);

  const intent_mode_requested = parseIntentMode(options?.intent_mode);

  // 推断各项信号（intent_mode 非 AUTO 时覆盖 taskType）
  const inferredTaskType = inferTaskType(req.trip_id, msg, msgLower);
  const teamStructuredDiscussion = isTeamStructuredDiscussionQuery(msg);
  let taskType = teamStructuredDiscussion
    ? 'DATA_LOOKUP'
    : inferredTaskType;
  taskType = applyIntentModeToTaskType(intent_mode_requested, taskType, req);
  /** 前端「深度思考」等场景常误传 intent_mode=GENERIC_QA；已绑定 trip 且用户明确改稿时仍须走 TRIP_PLANNING，避免 ui_surface=consultation */
  taskType = clampTaskTypeForBoundTripReplanning(req.trip_id, msg, msgLower, taskType);
  const complexity = inferComplexity(msg, recentCount);
  const expectsToolCalls = inferExpectsToolCalls(taskType, msg, msgLower, options.allow_webbrowse);
  const requiresStructuredOutput = inferRequiresStructuredOutput(taskType, req.trip_id);
  const needsAudit = inferNeedsAudit(taskType, requiresStructuredOutput, options);
  const risk = inferRisk(taskType, msg, msgLower);
  const { capability, actionKind } = inferRouteRunCapability(req, taskType, msg, msgLower);

  const legacyWellSupported = inferLegacyWellSupported(taskType, complexity);
  const intent_mode_resolved = taskTypeToIntentBucket(taskType);

  return {
    taskType,
    capability,
    actionKind,
    risk,
    needsAudit,
    latencyBudgetMs,
    complexity,
    requiresStructuredOutput,
    expectsToolCalls,
    legacyWellSupported,
    intent_mode_requested,
    intent_mode_resolved,
  };
}

function parseIntentMode(raw: string | undefined): IntentMode {
  if (raw && (INTENT_MODE_VALUES as readonly string[]).includes(raw)) {
    return raw as IntentMode;
  }
  return 'AUTO';
}

/** 显式 intent 覆盖服务端推断（AUTO 保留推断结果） */
function applyIntentModeToTaskType(
  mode: IntentMode,
  inferred: TaskType,
  req?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
): TaskType {
  if (mode === 'AUTO') return inferred;
  const msg = String(req?.message ?? '').trim();
  if (mode === 'TRIP_PLANNING') return 'TRIP_PLANNING';
  if (mode === 'DATA_LOOKUP') return 'DATA_LOOKUP';
  if (
    shouldForceDataLookupForBoundTripReview({
      trip_id: req?.trip_id,
      message: msg,
    })
  ) {
    return 'DATA_LOOKUP';
  }
  return 'GENERIC_QA';
}

/** 已绑定 Trip 且为改排/节奏调整意图 → 须走 TRIP_PLANNING / ITINERARY_ADJUST 全链路 */
export function shouldRouteBoundTripAsItineraryAdjust(
  tripId: string | null | undefined,
  msg: string,
  dateRange?: { start_date?: string; end_date?: string },
): boolean {
  const tid = tripId?.trim();
  if (!tid) return false;
  if (detectFullTripReplanIntent(msg, dateRange)) return false;
  return detectItineraryAdjustIntent(msg, dateRange);
}

/**
 * 已绑定行程且用户话术中为「改行程/生成草案」等强规划信号时，将误传的 GENERIC_QA / DATA_LOOKUP 钳回 TRIP_PLANNING。
 * 节奏类改排（如「第三天轻松点」）经 `detectItineraryAdjustIntent` 同样钳位。
 * 不影响纯咨询（无改排信号时保持原 taskType）。
 */
function clampTaskTypeForBoundTripReplanning(
  tripId: string | null | undefined,
  msg: string,
  msgLower: string,
  taskType: TaskType,
): TaskType {
  const tid = tripId?.trim();
  if (!tid) return taskType;
  if (isTeamStructuredDiscussionQuery(msg)) {
    return taskType === 'TRIP_PLANNING' ? 'DATA_LOOKUP' : taskType;
  }
  if (isWestfjordsLegTransportPreferenceConsultation(msg, msgLower)) {
    return taskType;
  }
  if (isBoundTripLodgingDiningPlanQuery(msg, msgLower) && !detectItineraryAdjustIntent(msg)) {
    return taskType === 'TRIP_PLANNING' ? 'DATA_LOOKUP' : taskType;
  }
  if (
    isTripStatusOverviewQuery(msg, msgLower) &&
    !detectItineraryAdjustIntent(msg) &&
    !detectFullTripReplanIntent(msg)
  ) {
    return taskType === 'TRIP_PLANNING' ? 'DATA_LOOKUP' : taskType;
  }
  if (taskType === 'TRIP_PLANNING') return taskType;
  const hasBoundTripAdjustIntent =
    detectItineraryAdjustIntent(msg) ||
    detectFullTripReplanIntent(msg) ||
    hasReplanningEditSignalBeforeTransportConsult(msg, msgLower);
  if (!hasBoundTripAdjustIntent) return taskType;
  if (
    taskType === 'GENERIC_QA' ||
    taskType === 'DATA_LOOKUP' ||
    taskType === 'RAG_QA'
  ) {
    return 'TRIP_PLANNING';
  }
  return taskType;
}

export function isExistingTripRouteOrderOptimizationQuery(
  tripId: string | null | undefined,
  msg: string,
  msgLower = msg.toLowerCase(),
): boolean {
  if (!tripId?.trim()) return false;
  return /(?:优化|调整|重排|重新排序|reorder|optimi[sz]e).{0,24}(?:路线顺序|路线|交通时间|通勤|route\s*order|travel\s*time)|(?:路线顺序|交通时间|通勤|route\s*order|travel\s*time).{0,24}(?:优化|调整|重排|重新排序|reorder|optimi[sz]e)/i.test(
    `${msg}\n${msgLower}`,
  );
}

function isLocalItineraryEditQuery(tripId: string | null | undefined, msg: string, msgLower: string): boolean {
  if (!tripId?.trim()) return false;
  return (
    /(?:删除|删掉|删去|去掉|添加|新增|加上|加入|插入|移动|挪到|放到|换成|替换|改时间|改到).{0,24}(?:景点|地点|POI|行程项|第\s*\d+\s*天|day\s*\d+|酒店|餐厅)/i.test(msg) ||
    /(?:remove|delete|add|insert|move|replace|change).{0,24}(?:poi|place|stop|item|day\s*\d+|hotel|restaurant)/i.test(msgLower)
  );
}

function isSafetyOrTradeoffQuery(msg: string, msgLower: string): boolean {
  return (
    /(?:安全|风险|阻断|太赶|疲劳|节奏|协商|权衡|折中|Abu|Dr\.?\s*Dre|Neptune|三人格)/i.test(msg) ||
    /\b(?:risk|safety|fatigue|trade-?off|negotiate|blocked|too tight)\b/i.test(msgLower)
  );
}

function isDeliveryOrBookingHandoffQuery(msg: string, msgLower: string): boolean {
  return (
    /(?:地图|日历|PDF|分享|语音|解说|购物车|预订优先级|跳转订|订票链接|deep link|晴雨方案|避坑|住宿健康度)/i.test(msg) ||
    /\b(?:map|calendar|pdf|share|voice|cart|booking link|deep link|handoff)\b/i.test(msgLower)
  );
}

function inferRouteRunCapability(
  req: RouteAndRunRequestDto,
  taskType: TaskType,
  msg: string,
  msgLower: string,
): { capability: RouteRunCapability; actionKind: RouteRunActionKind } {
  if (req.clarification_answers?.length) {
    return { capability: 'CLARIFICATION', actionKind: 'CLARIFICATION_RESPONSE' };
  }
  if (isExistingTripRouteOrderOptimizationQuery(req.trip_id, msg, msgLower)) {
    return { capability: 'PLANNING_AND_REVISION', actionKind: 'EXISTING_TRIP_ROUTE_OPTIMIZATION' };
  }
  if (isLocalItineraryEditQuery(req.trip_id, msg, msgLower) || taskType === 'CRUD') {
    return { capability: 'CRUD_EDIT', actionKind: 'LOCAL_ITINERARY_EDIT' };
  }
  if (isTeamStructuredDiscussionQuery(msg)) {
    return { capability: 'SAFETY_NEGOTIATION', actionKind: 'TEAM_STRUCTURED_DISCUSSION' };
  }
  if (isSafetyOrTradeoffQuery(msg, msgLower)) {
    return { capability: 'SAFETY_NEGOTIATION', actionKind: 'SAFETY_OR_TRADEOFF_REVIEW' };
  }
  if (isDeliveryOrBookingHandoffQuery(msg, msgLower) || taskType === 'BOOKING_WORKFLOW') {
    return { capability: 'DELIVERY', actionKind: 'BOOKING_OR_DELIVERY_HANDOFF' };
  }
  if (taskType === 'DATA_LOOKUP' || taskType === 'GENERIC_QA' || taskType === 'RAG_QA') {
    return { capability: 'FAST_QA', actionKind: 'TRIP_SCOPED_CONSULTATION' };
  }
  if (taskType === 'TRIP_PLANNING') {
    return { capability: 'PLANNING_AND_REVISION', actionKind: 'FULL_TRIP_PLANNING' };
  }
  return { capability: 'FAST_QA', actionKind: 'GENERIC' };
}

/** 与前端 RouteDecision / options.intent_mode 三档对齐 */
export function taskTypeToIntentBucket(
  taskType: TaskType,
): 'TRIP_PLANNING' | 'DATA_LOOKUP' | 'GENERIC_QA' {
  switch (taskType) {
    case 'TRIP_PLANNING':
      return 'TRIP_PLANNING';
    case 'DATA_LOOKUP':
      return 'DATA_LOOKUP';
    default:
      return 'GENERIC_QA';
  }
}

/**
 * 元对话：寒暄、自我介绍、能力/功能询问。优先级高于「有 trip_id → 默认 TRIP_PLANNING」的惯性，
 * 用于将请求分流到 DATA_LOOKUP（与「非规划检索」统计对齐）→ 轻量问答，避免误入全量规划状态机。
 *
 * 保守策略：命中明确的「行程/规划/目的地」类语义时不视为元对话。
 */
export function isMetaChatQuery(msg: string, msgLower: string): boolean {
  const t = msg.trim();
  if (!t) return false;

  // 较长输入极少是纯元对话（避免英文从句里误含 what can you do）
  if (t.length > 120) return false;

  const blocksTripOrPlanning =
    /(?:规划|安排)(?:一下)?(?:行程|日程)|生成(?:一下)?行程|改行程|重做|行程表|plan\s+(?:a\s+)?trip|itinerary|\d+\s*天(?:行程|安排|规划)?|几天(?:的)?(?:行程|安排)|替换.*景点|订(?:酒店|机票)|我想去|帮我(?:规划|安排|设计)|去(?:玩|旅游)|攻略(?=.*行程)|签证.*办理/m.test(msg) ||
    /trip|hotel|flight|itinerary|book(?:ing)?\s+(?:a\s+)?(?:hotel|flight)/i.test(msgLower);

  if (blocksTripOrPlanning) return false;

  const metaPatterns: RegExp[] = [
    /^您好[，,！!。\s]*$/,
    /^你好[，,！!。\s]*$/,
    /^hi\b[!?.，。\s]*$/i,
    /^hello\b[!?.，。\s]*$/i,
    /^hey\b[!?.，。\s]*$/i,
    /你是谁|你叫什么|哪位助手|什么助手|哪个模型|你是哪个|你是干嘛的|干啥的/,
    /能做什么|会做什么|可以做什么|能做啥|会干啥|有什么功能|有哪些功能/,
    /怎么用|如何使用|怎么上手|使用说明/,
    /^介绍一下(?:你们|产品|功能|助手|系统|自己)\b/,
    /产品介绍|功能列表|能力清单/,
    /^\s*what\s+can\s+you\s+do\b[!?.，。\s]*$/i,
    /^\s*who\s+are\s+you\b[!?.，。\s]*$/i,
    /^\s*what\s+are\s+your\s+capabilities\b[!?.，。\s]*$/i,
    /^\s*what\s+do\s+you\s+do\b[!?.，。\s]*$/i,
  ];

  if (metaPatterns.some((p) => p.test(t))) return true;

  // 短句：问候 + 能力/身份问法，且未出现常见旅行实体
  if (t.length <= 56 && /^(?:您好|你好)[，,]?\s*/.test(t)) {
    if (
      /(能做什么|会做什么|可以做什么|你是谁|干什么|哪位)/.test(t) &&
      !/(冰岛|日本|瑞士|尼泊尔|行程|旅游|机票|酒店|签证|自驾|景点)/.test(t)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 用户是否在询问当前行程草稿的进度、汇总或概览（与规划动词区分：需在「安排」等动词之前判断）。
 * 供轻量问答 Prompt 与路由共用。
 */
export function isTripStatusOverviewQuery(msg: string, msgLower: string): boolean {
  if (isAgentTripComprehensiveAnalysisMessage(msg)) {
    return true;
  }
  /** 含「规划」但实为看草稿状态：须在 isTripScopedConsultationQuery 里早于「规划」动词黑名单判断 */
  const tripReadinessZh =
    /规划情况|规划如何|规划得怎么样|查看.{0,12}行程.{0,14}(?:规划|情况)|行程.{0,16}(?:规划情况|说明|总结|解读)|准备度|合理不合理|是否合理|有没有不合理|有没有订酒店|酒店.{0,10}(?:订了|定了|有没有)|用餐安排|中晚餐|(?:午餐|晚餐).{0,10}(?:安排|有没有|订)|伙食|吃住怎么|吃喝怎么安排/.test(
      msg,
    );
  const tripStatusOverviewZh =
    /(?:行程|这趟|本次|当前|草稿|日程|计划).{0,24}?(?:什么(?:情况|样)|进度|怎么样了|汇总|概览)/.test(
      msg,
    ) ||
    /(?:这趟|本次|当前).{0,14}?(?:行程|计划).{0,18}?(?:进度|情况|汇总|概览|怎么样了)/.test(msg) ||
    /目前安排(?:怎么样|如何|是怎样的)?/.test(msg) ||
    /(?:进度|汇总|概览|怎么样了).{0,12}?(?:行程|计划|日程|草稿)/.test(msg);
  /** 绑定 Trip 上的「体检/复盘」问法（非改稿）：避免误入 TRIP_PLANNING → CGUS 决策驾驶舱 */
  const tripItineraryReviewZh =
    /(?:全面|详细|帮忙?)?分析.{0,32}(?:当前|现有|这份|这条)?(?:行程|日程|计划)/.test(msg) ||
    /(?:看看|检查|审视|评估|盘点).{0,24}(?:当前|现有)?(?:行程|日程|计划)/.test(msg) ||
    /(?:行程|日程|计划).{0,32}?(?:有没有|是否存在|有无).{0,16}?(?:问题|风险|不合理|短板|缺口)/.test(msg) ||
    /(?:行程|日程|计划).{0,16}?(?:体检|健康度|风险盘点)/.test(msg);
  const tripStatusOverviewEn =
    /\b(?:trip|itinerary)\s+(?:status|progress|overview|summary)\b/i.test(msgLower) ||
    /\bhow\s+(?:is|s|'s)\s+(?:my\s+)?(?:trip|itinerary)\b/i.test(msgLower) ||
    /\b(?:status|progress|overview)\s+of\s+(?:my\s+)?(?:trip|itinerary)\b/i.test(msgLower) ||
    /\b(readiness|preparedness)\b/i.test(msgLower) ||
    /\b(?:analyze|review|assess|audit)\s+(?:my\s+)?(?:current\s+)?(?:trip|itinerary)\b/i.test(
      msgLower,
    ) ||
    /\b(?:trip|itinerary)\s+(?:review|health\s+check|risk\s+assessment)\b/i.test(msgLower);
  return tripReadinessZh || tripStatusOverviewZh || tripItineraryReviewZh || tripStatusOverviewEn;
}

/**
 * 已绑定 trip 的「多日住宿 + 餐饮方案/策略」问法（非改稿、非整段重规划）。
 * 例：详细6天住宿和餐饮方案，黄金圈南岸到冰河湖，包括酒店推荐和每日用餐策略。
 */
export function isBoundTripLodgingDiningPlanQuery(msg: string, msgLower: string): boolean {
  const lodging =
    /住宿|酒店|民宿|客栈|过夜|住哪|订房|入住/i.test(msg) ||
    /\b(lodging|hotels?|accommodation|where to stay|airbnb|bnb)\b/i.test(msgLower);
  const dining =
    /餐饮|用餐|吃饭|膳食|餐厅|美食|伙食|早餐|午餐|晚餐|餐馆|吃什么|用餐策略|餐饮策略|餐食/i.test(msg) ||
    /\b(dining|meals?|restaurants?|food plan|where to eat|eating|meal strategy)\b/i.test(msgLower);
  const planCue =
    /方案|策略|计划|规划|推荐|安排|逐日|每天|每日|分天|按天/i.test(msg) ||
    /\b(detailed|plan|strategy|recommendations?)\b/i.test(msgLower);

  if (lodging && dining && planCue) return true;
  if (/吃住|食宿|餐饮.*住宿|住宿.*餐饮|酒店.*(?:餐|饭)|(?:餐|饭).*(?:酒店|住宿)/.test(msg)) {
    return true;
  }
  if (
    planCue &&
    (/\b(accommodation|lodging|hotels?).{0,48}(dining|meals?|food)\b/i.test(msgLower) ||
      /\b(dining|meals?|food).{0,48}(accommodation|lodging|hotels?)\b/i.test(msgLower))
  ) {
    return true;
  }
  const multiDay =
    /\d+\s*天|逐晚|每晚|各晚/i.test(msg) || /\b(multi[-\s]?day|\d+\s*days?)\b/i.test(msgLower);
  if (multiDay && lodging && dining) return true;

  return false;
}

/**
 * 绑定 trip 的轻量复盘/咨询问法。
 * 与 `isTripScopedConsultationQuery` 对齐，避免 Plan Studio 内「攻略/指南」类问法误落 TRIP_PLANNING 深度路径。
 */
export function isBoundTripLightConsultQuery(msg: string, msgLower?: string): boolean {
  const lower = msgLower ?? msg.toLowerCase();
  return isTripScopedConsultationQuery(msg, lower);
}

/**
 * 已绑定 trip 的「全面分析 / 体检 / 进度复盘 / 住宿+餐饮方案」问法：须走 DATA_LOOKUP 轻量咨询，
 * 即使前端或 PA generate 误传 intent_mode=TRIP_PLANNING。
 */
export function shouldForceDataLookupForBoundTripReview(
  req: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
): boolean {
  const tid = req.trip_id?.trim();
  const msg = String(req.message ?? '').trim();
  if (!tid || !msg) return false;
  const msgLower = msg.toLowerCase();
  if (!isBoundTripLightConsultQuery(msg, msgLower)) return false;
  if (detectItineraryAdjustIntent(msg)) return false;
  /** 多日住宿+餐饮方案是咨询输出，勿与整段重规划 intent 混淆 */
  if (isBoundTripLodgingDiningPlanQuery(msg, msgLower)) return true;
  if (detectFullTripReplanIntent(msg)) return false;
  return true;
}

/**
 * 就地修正 route_and_run 请求：复盘问法强制 DATA_LOOKUP + 跳过状态机。
 * 供 ExecutionGateway / AgentService 入口在 signals 解析前调用。
 */
export function applyBoundTripReviewRouteAndRunOverrideInPlace(request: RouteAndRunRequestDto): boolean {
  if (!shouldForceDataLookupForBoundTripReview(request)) {
    return false;
  }
  request.options = {
    ...request.options,
    intent_mode: 'DATA_LOOKUP',
    use_state_machine_orchestration: false,
  };
  if (request.trip_id?.trim()) {
    request.conversation_context = {
      ...(request.conversation_context ?? {}),
      context_type: request.conversation_context?.context_type ?? 'active_trip_summary',
    };
  }
  (request as RouteAndRunRequestDto & { __trip_review_data_lookup_override?: boolean }).__trip_review_data_lookup_override =
    true;
  return true;
}

/**
 * 用户主要关心「近期天气 + 道路/通行类提示」，而非租车攻略或「行程进度/住宿餐饮」式总览。
 * 用于轻量编排：避免孤立「路况」触发租车主旨，并避免「汇总」叠行程 Dashboard 模板。
 */
export function isWeatherRoadConditionFocusedQuery(msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const carPrimary =
    /租车|自驾|包车|提车|还车|车型|四驱|SUV|用车|碎石险|车行|驾照|交规/i.test(m) ||
    /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[-\s]?drive|rental\s+car)\b/i.test(lower);
  if (carPrimary) return false;
  const hasWx = /天气|气象|气温|降雨|刮风|大风|暴雨|降雪|forecast|\bweather\b/i.test(m);
  const hasRoad = /路况|道路|封路|闭路|修路|交通管制|通行|路面|滑坡|风吹门/i.test(m);
  if (hasWx && hasRoad) return true;
  if (
    hasWx &&
    /近期|出发前|注意|预警|汇总|提醒/.test(m) &&
    /目的地|行程|旅途|出行|当地/.test(m)
  ) {
    return true;
  }
  return false;
}

/**
 * 用户问「今天/今日」实况天气（非季节气候、非租车+路况复合咨询）。
 * 用于轻量路径自动拉 Open-Meteo 当前观测。
 */
export function isTodayWeatherFactQuery(msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const carPrimary =
    /租车|自驾|包车|提车|还车|车型|四驱|SUV|用车|碎石险|车行|驾照|交规/i.test(m) ||
    /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[-\s]?drive|rental\s+car)\b/i.test(lower);
  if (carPrimary) return false;

  const hasWx = /天气|气象|气温|温度|下雨|降雨|刮风|风大|下雪|forecast|\bweather\b/i.test(m);
  if (!hasWx) return false;

  if (/几月|月份|季节|通常|一般|平均|常年|气候特点|最佳时间|什么时候去|historically/i.test(m)) {
    return false;
  }

  const todayCue =
    /今天|今日|此刻|当前|这会儿|这阵儿|right now|\btoday\b|\bnow\b/i.test(m) ||
    /(今天|今日).*(天气|气温|温度|下雨|风)/.test(m) ||
    /(天气|气温|温度|weather).*(今天|今日|today|now)/i.test(m) ||
    /天气怎么样|天气如何|天气怎样|多少度|几度|下不下雨/i.test(m);

  return todayCue;
}

/**
 * 轻量 DATA_LOOKUP 等：是否并发注入 `iceland.rentalGuidance`（与 Booking 租车 MCP 双路合并）。
 * 条件：话术命中冰岛语境 + 租车/保险/F-road/指定本地品牌等；或行程摘要已锚 IS/冰岛且用户问租车相关。
 */
export function shouldInjectIcelandRentalGuidanceForLightweight(
  message: string | undefined,
  tripContextJoined: string,
): boolean {
  const m = (message ?? '').trim();
  const t = (tripContextJoined ?? '').trim();
  if (!m && !t) return false;

  const icelandCtx =
    /冰岛|\bIceland\b|雷克雅未克|Reykjavik|凯夫拉维克|KEF|斯奈山|南岸|米湖|黄金圈|环岛|维克|塞里雅兰/i.test(m) ||
    /冰岛|\bIceland\b|目的地代码:\s*IS\b|国家代码:\s*IS\b/i.test(t);

  const rentalTopic =
    /(冰岛|Iceland).*(租车|车行|保险|F路|F-road|全险|自驾安全|Blue|Lotus|Zero|Lava)/i.test(m) ||
    /(租车|车行|保险|F路|F-road|全险|自驾安全|Blue|Lotus|Zero|Lava).*(冰岛|Iceland)/i.test(m) ||
    /租车|车行|自驾租车|碎石险|砂石险|全险|免赔|车行|car\s+rental|rent\s+a\s+car/i.test(m);

  const brandOnly = /\b(Blue|Lotus|Zero|Lava)\s+Car\b/i.test(m) || /(Blue|Lotus|Zero|Lava).*租车/i.test(m);

  if (!icelandCtx) return false;
  return rentalTopic || brandOnly;
}

/**
 * 轻量问答：是否应拉取 SafeTravel RSS（写入 `lightweight_research_data`，供红警闸与 `safety_surface.safetravel_route_alerts`）。
 * 避免「冰岛几月好」类泛问也打外网；仅在行程锚 IS、租车/路况意图、显式风险问法时启用。
 */
export function shouldPullSafetravelAdvisoriesForLightweightIceland(input: {
  message: string | undefined;
  tripContextJoined: string;
  hasAnchoredTripFact: boolean;
  weatherRoadFocused: boolean;
}): boolean {
  const m = (input.message ?? '').trim();
  const t = (input.tripContextJoined ?? '').trim();
  const icelandAnchored =
    input.hasAnchoredTripFact && /目的地代码:\s*IS\b|国家代码:\s*IS\b/i.test(t);
  const explicitRiskQuery =
    /safetravel|safe\s*travel|红警|封路|极端天气|火山|路况预警|橙色预警|红色预警|do\s+not\s+travel|unsafe\s+to\s+travel/i.test(
      m,
    );
  const icelandMsg =
    /冰岛|\bIceland\b|雷克雅未克|Reykjavik|凯夫拉维克|KEF|斯奈山|南岸|米湖|黄金圈|环岛|维克|塞里雅兰/i.test(m);
  const drivingish =
    /自驾|租车|行车|路况|道路|封路|F-road|F路|\bF\s*\d{2,3}\b|高地|内陆|碎石|横风/i.test(m);
  return (
    icelandAnchored ||
    shouldInjectIcelandRentalGuidanceForLightweight(m, t) ||
    input.weatherRoadFocused ||
    explicitRiskQuery ||
    (icelandMsg && drivingish)
  );
}

/**
 * 轻量路径（DATA_LOOKUP / GENERIC_QA / RAG_QA）是否应尝试天气 MCP。
 * 与 `ClaudeOrchestratorService.shouldAttemptLiveWeatherSensor` 中「开关 + 话术」逻辑对齐（不含 `mcpToolDispatcher` 是否注入）。
 */
export function shouldEnableLiveWeatherMcpForLightweightRoute(
  routingTaskType: TaskType | string | undefined,
  message: string | undefined,
  options?: RouteAndRunRequestDto['options'],
): boolean {
  const rt = routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(options?.enable_live_tools);
  const liveFacts = options?.intent_flags?.live_facts === true;
  const msg = message ?? '';
  if (tools.includes('weather')) return true;
  if (liveFacts && /天气|气温|降雨|刮风|forecast|weather/i.test(msg)) return true;
  if (isTodayWeatherFactQuery(msg)) return true;
  if (isWeatherRoadConditionFocusedQuery(msg)) return true;
  return false;
}

/**
 * 当地当前时间 / 时区 / 时差（与行程草案无关）。
 * 轻量编排用于：跳过整段行程摘要、并行 MCP、`<<<CONSULTATION_UI_JSON>>>`，避免「几点钟」触发预算/风险长文。
 */
export function isLocalClockOrTimezoneFactQuery(msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const factualClockZh =
    /(?:现在|当前)(?:是)?几点|几点了|当地(?:几点|时间)|时差多少|几小时差|时区|比北京|慢几小时|快几小时|GMT|UTC/i;
  const factualClockEn =
    /\bwhat\s+time\s+(?:is\s+it|now)\b/i.test(lower) ||
    /\bcurrent\s+(?:local\s+)?time\b/i.test(lower) ||
    /\btime\s+in\b/i.test(lower);
  return factualClockZh.test(m) || factualClockEn;
}

/** 人口/面积/GDP 等宏观事实（与行程草案无关），与 `isLocalClockOrTimezoneFactQuery` 同用于轻量编排收紧 */
export function isFactualMacroStatQuery(msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const factualMacroStatZh =
    /人口|面积(?:多大|多少)|有多少(?:万)?人|GDP|国内生产总值|共有.*座城/i;
  const factualMacroStatEn =
    /\bpopulation\b|\bhow\s+many\s+people\b|\bhow\s+big\s+(?:is|are)\b/i.test(lower);
  return factualMacroStatZh.test(m) || factualMacroStatEn;
}

/**
 * 用户是否在查看已有 Trip 上某一日的安排（只读，非改稿/重规划）。
 */
export function isItineraryDayViewQuery(msg: string): boolean {
  return detectItineraryDayViewIntent(msg);
}

/**
 * 在「已有行程会话」(trip_id 存在) 下，识别纯咨询/检索类问题，避免一律走 TRIP_PLANNING 状态机。
 *
 * 规则：命中咨询词且未命中强规划意图 → 视为 DATA_LOOKUP（保留 trip 上下文由上游决定，仅任务类型分流）。
 */
function isTripScopedConsultationQuery(msg: string, msgLower: string): boolean {
  if (isItineraryDayViewQuery(msg)) {
    return true;
  }
  if (isWestfjordsLegTransportPreferenceConsultation(msg, msgLower)) {
    return true;
  }
  /** 改排/节奏调整（如「第三天轻松点」）须在 DATA_LOOKUP profile 之前排除，避免误入轻量咨询 */
  if (detectItineraryAdjustIntent(msg)) {
    return false;
  }
  /** 用户拒绝改线/坚持原计划 → 非咨询，走规划/协商 */
  if (/不要改|仍按原|坚持.{0,8}(?:计划|方案)|按原计划/i.test(msg)) {
    return false;
  }
  /** 景点开放/营业时间事实问（绑定 trip 仍走快答） */
  if (
    /(?:开放|营业|开馆|闭馆|关门).{0,12}(?:吗|么|呢)|周[一二三四五六日天].{0,16}(?:开放|营业|开吗)/.test(
      msg,
    )
  ) {
    return true;
  }
  /** 改行程话术里常同时出现「自驾/路况」等，必须在交通咨询分支之前排除（窄信号，避免误伤「规划情况」类问法） */
  if (hasReplanningEditSignalBeforeTransportConsult(msg, msgLower)) {
    return false;
  }

  /**
   * Intent Profile Registry：餐饮/补给/住宿/交通/单日可行性等 DATA_LOOKUP 咨询。
   * 新增国家/品类时优先扩展 `src/agent/intent/intent-profile-registry.ts`。
   */
  if (matchesAnyDataLookupProfile(msg, {})) {
    return true;
  }

  /**
   * 票务预约提前量 / 购票 logistics（例：蓝湖门票提前多久订）。
   * 若不命中，仅有 trip_id 时会被默认 TRIP_PLANNING → 状态机输出无关单日占位日程。
   */
  const ticketBookingLogisticsZh =
    /(?:门票|入场券).{0,24}?(?:多久|提前|预订|预约)|(?:多久|几天).{0,16}?(?:提前|预订|订座|要买)|提前(?:多久|几天)|(?:蓝湖|温泉|博物馆).{0,12}?(?:门票|预定)/;
  const ticketBookingLogisticsEn =
    /\bhow\s+far\s+in\s+advance\b|\bhow\s+early\s+(?:do|should|to)\b|\blead\s*time\b|\btickets?\s+(?:in\s+advance|online)\b/i.test(
      msgLower,
    );
  if (ticketBookingLogisticsZh.test(msg) || ticketBookingLogisticsEn) {
    return true;
  }

  if (isLocalClockOrTimezoneFactQuery(msg)) {
    return true;
  }

  if (isFactualMacroStatQuery(msg)) {
    return true;
  }

  /** 人群适配/值不值得/谁适合类泛咨询（非改行程）：否则仅有 trip_id 时常被判 TRIP_PLANNING → 误以为要做日程卡片 */
  const personaFitZh =
    /适合(?:去|玩)?|什么人|哪种人|哪类人|人群|体质|新手|亲子|老人|小孩|值不值|值不值得|该不该去|推荐谁去|能不能去/i;
  const personaFitEn =
    /\b(who\s+should|what\s+kind\s+of\s+people|is\s+.*\s+(?:right|worth)|worth\s+it|beginners?|families?)\b/i;
  if (personaFitZh.test(msg) || personaFitEn.test(msgLower)) {
    return true;
  }

  if (isTripStatusOverviewQuery(msg, msgLower)) {
    return true;
  }

  if (isBoundTripLodgingDiningPlanQuery(msg, msgLower)) {
    return true;
  }

  if (hasExplicitTripPlanningIntent(msg, msgLower)) {
    return false;
  }

  /**
   * 实时航班舱位 / 可订组合 / 开口程（轻量路径 flight sensor → Amadeus）。
   * 此类话术往往不含「攻略/推荐」等 QA 词根，若在下方 hasQa 门控之前不分流，
   * 仅有 trip_id 时会落入 TRIP_PLANNING → 不出实时报价。
   */
  if (isExecutableFlightInventoryQuery(msg)) {
    return true;
  }

  // 预算/费用锚点优先：混合「黄金圈自驾 1 天 + 预算」仍以咨询为主（避免误入规划状态机缺参）
  const budgetAnchorZh = ['预算', '费用', '多少钱', '大概多少钱', '花销', '开销', '花费'];
  const budgetAnchorEn = ['budget', 'how much', 'cost estimate', 'cost of'];
  if (
    budgetAnchorZh.some((k) => msg.includes(k)) ||
    budgetAnchorEn.some((k) => msgLower.includes(k))
  ) {
    return true;
  }

  const qaKeywordsZh = [
    // 定义/常识问答（否则仅有 trip_id 时会误判 TRIP_PLANNING → 误入 PLAN_GEN）
    '什么是',
    '什么叫',
    '是啥',
    '什么意思',
    '为何',
    '为啥',
    '推荐',
    '指南',
    '攻略',
    '大概多',
    /** 时长类事实问答（提前多久、车程多久）；勿仅靠「多久」以免极短句误判时可依赖票务词条） */
    '多久',
    '介绍一下',
    '天气',
    '气候',
    '签证要',
    '注意什么',
    '带什么',
    '安全吗',
    '消费',
    '物价',
    '换汇',
    '小费',
    '省钱',
    '参考价',
    // 行前实用咨询（穿搭/打包/清单），避免在有行程会话时被误判为「规划改行程」
    '穿搭',
    '穿什么',
    '衣物',
    '衣服',
    '打包',
    '行李',
    '清单',
    '必备',
    '装备',
    '鞋',
    '厚度',
    '分层',
    '冰爪',
    '需要带',
    '要带',
    '月初',
    // 行程会话内状态/进度/概览（与 isTripStatusOverviewQuery 互补）
    '进度',
    '情况',
    '汇总',
    '概览',
    '怎么样了',
    // 行前准备类（「需要做哪些准备」等不含「攻略/清单」词根时亦需命中）
    '准备',
    '行前',
    '建议',
    '注意',
    '提示',
    '要带什么',
    '注意事项',
    /** 签证常识子串（申根区/签证类型问答；不宜单独用「签证」以免与「办签证行程」类混淆） */
    '申根',
  ];
  const qaKeywordsEn = [
    'cost',
    'guide',
    'weather',
    'tips',
    'overview',
    'safety',
    'price',
    'exchange rate',
    'outfit',
    'packing',
    'what to wear',
    'clothing',
    'checklist',
    'layers',
    'crampon',
    'crampons',
    'do i need',
    'should i bring',
    'preparation',
    'prepare for',
    'what to prepare',
    'tips',
    'advise',
    'advice',
    'checklist',
  ];

  const hasQa =
    qaKeywordsZh.some((k) => msg.includes(k)) || qaKeywordsEn.some((k) => msgLower.includes(k));

  if (!hasQa) {
    return false;
  }

  const tripIntentPatterns = [
    /我想去/,
    /帮我(?:规划|安排|设计)/,
    /去(?:玩|旅游|几天)/,
    /\d+\s*天\s*(?:的)?(?:行程|安排|规划)/,
  ];
  if (tripIntentPatterns.some((p) => p.test(msg))) {
    return false;
  }

  return true;
}

/**
 * 推断任务类型
 */
function inferTaskType(tripId: string | null | undefined, msg: string, msgLower: string): TaskType {
  // 元对话优先：即使存在 trip_id，也不走 TRIP_PLANNING 惯性（定性为 DATA_LOOKUP，便于日志/RAG 与咨询类一致）
  if (isMetaChatQuery(msg, msgLower)) {
    return 'DATA_LOOKUP';
  }

  // 有 trip_id：默认行程规划，但允许咨询类请求降级为 DATA_LOOKUP（见 isTripScopedConsultationQuery）
  if (tripId) {
    if (isTeamStructuredDiscussionQuery(msg)) {
      return 'DATA_LOOKUP';
    }
    if (isTripScopedConsultationQuery(msg, msgLower)) {
      return 'DATA_LOOKUP';
    }
    return 'TRIP_PLANNING';
  }

  // CRUD-ish（需要上下文，避免误触发）
  // 例如"我想删除烦恼"不应该命中 CRUD，需要明确的对象（记录/订单/行程/数据等）
  // 
  // 改进：使用更严格的模式匹配，确保是明确的 CRUD 操作
  // 规则：
  // 1. 必须包含 CRUD 动作词（create/update/delete/新增/创建/更新/删除等）
  // 2. 必须包含明确的对象上下文（行程/订单/记录/数据等）
  // 3. 排除常见的误判场景（如"删除烦恼"、"创建快乐"等抽象概念）
  
  // 英文 CRUD 动作词（必须后跟空格或对象）
  const englishCrudActions = ['create ', 'update ', 'delete ', 'insert ', 'upsert ', 'patch ', 'put ', 'post '];
  
  // 中文 CRUD 动作词
  const chineseCrudActions = ['新增', '创建', '更新', '删除', '改一下', '写入', '保存', '修改', '编辑'];
  
  // 明确的对象上下文（必须与动作词同时出现）
  const crudContextKeywords = [
    // 英文
    'record', 'order', 'trip', 'data', 'item', 'entry', 'row', 'document', 'file',
    // 中文
    '行程', '订单', '记录', '数据', '项目', '条目', '文档', '文件', '信息', '资料',
  ];
  
  // 排除的误判模式（抽象概念，不应被识别为 CRUD）
  const falsePositivePatterns = [
    /(?:删除|delete).*(?:烦恼|烦恼|压力|焦虑|悲伤|痛苦|困难|问题|困扰)/i,
    /(?:创建|create).*(?:快乐|幸福|美好|梦想|希望|未来|回忆)/i,
    /(?:更新|update).*(?:心情|情绪|状态|感觉|感受)/i,
  ];
  
  // 检查是否匹配误判模式
  if (falsePositivePatterns.some(pattern => pattern.test(msg))) {
    // 明确排除误判场景
    // 继续后续判断，不返回 CRUD
  } else {
    // 检查英文 CRUD 模式
    if (matchesAny(msgLower, englishCrudActions)) {
      // 必须同时包含对象上下文
      if (matchesAny(msgLower, crudContextKeywords)) {
        return 'CRUD';
      }
      // 或者匹配明确的 CRUD 操作模式（如"delete trip"、"create order"）
      const englishCrudPatterns = [
        /(?:delete|remove|drop).*(?:trip|order|record|data|item)/i,
        /(?:create|add|insert|new).*(?:trip|order|record|data|item)/i,
        /(?:update|modify|edit|change).*(?:trip|order|record|data|item)/i,
      ];
      if (englishCrudPatterns.some(pattern => pattern.test(msg))) {
        return 'CRUD';
      }
    }
    
    // 检查中文 CRUD 模式（更严格的匹配）
    const chineseCrudPatterns = [
      // 模式1: "删除/创建/更新 + 对象"（动作词在前）
      /(?:删除|创建|更新|新增|修改|编辑).*(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料)/,
      // 模式2: "对象 + 删除/创建/更新"（对象在前）
      /(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料).*(?:删除|创建|更新|新增|修改|编辑)/,
      // 模式3: 明确的 CRUD 操作短语
      /(?:删除行程|创建订单|更新记录|新增数据|修改项目|编辑文档)/,
    ];
    
    if (chineseCrudPatterns.some(pattern => pattern.test(msg))) {
      return 'CRUD';
    }
    
    // 检查是否包含 CRUD 动作词和对象上下文（但不在同一短语中）
    // 这种情况需要更严格的检查，避免误判
    const hasCrudAction = matchesAny(msg, chineseCrudActions) || matchesAny(msgLower, englishCrudActions);
    const hasContext = matchesAny(msg, crudContextKeywords) || matchesAny(msgLower, crudContextKeywords);
    
    if (hasCrudAction && hasContext) {
      // 检查动作词和对象是否在合理距离内（避免"我想删除烦恼，但订单还在"这样的误判）
      // 简单检查：如果消息长度较短（< 50字符），且同时包含动作词和对象，可能是 CRUD
      if (msg.length < 50) {
        return 'CRUD';
      }
      // 对于长消息，需要更严格的模式匹配（已在上面处理）
    }
  }

  // 处理完 CRUD 后继续其他类型判断
  // Data lookup / info retrieval
  if (
    matchesAny(msg, [
      '查一下',
      '查询',
      '看看',
      '多少',
      '是什么',
      '什么是',
      '什么叫',
      '几点',
      '列出',
      '给我数据',
    ])
  ) {
    return 'DATA_LOOKUP';
  }

  // Customer support-ish
  if (matchesAny(msg, ['退款', '投诉', '无法登录', '打不开', '报错', '无法支付', '账号', '订单'])) {
    return 'CUSTOMER_SUPPORT';
  }

  // RAG/QA hints
  if (matchesAny(msgLower, ['according to', 'based on the document', 'summarize', '总结', '概括', '文档'])) {
    return 'RAG_QA';
  }

  // Booking workflow hints (even without trip_id)
  if (matchesAny(msg, ['预订', '订票', '订酒店', '下单', '支付', 'booking', 'reserve'])) {
    return 'BOOKING_WORKFLOW';
  }

  if (hasExplicitTripPlanningIntent(msg, msgLower)) {
    return 'TRIP_PLANNING';
  }

  // Default
  return 'GENERIC_QA';
}

/**
 * 推断复杂度
 */
function inferComplexity(msg: string, recentCount: number): ComplexityLevel {
  const len = msg.length;
  const multiClause = matchesAny(msg, ['并且', '同时', '然后', '之后', '再', '另外', '对比', '比较', '优缺点', '方案', '步骤']);
  const manyQuestions = (msg.match(/[?？]/g)?.length ?? 0) >= 2;

  if (len >= 400 || (len >= 220 && (multiClause || manyQuestions)) || recentCount >= 8) return 'COMPLEX';
  if (len >= 120 || multiClause || recentCount >= 4) return 'MODERATE';
  return 'SIMPLE';
}

/**
 * 推断是否需要工具调用
 */
function inferExpectsToolCalls(
  taskType: TaskType,
  msg: string,
  msgLower: string,
  allowWebbrowse?: boolean,
): boolean {
  // If webbrowse is allowed and the user asks for latest/current/prices/weather, tools are likely.
  const timeSensitive =
    matchesAny(msg, ['最新', '今天', '当前', '实时', '现在', '最近']) ||
    matchesAny(msgLower, ['latest', 'today', 'current', 'realtime', 'now']);

  const travelSignals = matchesAny(msg, ['路线', '交通', '地铁', '公交', '打车', '步行', '景点', '开放时间', '门票', '酒店']);
  const compareSignals = matchesAny(msg, ['对比', '比较', '哪个好', '推荐', '排行']);

  if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW') return true;
  if (timeSensitive && allowWebbrowse) return true;
  if (travelSignals || compareSignals) return true;

  // RAG_QA might be internal retrieval; treat as tool-y but not necessarily web.
  if (taskType === 'RAG_QA') return true;

  return false;
}

/**
 * 推断是否需要结构化输出
 */
function inferRequiresStructuredOutput(taskType: TaskType, tripId: string | null | undefined): boolean {
  // 行程会话内的纯咨询：不要求结构化行程输出，便于降级到 CLAUDE_DYNAMIC / 减少状态机误触发
  if (
    tripId &&
    (taskType === 'DATA_LOOKUP' || taskType === 'GENERIC_QA' || taskType === 'RAG_QA')
  ) {
    return false;
  }
  if (tripId) return true;
  return (
    taskType === 'TRIP_PLANNING' ||
    taskType === 'BOOKING_WORKFLOW'
  );
}

/**
 * 推断是否需要审计
 */
function inferNeedsAudit(taskType: TaskType, requiresStructuredOutput: boolean, options: any): boolean {
  // Conservative defaults: audited flows for structured multi-step tasks.
  if (options.dry_run) return false; // treat dry_run as dev/test; still trace everything, just not "audit required"
  if (requiresStructuredOutput) return true;
  if (taskType === 'BOOKING_WORKFLOW') return true;
  return false;
}

/**
 * 推断风险级别
 */
function inferRisk(taskType: TaskType, msg: string, msgLower: string): RiskLevel {
  // CRITICAL triggers: 必须是明确的金融操作或敏感数据处理，而不是仅仅提到这些词汇
  // 例如"提到护照" ≠ CRITICAL，"帮我填写/提交/处理护照信息" = CRITICAL
  
  // 支付相关：必须是明确的支付操作
  const paymentActionPatterns = [
    /(?:支付|付款|转账|下单|付款|pay|transfer|purchase).*(?:金额|钱|费用|元|美元|美元)/i,
    /(?:信用卡|银行卡).*(?:号码|卡号|信息|信息)/i,
    /cvv|cvc|cvn/i, // 信用卡安全码
  ];
  const payment = paymentActionPatterns.some(pattern => pattern.test(msg));
  
  // PII 相关：必须是明确的 PII 处理操作，而不是仅仅查询
  // 修复：使用更宽松的模式匹配，确保能匹配"帮我填写护照信息"这样的句子
  // 关键：必须同时包含动作词（填写/提交等）和敏感信息（护照/身份证等）
  const piiActionPatterns = [
    // 模式1: "帮我填写护照号码" - 包含"帮我" + 动作 + 敏感信息
    /(?:帮|请|帮我).*(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
    // 模式2: "填写护照号码" - 直接动作 + 敏感信息
    /(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
    // 模式3: "填写passport信息" - 英文敏感信息
    /(?:填写|提交|处理|录入|输入|提供).*(?:passport|ssn|credit card|personal information)/i,
    // 模式4: "护照号码填写" - 敏感信息在前
    /(?:身份证|护照).*(?:号码|信息|信息).*(?:填写|提交|处理)/i,
    // 模式5: 更通用的模式 - 包含动作词和敏感信息（顺序灵活）
    /(?:身份证|护照|住址|手机号|邮箱|姓名).*(?:填写|提交|处理|录入|输入|提供)/i,
  ];
  const piiAction = piiActionPatterns.some(pattern => pattern.test(msg));
  
  // 仅提到但不涉及操作（降低风险等级）
  const piiMentionOnly = matchesAny(msg, ['身份证', '护照', '住址', '手机号', '邮箱', '姓名']) ||
    matchesAny(msgLower, ['passport', 'ssn', 'credit card']);
  const piiQueryPatterns = [
    /(?:需要|要带|要准备|需要准备).*(?:护照|身份证)/i,
    /(?:护照|身份证).*(?:要带|需要|准备)/i,
  ];
  const piiQueryOnly = piiQueryPatterns.some(pattern => pattern.test(msg));
  
  // CRITICAL: 明确的支付或 PII 操作
  // 修复：只要匹配到 piiAction，就应该是 CRITICAL（无论 taskType）
  if (payment) {
    return 'CRITICAL';
  }

  if (/退款|refund|chargeback/i.test(msg) && /支付|payment|凭证|投诉/i.test(msg)) {
    return 'HIGH';
  }

  if (piiAction) {
    return 'CRITICAL'; // 明确的 PII 操作总是 CRITICAL
  }
  
  // HIGH: 医疗法律或 PII 查询（但非操作）
  const medicalLegal = matchesAny(msg, ['诊断', '用药', '律师', '起诉', '合同', '犯罪']);
  if (medicalLegal) return 'HIGH';
  
  // 仅提到 PII 但无操作，降级到 MEDIUM
  if (piiMentionOnly && !piiAction && !piiQueryOnly) {
    // 提到但不操作，可能是正常咨询
    return taskType === 'BOOKING_WORKFLOW' ? 'MEDIUM' : 'LOW';
  }
  
  // 查询 PII 但不操作，MEDIUM
  if (piiQueryOnly) {
    return 'MEDIUM';
  }

  if (taskType === 'BOOKING_WORKFLOW') return 'HIGH';
  if (taskType === 'TRIP_PLANNING') return 'MEDIUM';
  if (taskType === 'CUSTOMER_SUPPORT') return 'MEDIUM';

  return 'LOW';
}

/**
 * 推断 Legacy 是否良好支持
 */
function inferLegacyWellSupported(taskType: TaskType, complexity: ComplexityLevel): boolean {
  if (taskType === 'CRUD' || taskType === 'DATA_LOOKUP') return true;
  if (taskType === 'RAG_QA' && complexity !== 'COMPLEX') return true;

  // Trip/booking typically benefit from skills + gated planning.
  if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW') {
    return false;
  }

  // Default: moderate confidence legacy support
  return complexity === 'SIMPLE';
}

/**
 * 辅助函数：检查字符串是否包含任一模式
 */
function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * 辅助函数：将数字限制在指定范围内
 */
function clampInt(n: number, min: number, max: number): number {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, x));
}

/**
 * 使用 intent.recognize（或其它来源）解析到的 taskType，重建完整 RoutingSignals。
 * 保留 `options.intent_mode` 对用户显式三档（AUTO/TRIP_PLANNING/DATA_LOOKUP/GENERIC_QA）的覆盖语义。
 */
export function routingSignalsWithResolvedTaskType(
  req: RouteAndRunRequestDto,
  resolvedTaskType: TaskType,
): RoutingSignals {
  const msg = (req.message ?? '').trim();
  const msgLower = msg.toLowerCase();
  const options = req.options ?? {};
  const ctx = req.conversation_context ?? {};
  const recentCount = ctx.recent_messages?.length ?? 0;
  const latencyBudgetMs = clampInt((options.max_seconds ?? DEFAULT_MAX_SECONDS) * 1000, 0, 5 * 60_000);
  const intent_mode_requested = parseIntentMode(options?.intent_mode);
  let taskType = applyIntentModeToTaskType(intent_mode_requested, resolvedTaskType);
  taskType = clampTaskTypeForBoundTripReplanning(req.trip_id, msg, msgLower, taskType);
  const complexity = inferComplexity(msg, recentCount);
  const expectsToolCalls = inferExpectsToolCalls(taskType, msg, msgLower, options.allow_webbrowse);
  const requiresStructuredOutput = inferRequiresStructuredOutput(taskType, req.trip_id);
  const needsAudit = inferNeedsAudit(taskType, requiresStructuredOutput, options);
  const risk = inferRisk(taskType, msg, msgLower);
  const { capability, actionKind } = inferRouteRunCapability(req, taskType, msg, msgLower);
  const legacyWellSupported = inferLegacyWellSupported(taskType, complexity);
  const intent_mode_resolved = taskTypeToIntentBucket(taskType);
  return {
    taskType,
    capability,
    actionKind,
    risk,
    needsAudit,
    latencyBudgetMs,
    complexity,
    requiresStructuredOutput,
    expectsToolCalls,
    legacyWellSupported,
    intent_mode_requested,
    intent_mode_resolved,
  };
}
