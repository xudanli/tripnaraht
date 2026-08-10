/**
 * 澄清 intro 文案（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import { clarificationIntroPlain } from '../../common/constants/agent-prompts';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export function resolveClarificationIntroAnswerText(state: OrchestratorState): string {
  const locale = (state.metadata as { clarification_locale?: string })?.clarification_locale;
  return clarificationIntroPlain(locale);
}
