import type { CompiledRoundClarification } from './clarification-dsl-compiler.types';
import { buildSuggestedPillsFromCards, buildTransitionFromRound } from './clarification-transition.builder';

export type RoundCompileInput = {
  name?: string;
  roundId?: string;
  description?: string;
};

export type QuestionCompileInput = {
  id: string;
  question?: string;
  type?: string;
  metadata?: { fieldName?: string };
};

/**
 * Clarification DSL Compiler v0
 *
 * 1. round + 本轮题目 → UI schema 摘要（卡片 id / 字段 / 题型）
 * 2. → 过渡叙述 transitionText
 * 3. → 快捷 pill suggestedPills
 * 4. → LLM 仅用 explanation：llmPromptContext（禁止在 reply 里再造问题集合）
 */
export function compileRoundClarification(
  round: RoundCompileInput,
  questions: QuestionCompileInput[],
): CompiledRoundClarification {
  const cards = questions.map((q) => ({
    questionId: q.id,
    title: (q.question || '').replace(/\*+$/g, '').trim(),
    type: q.type,
    fieldName: q.metadata?.fieldName,
  }));

  const liteForTransition = questions.map((q) => ({ question: q.question }));

  const transitionText = buildTransitionFromRound(round, liteForTransition);
  const suggestedPills = buildSuggestedPillsFromCards(liteForTransition);

  const fieldNames = cards.map((c) => c.fieldName).filter(Boolean) as string[];
  const phaseLabel = round.name || round.roundId || '当前阶段';

  const llmPromptContext = [
    `【澄清 DSL 编译】阶段「${phaseLabel}」。`,
    fieldNames.length
      ? `系统已通过澄清卡片收集字段：${fieldNames.join('、')}。`
      : '系统已通过澄清卡片收集上述维度。',
    '约束：请勿在 reply/suggestedQuestions 中再用编号清单复述卡片题干；仅输出 1–4 句过渡与鼓励；具体问题仅以服务端下发的 clarificationQuestions / 卡片为准。',
  ].join('\n');

  return {
    ui: {
      cards,
      plannerResponseBlockRefs: questions.map((q) => ({
        type: 'question_card' as const,
        questionId: q.id,
      })),
    },
    transitionText,
    suggestedPills,
    llmPromptContext,
  };
}
