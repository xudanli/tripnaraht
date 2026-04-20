import { Injectable } from '@nestjs/common';
import type { HarnessExecutionContext } from '../runtime/execution-context.types';
import type { HarnessGraderResult, HarnessInferentialGrader } from './harness-inferential-grader.interface';

/** 单日条目数超过此阈值则判 L2（纯启发式，无 LLM） */
const MAX_ITEMS_PER_DAY_HEURISTIC = 24;

function countDayItems(day: unknown): number {
  if (day == null || typeof day !== 'object') return 0;
  const items = (day as Record<string, unknown>).items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * PLAN_GEN 等步骤可用的轻量 pacing 检查：基于 planDraft.days[*].items 长度。
 * 无草稿或结构不符时跳过（通过），避免误伤未落 plan 的路径。
 */
@Injectable()
export class HarnessPacingHeuristicInferentialGrader implements HarnessInferentialGrader {
  readonly name = 'pacing-heuristic.grader';

  async grade(
    _input: unknown,
    context: HarnessExecutionContext,
  ): Promise<HarnessGraderResult> {
    const vs = context.visibleState as Record<string, unknown>;
    const tripState = vs.tripState;
    if (tripState == null || typeof tripState !== 'object') {
      return {
        passed: true,
        score: 1,
        label: 'PACING_SKIPPED',
        explanation: 'No tripState in visible projection; heuristic skipped.',
        severity: 'L1',
      };
    }
    const planDraft = (tripState as Record<string, unknown>).planDraft;
    if (planDraft == null || typeof planDraft !== 'object') {
      return {
        passed: true,
        score: 1,
        label: 'PACING_SKIPPED',
        explanation: 'No planDraft; heuristic skipped.',
        severity: 'L1',
      };
    }
    const days = (planDraft as Record<string, unknown>).days;
    if (!Array.isArray(days) || days.length === 0) {
      return {
        passed: true,
        score: 1,
        label: 'PACING_SKIPPED',
        explanation: 'planDraft.days empty; heuristic skipped.',
        severity: 'L1',
      };
    }
    let maxItems = 0;
    for (const d of days) {
      maxItems = Math.max(maxItems, countDayItems(d));
    }
    if (maxItems > MAX_ITEMS_PER_DAY_HEURISTIC) {
      return {
        passed: false,
        score: 0,
        label: 'PACING_OVERPACKED',
        explanation: `Heuristic pacing: at least one day has ${maxItems} items (limit ${MAX_ITEMS_PER_DAY_HEURISTIC}).`,
        severity: 'L2',
      };
    }
    return {
      passed: true,
      score: 1,
      label: 'PACING_OK',
      explanation: `Heuristic pacing: max items per day ${maxItems} within limit ${MAX_ITEMS_PER_DAY_HEURISTIC}.`,
      severity: 'L1',
    };
  }
}
