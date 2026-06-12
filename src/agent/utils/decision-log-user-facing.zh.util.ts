/**
 * 将编排 decision_log 的 inputs_summary / outputs_summary 格式化为用户可读中文。
 * 机器侧枚举与 metadata 仍保留在结构化字段中；此处只影响展示字符串。
 */

import type { ItineraryDayPoiDigest } from './itinerary-adjust-decision-log.util';
import { formatItineraryDayPoiDigestZh } from './itinerary-adjust-decision-log.util';

const RESEARCH_KEY_ZH: Record<string, string> = {
  transport_evidence: '交通/路线',
  transport_endpoint_hydration: '起终点补全',
  poi_evidence: '景点与兴趣点',
  opening_hours_evidence: '开放与营业时间',
  dem_metrics: '地形与高程',
  risk_assessment: '地理与安全风险',
  failure_risk_prediction: '行程失败风险预测',
  weather_evidence: '天气',
  live_sensor_audit: '实时传感器校验',
  world_model_data: '目的地概况',
  prediction_data: '预测数据',
};

/** Research Team 审计条目（展示层弱类型，避免 decision_log 工具反向依赖 teams 模块） */
export type ResearchTeamAuditEntryLike = {
  action?: string;
  duration_ms?: number;
  detail?: {
    request_id?: string;
    research_execution_kind?: string;
    members_planned?: string[];
  };
};

/**
 * Research Team 执行审计一行摘要（详细结构见 metadata.team_audit_log / last_team_execution）。
 */
export function formatResearchTeamAuditOutputsZh(entries: ResearchTeamAuditEntryLike[]): string {
  if (!entries.length) return '';
  const plan = entries.find((e) => e.action === 'plan_members');
  const members = plan?.detail?.members_planned ?? [];
  const kind = plan?.detail?.research_execution_kind ?? 'FULL';
  const exec = entries.find((e) => e.action === 'execute');
  const execMs = typeof exec?.duration_ms === 'number' ? exec.duration_ms : undefined;
  const parts = [`执行形态「${kind}」`, `规划成员：${members.length ? members.join('、') : '—'}`];
  if (execMs !== undefined) parts.push(`执行体耗时 ${execMs}ms`);
  return parts.join('；');
}

export function researchKeysDisplayZh(keys: string[]): string {
  if (!keys.length) return '';
  const labels = keys.map((k) => RESEARCH_KEY_ZH[k] ?? k);
  const uniq = [...new Set(labels)];
  if (uniq.length <= 6) return uniq.join('、');
  return `${uniq.slice(0, 5).join('、')}等 ${uniq.length} 项`;
}

const INTENT_ZH: Record<string, string> = {
  PLAN_TRIP: '规划行程',
  MODIFY_TRIP: '修改行程',
  ASK_QUESTION: '行程问答',
  UNKNOWN: '未归类意图',
};

export function intentDisplayZh(intent: string | undefined): string {
  const k = String(intent ?? 'PLAN_TRIP').trim();
  return INTENT_ZH[k] ?? `意图「${k}」`;
}

export function formatIntakeOutputsZh(
  intent: string | undefined,
  gapCount: number,
  ctx?: DecisionLogTripContext,
): string {
  const label = intentDisplayZh(intent);
  const scope = formatTripScopePhraseZh(ctx);
  const head = scope ? `${label}（${scope}）` : label;
  if (gapCount === 0) {
    return `${head}：目的地、日期等必填信息已齐全，无需额外追问。`;
  }
  return `${head}：仍有 ${gapCount} 项关键信息待补齐（系统可能会向你提问）。`;
}

/** 决策日志展示用：从 Trip / DSO / metadata 抽取可读上下文 */
export type DecisionLogTripContext = {
  destination?: string;
  dateStart?: string;
  dateEnd?: string;
  dayCount?: number;
  vehicleType?: string;
  partyCount?: number;
  userMessage?: string;
  targetDateIso?: string;
  targetDayNumber?: number;
  selectedPoiNames?: string[];
  tripId?: string;
};

