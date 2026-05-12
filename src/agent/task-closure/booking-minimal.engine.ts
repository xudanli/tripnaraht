import type {
  BookingCompletionContract,
  BookingExecutionContext,
  BookingFailurePattern,
  BookingNoProgressReason,
  BookingPolicyDecision,
  BookingProposedAction,
  BookingStage,
  BookingToolLoopSummary,
} from './booking-minimal.types';

/** 写死 allowlist（Step 3）：stage → 允许的语义化 action 名。 */
export const BOOKING_STAGE_ACTION_ALLOWLIST: Record<BookingStage, readonly string[]> = {
  search: ['search_poi', 'search_hotels'],
  validate: ['check_time', 'check_weather'],
  book: ['check_inventory', 'book'],
};

/** 由 State 推导契约字段（先做最小布尔推导）。 */
export function deriveBookingCompletion(ctx: BookingExecutionContext): BookingCompletionContract {
  return {
    has_route: ctx.route.length > 0,
    time_feasible: true,
    inventory_checked: ctx.inventory_checked,
  };
}

/** Completion 是否满足 — 停机判据（Step 2 核心驱动）。 */
export function isBookingCompletionSatisfied(c: BookingCompletionContract): boolean {
  return c.has_route && c.time_feasible && c.inventory_checked;
}

/**
 * P2.5 Progress：completion 是否在任一维度上严格向前（合法执行但未推进则可观测）。
 */
export function isBookingProgressForward(
  prev: BookingCompletionContract,
  next: BookingCompletionContract,
): boolean {
  if (!prev.has_route && next.has_route) return true;
  if (!prev.inventory_checked && next.inventory_checked) return true;
  if (!prev.time_feasible && next.time_feasible) return true;
  return false;
}

/** 用于归因：本轮工具执行前拷贝 ctx（避免引用被 reducer 原地改写）。 */
export function cloneBookingExecutionContext(ctx: BookingExecutionContext): BookingExecutionContext {
  return {
    route: [...ctx.route],
    inventory_checked: ctx.inventory_checked,
    failures: [...ctx.failures],
  };
}

export function bookingExecutionContextsEqual(a: BookingExecutionContext, b: BookingExecutionContext): boolean {
  return (
    a.inventory_checked === b.inventory_checked &&
    JSON.stringify(a.route) === JSON.stringify(b.route) &&
    JSON.stringify(a.failures) === JSON.stringify(b.failures)
  );
}

/**
 * 无 completion 前进时的粗归因（第一版规则见 PRD 讨论）。
 * 判定顺序：invalid_stage → no_effect → external_block → bad_params。
 */
export function classifyBookingNoProgressReason(params: {
  policyStage: BookingStage;
  ctxBefore: BookingExecutionContext;
  ctxAfter: BookingExecutionContext;
  executedEnvelopes: ReadonlyArray<{ success: boolean }>;
  executedSemanticActions: readonly string[];
}): BookingNoProgressReason {
  const ground = suggestBookingStage(params.ctxBefore);
  if (params.policyStage !== ground) {
    return 'invalid_stage';
  }
  const allow = BOOKING_STAGE_ACTION_ALLOWLIST[params.policyStage];
  for (const name of params.executedSemanticActions) {
    if (!allow.includes(name)) {
      return 'invalid_stage';
    }
  }
  if (bookingExecutionContextsEqual(params.ctxBefore, params.ctxAfter)) {
    return 'no_effect';
  }
  if (params.executedEnvelopes.some((e) => !e.success)) {
    return 'external_block';
  }
  return 'bad_params';
}

/** 极简阶段推进：无路由 → search；有路由未验库存 → validate；否则 book（可由上层覆盖）。 */
export function suggestBookingStage(ctx: BookingExecutionContext): BookingStage {
  if (ctx.route.length === 0) return 'search';
  if (!ctx.inventory_checked) return 'validate';
  return 'book';
}

/** 用于聚合 summary / 初始化计数 */
export const BOOKING_NO_PROGRESS_REASONS: BookingNoProgressReason[] = [
  'invalid_stage',
  'no_effect',
  'bad_params',
  'external_block',
];

/** 近期无进展归因窗口长度（与 executor 中 slice 对齐） */
export const BOOKING_NO_PROGRESS_REASON_WINDOW = 4;

/**
 * 在「最近几轮 no_progress 归因」上识别稳定失败模式（非单步标签）。
 * 判定顺序：external_blocked → stage_misaligned → ineffective_loop。
 */
