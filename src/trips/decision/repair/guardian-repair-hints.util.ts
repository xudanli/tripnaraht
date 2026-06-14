import type { TripPlan } from '../plan-model';
import type { TripWorldState } from '../world-model';
import type { RepairInstruction } from './repair-action.types';
import type {
  GuardianFatigueDayPrediction,
  GuardianRepairHintItem,
  GuardianRepairHints,
} from './guardian-repair-hints.types';
import {
  mapTdfpmRecommendationToAction,
  parseDayIndexFromText,
  resolveGuardianTargetSlotIds,
} from './guardian-repair-targeting.util';

const ACTION_PATTERNS: Array<{ pattern: RegExp; action: RepairInstruction['action'] }> = [
  { pattern: /休息|缓冲|rest|buffer|休息日/i, action: 'INSERT_REST' },
  { pattern: /缩短|压缩|shorten|compress/i, action: 'SHORTEN_ACTIVITY' },
  { pattern: /驾驶|疲劳|drive|fatigue|拆分/i, action: 'SPLIT_DRIVE' },
  { pattern: /换|替代|swap|alternative|替换/i, action: 'SWAP_POI' },
  { pattern: /跳过|optional|skip|可选/i, action: 'SKIP_OPTIONAL_POI' },
  { pattern: /提前|earlier|前移/i, action: 'MOVE_SLOT_EARLIER' },
  { pattern: /延后|later|后移/i, action: 'MOVE_SLOT_LATER' },
];

export function inferGuardianRepairAction(text: string): RepairInstruction['action'] | undefined {
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(text)) return action;
  }
  return undefined;
}

function appendFatigueDerivedItems(
  items: GuardianRepairHintItem[],
  fatiguePrediction: GuardianFatigueDayPrediction[] | undefined,
): void {
  const coveredDays = new Set(
    items.map((item) => item.dayIndex).filter((day): day is number => day != null),
  );

  for (const prediction of fatiguePrediction ?? []) {
    if (prediction.fatigueScore < 60 && !['REST_NOW', 'SPLIT_DAY', 'STOP_DRIVING'].includes(prediction.recommendation)) {
      continue;
    }
    if (coveredDays.has(prediction.dayIndex)) continue;

    const inferredAction = mapTdfpmRecommendationToAction(prediction.recommendation);
    if (!inferredAction) continue;

    items.push({
      text: `Day${prediction.dayIndex} TDFPM 疲劳 ${prediction.fatigueScore}（${prediction.riskLevel}）→ ${prediction.recommendation}`,
      source: 'suggested_adjustment',
      inferredAction,
      dayIndex: prediction.dayIndex,
      targeting: 'tdfpm',
    });
    coveredDays.add(prediction.dayIndex);
  }
}

export function buildGuardianRepairHints(input: {
  decision: string;
  consensusLevel: number;
  conditions?: string[];
  suggestedAdjustments?: string[];
  humanDecisionPoints?: string[];
  keyTradeoffs?: string[];
  sourcePhase: GuardianRepairHints['sourcePhase'];
  negotiatedAt: string;
  personaByText?: Record<string, 'ABU' | 'DRE' | 'NEPTUNE'>;
  fatiguePrediction?: GuardianFatigueDayPrediction[];
}): GuardianRepairHints {
  const items: GuardianRepairHintItem[] = [];

  const pushItems = (
    texts: string[] | undefined,
    source: GuardianRepairHintItem['source'],
  ) => {
    for (const text of texts ?? []) {
      const trimmed = String(text).trim();
      if (!trimmed) continue;
      const dayIndex = parseDayIndexFromText(trimmed);
      items.push({
        text: trimmed,
        source,
        persona: input.personaByText?.[trimmed],
        inferredAction: inferGuardianRepairAction(trimmed),
        ...(dayIndex != null ? { dayIndex, targeting: 'explicit_text' as const } : {}),
      });
    }
  };

  pushItems(input.conditions, 'condition');
  pushItems(input.suggestedAdjustments, 'suggested_adjustment');
  pushItems(input.humanDecisionPoints, 'human_decision_point');
  pushItems(input.keyTradeoffs, 'key_tradeoff');
  appendFatigueDerivedItems(items, input.fatiguePrediction);

  return {
    decision: input.decision,
    consensusLevel: input.consensusLevel,
    items,
    sourcePhase: input.sourcePhase,
    negotiatedAt: input.negotiatedAt,
    fatiguePrediction: input.fatiguePrediction,
  };
}

export function mapGuardianHintsToRepairInstructions(
  plan: TripPlan,
  hints: GuardianRepairHints | undefined,
): RepairInstruction[] {
  if (!hints?.items.length) return [];

  const repairs: RepairInstruction[] = [];
  let priority = 1;

  for (const item of hints.items) {
    if (!item.inferredAction) continue;

    const resolved = resolveGuardianTargetSlotIds({
      plan,
      action: item.inferredAction,
      dayIndex: item.dayIndex,
      fatiguePrediction: hints.fatiguePrediction,
    });
    if (resolved.slotIds.length === 0) continue;

    repairs.push({
      id: `guardian_hint_${priority}`,
      action: item.inferredAction,
      targetSlotIds: resolved.slotIds,
      date: resolved.date,
      narrative: `[Guardian/${item.persona ?? 'TEAM'}] ${item.text}`,
      priority,
      confidence: Math.max(0.35, hints.consensusLevel),
      metadata: {
        source: item.source,
        guardianDecision: hints.decision,
        dayIndex: resolved.dayIndex ?? item.dayIndex,
        targeting: item.targeting ?? (resolved.dayIndex != null ? 'explicit_text' : 'fallback'),
      },
    });
    priority += 1;
    if (repairs.length >= 5) break;
  }

  return repairs;
}

export function applyGuardianRepairHintsToState(
  state: TripWorldState,
  plan: TripPlan,
  hints: GuardianRepairHints | undefined,
): void {
  if (!hints?.items.length) return;

  state.signals.guardianRepairHints = hints;

  const repairs = mapGuardianHintsToRepairInstructions(plan, hints);
  if (repairs.length > 0) {
    const existing = state.signals.repairEvaluation?.repairs ?? [];
    state.signals.repairEvaluation = {
      repairs: [...repairs, ...existing],
      suggestReevaluateExecutionQuality: true,
      notes: [
        ...(state.signals.repairEvaluation?.notes ?? []),
        `Guardian debate (${hints.sourcePhase}): ${hints.items.length} hint(s), consensus ${(hints.consensusLevel * 100).toFixed(0)}%`,
      ],
    };
  }

  const alerts = state.signals.alerts ?? [];
  for (const item of hints.items.slice(0, 3)) {
    alerts.push({
      code: 'guardian_repair_hint',
      severity: 'warn',
      message: item.dayIndex != null ? `[Day${item.dayIndex}] ${item.text}` : item.text,
    });
  }
  state.signals.alerts = alerts;
}

export function formatGuardianHintExplanation(hints: GuardianRepairHints | undefined): string {
  if (!hints?.items.length) return '';
  const preview = hints.items
    .slice(0, 3)
    .map((item) => (item.dayIndex != null ? `Day${item.dayIndex}:${item.text}` : item.text))
    .join('；');
  return `Guardian hints(${hints.sourcePhase}, consensus=${(hints.consensusLevel * 100).toFixed(0)}%): ${preview}`;
}
