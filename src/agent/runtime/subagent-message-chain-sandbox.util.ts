/**
 * Harness Control P3+：编排多 SubAgent 消息链 escalation 剥离。
 * 覆盖 conversation_context.recent_messages 与 skill handoff 对象。
 */

import type { SubAgentType } from '../interfaces/trip-plan.interface';
import {
  sanitizeMessageForSubagentSandbox,
  stripToolCapabilityEscalationDeep,
} from './subagent-permission-sandbox.util';

export function mapSkillNameToSubAgentType(skillName?: string | null): SubAgentType {
  const name = String(skillName ?? '').trim();
  if (!name) return 'Planner';
  if (name.includes('gate')) return 'Gatekeeper';
  if (name === 'itinerary.smart_update') return 'LocalInsight';
  if (name.includes('narrate') || name.includes('explain')) return 'Narrator';
  if (name.includes('compliance')) return 'Compliance';
  return 'Planner';
}

export function resolveOrchestrationSubAgentFromRequest(options?: {
  orchestration_active_sub_agent?: string;
  agentic_sub_agent?: string;
}): SubAgentType {
  const raw = String(
    options?.orchestration_active_sub_agent ?? options?.agentic_sub_agent ?? '',
  ).trim();
  const allowed: SubAgentType[] = [
    'Orchestrator',
    'Planner',
    'Gatekeeper',
    'Compliance',
    'LocalInsight',
    'CoreDecision',
    'Narrator',
    'HallucinationDetection',
    'DecisionOS.IntentCompiler',
  ];
  if (allowed.includes(raw as SubAgentType)) return raw as SubAgentType;
  return 'Planner';
}

export function sanitizeSubagentMessageChain(recentMessages: string[] | undefined): {
  messages: string[];
  messagesScanned: number;
  stripCount: number;
} {
  if (!recentMessages?.length) {
    return { messages: recentMessages ?? [], messagesScanned: 0, stripCount: 0 };
  }
  let stripCount = 0;
  const messages = recentMessages.map((entry) => {
    const text = String(entry ?? '');
    const sanitized = sanitizeMessageForSubagentSandbox(text);
    stripCount += sanitized.stripCount;
    return sanitized.sanitizedMessage;
  });
  return { messages, messagesScanned: recentMessages.length, stripCount };
}

/** Skill step 间 handoff payload：递归剥离 tool 能力 escalation */
export function sanitizeOrchestrationHandoffValue(value: unknown): {
  value: unknown;
  stripCount: number;
} {
  const violations: string[] = [];
  const cleaned = stripToolCapabilityEscalationDeep(value, violations);
  return { value: cleaned, stripCount: violations.length };
}

export function sanitizeOrchestrationResultsMapInPlace(
  results: Record<string, unknown>,
): number {
  let total = 0;
  for (const key of Object.keys(results)) {
    const { value, stripCount } = sanitizeOrchestrationHandoffValue(results[key]);
    results[key] = value;
    total += stripCount;
  }
  return total;
}
