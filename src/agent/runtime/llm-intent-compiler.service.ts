import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';
import type { DecisionOsExecutionContext } from './decision-os-execution-context';
import { compileLegacyPlanDeltaFromRequest } from './legacy-plan-delta-compiler.util';
import { parsePlanDeltaIrFromLlmJson, validatePlanDeltaIrList } from './plan-delta-ir-parse.util';
import { DecisionOsGrayRouterService } from './decision-os-gray-router.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { ChatCompletionMessage } from '../../llm/interfaces/chat-completion-tools.interface';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';

export type IntentCompileSource = 'experimental' | 'llm' | 'legacy' | 'none';

export type IntentCompileResult = {
  deltas: PlanDeltaIR[];
  source: IntentCompileSource;
};

const ITINERARY_EDIT_HINT_RE =
  /(?:换|改|替换|删除|去掉|增加|添加|调整|移到|搬到|改成|改为|replan|replace|remove|add|swap|change)/i;

function resolveIntentCompilerProvider(config: ConfigService): LlmProvider {
  const raw =
    config.get<string>('INTENT_COMPILER_LLM_PROVIDER') ??
    process.env.INTENT_COMPILER_LLM_PROVIDER ??
    config.get<string>('INCREMENTAL_RECOMPUTE_LLM_PROVIDER') ??
    process.env.INCREMENTAL_RECOMPUTE_LLM_PROVIDER ??
    'deepseek';
  const v = String(raw).trim().toLowerCase();
  if (v === 'openai') return LlmProvider.OPENAI;
  if (v === 'vllm') return LlmProvider.VLLM;
  if (v === 'anthropic' || v === 'claude') return LlmProvider.ANTHROPIC;
  return LlmProvider.DEEPSEEK;
}

function shouldAttemptLlmCompile(request: RouteAndRunRequestDto): boolean {
  const opt = request.options;
  if (opt?.itinerary_context?.is_replan === true) return true;
  const ref = opt?.refinement_signal?.type;
  if (ref === 'REPLACEMENT' || ref === 'REMOVAL' || ref === 'ADDITION') return true;
  const targets = opt?.intent_flags?.modification_targets;
  if (Array.isArray(targets) && targets.length > 0) return true;
  const msg = String(request.message ?? '').trim();
  if (!msg) return false;
  return ITINERARY_EDIT_HINT_RE.test(msg);
}

function stampGrayRoute(
  request: RouteAndRunRequestDto,
  gray: ReturnType<DecisionOsGrayRouterService['evaluate']>,
): void {
  (request as RouteAndRunRequestDto & { __dosGrayRoute?: typeof gray }).__dosGrayRoute = gray;
}

function buildIntentCompilerSystemPrompt(tripSummary: string): string {
  return [
    '你是 Decision OS 内核的意图编译器前端（Intent Compiler）。',
    '对照【当前行程摘要】分析用户最新指令，输出精准的行程修改差异树 Plan Delta IR JSON。',
    '若用户只是闲聊、问候、事实咨询且不要求改行程，返回空数组。',
    '',
    '【当前行程摘要】',
    tripSummary || '（无摘要）',
    '',
    '【输出 JSON 规范】',
    '返回单个 JSON 对象：{"deltas":[...]}。',
    '每个元素类型：',
    '{ "op":"ADD"|"REMOVE"|"REPLACE",',
    '  "target":{ "type":"POI"|"HOTEL"|"FLIGHT"|"ROUTE_CONSTRAINT"|"RESTRICTION", "id?":"string", "dayIndex?":0, "zoneId?":"string" },',
    '  "payload":{ "query?":"string" } }',
    '',
    'dayIndex 为 0-based（第二天=1）。只影响被点名的天/节点，禁止误伤其他天或其他域。',
    '示例：用户「把第二天的东京塔换成涩谷」→',
    '{"deltas":[{"op":"REPLACE","target":{"type":"POI","dayIndex":1,"id":"poi_tokyo_tower"},"payload":{"query":"涩谷"}}]}',
  ].join('\n');
}

function ensureJsonKeywordInMessages(msgs: ChatCompletionMessage[]): ChatCompletionMessage[] {
  const hasJson = msgs.some((m) => (m.content ?? '').toLowerCase().includes('json'));
  if (hasJson) return msgs;
  const copy = [...msgs];
  const lastUserIdx = [...copy].map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').pop()?.i;
  const idx = lastUserIdx ?? copy.length - 1;
  if (idx >= 0 && copy[idx]) {
    copy[idx] = {
      ...copy[idx],
      content: `${copy[idx].content ?? ''}\n\n(Respond with valid JSON only.)`,
    };
  }
  return copy;
}

