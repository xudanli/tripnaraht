import type { ContextBlock } from '../../../../agent/context-engine/types/context-package.types';

/**
 * Context Supplement —— 来自 Context Engineer 的弱证据（后续可迁到 Constraint / Policy）
 */
export function renderContextSupplementLayer(contextBlocks?: ContextBlock[]): string {
  if (!contextBlocks?.length) return '';
  return `## 目的地相关上下文（弱证据，仅供叙事与风险提示）
${contextBlocks
  .filter((b) => b.visibility === 'public')
  .sort((a, b) => b.priority - a.priority)
  .map((b) => `### ${b.key}\n${b.text}`)
  .join('\n\n')}

---
`;
}
