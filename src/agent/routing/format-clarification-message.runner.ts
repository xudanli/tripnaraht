/**
 * 澄清问题格式化为用户可读文本（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import { clarificationIntroNumberedPrefix } from '../../common/constants/agent-prompts';

export function formatClarificationMessage(
  questions?: ClarificationQuestion[],
  localeRaw?: string | null,
): string {
  if (!questions || questions.length === 0) {
    return '';
  }

  const messages: string[] = [];
  messages.push(clarificationIntroNumberedPrefix(localeRaw));

  questions.forEach((q, index) => {
    messages.push(`${index + 1}. ${q.question}`);
    if (q.hint) {
      messages.push(`   ${q.hint}`);
    }
    if (q.options && q.options.length > 0) {
      const optionLabels = q.options.map((opt: any) =>
        typeof opt === 'string' ? opt : opt?.label || opt?.value || String(opt),
      );
      messages.push(`   选项：${optionLabels.join('、')}`);
    }
    messages.push('');
  });

  return messages.join('\n');
}