export function detectBookingFailurePattern(
  reasons: readonly BookingNoProgressReason[],
): BookingFailurePattern {
  const r = reasons;
  if (r.length === 0) {
    return 'none';
  }

  if (r.filter((x) => x === 'external_block').length >= 2) {
    return 'external_blocked';
  }

  for (let i = 1; i < r.length; i++) {
    if (r[i] === 'invalid_stage' && r[i - 1] === 'invalid_stage') {
      return 'stage_misaligned';
    }
  }

  if (r.length >= 4) {
    const isAlt = (a: BookingNoProgressReason, b: BookingNoProgressReason) =>
      r.length >= 4 && r.every((x, i) => (i % 2 === 0 ? x === a : x === b));
    if (isAlt('bad_params', 'no_effect') || isAlt('no_effect', 'bad_params')) {
      return 'ineffective_loop';
    }
  }

  return 'none';
}

export function stubBookingAction(name: string): BookingProposedAction {
  return { type: 'PROPOSED_ACTION', name, intent: 'booking' };
}

/** dominant_pattern 同频并列时的稳定次序（序号越小越优先） */
export const BOOKING_DOMINANT_PATTERN_TIE_ORDER: readonly BookingFailurePattern[] = [
  'external_blocked',
  'ineffective_loop',
  'stage_misaligned',
];

function rankBookingSemantics(
  names: readonly string[],
  extMap: ReadonlyMap<string, number>,
  discouraged: Set<string>,
): string[] {
  return [...names].sort((a, b) => {
    const sa = -(extMap.get(a) ?? 0) * 10 - (discouraged.has(a) ? 50 : 0);
    const sb = -(extMap.get(b) ?? 0) * 10 - (discouraged.has(b) ? 50 : 0);
    return sb - sa;
  });
}

/**
 * 替代路径 hint（非 Planner）：按 pattern/stage 给出更可能有效的语义名列表。
 * 同层内：优先低 external 计数、低 discouraged 命中（第一版启发式）。
 */
export function deriveBookingSuggestedActions(params: {
  stage: BookingStage;
  pattern: BookingFailurePattern;
  lastNoProgressSemantics: readonly string[];
  externalBlockAttempts: ReadonlyMap<string, number>;
  lastDiscouragedSemantics?: readonly string[];
}): BookingProposedAction[] {
  const { stage, pattern, lastNoProgressSemantics, externalBlockAttempts } = params;
  const discouraged = new Set(params.lastDiscouragedSemantics ?? []);
  const allowNames = BOOKING_STAGE_ACTION_ALLOWLIST[stage];

  switch (pattern) {
    case 'none':
      return [];
    case 'ineffective_loop': {
      const tried = new Set(lastNoProgressSemantics);
      const fresh = allowNames.filter((n) => !tried.has(n));
      return rankBookingSemantics(fresh, externalBlockAttempts, discouraged).map(stubBookingAction);
    }
    case 'stage_misaligned': {
      return rankBookingSemantics(allowNames, externalBlockAttempts, discouraged).map(stubBookingAction);
    }
    case 'external_blocked': {
      const alts: string[] = [];
      for (const n of allowNames) {
        if ((externalBlockAttempts.get(n) ?? 0) >= 2) continue;
        if (!lastNoProgressSemantics.includes(n)) {
          alts.push(n);
        }
      }
      if (alts.length > 0) {
        return rankBookingSemantics(alts, externalBlockAttempts, discouraged).map(stubBookingAction);
      }
      const fallback: string[] = [];
      for (const n of allowNames) {
        if ((externalBlockAttempts.get(n) ?? 0) < 2) {
          fallback.push(n);
        }
      }
      return rankBookingSemantics(fallback, externalBlockAttempts, discouraged).map(stubBookingAction);
    }
    default:
      return [];
  }
}

export interface BookingPolicyOptions {
  /** 最近若干轮 no_progress 归因（executor slice，默认窗口 4） */
  recentNoProgressReasons?: BookingNoProgressReason[];
  /** 上一轮 no_progress 时执行的语义 action */
  lastNoProgressSemantics?: readonly string[];
  /** external_block 按语义累计，≥2 时策略层拦截 */
  externalBlockAttempts?: ReadonlyMap<string, number>;
  /** detectBookingFailurePattern 输出；用于收紧或阻断重复低效路径 */
  failurePattern?: BookingFailurePattern;
  /** 上一轮 Policy.discouraged 的语义名（用于 suggested 排序降权） */
  lastDiscouragedSemantics?: readonly string[];
}