/**
 * Phase 5：将自然语言 / NLU 信号编译为 PlanDeltaIR[]（LLM 主路径 + legacy 冷备）。
 */
@Injectable()
export class LlmIntentCompilerService {
  private readonly logger = new Logger(LlmIntentCompilerService.name);

  constructor(
    private readonly contextSlidingWindow: ContextSlidingWindowAdapter,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly grayRouter?: DecisionOsGrayRouterService,
  ) {}

  async compileToDelta(
    request: RouteAndRunRequestDto,
    context: DecisionOsExecutionContext,
  ): Promise<IntentCompileResult> {
    const experimental = request.options?.experimental_plan_delta;
    if (Array.isArray(experimental) && experimental.length > 0) {
      const validated = validatePlanDeltaIrList(
        parsePlanDeltaIrFromLlmJson(JSON.stringify({ deltas: experimental })),
      );
      if (validated.length > 0) {
        (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
          'experimental';
        return { deltas: validated, source: 'experimental' };
      }
    }

    const router = this.grayRouter ?? new DecisionOsGrayRouterService(this.configService);
    const gray = router.evaluate(request, context.userId ?? request.user_id);
    stampGrayRoute(request, gray);

    if (!gray.llm_compiler_path) {
      const legacy = compileLegacyPlanDeltaFromRequest(request);
      (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
        legacy.length > 0 ? 'legacy' : 'none';
      return { deltas: legacy, source: legacy.length > 0 ? 'legacy' : 'none' };
    }

    if (!shouldAttemptLlmCompile(request)) {
      (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
        'none';
      return { deltas: [], source: 'none' };
    }

    if (!this.llmService) {
      this.logger.warn('[IntentCompiler] LlmService 未注入，降级 legacy');
      const legacy = compileLegacyPlanDeltaFromRequest(request);
      (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
        legacy.length > 0 ? 'legacy' : 'none';
      return { deltas: legacy, source: legacy.length > 0 ? 'legacy' : 'none' };
    }

    try {
      const llmDeltas = await this.callStructuredLlmCompiler(request, context);
      if (llmDeltas.length > 0) {
        (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
          'llm';
        return { deltas: llmDeltas, source: 'llm' };
      }
      const legacy = compileLegacyPlanDeltaFromRequest(request);
      if (legacy.length > 0) {
        this.logger.debug('[IntentCompiler] LLM 返回空 deltas，回退 legacy');
        (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
          'legacy';
        return { deltas: legacy, source: 'legacy' };
      }
      (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
        'none';
      return { deltas: [], source: 'none' };
    } catch (err: unknown) {
      this.logger.warn(
        `[IntentCompiler] LLM 编译失败，降级 legacy: ${err instanceof Error ? err.message : String(err)}`,
      );
      const legacy = compileLegacyPlanDeltaFromRequest(request);
      (request as RouteAndRunRequestDto & { __intentCompileSource?: IntentCompileSource }).__intentCompileSource =
        legacy.length > 0 ? 'legacy' : 'none';
      return { deltas: legacy, source: legacy.length > 0 ? 'legacy' : 'none' };
    }
  }

  private async callStructuredLlmCompiler(
    request: RouteAndRunRequestDto,
    context: DecisionOsExecutionContext,
  ): Promise<PlanDeltaIR[]> {
    const config = this.configService ?? new ConfigService();
    const provider = resolveIntentCompilerProvider(config);
    const summary = context.activeTripSummary;
    const recent = this.contextSlidingWindow.slice(
      'intent_compiler',
      request.conversation_context?.recent_messages,
    );

    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: buildIntentCompilerSystemPrompt(summary) },
      ...recent.map((line) => ({ role: 'user' as const, content: String(line) })),
      { role: 'user', content: String(request.message ?? '').trim() },
    ];

    if (provider === LlmProvider.ANTHROPIC) {
      const prompt = messages.map((m) => `[${m.role}]\n${m.content ?? ''}`).join('\n\n');
      const raw = await this.llmService!.callLlmWithSchema(provider, `${prompt}\n\nReturn JSON object with key "deltas".`);
      return validatePlanDeltaIrList(parsePlanDeltaIrFromLlmJson(raw));
    }

    const chatMsgs = ensureJsonKeywordInMessages(messages);
    const result = await this.llmService!.callChatWithTools(provider, chatMsgs, [], {
      temperature: 0.1,
      max_tokens: 2048,
      response_format: provider === LlmProvider.OPENAI ? { type: 'json_object' } : undefined,
      tokenContext: {
        request_id: request.request_id,
        state_machine_step: 'INTENT_COMPILE',
        sub_agent: 'DecisionOS.IntentCompiler',
      },
    });

    return validatePlanDeltaIrList(parsePlanDeltaIrFromLlmJson(result.message.content ?? ''));
  }
}
