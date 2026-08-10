/**
 * ExecutePlan 答案文本生成（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';

export function generateAnswerText(
  results: Record<string, any>,
  stepsExecuted: OrchestrationResult['stepsExecuted'],
): string {
  void results;
  const successfulSteps = stepsExecuted.filter((step) => step.success);

  if (successfulSteps.length === 0) {
    return '处理完成，但所有步骤都失败了。';
  }

  const lastStep = successfulSteps[successfulSteps.length - 1];
  if (lastStep?.result) {
    if (typeof lastStep.result === 'string') {
      return lastStep.result;
    }
    if (lastStep.result.answerText) {
      return lastStep.result.answerText;
    }
    if (lastStep.result.message) {
      return lastStep.result.message;
    }
    if (lastStep.result.explanation) {
      return lastStep.result.explanation;
    }
    if (lastStep.result.summary) {
      return lastStep.result.summary;
    }
    if (typeof lastStep.result === 'object') {
      if (lastStep.result.timeline && Array.isArray(lastStep.result.timeline)) {
        return `已生成 ${lastStep.result.timeline.length} 天的行程安排。`;
      }
      if (lastStep.result.candidates && Array.isArray(lastStep.result.candidates)) {
        return `找到 ${lastStep.result.candidates.length} 个候选结果。`;
      }
      const keys = Object.keys(lastStep.result);
      if (keys.length > 0) {
        return `处理完成。结果包含：${keys.slice(0, 3).join('、')}${keys.length > 3 ? '等' : ''}。`;
      }
    }
  }

  if (successfulSteps.length > 0) {
    const skillNames = successfulSteps
      .map((step) => step.skillName || step.actionName)
      .filter(Boolean)
      .join('、');
    return `已成功执行 ${successfulSteps.length} 个步骤${skillNames ? `（${skillNames}）` : ''}。`;
  }

  return '处理完成';
}