/**
 * P0：硬编码策略 — 仅放行当前 stage 下的 action；其余记入 blocked。
 * P3：可选 History-aware — invalid_stage 同步由 executor 在调用前完成；此处处理 no_effect / bad_params / external 收紧。
 */
export function applyBookingCallPolicy(
  stage: BookingStage,
  proposals: BookingProposedAction[],
  opts?: BookingPolicyOptions,
): BookingPolicyDecision {
  const allow = new Set(BOOKING_STAGE_ACTION_ALLOWLIST[stage]);
  const allowed: BookingProposedAction[] = [];
  const discouraged: BookingProposedAction[] = [];
  const blocked: BookingPolicyDecision['blocked'] = [];

  const recent = opts?.recentNoProgressReasons ?? [];
  const lastSem = opts?.lastNoProgressSemantics ?? [];
  const extMap = opts?.externalBlockAttempts ?? new Map<string, number>();
  const lastReason = recent[recent.length - 1];
  const pattern = opts?.failurePattern ?? 'none';

  for (const p of proposals) {
    if (!allow.has(p.name)) {
      blocked.push({
        action: p,
        reason: `action_not_allowed_in_stage:${stage}`,
      });
      continue;
    }

    if (pattern === 'ineffective_loop' && lastSem.includes(p.name)) {
      blocked.push({
        action: p,
        reason: `policy_ineffective_loop:${p.name}`,
      });
      continue;
    }

    const strikes = extMap.get(p.name) ?? 0;
    if (strikes >= 2) {
      blocked.push({
        action: p,
        reason: `policy_external_block_exhausted:${p.name}`,
      });
      continue;
    }

    if (lastReason === 'no_effect' && lastSem.includes(p.name)) {
      blocked.push({
        action: p,
        reason: `policy_repeat_no_effect:${p.name}`,
      });
      continue;
    }

    if (lastReason === 'bad_params' && lastSem.includes(p.name)) {
      discouraged.push(p);
      continue;
    }

    allowed.push(p);
  }

  const suggested = deriveBookingSuggestedActions({
    stage,
    pattern,
    lastNoProgressSemantics: lastSem,
    externalBlockAttempts: extMap,
    lastDiscouragedSemantics: opts?.lastDiscouragedSemantics,
  });

  return { allowed, discouraged, blocked, suggested };
}

/** 从 agentic trace 步生成 booking 聚合（轻量，避免 payload 堆明细）。 */
export function buildBookingToolLoopSummary(
  steps: ReadonlyArray<{
    booking_progress_made?: boolean;
    booking_no_progress_step?: boolean;
    booking_no_progress_reason?: BookingNoProgressReason;
    booking_failure_pattern?: BookingFailurePattern;
    booking_pattern_stability?: number;
    booking_suggested_candidates_count?: number;
    booking_suggested_used?: boolean;
    booking_suggested_override?: boolean;
    tool_results?: ReadonlyArray<{
      envelope: { orchestrator_robustness?: { failure_code?: string } | null };
    }>;
  }>,
): BookingToolLoopSummary {
  const no_progress_by_reason = Object.fromEntries(
    BOOKING_NO_PROGRESS_REASONS.map((r) => [r, 0]),
  ) as Record<BookingNoProgressReason, number>;

  let progress_steps = 0;
  let no_progress_steps = 0;

  for (const s of steps) {
    if (s.booking_progress_made === true) {
      progress_steps++;
    }
    if (s.booking_no_progress_step) {
      no_progress_steps++;
      const r = s.booking_no_progress_reason;
      if (r) {
        no_progress_by_reason[r]++;
      }
    }
  }

  let total_executed_steps = 0;
  for (const s of steps) {
    for (const tr of s.tool_results ?? []) {
      if (tr.envelope.orchestrator_robustness?.failure_code !== 'POLICY_BLOCKED') {
        total_executed_steps++;
      }
    }
  }

  const loop_efficiency = total_executed_steps > 0 ? progress_steps / total_executed_steps : 0;
  const step_efficiency = steps.length > 0 ? progress_steps / steps.length : 0;

  let failure_pattern_last: BookingFailurePattern = 'none';
  for (let i = steps.length - 1; i >= 0; i--) {
    const fp = steps[i]?.booking_failure_pattern;
    if (fp && fp !== 'none') {
      failure_pattern_last = fp;
      break;
    }
  }

  let pattern_stability_last = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i]?.booking_pattern_stability;
    if (st !== undefined && st > 0) {
      pattern_stability_last = st;
      break;
    }
  }

  const patternHist = new Map<BookingFailurePattern, number>();
  for (const s of steps) {
    const fp = s.booking_failure_pattern;
    if (fp && fp !== 'none') {
      patternHist.set(fp, (patternHist.get(fp) ?? 0) + 1);
    }
  }
  let maxPatternCount = 0;
  for (const c of patternHist.values()) {
    maxPatternCount = Math.max(maxPatternCount, c);
  }
  const atMax = [...patternHist.entries()]
    .filter(([, c]) => c === maxPatternCount && maxPatternCount > 0)
    .map(([p]) => p);
  let dominant_pattern: BookingFailurePattern = 'none';
  if (atMax.length === 1) {
    dominant_pattern = atMax[0];
  } else if (atMax.length > 1) {
    dominant_pattern =
      BOOKING_DOMINANT_PATTERN_TIE_ORDER.find((p) => atMax.includes(p)) ?? atMax[0];
  }

  let suggested_offered_rounds = 0;
  let suggested_used_rounds = 0;
  let suggested_override_count = 0;
  for (const s of steps) {
    const n = s.booking_suggested_candidates_count ?? 0;
    if (n > 0) suggested_offered_rounds++;
    if (s.booking_suggested_used) suggested_used_rounds++;
    if (s.booking_suggested_override) suggested_override_count++;
  }
  const suggested_usage_rate =
    suggested_offered_rounds > 0 ? suggested_used_rounds / suggested_offered_rounds : 0;

  const efficiency_by_reason = Object.fromEntries(
    BOOKING_NO_PROGRESS_REASONS.map((r) => [
      r,
      no_progress_steps > 0 ? no_progress_by_reason[r] / no_progress_steps : 0,
    ]),
  ) as Record<BookingNoProgressReason, number>;

  return {
    steps: steps.length,
    progress_steps,
    no_progress_steps,
    no_progress_by_reason,
    total_executed_steps,
    loop_efficiency,
    step_efficiency,
    failure_pattern_last,
    pattern_stability_last,
    dominant_pattern,
    suggested_usage_rate,
    suggested_override_count,
    efficiency_by_reason,
  };
}

