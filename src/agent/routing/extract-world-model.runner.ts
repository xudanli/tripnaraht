/**
 * 从 ContextPackage 提取 WorldModelContext（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';

export function extractWorldModelFromContextPackage(
  decisionState: DecisionState | undefined,
): { physical?: unknown; human?: unknown; routeDirection?: unknown } | undefined {
  const pkg = decisionState?.contextPackage;
  if (!pkg?.blocks?.length) return undefined;
  const block = pkg.blocks.find((b: any) => b.type === 'WORLD_MODEL' && b.data?.physical);
  return block?.data;
}
