import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../../llm/services/llm.service';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type {
  ChatCompletionMessage,
  ChatCompletionsToolCallParsed,
  ChatCompletionsWithToolsResult,
} from '../../../../llm/interfaces/chat-completion-tools.interface';
import type { McpToolDefinition } from './mcp-tool-registry.service';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpToolDispatcherService } from './mcp-tool-dispatcher.service';
import {
  buildOpenAiToolsFromMcpDefinitions,
  type McpToolRoutingEntry,
} from './mcp-openai-tools.adapter';
import {
  buildToolGovernanceHoldEnvelope,
  isGovernanceAskPreApproved,
  policyForMcpTool,
  type GovernanceApprovedToolInvocation,
  type ToolGovernancePolicyEntry,
} from '../../../runtime/agentic-tool-governance.util';
import {
  classifyOrchestratorFailure,
  truncateOrchestratorFailurePreview,
} from '../../../utils/orchestrator-failure-taxonomy.util';
import type { OrchestratorRobustnessMetadata } from '../../../utils/orchestrator-failure-taxonomy.util';
import { isMcpToolExecutionError } from '../errors/mcp-tool-execution.error';
import { extractTokenUsage } from '../../../../llm/utils/token-extractor.util';
import type { ComplexityLevel } from '../../../utils/orchestration-signals.util';
import { MetricsRecorder } from '../../../utils/agent-metrics.util';
import type {
  BookingCompletionContract,
  BookingExecutionContext,
  BookingFailurePattern,
  BookingNoProgressReason,
  BookingProposedAction,
  BookingStage,
  BookingTaskClosureRunOptions,
  BookingToolLoopSummary,
} from '../../../task-closure/booking-minimal.types';
import {
  applyBookingCallPolicy,
  BOOKING_NO_PROGRESS_REASON_WINDOW,
  buildBookingToolLoopSummary,
  classifyBookingNoProgressReason,
  cloneBookingExecutionContext,
  detectBookingFailurePattern,
  deriveBookingCompletion,
  getLlmFunctionFromProposal,
  isBookingCompletionSatisfied,
  isBookingProgressForward,
  llmToolCallToBookingProposedAction,
  pickDefaultLlmFunctionForBookingSemantic,
  reduceBookingExecutionContext,
  stripBookingProposalInternalArgs,
  suggestBookingStage,
} from '../../../task-closure/booking-minimal.engine';

/** PRD：统一工具返回结构（I5：失败时可带 orchestrator_robustness） */
export interface McpToolRuntimeEnvelope {
  success: boolean;
  data: unknown;
  error: string | null;
  sideEffects: Record<string, unknown>;
  confidence: number;
  orchestrator_robustness?: OrchestratorRobustnessMetadata;
}

export type AgentToolPack = 'weather' | 'exa' | 'hotel' | 'calendar';

export interface AgentLoopTraceStep {
  step: number;
  llm_finish_reason?: string | null;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tool_results?: Array<{ tool_call_id: string; envelope: McpToolRuntimeEnvelope }>;
  latency_ms: number;
  /** Task Closure booking：本轮前后 completion 快照与推进语义（可 replay）。 */
  booking_prev_completion?: BookingCompletionContract;
  booking_next_completion?: BookingCompletionContract;
  booking_progress_made?: boolean;
  /** 至少一次真实 MCP 执行但 completion 维度无严格前进 */
  booking_no_progress_step?: boolean;
  booking_no_progress_reason?: BookingNoProgressReason;
  /** 仅观测：不参与 completion 判断，为 state_progress 升级预留 */
  booking_state_delta?: {
    route_len_delta: number;
    inventory_items_delta: number;
  };
  /** 本轮存在 Policy 标为 discouraged 且已真实执行的语义 action */
  booking_discouraged_action?: boolean;
  /** 本轮 Policy 前基于近期 no_progress 序列检测到的失败模式 */
  booking_failure_pattern?: BookingFailurePattern;
  /** 连续相同 failure_pattern 的长度（pattern 为 none 时为 0） */
  booking_pattern_stability?: number;
  /** 本轮 Policy 给出的 suggested 条数（纠偏前后一致取最终 decision） */
  booking_suggested_candidates_count?: number;
  /** 执行语义命中 suggested，或触发了 suggested 纠偏 */
  booking_suggested_used?: boolean;
  /** stability≥2 且 LLM 未采纳 suggested 时，强制首轮改为 suggested[0] */
  booking_suggested_override?: boolean;
}

export interface McpAgentExecutorBudget {
  /** 累计 total_tokens 上限（默认 AGENTIC_LOOP_MAX_TOTAL_TOKENS 或 4000） */
  maxTotalTokens?: number;
  /** 下一轮 LLM 前若 deadline 剩余不足则优雅退出（默认 AGENTIC_LOOP_MIN_REMAINING_MS 或 800） */
  minRemainingMsForNextLlm?: number;
  /** 外层 route_and_run deadline.remainingMs */
  deadlineRemainingMs?: () => number;
  /**
   * 单次 MCP 工具调用的最大尝试次数（含首次）；仅当 failure 带 retryable_hint 时在两次尝试之间退避。
   * 缺省由 AGENTIC_MCP_TOOL_MAX_ATTEMPTS 或复杂度预设决定。
   */
  mcpMaxToolAttempts?: number;
  /**
   * MCP 可重试失败时的退避基数（ms）；第 k 次失败后等待 `mcpRetryBaseMs * 2^k`（k 从 0 起）。
   * 缺省由 AGENTIC_MCP_RETRY_BASE_MS 或复杂度预设决定。
   */
  mcpRetryBaseMs?: number;
}

