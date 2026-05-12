/**
 * Clarification DSL Compiler — 产物类型（Compiler 前夜 / v0）
 * round 配置 + 本轮生效题目 → UI 摘要 + 叙述模板 + LLM 约束上下文
 */

/** 单张澄清卡片的 UI 摘要（完整 schema 演进后可替换为 JSON Schema / 前端组件树） */
export interface CompiledClarificationCard {
  questionId: string;
  title: string;
  type?: string;
  fieldName?: string;
}

/** plannerResponseBlocks 中与 question_card 对齐的引用列表 */
export interface CompiledClarificationUISchema {
  cards: CompiledClarificationCard[];
  /** 与 blocks 中 question_card 顺序一致 */
  plannerResponseBlockRefs: Array<{ type: 'question_card'; questionId: string }>;
}

export interface CompiledRoundClarification {
  ui: CompiledClarificationUISchema;
  /** 气泡内过渡正文（与 DSL 同源） */
  transitionText: string;
  /** 快捷 pill 文案（与卡片题干同源） */
  suggestedPills: string[];
  /**
   * 注入后续 NL 解析 LLM 调用的上下文片段：说明「问题已由系统展示」，禁止复述为题干。
   * 持久化于会话 assistant metadata（dslLlmPromptContext），下一轮请求注入 NaturalLanguageToParamsDto.dslClarificationContext。
   */
  llmPromptContext: string;
}