export function extractDecisionLogTripContext(params: {
  tripPlanRequest?: {
    destination?: string | { lat: number; lng: number };
    date_range?: { start_date?: string; end_date?: string };
    start_date?: string;
    days?: number;
    trip_id?: string;
    constraints?: { vehicle_type?: string };
    party?: { count?: number };
    message?: string;
    ontology_context?: { destination?: { country_name?: string; city?: string; name?: string } };
  };
  userIntentDestination?: unknown;
  metadata?: Record<string, unknown>;
  itinerary?: { days?: unknown[] };
}): DecisionLogTripContext {
  const destination = extractDestinationDisplayZh({
    userIntentDestination: params.userIntentDestination,
    tripPlanRequest: params.tripPlanRequest,
  });
  const dr = params.tripPlanRequest?.date_range;
  const dateStart = dr?.start_date?.slice(0, 10) ?? params.tripPlanRequest?.start_date?.slice(0, 10);
  const dateEnd = dr?.end_date?.slice(0, 10);
  const meta = params.metadata ?? {};
  const targetDateIso =
    typeof meta.itinerary_adjust_target_date_iso === 'string'
      ? meta.itinerary_adjust_target_date_iso.slice(0, 10)
      : undefined;
  const targetDayNumber =
    typeof meta.itinerary_adjust_target_day_number === 'number'
      ? meta.itinerary_adjust_target_day_number
      : (meta.itinerary_adjust_neighbor_anchors as { targetDayNumber?: number } | undefined)
          ?.targetDayNumber;
  const audit = meta.itinerary_adjust_audit as { selected_poi_names?: string[] } | undefined;
  const dayCount =
    params.itinerary?.days?.length ??
    params.tripPlanRequest?.days ??
    (dateStart && dateEnd ? undefined : undefined);

  return {
    destination,
    dateStart,
    dateEnd,
    dayCount: typeof dayCount === 'number' && dayCount > 0 ? dayCount : undefined,
    vehicleType: params.tripPlanRequest?.constraints?.vehicle_type,
    partyCount: params.tripPlanRequest?.party?.count,
    userMessage:
      (typeof meta.intake_user_message === 'string' ? meta.intake_user_message : undefined) ??
      params.tripPlanRequest?.message,
    targetDateIso,
    targetDayNumber,
    selectedPoiNames: audit?.selected_poi_names,
    tripId: params.tripPlanRequest?.trip_id,
  };
}

/** 例：`冰岛，11/1–11/6共6天，2WD，第1天改排` */
export function formatTripScopePhraseZh(ctx?: DecisionLogTripContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.destination) parts.push(ctx.destination);
  if (ctx.dateStart && ctx.dateEnd) {
    parts.push(`${formatShortDateZh(ctx.dateStart)}–${formatShortDateZh(ctx.dateEnd)}`);
  } else if (ctx.dateStart) {
    parts.push(`出发 ${formatShortDateZh(ctx.dateStart)}`);
  }
  if (ctx.dayCount) parts.push(`共 ${ctx.dayCount} 天`);
  if (ctx.vehicleType) parts.push(ctx.vehicleType === '4WD' ? '四驱车' : '两驱车');
  if (ctx.partyCount && ctx.partyCount > 0) parts.push(`${ctx.partyCount} 人`);
  if (ctx.targetDayNumber != null) parts.push(`改排第 ${ctx.targetDayNumber} 天`);
  else if (ctx.targetDateIso) parts.push(`改排 ${formatShortDateZh(ctx.targetDateIso)}`);
  return parts.join('，');
}

