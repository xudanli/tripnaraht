/**
 * 解析 Decision OS execution context（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { DecisionOsExecutionContext } from '../runtime/decision-os-execution-context';

export function resolveDosExecutionContext(
  request: RouteAndRunRequestDto,
  storeGet?: () => DecisionOsExecutionContext | undefined,
): DecisionOsExecutionContext | undefined {
  return (
    storeGet?.() ??
    (request as RouteAndRunRequestDto & { __dosExecutionContext?: DecisionOsExecutionContext })
      .__dosExecutionContext
  );
}
