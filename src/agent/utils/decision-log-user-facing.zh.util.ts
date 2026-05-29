/**
 * 将编排 decision_log 的 inputs_summary / outputs_summary 格式化为用户可读中文。
 * 机器侧枚举与 metadata 仍保留在结构化字段中；此处只影响展示字符串。
 */

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

export function formatIntakeOutputsZh(intent: string | undefined, gapCount: number): string {
  const label = intentDisplayZh(intent);
  if (gapCount === 0) {
    return `${label}：必填信息已齐全，无需额外追问。`;
  }
  return `${label}：仍有 ${gapCount} 项关键信息待补齐（系统可能会向你提问）。`;
}

export function formatIntakeInputsPreviewZh(userMessage: string, maxLen = 120): string {
  const t = String(userMessage ?? '').trim();
  if (!t) return '（空消息）';
  if (t.length <= maxLen) return `你的原话：${t}`;
  return `你的原话（摘录）：${t.substring(0, maxLen)}…`;
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
}): string {
  const before = destinationLabelForLog(params.destinationBefore);
  const after = destinationLabelForLog(params.destinationAfter);
  const scopeParts = [
    params.hasUserIntent ? '出行意向（目的地、偏好等）' : '',
    params.hasConstraints ? '硬性约束（预算、日期窗口等）' : '',
    params.hasEnvironmentState ? '外部环境快照（路况、季节因子等）' : '',
  ].filter(Boolean);
  const scope = scopeParts.length ? scopeParts.join('；') : '（本轮未写入新的结构化切片）';
  const destLine =
    before === after
      ? `目的地仍为「${after}」，未发生变化。`
      : `目的地由「${before}」更新为「${after}」。`;
  return `已将本轮对话写入决策状态（版本 ${params.version ?? '?'}）。更新了：${scope}。${destLine}`;
}

export function formatResearchOutputsZh(keys: string[]): string {
  const n = keys.length;
  const detail = researchKeysDisplayZh(keys);
  if (!n) return '未写入新的外部数据（可能依赖缓存或跳过检索）。';
  return `已汇总 ${n} 类外部数据${detail ? `，主要包括：${detail}` : ''}。`;
}

export function formatResearchInputsKernelZh(): string {
  return '结合目的地与行程参数检索交通、景点、开放时间等硬数据（Kernel）';
}

export function formatGateEvalOutputsZh(gateResult: string, violationCount: number): string {
  const verdict: Record<string, string> = {
    ALLOW: '放行：当前约束下可以继续生成方案',
    BLOCK: '拦截：存在必须解决的硬性冲突',
    ADJUST_REQUIRED: '需调整：允许规划但要做替换或改期',
    NEED_USER_CONFIRM: '需你确认：有规则要先问答再继续',
  };
  const head = verdict[gateResult] ?? `门禁结论「${gateResult}」`;
  return `${head}；规则违规条目 ${violationCount} 条。`;
}

export function formatGateEvalInputsKernelZh(): string {
  return '对照出行约束与目的地规则做门禁检查（Kernel）';
}

export function formatPoiSelectionOutputsZh(candidateCount: number, selectedCount: number): string {
  return `从 ${candidateCount} 个候选点中筛出 ${selectedCount} 个，用于后续排日程（已按地域、风险与开放时间等打分）。`;
}

export function formatPoiSelectionInputsZh(candidateCount: number): string {
  return `候选兴趣点 ${candidateCount} 个（来自检索与世界模型）`;
}

export function formatContextBuildOutputsZh(blockCount: number | undefined, skipped: boolean): string {
  if (skipped) return '未构建额外上下文包（无上下文工程师或已跳过）。';
  return `已为 Planner 组装 ${blockCount ?? 0} 块上下文（约束、证据摘要等），用于生成文案与排序。`;
}

export function formatContextBuildInputsZh(): string {
  return '决策状态 + 你的自然语言问题';
}

export function formatPlanGenInputsKernelZh(): string {
  return '门禁通过后的结构化草案生成（Kernel）';
}

export function formatPlanGenOutputsZh(dayCount: number, failureMessage?: string): string {
  if (dayCount > 0) return `已排出 ${dayCount} 天的日程骨架（可按验证步骤微调）。`;
  return `未能生成有效日程天：${failureMessage ?? '原因未知'}。`;
}

/** CGUS：约束引导效用搜索；与产品文案对齐即可 */
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
      ? '约束引导效用搜索（CGUS）'
      : params.method === 'MONTE_CARLO'
        ? '蒙特卡洛抽样'
        : params.method === 'HEURISTIC'
          ? '启发式'
          : params.method ?? '未知方法';
  const rec = params.recommendedId && params.recommendedId !== 'N/A' ? params.recommendedId : '默认基准方案';
  const parts = [
    `优化方式：${methodZh}。`,
    `推荐方案标识：${rec}。`,
    typeof params.altCount === 'number' ? `共对比备选 ${params.altCount} 套。` : '',
    typeof params.expectedUtility === 'number'
      ? `期望满意度（内部效用）约 ${params.expectedUtility.toFixed(3)}。`
      : '',
    typeof params.feasibilityProbability === 'number'
      ? `估计全程可执行概率约 ${(params.feasibilityProbability * 100).toFixed(0)}%。`
      : '',
    params.ciLower !== undefined && params.ciUpper !== undefined
      ? `不确定性区间（95%）：效用约在 ${params.ciLower.toFixed(2)}～${params.ciUpper.toFixed(2)} 之间。`
      : '',
    params.strategyDirection ? `策略提示：${params.strategyDirection}` : '',
  ].filter(Boolean);
  return parts.join('');
}

export function formatOptimizeInputsZh(): string {
  return '目的地的环境状态 + 当前草案行程（用于打分与选优）';
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

export function formatVerifyInputsKernelZh(): string {
  return '对草案做可执行性检查（开放时间、转乘、可达性等，Kernel）';
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
  return '在门禁结论允许的前提下尝试局部改行程（Kernel）';
}

export function formatFeedbackOutputsZh(confidence: number | string | undefined, version: number | string | undefined): string {
  return `已将本轮决策摘要记入反馈通道，供后续改进模型；当前置信度 ${confidence ?? '—'}，状态版本 ${version ?? '—'}。`;
}

export function formatFeedbackInputsZh(): string {
  return '将本轮结构化决策写入训练/反馈队列（不影响你看到的行程正文）';
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

export function formatHallucinationInputsZh(): string {
  return '检查助手文案中的可核对事实（开放时间、地名等）';
}