function formatShortDateZh(iso: string): string {
  const d = String(iso ?? '').slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function formatSelectedPoiListZh(names: string[] | undefined, max = 4): string {
  const list = (names ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (!list.length) return '';
  if (list.length <= max) return list.join('、');
  return `${list.slice(0, max).join('、')}等 ${list.length} 处`;
}

function truncateUserFacingText(text: string, maxLen: number): string {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.substring(0, Math.max(0, maxLen - 1))}…`;
}

/** 用户原话 → 决策日志「输入」展示（前端主读 inputs_summary） */
export function formatIntakeInputsPreviewZh(userMessage: string, maxLen = 120): string {
  const t = truncateUserFacingText(userMessage, maxLen);
  if (!t) return '（未收到文字描述）';
  return `用户请求：${t}`;
}

export function formatItineraryAdjustIntakeInputsZh(params: {
  userMessage: string;
  subIntent?: string;
  targetDateIso?: string;
  targetDayNumber?: number;
  ctx?: DecisionLogTripContext;
}): string {
  const msg = formatIntakeInputsPreviewZh(params.userMessage, 80);
  const intent =
    params.subIntent === 'poi_slot_fill'
      ? '向稀疏日程追加推荐景点（只增不删）'
      : params.subIntent === 'strong_modification'
        ? '单日行程改排（强修改）'
        : '单日行程调整';
  const day =
    params.targetDayNumber != null
      ? `第 ${params.targetDayNumber} 天`
      : params.targetDateIso
        ? formatShortDateZh(params.targetDateIso.slice(0, 10))
        : '';
  const scope = formatTripScopePhraseZh(params.ctx);
  const dayPart = day ? `，优先补档 ${day}` : '';
  const tripPart = scope ? `；行程：${scope}` : '（已绑定当前行程）';
  return `${msg}；识别为${intent}${dayPart}${tripPart}`;
}

export function formatFullTripReplanIntakeInputsZh(
  userMessage: string,
  dateRange?: { start_date?: string; end_date?: string },
  ctx?: DecisionLogTripContext,
): string {
  const msg = formatIntakeInputsPreviewZh(userMessage, 80);
  const scope = formatTripScopePhraseZh({
    ...ctx,
    dateStart: dateRange?.start_date?.slice(0, 10) ?? ctx?.dateStart,
    dateEnd: dateRange?.end_date?.slice(0, 10) ?? ctx?.dateEnd,
  });
  return `${msg}；识别为整段多日重规划${scope ? `（${scope}）` : '（已绑定当前行程）'}`;
}

export function formatStateUpdateInputsZh(params: {
  userMessage?: string;
  destination?: unknown;
  ctx?: DecisionLogTripContext;
}): string {
  const dest = destinationLabelForLog(params.destination);
  const msg = truncateUserFacingText(params.userMessage ?? '', 72);
  const scope = formatTripScopePhraseZh(
    params.ctx ?? (dest !== '（未记录）' ? { destination: dest } : undefined),
  );
  const scopePart = scope ? `（${scope}）` : '';
  if (msg && dest !== '（未记录）') {
    return `将您的请求「${msg}」与目的地「${dest}」${scopePart} 等约束同步到决策状态`;
  }
  if (msg) {
    return `将您的请求「${msg}」${scopePart} 与本轮出行约束同步到决策状态`;
  }
  if (dest !== '（未记录）') {
    return `将目的地「${dest}」${scopePart} 与本轮出行约束同步到决策状态`;
  }
  return scope
    ? `将本轮对话${scopePart} 与出行约束同步到决策状态`
    : '将本轮对话与出行约束同步到决策状态';
}

function destinationLabelForLog(d: unknown): string {
  if (d == null) return '（未记录）';
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && d && 'lat' in d && 'lng' in d) {
    const o = d as { lat: number; lng: number };
    return `坐标 ${o.lat},${o.lng}`;
  }
  return String(d);
}

export function formatStateUpdateOutputsZh(params: {
  hasUserIntent: boolean;
  hasConstraints: boolean;
  hasEnvironmentState: boolean;
  version: number | string | undefined;
  destinationBefore: unknown;
  destinationAfter: unknown;
  ctx?: DecisionLogTripContext;
}): string {
  const before = destinationLabelForLog(params.destinationBefore);
  const after = destinationLabelForLog(params.destinationAfter);
  const updatedParts: string[] = [];
  if (params.hasUserIntent) {
    if (after !== '（未记录）' && before !== after) {
      updatedParts.push(`目的地 ${before}→${after}`);
    } else if (after !== '（未记录）') {
      updatedParts.push(`目的地 ${after}`);
    } else {
      updatedParts.push('出行意向');
    }
  }
  if (params.hasConstraints) {
    const cParts: string[] = [];
    if (params.ctx?.dateStart && params.ctx?.dateEnd) {
      cParts.push(
        `日期 ${formatShortDateZh(params.ctx.dateStart)}–${formatShortDateZh(params.ctx.dateEnd)}`,
      );
    }
    if (params.ctx?.vehicleType) {
      cParts.push(params.ctx.vehicleType === '4WD' ? '四驱车' : '两驱车');
    }
    if (params.ctx?.partyCount) cParts.push(`${params.ctx.partyCount} 人`);
    updatedParts.push(cParts.length ? cParts.join('、') : '硬性约束');
  }
  if (params.hasEnvironmentState) updatedParts.push('外部环境快照');
  const scope = updatedParts.length ? updatedParts.join('；') : '（本轮未写入新的结构化切片）';
  const destLine =
    before === after
      ? after !== '（未记录）'
        ? `目的地仍为「${after}」。`
        : ''
      : `目的地由「${before}」更新为「${after}」。`;
  return `已将本轮对话写入决策状态（版本 ${params.version ?? '?'}）。更新了：${scope}。${destLine}`.replace(
    /\。\s*$/,
    '。',
  );
}

export function formatResearchOutputsZh(keys: string[], ctx?: DecisionLogTripContext): string {
  const n = keys.length;
  const detail = researchKeysDisplayZh(keys);
  const scope = formatTripScopePhraseZh(ctx);
  if (!n) {
    return scope
      ? `「${scope}」未写入新的外部数据（可能依赖缓存或跳过检索）。`
      : '未写入新的外部数据（可能依赖缓存或跳过检索）。';
  }
  return scope
    ? `已为「${scope}」汇总 ${n} 类外部数据：${detail}。`
    : `已汇总 ${n} 类外部数据${detail ? `：${detail}` : ''}。`;
}

export function formatResearchInputsKernelZh(params?: {
  destination?: string;
  ctx?: DecisionLogTripContext;
}): string {
  const scope = formatTripScopePhraseZh(
    params?.ctx ?? (params?.destination ? { destination: params.destination } : undefined),
  );
  if (scope) {
    return `检索「${scope}」的交通、景点开放时间、天气与地形等外部数据`;
  }
  return '检索目的地沿线交通、景点开放时间、天气与地形等外部数据';
}

export function formatResearchTeamAuditInputsZh(ctx?: DecisionLogTripContext): string {
  const scope = formatTripScopePhraseZh(ctx);
  return scope
    ? `汇总「${scope}」调研团队的执行分工与耗时（供审计）`
    : '汇总调研团队执行形态与成员分工（供审计）';
}

export function formatGateEvalOutputsZh(
  gateResult: string,
  violationCount: number,
  guardian?: {
    abu?: string;
    drdre?: string;
    neptune?: string;
  },
): string {
  const verdict: Record<string, string> = {
    ALLOW: '放行：当前约束下可以继续生成方案',
    BLOCK: '拦截：存在必须解决的硬性冲突',
    ADJUST_REQUIRED: '需调整：允许规划但要做替换或改期',
    NEED_USER_CONFIRM: '需你确认：有规则要先问答再继续',
  };
  const head = verdict[gateResult] ?? `门禁结论「${gateResult}」`;
  const persona = formatGuardianVerdictsBriefZh(guardian);
  const viol = violationCount > 0 ? `；规则违规 ${violationCount} 条` : '；未发现规则违规';
  return `${head}${viol}${persona ? `；${persona}` : ''}。`;
}

const GUARDIAN_VERDICT_ZH: Record<string, string> = {
  ALLOW: '通过',
  REJECT: '不通过',
  ADJUST: '需调整',
  NEED_USER_CONFIRM: '待确认',
};

export function formatGuardianVerdictsBriefZh(guardian?: {
  abu?: string;
  drdre?: string;
  neptune?: string;
}): string {
  if (!guardian) return '';
  const parts: string[] = [];
  if (guardian.abu) parts.push(`安全 ${GUARDIAN_VERDICT_ZH[guardian.abu] ?? guardian.abu}`);
  if (guardian.drdre) parts.push(`节奏 ${GUARDIAN_VERDICT_ZH[guardian.drdre] ?? guardian.drdre}`);
  if (guardian.neptune) parts.push(`空间 ${GUARDIAN_VERDICT_ZH[guardian.neptune] ?? guardian.neptune}`);
  return parts.length ? `三人格：${parts.join('、')}` : '';
}

export function formatGuardianDebateGateInputsZh(budgetMs: number, ctx?: DecisionLogTripContext): string {
  const sec = Math.max(1, Math.round(budgetMs / 1000));
  const scope = formatTripScopePhraseZh(ctx);
  return scope
    ? `计划生成前三人格合议（${scope}），时限约 ${sec} 秒`
    : `计划生成前三人格安全/节奏/空间合议，时限约 ${sec} 秒`;
}

export function formatGuardianDebateGateOutputsZh(params: {
  gateResult: string;
  fused?: boolean;
  fusionReason?: string;
  guardian?: { abu?: string; drdre?: string; neptune?: string };
}): string {
  if (params.fused) {
    return `三人格合议后需您确认：${params.fusionReason ?? '存在安全或强度分歧'}（门禁 ${params.gateResult}）`;
  }
  const persona = formatGuardianVerdictsBriefZh(params.guardian);
  const gateHead =
    params.gateResult === 'ALLOW'
      ? '门禁放行，可继续生成行程'
      : `门禁结论 ${params.gateResult}`;
  return persona ? `${gateHead}；${persona}` : gateHead;
}

export function formatGateEvalInputsKernelZh(params?: {
  destination?: string;
  ctx?: DecisionLogTripContext;
}): string {
  const scope = formatTripScopePhraseZh(
    params?.ctx ?? (params?.destination ? { destination: params.destination } : undefined),
  );
  if (scope) {
    return `检查「${scope}」是否满足车型、开放时间、路况与安全规则`;
  }
  return '对照出行约束与目的地规则做可行性检查';
}

export function formatPoiSelectionOutputsZh(
  candidateCount: number,
  selectedCount: number,
  ctx?: DecisionLogTripContext,
): string {
  const scope = formatTripScopePhraseZh(ctx);
  const head = scope ? `在「${scope}」` : '';
  return `${head}从 ${candidateCount} 个候选点中筛出 ${selectedCount} 个排入日程（已按地域、开放时间与风险打分）。`.replace(
    /^在「」/,
    '',
  );
}

export function formatPoiSelectionInputsZh(
  candidateCount: number,
  ctx?: DecisionLogTripContext,
): string {
  const scope = formatTripScopePhraseZh(ctx);
  if (scope) {
    return `「${scope}」共有 ${candidateCount} 个候选兴趣点（来自检索与世界模型）`;
  }
  return `候选兴趣点 ${candidateCount} 个（来自检索与世界模型）`;
}

export function formatContextBuildOutputsZh(blockCount: number | undefined, skipped: boolean): string {
  if (skipped) return '未构建额外上下文包（无上下文工程师或已跳过）。';
  return `已为 Planner 组装 ${blockCount ?? 0} 块上下文（约束、证据摘要等），用于生成文案与排序。`;
}

export function formatContextBuildInputsZh(userMessage?: string, ctx?: DecisionLogTripContext): string {
  const msg = truncateUserFacingText(userMessage ?? '', 80);
  const scope = formatTripScopePhraseZh(ctx);
  if (msg && scope) return `为「${scope}」组装规划上下文；您的问题：「${msg}」`;
  if (msg) return `基于决策状态与您的问题「${msg}」组装规划上下文`;
  if (scope) return `为「${scope}」组装约束与证据摘要，供排日程使用`;
  return '基于决策状态与您的自然语言问题组装规划上下文';
}

export function formatPlanGenInputsKernelZh(ctx?: DecisionLogTripContext): string {
  const scope = formatTripScopePhraseZh(ctx);
  const pois = formatSelectedPoiListZh(ctx?.selectedPoiNames);
  if (scope && pois) {
    return `为「${scope}」生成日程草案（候选含 ${pois}）`;
  }
  if (scope) return `为「${scope}」生成结构化行程草案`;
  return '在门禁通过后生成结构化行程草案';
}

export function formatPlanGenOutputsZh(
  dayCount: number,
  failureMessage?: string,
  ctx?: DecisionLogTripContext,
  dayDigest?: ItineraryDayPoiDigest[],
): string {
  const scope = formatTripScopePhraseZh(ctx);
  if (dayCount > 0) {
    const head = scope
      ? `已为「${scope}」排出 ${dayCount} 天日程骨架（可按验证步骤微调）`
      : `已排出 ${dayCount} 天的日程骨架（可按验证步骤微调）`;
    const digest = formatItineraryDayPoiDigestZh(dayDigest ?? []);
    return digest ? `${head}。${digest}` : `${head}。`;
  }
  return `未能生成有效日程天：${failureMessage ?? '原因未知'}。`;
}

export function formatOptimizeOutputsZh(params: {
  method?: string;
  recommendedId?: string;
  altCount?: number;
  expectedUtility?: number;
  feasibilityProbability?: number;
  ciLower?: number;
  ciUpper?: number;
  strategyDirection?: string;
}): string {
  const methodZh =
    params.method === 'CGUS'
      ? '多方案对比选优'
      : params.method === 'MONTE_CARLO'
        ? '蒙特卡洛抽样'
        : params.method === 'HEURISTIC'
          ? '启发式'
          : params.method ?? '未知方法';
  const rec =
    params.recommendedId && params.recommendedId !== 'N/A'
      ? params.recommendedId === 'plan-base'
        ? '基准方案'
        : params.recommendedId
      : '默认基准方案';
  const parts = [
    `优化方式：${methodZh}。`,
    `推荐：${rec}。`,
    typeof params.altCount === 'number' && params.altCount > 0
      ? `共对比 ${params.altCount} 套备选。`
      : '',
    typeof params.feasibilityProbability === 'number'
      ? `估计全程可执行概率约 ${(params.feasibilityProbability * 100).toFixed(0)}%。`
      : '',
  ].filter(Boolean);
  return parts.join('');
}

export function formatOptimizeInputsZh(params?: {
  destination?: string;
  dayCount?: number;
  ctx?: DecisionLogTripContext;
}): string {
  const scope = formatTripScopePhraseZh(
    params?.ctx ??
      (params?.destination || params?.dayCount
        ? { destination: params.destination, dayCount: params.dayCount }
        : undefined),
  );
  if (scope) {
    return `对「${scope}」的草案行程做多方案打分与选优`;
  }
  return '结合目的地环境状态与草案行程做方案对比与选优';
}

/**
 * 保留子串「个问题」供 syncConfidenceAfterVerify 等逻辑识别存在问题。
 */
export function formatVerifyOutputsZh(params: {
  issueCount: number;
  fatal: number;
  conflict: number;
  advisory: number;
}): string {
  if (params.issueCount === 0) return '验证通过：未发现阻断性冲突。';
  return `共发现 ${params.issueCount} 个问题：致命 ${params.fatal} 个、需协调 ${params.conflict} 个、提示 ${params.advisory} 个（详见 metadata）。`;
}

export function formatVerifyInputsKernelZh(ctx?: DecisionLogTripContext): string {
  const scope = formatTripScopePhraseZh(ctx);
  const pois = formatSelectedPoiListZh(ctx?.selectedPoiNames, 3);
  if (scope && pois) {
    return `检查「${scope}」草案（含 ${pois}）的开放时间、转乘与可达性`;
  }
  if (scope) {
    return `检查「${scope}」草案的可执行性（开放时间、转乘衔接、可达性）`;
  }
  return '检查草案的可执行性（开放时间、转乘衔接、可达性等）';
}

export function formatVerifyPoiClosedOutputsZh(name: string, startWindow: string, endWindow: string): string {
  return `开放时间冲突：「${name}」在你安排的 ${startWindow}–${endWindow} 时段可能闭馆或不可进入；建议改时段或替换景点。`;
}

export function formatVerifyTemporalOpeningInputsZh(): string {
  return '对照营业时间证据做强校验（temporal_opening_v1）';
}

export function formatRepairOutputsZh(applied: boolean): string {
  if (applied) return '已根据验证结果自动调整行程（替换景点或改时段等）。';
  return '本次未自动改行程：当前草案可能已满足约束，或系统在尝试微调后仍未找到合适改动。';
}

/**
 * decision_log.reasonCodes → 用户可读短句（不含原始枚举名）。
 * 未收录的码不展示，避免把 REPAIR、GUARDIAN_* 直接暴露给终端用户。
 */
const REASON_CODE_ZH: Record<string, string> = {
  REPAIR: '自动修复评估',
  GUARDIAN_NEPTUNE: 'Neptune 路线与空间方案',
  GUARDIAN_ABU: 'Abu 安全与规则',
  GUARDIAN_DRE: 'Dr.Dre 节奏与强度',
  GUARDIAN_DRDRE: 'Dr.Dre 节奏与强度',
  SPATIAL_REPAIR: '空间/路线修复',
  MIN_EDIT_REPAIR: '最小改动修复',
  DRE_NO_PACE_CHANGE: '节奏已平衡',
  DRE_ORIGINAL_OPTIMAL: '当前方案已较优',
  DRE_OPTIMIZATION_DETAIL: '优化细节比对',
  FATIGUE_COMPARISON: '疲劳与缓冲比对',
  EXPECTED_UTILITY_EVAL: '满意度评估',
  PACE_BUFFER: '行程缓冲',
  POLICY: '策略规则',
  HALLUCINATION_DETECTION: '叙述内容事实核查',
  FEEDBACK: '决策质量回传',
  HALLUCINATION_RISK: '内容风险标记',
};

export function reasonCodesDisplayZh(codes: string[] | undefined): string {
  if (!codes?.length) return '';
  const labels = codes
    .map((c) => {
      const key = String(c).trim();
      if (REASON_CODE_ZH[key]) return REASON_CODE_ZH[key];
      const base = key.split(':')[0];
      return REASON_CODE_ZH[base] ?? '';
    })
    .filter(Boolean);
  const uniq = [...new Set(labels)];
  if (!uniq.length) return '';
  return `说明：${uniq.join('、')}`;
}

export function formatRepairInputsKernelZh(): string {
  return '根据验证结果尝试自动修复行程（替换景点或改时段等）';
}

export function formatNarrateInputsZh(dayCount?: number, ctx?: DecisionLogTripContext): string {
  const scope = formatTripScopePhraseZh(ctx);
  const n =
    typeof dayCount === 'number' && dayCount > 0
      ? dayCount
      : ctx?.dayCount;
  if (n && scope) {
    return `为「${scope}」的 ${n} 天结构化日程撰写讲解说明（不改时间安排）`;
  }
  if (n) return `将 ${n} 天结构化日程转成自然语言说明（不改具体时间安排）`;
  return '将结构化日程转成自然语言说明（不改具体时间安排）';
}

export function formatHallucinationInputsZh(ctx?: DecisionLogTripContext): string {
  const scope = formatTripScopePhraseZh(ctx);
  return scope
    ? `核对「${scope}」行程说明中的开放时间、地名等可验证事实`
    : '核对助手文案中的可验证事实（开放时间、地名等）';
}

export function formatFeedbackOutputsZh(confidence: number | string | undefined, version: number | string | undefined): string {
  return `已将本轮决策摘要记入反馈通道，供后续改进模型；当前置信度 ${confidence ?? '—'}，状态版本 ${version ?? '—'}。`;
}

export function formatFeedbackInputsZh(): string {
  return '记录本轮决策摘要供系统改进（不影响您看到的行程正文）';
}

/** 幻觉检测 decision_log 中可折叠展示的抽查样例行 */
export type HallucinationAuditSampleRowZh = {
  excerpt_zh: string;
  /** 与证据一致 / 已标注存疑 / 已从叙述移除或弱化 等 */
  outcome_zh: string;
};

export type HallucinationOutputsDetailZh = {
  /** 已从叙述移除或弱化的陈述条数（与 statistics.removedClaims 对齐） */
  removedCount?: number;
  durationMs?: number;
  /** 最多展示若干条，避免 decision_log 过长 */
  sampleRows?: HallucinationAuditSampleRowZh[];
};

function truncateHallucinationExcerpt(text: string, maxLen: number): string {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '（空）';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * 为统一入口生成「抽查摘录」：优先展示风险项，再补充高置信的一致项。
 */
export function buildHallucinationAuditSampleRowsZh(params: {
  verifiedClaims: ReadonlyArray<{ text: string; verified: boolean; confidence?: number }>;
  riskClaims: ReadonlyArray<{ text: string; action: string; confidence?: number }>;
  maxRows?: number;
  excerptMaxLen?: number;
}): HallucinationAuditSampleRowZh[] {
  const maxRows = params.maxRows ?? 5;
  const excerptMaxLen = params.excerptMaxLen ?? 88;
  const riskSet = new Set(params.riskClaims.map((r) => String(r.text ?? '').trim()));
  const rows: HallucinationAuditSampleRowZh[] = [];

  for (const r of params.riskClaims) {
    if (rows.length >= maxRows) break;
    const action = String(r.action ?? '').trim();
    const outcomeZh =
      action === 'REMOVE'
        ? '已从叙述移除或弱化'
        : action === 'FLAG'
          ? '已标注存疑'
          : action
            ? `处置「${action}」`
            : '已标记待复核';
    rows.push({
      excerpt_zh: truncateHallucinationExcerpt(r.text, excerptMaxLen),
      outcome_zh: outcomeZh,
    });
  }

  const okPool = params.verifiedClaims.filter(
    (c) => c.verified && !riskSet.has(String(c.text ?? '').trim()),
  );
  const sortedOk = [...okPool].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const c of sortedOk) {
    if (rows.length >= maxRows) break;
    const conf =
      typeof c.confidence === 'number' && !Number.isNaN(c.confidence)
        ? `模型置信约 ${(c.confidence * 100).toFixed(0)}%`
        : '';
    rows.push({
      excerpt_zh: truncateHallucinationExcerpt(c.text, excerptMaxLen),
      outcome_zh: conf ? `与证据一致（${conf}）` : '与证据一致',
    });
  }

  return rows;
}

export function formatHallucinationOutputsZh(
  total: number,
  verified: number,
  risks: number,
  detail?: HallucinationOutputsDetailZh,
): string {
  const removed = Math.max(0, Math.min(risks, detail?.removedCount ?? 0));
  const flagged = Math.max(0, risks - removed);

  let head = `对叙述文案做了事实抽查：共抽取 ${total} 条可核对陈述，其中 ${verified} 条与检索证据一致；`;
  if (risks === 0) {
    head += '未发现需额外标注或移除的高风险陈述。';
  } else {
    head += `${flagged} 条已标注存疑或弱化措辞，${removed} 条已从叙述中移除或改写。`;
  }

  const tail: string[] = [];
  if (detail?.durationMs !== undefined && detail.durationMs >= 0) {
    tail.push(`本步耗时约 ${detail.durationMs}ms。`);
  }
  if (detail?.sampleRows?.length) {
    const segs = detail.sampleRows.map(
      (r, i) => `「样例${i + 1}·${r.outcome_zh}」${r.excerpt_zh}`,
    );
    tail.push(`抽查摘录：${segs.join(' ')}`);
  }
  return tail.length ? `${head}${tail.join('')}` : head;
}

/** 从 TripPlanRequest / DSO userIntent 提取目的地展示名 */
export function extractDestinationDisplayZh(params: {
  userIntentDestination?: unknown;
  tripPlanRequest?: {
    destination?: string | { lat: number; lng: number };
    message?: string;
    ontology_context?: { destination?: { country_name?: string; city?: string; name?: string } };
  };
}): string | undefined {
  const fromIntent = destinationLabelForLog(params.userIntentDestination);
  if (fromIntent !== '（未记录）') return fromIntent;
  const ont = params.tripPlanRequest?.ontology_context?.destination;
  if (ont?.country_name || ont?.city || ont?.name) {
    return [ont.country_name, ont.city, ont.name].filter(Boolean).join('·');
  }
  const rawDest = params.tripPlanRequest?.destination;
  if (rawDest != null) {
    const labeled = destinationLabelForLog(rawDest);
    if (labeled !== '（未记录）') return labeled;
  }
  return undefined;
}

const LEGACY_INPUTS_SUMMARY_ZH: Record<string, string> = {
  '识别绑定 Trip 上的单日行程改排意图': '识别为绑定行程的单日改排或景点补全请求',
  '识别绑定 Trip 上的整段多日行程重规划意图': '识别为绑定行程的整段多日重规划请求',
  '把本轮对话与约束写入统一决策状态（DSO），一次性提交': '将本轮对话与出行约束同步到决策状态',
  'Research Team 执行审计（Kernel）': '汇总调研团队执行形态与成员分工（供审计）',
  '把结构化日程转成自然语言说明（不改具体时间安排）': '将结构化日程转成自然语言说明（不改具体时间安排）',
};

/**
 * BFF 出站：decision_log.outputs_summary → 前端可读结果行（弱化内部枚举）。
 */
export function formatDecisionLogOutputsDisplayZh(entry: {
  step?: string;
  outputs_summary?: string;
  metadata?: Record<string, unknown>;
}): string {
  let s = String(entry.outputs_summary ?? '').trim();
  if (!s) return '';
  if (/^Abu=/.test(s) || /\bgate=ALLOW\b/i.test(s)) {
    const meta = entry.metadata ?? {};
    return formatGuardianDebateGateOutputsZh({
      gateResult: String(meta.gate_result ?? 'ALLOW'),
      fused: Boolean(meta.debate_gate_fusion),
      fusionReason: typeof meta.debate_gate_fusion === 'string' ? meta.debate_gate_fusion : undefined,
      guardian: {
        abu: typeof meta.abu_verdict === 'string' ? meta.abu_verdict : undefined,
      },
    });
  }
  if (
    entry.step === 'PLAN_GEN' &&
    !s.includes('日程要点：') &&
    Array.isArray(entry.metadata?.plan_gen_day_digest)
  ) {
    const digest = formatItineraryDayPoiDigestZh(
      entry.metadata!.plan_gen_day_digest as ItineraryDayPoiDigest[],
    );
    if (digest) s = `${s.replace(/\。?$/, '。')}${digest}`;
  }
  s = s.replace(/POI_SLOT_FILL/g, '景点补全');
  s = s.replace(/ITINERARY_ADJUST/g, '单日改排');
  s = s.replace(/CGUS/g, '多方案对比');
  s = s.replace(/plan-base/g, '基准方案');
  s = s.replace(/Abu=/g, '安全=');
  s = s.replace(/\bgate=/gi, '门禁=');
  return s;
}

/**
 * BFF 出站：decision_log.inputs_summary → 前端可读「输入」行（剥离 Kernel/DSO 等内部术语）。
 */
export function formatDecisionLogInputsDisplayZh(entry: {
  step?: string;
  inputs_summary?: string;
}): string {
  let s = String(entry.inputs_summary ?? '').trim();
  if (!s) return '';
  if (LEGACY_INPUTS_SUMMARY_ZH[s]) return LEGACY_INPUTS_SUMMARY_ZH[s];
  s = s.replace(/（Kernel）/g, '').replace(/\(Kernel\)/g, '').trim();
  s = s.replace(/你的原话：/g, '用户请求：').replace(/你的原话（摘录）：/g, '用户请求（摘录）：');
  s = s.replace(/DSO/g, '决策状态').replace(/\s{2,}/g, ' ').trim();
  return s;
}
