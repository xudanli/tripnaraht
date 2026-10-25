/**
 * KNOWLEDGE_RUNTIME_SSOT_ENFORCE — runtime convergence for Knowledge System guards.
 *
 * off（默认）：不拦截（仅单元/显式调用仍可 assert）
 * shadow：记录 violations，不 throw
 * active：违规 throw
 */

export type KnowledgeRuntimeSsotEnforceMode = 'off' | 'shadow' | 'active';

export function resolveKnowledgeRuntimeSsotEnforceMode(
  env: NodeJS.ProcessEnv = process.env,
): KnowledgeRuntimeSsotEnforceMode {
  const raw = String(env.KNOWLEDGE_RUNTIME_SSOT_ENFORCE ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'active' || raw === '1' || raw === 'true' || raw === 'on') {
    return 'active';
  }
  if (raw === 'shadow' || raw === 'diff' || raw === 'audit') {
    return 'shadow';
  }
  return 'off';
}