export interface McpAgentExecutorRunInput {
  /** 用户自然语言任务 */
  message: string;
  /** 可选系统提示 */
  systemPrompt?: string;
  /** 覆盖默认 LLM（须支持 OpenAI 兼容 tools） */
  provider?: LlmProvider;
  /** 最大 Agent 轮数（LLM 调用次数上限） */
  maxSteps?: number;
  /** Token / 耗时 / 死循环熔断（BudgetGuard） */
  budget?: McpAgentExecutorBudget;
  /**
   * 单包（兼容旧接口）
   * @deprecated 优先使用 toolPacks
   */
  toolPack?: 'weather';
  /** 多工具包合并注册（去重 toolName） */
  toolPacks?: AgentToolPack[];
  /**
   * Runtime MCP 硬装配：在审计白名单（AGENTIC_MCP_LLM_EXPOSE_WHITELIST）之后，仅允许这些 MCP toolName。
   * `undefined`：不启用第二道闸；`[]`：显式拒绝全部 MCP（与 RCS 空集语义一致）。
   */
  runtimeMcpToolAllowlist?: string[];
  /**
   * 可观测：deriveAgenticMcpRuntimeAllowlist 等写入的简短溯源（可选）。
   */
  runtimeMcpCapProvenance?: string;
  /**
   * MCP toolName → 治理模式；由 Agent 合并 FEATURE_AGENTIC_GOVERNANCE_HITL 默认与 TripTaskMemory.constraints.tool_policies。
   * `ask` / `deny` 在 dispatch 前短路，返回结构化 envelope（不发起真实 MCP）。
   */
  toolGovernancePolicies?: Record<string, ToolGovernancePolicyEntry>;
  /**
   * HITL 续跑：用户确认后的 tool_call_id 列表（可与 TripTask.constraints.approved_tool_invocations 合并）。
   * 对 `mode: ask` 的工具，若命中则跳过挂起并执行真实 MCP。
   */
  governanceApprovedToolInvocations?: GovernanceApprovedToolInvocation[];
  /**
   * Task Closure：booking 时强制执行 Proposal→Policy→Execute，禁止绕过 Policy 直连 MCP。
   */
  taskClosure?: BookingTaskClosureRunOptions;
}

/** 双轨实验：MCP 工具调用次数、LLM 轮次、Token 累计（与 observability 对齐） */
export interface AgenticLoopMetrics {
  /** 本轮 loop 内真实 MCP/工具执行次数（非 LLM 轮次） */
  tool_call_count: number;
  /** chat/completions 调用次数（含最终无 tool 的一轮） */
  llm_rounds: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type AgenticBudgetStopReason = 'token' | 'time' | 'dead_loop';

export type AgenticToolLoopTrace = {
  steps: AgentLoopTraceStep[];
  stopped_reason: string;
  booking_summary?: BookingToolLoopSummary;
};

export interface McpAgentExecutorRunResult {
  success: boolean;
  final_message: string | null;
  trace: AgenticToolLoopTrace;
  /** 最后一轮 LLM 原始响应（可观测） */
  last_raw_llm_response?: unknown;
  /** 聚合指标（route_and_run observability / 实验对照） */
  metrics?: AgenticLoopMetrics;
  /** BudgetGuard 触发时写入（与 I5 对齐，不抛异常） */
  orchestrator_robustness?: OrchestratorRobustnessMetadata;
  budget_stop_reason?: AgenticBudgetStopReason;
}

const DEFAULT_SYSTEM_WEATHER = `你是 TripNARA 旅行助理。你可以调用提供的工具获取实时天气。
策略：若用户询问某地天气，先调用相应天气工具，再基于工具结果用中文简洁回答。
不要编造气象数据；工具失败时说明原因并给出可行建议。`;

/** 减少日期参数幻觉：每次请求注入当前 UTC 锚点（工具参数字符串请与此对齐）。 */
function buildTemporalGroundingLine(now: Date = new Date()): string {
  const iso = now.toISOString();
  return `[Temporal anchor] UTC now: ${iso}. Interpret 今天/明天/后天 and weather startDate/endDate relative to this instant.`;
}

/** 按路由复杂度给出 MCP 韧性默认值（可被 budget / 环境变量覆盖）。 */
export function resolveAgenticMcpRetryBudget(complexity: ComplexityLevel): Pick<
  McpAgentExecutorBudget,
  'mcpMaxToolAttempts' | 'mcpRetryBaseMs'
> {
  switch (complexity) {
    case 'COMPLEX':
      return { mcpMaxToolAttempts: 6, mcpRetryBaseMs: 1000 };
    case 'MODERATE':
      return { mcpMaxToolAttempts: 4, mcpRetryBaseMs: 500 };
    default:
      return { mcpMaxToolAttempts: 3, mcpRetryBaseMs: 300 };
  }
}

function resolveMcpToolMaxAttempts(budget?: McpAgentExecutorBudget): number {
  if (budget?.mcpMaxToolAttempts != null) {
    const n = Math.floor(Number(budget.mcpMaxToolAttempts));
    if (Number.isFinite(n) && n >= 1 && n <= 8) return n;
  }
  const raw = parseInt(process.env.AGENTIC_MCP_TOOL_MAX_ATTEMPTS ?? '3', 10);
  return Number.isFinite(raw) && raw >= 1 && raw <= 8 ? raw : 3;
}

function resolveMcpRetryBaseMs(budget?: McpAgentExecutorBudget): number {
  if (budget?.mcpRetryBaseMs != null) {
    const n = Math.floor(Number(budget.mcpRetryBaseMs));
    if (Number.isFinite(n) && n >= 0 && n <= 30_000) return n;
  }
  const raw = parseInt(process.env.AGENTIC_MCP_RETRY_BASE_MS ?? '500', 10);
  return Number.isFinite(raw) && raw >= 0 && raw <= 30_000 ? raw : 500;
}

@Injectable()
export class McpAgentExecutorService {
  private readonly logger = new Logger(McpAgentExecutorService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly mcpRegistry: McpToolRegistryService,
    @Optional() private readonly mcpDispatcher?: McpToolDispatcherService,
  ) {}

