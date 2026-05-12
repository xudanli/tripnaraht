// src/skills/intent/intent-recognize.skill.ts
/**
 * skill.intent.recognize
 *
 * 用单一 LLM 结构化调用替代持续堆叠的关键词规则，输出与 `TaskType` 对齐的意图分类。
 * 供 AgentService 在规则推断之后做可选覆盖；也可被编排器 / MCP 直接调用。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { LlmService } from '../../llm/services/llm.service';
import type { TaskType } from '../../agent/utils/orchestration-signals.util';

export interface IntentRecognizeInput extends SkillInput {
  /** 用户当前输入 */
  message: string;
  /** 可选：已有行程会话 */
  trip_id?: string | null;
  /** 规则层预分类（供模型对照，避免离谱漂移） */
  rule_based_task_type?: TaskType;
  /** 最近若干条用户侧消息摘要（可选） */
  recent_messages?: string[];
}

export interface IntentRecognizeOutput extends SkillOutput {
  taskType: TaskType;
  confidence: number;
  reasoning: string;
  /** 细粒度标签，便于观测与后续路由 */
  labels?: string[];
}

const TASK_TYPE_ENUM: TaskType[] = [
  'TRIP_PLANNING',
  'CRUD',
  'DATA_LOOKUP',
  'CUSTOMER_SUPPORT',
  'RAG_QA',
  'BOOKING_WORKFLOW',
  'GENERIC_QA',
];

@Injectable()
export class IntentRecognizeSkill implements Skill<IntentRecognizeInput, IntentRecognizeOutput> {
  private readonly logger = new Logger(IntentRecognizeSkill.name);

  metadata = {
    name: 'intent.recognize',
    description:
      '基于用户自然语言识别路由任务类型（与 orchestration TaskType 对齐），用于减少关键词规则维护成本',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'CONTEXT' as const,
    inputSchema: {
      required: ['message'],
    },
  };

  constructor(private readonly llmService: LlmService) {}

  async execute(input: IntentRecognizeInput): Promise<IntentRecognizeOutput> {
    const msg = (input.message ?? '').trim();
    if (!msg) {
      throw new Error('intent.recognize 需要非空 message');
    }

    const ruleHint = input.rule_based_task_type
      ? `服务端规则预分类（仅供参考，你可修正）：${input.rule_based_task_type}\n`
      : '';
    const tripHint = input.trip_id ? `当前存在 trip_id（行程会话）: ${input.trip_id}\n` : '';
    const recent =
      Array.isArray(input.recent_messages) && input.recent_messages.length > 0
        ? `最近用户消息片段：\n${input.recent_messages.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`
        : '';

    const prompt = `你是 TripNARA 的意图分类器。根据用户输入判断最合适的 taskType（只能选一个）。

taskType 枚举及含义：
- TRIP_PLANNING：多日行程规划、改行程、替换景点、排期、路线组合可行性追问且期望系统改草案等（强行程产物）。
- DATA_LOOKUP：事实检索、天气/票价/开放时间、攻略问答、装备清单、咨询「多少钱/注意什么」且不要求直接改行程 JSON。
- CRUD：明确对业务对象的新增/删除/修改且带行程/订单/记录等对象语境。
- CUSTOMER_SUPPORT：退款、账号、支付失败、投诉、无法登录等产品问题。
- RAG_QA：明确基于文档/知识库的概括与引用。
- BOOKING_WORKFLOW：下单、支付、锁库存等预订闭环。
- GENERIC_QA：开放闲聊、模糊提问且不属于以上类别时的兜底。

约束：
1. 若用户只是在已有行程上下文里问「酒店推荐/预算/天气/准备清单」而无意修改行程，倾向 DATA_LOOKUP 而非 TRIP_PLANNING。
2. 元对话（你是谁/能做什么）→ GENERIC_QA 或 DATA_LOOKUP。
3. 参考 rule_hint，但若规则明显与语义不符可纠正并给出较高 confidence。

${tripHint}${ruleHint}${recent}
用户输入：
"""${msg}"""`;

    const raw = await this.llmService.callLlmWithSchema(
      this.llmService.getDefaultProvider(),
      prompt,
      {
        type: 'object',
        properties: {
          taskType: { type: 'string', enum: TASK_TYPE_ENUM as unknown as string[] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['taskType', 'confidence', 'reasoning'],
      },
      input.tokenContext,
    );

    let parsed: { taskType?: string; confidence?: number; reasoning?: string; labels?: string[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      this.logger.warn(`intent.recognize JSON 解析失败，原始=${raw.slice(0, 400)}`);
      throw new Error('intent.recognize 返回非 JSON');
    }

    const tt = parsed.taskType as TaskType;
    if (!TASK_TYPE_ENUM.includes(tt)) {
      this.logger.warn(`intent.recognize 非法 taskType=${parsed.taskType}，回落 GENERIC_QA`);
      return {
        taskType: 'GENERIC_QA',
        confidence: 0.35,
        reasoning: `模型返回非法 taskType=${parsed.taskType}；已降级`,
        labels: parsed.labels,
      };
    }

    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;

    return {
      taskType: tt,
      confidence,
      reasoning: (parsed.reasoning ?? '').trim() || '（无说明）',
      labels: parsed.labels,
    };
  }
}