/** P3 伏笔：本轮被策略拦下的提案数。 */
export function countBlockedProposals(d: BookingPolicyDecision): number {
  return d.blocked.length;
}

/** LLM OpenAI function name → booking 语义名（Policy allowlist 键）。 */
export function mapLlmFunctionNameToBookingSemantic(llmFunctionName: string): string {
  if (/^weather_/i.test(llmFunctionName)) return 'check_weather';
  return llmFunctionName;
}

/** 将 booking 语义映射到当前路由表里第一个匹配的 LLM 函数名（用于 suggested override）。 */
export function pickDefaultLlmFunctionForBookingSemantic(
  semantic: string,
  routing: ReadonlyArray<{ llmFunctionName: string }>,
): string | undefined {
  for (const e of routing) {
    if (mapLlmFunctionNameToBookingSemantic(e.llmFunctionName) === semantic) {
      return e.llmFunctionName;
    }
  }
  return undefined;
}

export function llmToolCallToBookingProposedAction(call: {
  name: string;
  args: Record<string, unknown>;
}): BookingProposedAction {
  const semantic = mapLlmFunctionNameToBookingSemantic(call.name);
  return {
    type: 'PROPOSED_ACTION',
    name: semantic,
    intent: 'booking',
    args: { ...call.args, _llm_function: call.name },
  };
}

/** 单一写入口：tool 结果折叠进 Execution Context。 */
export function reduceBookingExecutionContext(
  ctx: BookingExecutionContext,
  semanticAction: string,
  envelope: { success: boolean; error: string | null; data: unknown },
): BookingExecutionContext {
  const failures = [...ctx.failures];
  const route = [...ctx.route];

  if (!envelope.success) {
    failures.push({
      at: semanticAction,
      detail: envelope.error ?? 'tool_failed',
    });
    return { ...ctx, failures };
  }

  if (semanticAction === 'check_weather') {
    route.push({ kind: 'weather', data: envelope.data });
    return { route, failures, inventory_checked: ctx.inventory_checked };
  }
  if (semanticAction === 'check_inventory') {
    return { route, failures, inventory_checked: true };
  }

  return { route, failures, inventory_checked: ctx.inventory_checked };
}

/** MCP 调用前剥离内部审计字段。 */
export function stripBookingProposalInternalArgs(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!args) return {};
  const { _llm_function: _fn, ...rest } = args;
  return rest;
}

export function getLlmFunctionFromProposal(a: BookingProposedAction): string | undefined {
  const v = a.args?._llm_function;
  return typeof v === 'string' ? v : undefined;
}