  /** 别名：与 route_and_run 接线文档对齐 */
  runLoop(input: McpAgentExecutorRunInput): Promise<McpAgentExecutorRunResult> {
    return this.run(input);
  }

  /**
   * OpenAI 兼容原生 tools + MCP 执行 + tool_result 回填的最小闭环。
   */
  async run(input: McpAgentExecutorRunInput): Promise<McpAgentExecutorRunResult> {
    const bookingClosureActive = input.taskClosure?.mode === 'booking';

    if (!this.mcpDispatcher) {
      return {
        success: false,
        final_message: null,
        trace: this.finalizeTrace([], 'McpToolDispatcherService not available', bookingClosureActive),
        metrics: this.emptyMetrics(),
      };
    }

    const maxSteps = Math.min(Math.max(input.maxSteps ?? 8, 1), 16);
    const provider = input.provider ?? this.resolveToolCallingProvider();
    const packs = this.resolveToolPacks(input);
    const defs = this.selectToolDefinitions(packs);
    if (defs.length === 0) {
      return {
        success: false,
        final_message: null,
        trace: this.finalizeTrace([], 'no_tools_registered_for_packs', bookingClosureActive),
        metrics: this.emptyMetrics(),
      };
    }

    const filterOpts =
      input.runtimeMcpToolAllowlist !== undefined
        ? { runtimeAllowedMcpToolNames: new Set(input.runtimeMcpToolAllowlist) }
        : undefined;
    if (input.runtimeMcpCapProvenance && filterOpts) {
      this.logger.debug(`Agentic runtime MCP cap provenance: ${input.runtimeMcpCapProvenance}`);
    }
    const { tools, routing, droppedToolNames } = buildOpenAiToolsFromMcpDefinitions(defs, filterOpts);
    if (droppedToolNames.length > 0) {
      this.logger.debug(
        `Agentic MCP defs dropped ${droppedToolNames.length} tool(s): ${droppedToolNames.join(', ')}`,
      );
    }
    if (tools.length === 0) {
      return {
        success: false,
        final_message: null,
        trace: this.finalizeTrace(
          [],
          filterOpts ? 'all_tools_filtered_by_runtime_mcp_cap' : 'all_tools_filtered_by_agentic_llm_whitelist',
          bookingClosureActive,
        ),
        metrics: this.emptyMetrics(),
      };
    }

    const messages: ChatCompletionMessage[] = [];
    const systemBody = input.systemPrompt?.trim() || this.buildDefaultSystemPrompt(packs);
    messages.push({
      role: 'system',
      content: `${buildTemporalGroundingLine()}\n\n${systemBody}`,
    });
    messages.push({ role: 'user', content: input.message });

    const traceSteps: AgentLoopTraceStep[] = [];
    let stoppedReason = 'max_steps';
    let lastRaw: unknown;
    let promptTok = 0;
    let completionTok = 0;
    let totalTok = 0;

    let bookingCtx: BookingExecutionContext | undefined;
    let bookingStage: BookingStage | undefined;
    if (bookingClosureActive && input.taskClosure) {
      const ic = input.taskClosure.initialContext;
      bookingCtx = {
        route: ic?.route ?? [],
        inventory_checked: ic?.inventory_checked ?? false,
        failures: ic?.failures ?? [],
      };
      bookingStage = input.taskClosure.initialStage ?? suggestBookingStage(bookingCtx);
    }

    let bookingRecentNoProgressReasons: BookingNoProgressReason[] = [];
    let bookingLastNoProgressSemantics: string[] = [];
    const bookingExternalBlockAttempts = new Map<string, number>();
    let bookingPatternStreakPrev: BookingFailurePattern = 'none';
    let bookingPatternStreakLen = 0;
    let bookingPrevRoundDiscouragedSemantics: string[] = [];

    const budgetCfg = this.resolveBudgetConfig(input);
    const getRemaining = input.budget?.deadlineRemainingMs;
    let lastAssistantPlainText: string | null = null;
    let lastToolSig: string | null = null;
    let identicalToolStreak = 0;

    for (let step = 1; step <= maxSteps; step++) {
      if (getRemaining) {
        const rem = getRemaining();
        if (rem < budgetCfg.minRemainingMs) {
          return this.budgetGuardExit({
            reason: 'time',
            traceSteps,
            promptTok,
            completionTok,
            totalTok,
            lastRaw,
            stoppedReason: 'budget_time',
            finalMessage: lastAssistantPlainText ?? this.defaultBudgetUserMessage('time'),
            previewDetail: `remaining_ms=${Math.max(0, Math.floor(rem))}`,
            bookingClosureActive,
          });
        }
      }

      const t0 = Date.now();
      let llmRes: ChatCompletionsWithToolsResult;
      try {
        llmRes = await this.llmService.callChatWithTools(provider, messages, tools, {
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 2048,
        });
      } catch (e: any) {
        traceSteps.push({
          step,
          latency_ms: Date.now() - t0,
        });
        stoppedReason = `llm_error: ${e?.message || String(e)}`;
        return {
          success: false,
          final_message: null,
          trace: this.finalizeTrace(traceSteps, stoppedReason, bookingClosureActive),
          last_raw_llm_response: lastRaw,
          metrics: this.buildMetrics(traceSteps, promptTok, completionTok, totalTok),
        };
      }

      lastRaw = llmRes.rawResponse;
      const usage = extractTokenUsage(provider, llmRes.rawResponse as any, JSON.stringify(messages));
      promptTok += usage.prompt_tokens;
      completionTok += usage.completion_tokens;
      totalTok += usage.total_tokens;

      const finishReason = (llmRes.rawResponse as any)?.choices?.[0]?.finish_reason ?? null;
      const rawAssistantMsg = (llmRes.rawResponse as any)?.choices?.[0]?.message;
      const contentStr =
        typeof llmRes.message.content === 'string' ? llmRes.message.content.trim() : '';
      if (contentStr) {
        lastAssistantPlainText = contentStr;
      }

      if (totalTok > budgetCfg.maxTotalTokens) {
        const calls = llmRes.message.tool_calls;
        if (calls?.length) {
          traceSteps.push({
            step,
            llm_finish_reason: finishReason,
            tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
            latency_ms: Date.now() - t0,
          });
        }
        return this.budgetGuardExit({
          reason: 'token',
          traceSteps,
          promptTok,
          completionTok,
          totalTok,
          lastRaw,
          stoppedReason: 'budget_token',
          finalMessage:
            contentStr ||
            lastAssistantPlainText ||
            this.defaultBudgetUserMessage('token'),
          previewDetail: `total_tokens=${totalTok}>${budgetCfg.maxTotalTokens}`,
          bookingClosureActive,
        });
      }

      const calls = llmRes.message.tool_calls;
      if (!calls?.length) {
        if (rawAssistantMsg) {
          messages.push(rawAssistantMsg as ChatCompletionMessage);
        }
        traceSteps.push({
          step,
          llm_finish_reason: finishReason,
          latency_ms: Date.now() - t0,
        });
        stoppedReason = 'final_answer';
        return {
          success: true,
          final_message: llmRes.message.content,
          trace: this.finalizeTrace(traceSteps, stoppedReason, bookingClosureActive),
          last_raw_llm_response: lastRaw,
          metrics: this.buildMetrics(traceSteps, promptTok, completionTok, totalTok),
        };
      }

      const sig = this.serializeToolCallsSignature(calls);
      if (sig === lastToolSig) {
        identicalToolStreak++;
      } else {
        identicalToolStreak = 1;
        lastToolSig = sig;
      }
      if (identicalToolStreak >= 3) {
        traceSteps.push({
          step,
          llm_finish_reason: finishReason,
          tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
          latency_ms: Date.now() - t0,
        });
        return this.budgetGuardExit({
          reason: 'dead_loop',
          traceSteps,
          promptTok,
          completionTok,
          totalTok,
          lastRaw,
          stoppedReason: 'budget_dead_loop',
          finalMessage: lastAssistantPlainText ?? this.defaultBudgetUserMessage('dead_loop'),
          previewDetail: `identical_tool_plan_x${identicalToolStreak}`,
          bookingClosureActive,
        });
      }

      if (getRemaining && getRemaining() < budgetCfg.minRemainingMs) {
        traceSteps.push({
          step,
          llm_finish_reason: finishReason,
          tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
          latency_ms: Date.now() - t0,
        });
        return this.budgetGuardExit({
          reason: 'time',
          traceSteps,
          promptTok,
          completionTok,
          totalTok,
          lastRaw,
          stoppedReason: 'budget_time_pre_tool',
          finalMessage: lastAssistantPlainText ?? this.defaultBudgetUserMessage('time'),
          previewDetail: `remaining_ms=${Math.max(0, Math.floor(getRemaining()))}`,
          bookingClosureActive,
        });
      }

      if (rawAssistantMsg) {
        messages.push(rawAssistantMsg as ChatCompletionMessage);
      }

      traceSteps.push({
        step,
        llm_finish_reason: finishReason,
        tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
        latency_ms: Date.now() - t0,
      });

      const toolResults: AgentLoopTraceStep['tool_results'] = [];
      const execT0 = Date.now();

      if (bookingClosureActive && bookingCtx !== undefined && bookingStage !== undefined) {
        const bookingFailurePattern = detectBookingFailurePattern(bookingRecentNoProgressReasons);

        let bookingPatternStabilityThisRound = 0;
        if (bookingFailurePattern === 'none') {
          bookingPatternStreakLen = 0;
          bookingPatternStreakPrev = 'none';
          bookingPatternStabilityThisRound = 0;
        } else {
          if (bookingFailurePattern === bookingPatternStreakPrev) {
            bookingPatternStreakLen++;
          } else {
            bookingPatternStreakLen = 1;
          }
          bookingPatternStreakPrev = bookingFailurePattern;
          bookingPatternStabilityThisRound = bookingPatternStreakLen;
        }

        const traceStepForPattern = traceSteps[traceSteps.length - 1];
        if (traceStepForPattern) {
          traceStepForPattern.booking_failure_pattern = bookingFailurePattern;
          traceStepForPattern.booking_pattern_stability = bookingPatternStabilityThisRound;
        }

        if (
          bookingRecentNoProgressReasons.includes('invalid_stage') ||
          bookingFailurePattern === 'ineffective_loop' ||
          bookingFailurePattern === 'stage_misaligned' ||
          bookingFailurePattern === 'external_blocked'
        ) {
          bookingStage = suggestBookingStage(bookingCtx);
        }

        let proposals = calls.map((c) => llmToolCallToBookingProposedAction({ name: c.name, args: c.args }));
        let workingCalls = [...calls];
        let decision = applyBookingCallPolicy(bookingStage, proposals, {
          recentNoProgressReasons: bookingRecentNoProgressReasons,
          lastNoProgressSemantics: bookingLastNoProgressSemantics,
          externalBlockAttempts: bookingExternalBlockAttempts,
          failurePattern: bookingFailurePattern,
          lastDiscouragedSemantics: bookingPrevRoundDiscouragedSemantics,
        });

        const suggestedNameSet = new Set(decision.suggested.map((s) => s.name));
        const llmPickedSuggested = proposals.some((p) => suggestedNameSet.has(p.name));
        let bookingSuggestedOverride = false;

        if (
          decision.suggested.length > 0 &&
          !llmPickedSuggested &&
          bookingPatternStabilityThisRound >= 2 &&
          workingCalls.length > 0
        ) {
          const sem0 = decision.suggested[0].name;
          const llmFnOverride = pickDefaultLlmFunctionForBookingSemantic(sem0, [...routing.values()]);
          if (llmFnOverride) {
            proposals = [...proposals];
            workingCalls = [...workingCalls];
            proposals[0] = {
              type: 'PROPOSED_ACTION',
              name: sem0,
              intent: 'booking',
              args: { _llm_function: llmFnOverride },
            };
            workingCalls[0] = { ...workingCalls[0], name: llmFnOverride, args: {} };
            decision = applyBookingCallPolicy(bookingStage, proposals, {
              recentNoProgressReasons: bookingRecentNoProgressReasons,
              lastNoProgressSemantics: bookingLastNoProgressSemantics,
              externalBlockAttempts: bookingExternalBlockAttempts,
              failurePattern: bookingFailurePattern,
              lastDiscouragedSemantics: bookingPrevRoundDiscouragedSemantics,
            });
            bookingSuggestedOverride = true;
            const tsPatch = traceSteps[traceSteps.length - 1];
            if (tsPatch?.tool_calls?.[0]) {
              tsPatch.tool_calls = [...tsPatch.tool_calls];
              tsPatch.tool_calls[0] = {
                ...tsPatch.tool_calls[0],
                name: llmFnOverride,
                args: {},
              };
            }
          }
        }

        bookingPrevRoundDiscouragedSemantics = decision.discouraged.map((d) => d.name);

        const blockedCount = decision.blocked.length;
        if (blockedCount > 0) {
          MetricsRecorder.recordAgenticPolicyGateBlocked(blockedCount);
        }

        const prevCompletion = deriveBookingCompletion(bookingCtx);
        const ctxSnapshotBefore = cloneBookingExecutionContext(bookingCtx);
        const policyStageThisRound = bookingStage;
        let mcpExecutedThisRound = 0;
        const executedEnvelopes: McpToolRuntimeEnvelope[] = [];
        const executedSemanticActions: string[] = [];
        let bookingDiscouragedExecuted = false;

        for (let i = 0; i < workingCalls.length; i++) {
          const call = workingCalls[i];
          const proposal = proposals[i];
          const permitted =
            decision.allowed.includes(proposal) || decision.discouraged.includes(proposal);
          if (!permitted) {
            const rb = decision.blocked.find(
              (b: { action: BookingProposedAction; reason: string }) => b.action === proposal,
            );
            const envelope = this.buildPolicyBlockedEnvelope(rb?.reason ?? 'not_permitted');
            toolResults!.push({ tool_call_id: call.id, envelope });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(envelope),
            });
            continue;
          }
          const llmFn = getLlmFunctionFromProposal(proposal);
          if (!llmFn) {
            const envelope = this.buildPolicyBlockedEnvelope('missing_llm_function_mapping');
            toolResults!.push({ tool_call_id: call.id, envelope });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(envelope),
            });
            continue;
          }
          const envelope = await this.executeOneTool(
            llmFn,
            stripBookingProposalInternalArgs(proposal.args),
            routing,
            input.budget,
            input.toolGovernancePolicies,
            input.governanceApprovedToolInvocations,
            call.id,
          );
          mcpExecutedThisRound++;
          if (decision.discouraged.includes(proposal)) {
            bookingDiscouragedExecuted = true;
          }
          executedEnvelopes.push(envelope);
          executedSemanticActions.push(proposal.name);
          bookingCtx = reduceBookingExecutionContext(bookingCtx, proposal.name, envelope);
          toolResults!.push({ tool_call_id: call.id, envelope });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(envelope),
          });
        }

        if (decision.suggested.length > 0) {
          const hintNames = decision.suggested.map((s) => s.name).join(', ');
          messages.push({
            role: 'system',
            content: `[Booking policy] Suggested next actions (positive hint): ${hintNames}. Prefer these semantics when choosing tools for the current stage and detected failure pattern.`,
          });
        }

        bookingStage = suggestBookingStage(bookingCtx);

        const nextCompletion = deriveBookingCompletion(bookingCtx);
        const progressMade = isBookingProgressForward(prevCompletion, nextCompletion);
        const traceStepForBooking = traceSteps[traceSteps.length - 1];
        let noProgressAttribution: BookingNoProgressReason | undefined;

        for (let ei = 0; ei < executedEnvelopes.length; ei++) {
          if (executedEnvelopes[ei]?.success) {
            bookingExternalBlockAttempts.delete(executedSemanticActions[ei]);
          }
        }

        if (traceStepForBooking) {
          traceStepForBooking.booking_prev_completion = prevCompletion;
          traceStepForBooking.booking_next_completion = nextCompletion;
          traceStepForBooking.booking_progress_made = progressMade;
          traceStepForBooking.booking_state_delta = {
            route_len_delta: bookingCtx.route.length - ctxSnapshotBefore.route.length,
            inventory_items_delta:
              !ctxSnapshotBefore.inventory_checked && bookingCtx.inventory_checked ? 1 : 0,
          };
          if (bookingDiscouragedExecuted) {
            traceStepForBooking.booking_discouraged_action = true;
          }
          const finalSuggestedNames = new Set(decision.suggested.map((s) => s.name));
          traceStepForBooking.booking_suggested_candidates_count = decision.suggested.length;
          traceStepForBooking.booking_suggested_override = bookingSuggestedOverride;
          traceStepForBooking.booking_suggested_used =
            bookingSuggestedOverride ||
            executedSemanticActions.some((n) => finalSuggestedNames.has(n));
          if (mcpExecutedThisRound > 0 && !progressMade) {
            traceStepForBooking.booking_no_progress_step = true;
            noProgressAttribution = classifyBookingNoProgressReason({
              policyStage: policyStageThisRound,
              ctxBefore: ctxSnapshotBefore,
              ctxAfter: bookingCtx,
              executedEnvelopes,
              executedSemanticActions,
            });
            traceStepForBooking.booking_no_progress_reason = noProgressAttribution;
            MetricsRecorder.recordAgenticNoProgressStep(noProgressAttribution);
          }
        }

        if (mcpExecutedThisRound > 0 && !progressMade && noProgressAttribution) {
          bookingRecentNoProgressReasons = [...bookingRecentNoProgressReasons, noProgressAttribution].slice(
            -BOOKING_NO_PROGRESS_REASON_WINDOW,
          );
          bookingLastNoProgressSemantics = [...executedSemanticActions];
          if (noProgressAttribution === 'external_block') {
            for (const s of executedSemanticActions) {
              bookingExternalBlockAttempts.set(s, (bookingExternalBlockAttempts.get(s) ?? 0) + 1);
            }
          }
        } else if (progressMade) {
          bookingRecentNoProgressReasons = [];
          bookingLastNoProgressSemantics = [];
          bookingPrevRoundDiscouragedSemantics = [];
          bookingPatternStreakPrev = 'none';
          bookingPatternStreakLen = 0;
        }

        const completion = nextCompletion;
        if (isBookingCompletionSatisfied(completion)) {
          stoppedReason = 'completion_satisfied';
          const lastStep = traceSteps[traceSteps.length - 1];
          if (lastStep) {
            lastStep.tool_results = toolResults;
            lastStep.latency_ms = lastStep.latency_ms + (Date.now() - execT0);
          }
          return {
            success: true,
            final_message:
              lastAssistantPlainText ?? 'Completion contract satisfied.',
            trace: this.finalizeTrace(traceSteps, stoppedReason, bookingClosureActive),
            last_raw_llm_response: lastRaw,
            metrics: this.buildMetrics(traceSteps, promptTok, completionTok, totalTok),
          };
        }
      } else {
        for (const call of calls) {
          const envelope = await this.executeOneTool(
            call.name,
            call.args,
            routing,
            input.budget,
            input.toolGovernancePolicies,
            input.governanceApprovedToolInvocations,
            call.id,
          );
          toolResults!.push({ tool_call_id: call.id, envelope });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(envelope),
          });
        }
      }

      const lastStep = traceSteps[traceSteps.length - 1];
      if (lastStep) {
        lastStep.tool_results = toolResults;
        lastStep.latency_ms = lastStep.latency_ms + (Date.now() - execT0);
      }
    }

    return {
      success: false,
      final_message: lastAssistantPlainText,
      trace: this.finalizeTrace(traceSteps, stoppedReason, bookingClosureActive),
      last_raw_llm_response: lastRaw,
      metrics: this.buildMetrics(traceSteps, promptTok, completionTok, totalTok),
    };
  }

  private finalizeTrace(
    traceSteps: AgentLoopTraceStep[],
    stoppedReason: string,
    bookingClosureActive: boolean,
  ): AgenticToolLoopTrace {
    const base: AgenticToolLoopTrace = { steps: traceSteps, stopped_reason: stoppedReason };
    if (!bookingClosureActive) {
      return base;
    }
    return {
      ...base,
      booking_summary: buildBookingToolLoopSummary(traceSteps),
    };
  }

  private resolveBudgetConfig(input: McpAgentExecutorRunInput): {
    maxTotalTokens: number;
    minRemainingMs: number;
  } {
    const maxRaw =
      input.budget?.maxTotalTokens ??
      parseInt(process.env.AGENTIC_LOOP_MAX_TOTAL_TOKENS ?? '4000', 10);
    const minRaw =
      input.budget?.minRemainingMsForNextLlm ??
      parseInt(process.env.AGENTIC_LOOP_MIN_REMAINING_MS ?? '800', 10);
    const maxTotalTokens = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 4000;
    const minRemainingMs = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : 800;
    return {
      maxTotalTokens: Math.max(512, maxTotalTokens),
      minRemainingMs: Math.max(50, minRemainingMs),
    };
  }

  private budgetGuardExit(params: {
    reason: AgenticBudgetStopReason;
    traceSteps: AgentLoopTraceStep[];
    promptTok: number;
    completionTok: number;
    totalTok: number;
    lastRaw: unknown;
    stoppedReason: string;
    finalMessage: string;
    previewDetail: string;
    bookingClosureActive?: boolean;
  }): McpAgentExecutorRunResult {
    this.logger.warn(
      `[BudgetGuard] ${params.reason}: ${params.previewDetail} | stopped=${params.stoppedReason}`,
    );
    const robustness: OrchestratorRobustnessMetadata = {
      failure_domain: 'LLM',
      failure_code: 'AGENTIC_BUDGET_EXCEEDED',
      source_layer: 'LLM_PROVIDER',
      retryable_hint: false,
      classified_at: new Date().toISOString(),
      orchestrator_step_at_failure: 'AGENTIC_TOOL_LOOP.budget_guard',
      message_preview: truncateOrchestratorFailurePreview(`${params.reason}:${params.previewDetail}`),
    };
    return {
      success: false,
      final_message: params.finalMessage,
      trace: this.finalizeTrace(
        params.traceSteps,
        params.stoppedReason,
        params.bookingClosureActive ?? false,
      ),
      last_raw_llm_response: params.lastRaw,
      metrics: this.buildMetrics(params.traceSteps, params.promptTok, params.completionTok, params.totalTok),
      orchestrator_robustness: robustness,
      budget_stop_reason: params.reason,
    };
  }

  private defaultBudgetUserMessage(reason: AgenticBudgetStopReason): string {
    switch (reason) {
      case 'token':
        return '本次推理已达到长度上限，请缩小问题范围或新开一轮对话。';
      case 'time':
        return '剩余时间不足以继续推理；请查看上方已有结果或稍后重试。';
      case 'dead_loop':
        return '检测到工具调用重复循环，已停止；请换一种问法或缩小检索范围。';
      default:
        return '请求已中止。';
    }
  }

  /**
   * 连续轮次比较：同一轮内多 tool 时按 name+args 规范化后序列化。
   */
  private serializeToolCallsSignature(calls: ChatCompletionsToolCallParsed[]): string {
    const parts = calls.map((c) => ({
      name: c.name,
      args: this.stableSerializeArgs(c.args),
    }));
    parts.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(parts);
  }

  private stableSerializeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const keys = Object.keys(args).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = args[k];
    }
    return out;
  }

  private emptyMetrics(): AgenticLoopMetrics {
    return {
      tool_call_count: 0,
      llm_rounds: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }

  private buildMetrics(
    traceSteps: AgentLoopTraceStep[],
    promptTok: number,
    completionTok: number,
    totalTok: number,
  ): AgenticLoopMetrics {
    const tool_call_count = traceSteps.reduce((n, s) => n + (s.tool_calls?.length ?? 0), 0);
    return {
      tool_call_count,
      llm_rounds: traceSteps.length,
      prompt_tokens: promptTok,
      completion_tokens: completionTok,
      total_tokens: totalTok > 0 ? totalTok : promptTok + completionTok,
    };
  }

  private resolveToolPacks(input: McpAgentExecutorRunInput): AgentToolPack[] {
    if (input.toolPacks?.length) {
      return [...new Set(input.toolPacks)];
    }
    if (input.toolPack) {
      return [input.toolPack];
    }
    return ['weather'];
  }

  private buildDefaultSystemPrompt(packs: AgentToolPack[]): string {
    let s = DEFAULT_SYSTEM_WEATHER;
    if (packs.includes('exa')) {
      s += '\n你可以使用联网搜索类工具补充攻略与资讯；优先引用工具返回内容。';
    }
    if (packs.includes('hotel')) {
      s += '\n若涉及住宿，可使用酒店搜索类工具；请结合目的地与日期，不要编造房态。';
    }
    if (packs.includes('calendar')) {
      s +=
        '\n若用户提及日历或写入日程：当前对话若未提供日历类工具，请如实说明你无法访问或修改其 Google Calendar；不要假装已创建事件。';
    }
    return s;
  }

  private resolveToolCallingProvider(): LlmProvider {
    const preferred = this.llmService.getDefaultProvider();
    if (
      preferred === LlmProvider.OPENAI ||
      preferred === LlmProvider.DEEPSEEK ||
      preferred === LlmProvider.VLLM
    ) {
      return preferred;
    }
    return LlmProvider.OPENAI;
  }

  private selectToolDefinitions(packs: AgentToolPack[]): McpToolDefinition[] {
    const merged = new Map<string, McpToolDefinition>();
    for (const p of packs) {
      const serviceName =
        p === 'weather'
          ? 'weather'
          : p === 'exa'
            ? 'exa'
            : p === 'hotel'
              ? 'hotel'
              : p === 'calendar'
                ? 'google-calendar'
                : null;
      if (!serviceName) continue;
      for (const d of this.mcpRegistry.getServiceTools(serviceName)) {
        merged.set(d.toolName, d);
      }
    }
    return [...merged.values()];
  }

  private async executeOneTool(
    llmFunctionName: string,
    args: Record<string, unknown>,
    routing: Map<string, McpToolRoutingEntry>,
    budget: McpAgentExecutorBudget | undefined,
    toolGovernancePolicies: Record<string, ToolGovernancePolicyEntry> | undefined,
    governanceApprovedToolInvocations: GovernanceApprovedToolInvocation[] | undefined,
    toolCallId?: string,
  ): Promise<McpToolRuntimeEnvelope> {
    const entry = routing.get(llmFunctionName);
    if (!entry) {
      const robustness = classifyOrchestratorFailure(new Error(`unknown_tool:${llmFunctionName}`), {
        orchestrator_step: 'AGENTIC_TOOL_LOOP.tool_dispatch',
        tool_id: llmFunctionName,
      });
      return {
        success: false,
        data: null,
        error: `unknown_tool:${llmFunctionName}`,
        sideEffects: {},
        confidence: 0,
        orchestrator_robustness: robustness,
      };
    }

    const gov = policyForMcpTool(entry.mcpToolName, toolGovernancePolicies);
    if (gov.mode === 'deny') {
      this.logger.warn(
        `[AgenticGovernance] deny mcp=${entry.mcpToolName} reason=${gov.reason ?? 'policy'}`,
      );
      return buildToolGovernanceHoldEnvelope(entry.mcpToolName, 'deny', gov.reason) as McpToolRuntimeEnvelope;
    }
    if (gov.mode === 'ask') {
      if (
        isGovernanceAskPreApproved(governanceApprovedToolInvocations, toolCallId, entry.mcpToolName)
      ) {
        this.logger.debug(
          `[AgenticGovernance] ask bypass (pre-approved) mcp=${entry.mcpToolName} tool_call_id=${toolCallId ?? ''}`,
        );
      } else {
        this.logger.warn(
          `[AgenticGovernance] ask hold mcp=${entry.mcpToolName} reason=${gov.reason ?? 'hitl'}`,
        );
        return buildToolGovernanceHoldEnvelope(
          entry.mcpToolName,
          'ask',
          gov.reason,
          toolCallId,
        ) as McpToolRuntimeEnvelope;
      }
    }

    const maxAttempts = resolveMcpToolMaxAttempts(budget);
    const retryBaseMs = resolveMcpRetryBaseMs(budget);
    let lastErr: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const raw = await this.mcpDispatcher!.executeTool(
          entry.serviceName,
          entry.mcpToolName,
          args as Record<string, any>,
          0,
        );
        return this.wrapSuccess(raw);
      } catch (e: unknown) {
        lastErr = e;
        const robustness = isMcpToolExecutionError(e)
          ? e.orchestratorRobustness
          : classifyOrchestratorFailure(e ?? new Error('mcp_tool_failed'), {
              orchestrator_step: 'AGENTIC_TOOL_LOOP.tool_execute',
              tool_id: `${entry.serviceName}.${entry.mcpToolName}`,
              mcp_service: entry.serviceName,
              mcp_tool: entry.mcpToolName,
            });

        const retryable = robustness.retryable_hint === true;
        const hasAnotherAttempt = attempt < maxAttempts - 1;

        if (!retryable || !hasAnotherAttempt) {
          const env: McpToolRuntimeEnvelope = {
            success: false,
            data: null,
            error: e instanceof Error ? e.message : String(e),
            sideEffects: {},
            confidence: 0,
            orchestrator_robustness: robustness,
          };
          this.recordPhase3ProxyGateIfApplicable(env, `${entry.serviceName}.${entry.mcpToolName}`);
          return env;
        }

        const backoffMs = retryBaseMs * Math.pow(2, attempt);
        this.logger.warn(
          `[Agentic MCP retry] ${entry.serviceName}.${entry.mcpToolName} attempt ${attempt + 1}/${maxAttempts} retryable infrastructure failure; sleeping ${backoffMs}ms (base=${retryBaseMs}ms) before retry: ${e instanceof Error ? e.message : String(e)}`,
        );
        await this.sleepMs(backoffMs);
      }
    }

    this.logger.error(
      `[Agentic MCP] executeOneTool fell through without envelope (${entry.serviceName}.${entry.mcpToolName}); lastErr=${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
    const robustness = isMcpToolExecutionError(lastErr)
      ? lastErr.orchestratorRobustness
      : classifyOrchestratorFailure(lastErr ?? new Error('mcp_tool_failed'), {
          orchestrator_step: 'AGENTIC_TOOL_LOOP.tool_execute',
          tool_id: `${entry.serviceName}.${entry.mcpToolName}`,
          mcp_service: entry.serviceName,
          mcp_tool: entry.mcpToolName,
        });
    const env: McpToolRuntimeEnvelope = {
      success: false,
      data: null,
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      sideEffects: {},
      confidence: 0,
      orchestrator_robustness: robustness,
    };
    this.recordPhase3ProxyGateIfApplicable(env, `${entry.serviceName}.${entry.mcpToolName}`);
    return env;
  }

  /** booking Task Closure：Policy 拒绝执行（唯一闸门）。 */
  private buildPolicyBlockedEnvelope(reason: string): McpToolRuntimeEnvelope {
    const robustness: OrchestratorRobustnessMetadata = {
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'POLICY_BLOCKED',
      source_layer: 'ORCHESTRATOR',
      retryable_hint: false,
      classified_at: new Date().toISOString(),
      orchestrator_step_at_failure: 'AGENTIC_TOOL_LOOP.policy_gate',
      message_preview: truncateOrchestratorFailurePreview(reason),
    };
    return {
      success: false,
      data: null,
      error: `policy_blocked:${reason}`,
      sideEffects: {},
      confidence: 0,
      orchestrator_robustness: robustness,
    };
  }

  /** Phase 3：聚合 MCP_TOOL_ERROR + ECONNREFUSED 占比，决策是否做 Dispatcher 代理旁路。 */
  private recordPhase3ProxyGateIfApplicable(envelope: McpToolRuntimeEnvelope, toolRef: string): void {
    MetricsRecorder.recordAgenticMcpProxyBypassGateSample({
      failure_code: envelope.orchestrator_robustness?.failure_code,
      error_message: envelope.error ?? '',
      tool_ref: toolRef,
    });
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private wrapSuccess(data: unknown): McpToolRuntimeEnvelope {
    return {
      success: true,
      data,
      error: null,
      sideEffects: {},
      confidence: 0.9,
    };
  }
}
