import type { DraftSlot, TripDraftSelection } from '../state/trip-draft-state.types';
import { computeSelectionDiff } from '../diff/draft-diff.engine';
import type {
  ConvergenceMode,
  ConvergencePolicy,
  ConvergenceResult,
  DivergenceArea,
  DivergenceKind,
  GlobalWinnerStrategy,
} from './convergence.types';
import { DEFAULT_CONVERGENCE_POLICY } from './convergence.types';

const MEAL_SLOTS = new Set<DraftSlot>(['lunch', 'dinner']);
const EXPERIENCE_SLOTS = new Set<DraftSlot>(['morning', 'afternoon', 'evening']);

function selectionKey(day: number, slot: string): string {
  return `${day}:${slot}`;
}

function classifyDivergence(slot: string): DivergenceKind {
  if (MEAL_SLOTS.has(slot as DraftSlot)) return 'meal';
  if (EXPERIENCE_SLOTS.has(slot as DraftSlot)) return 'experience';
  return 'other';
}

function toMap(list: TripDraftSelection[]): Map<string, TripDraftSelection> {
  const m = new Map<string, TripDraftSelection>();
  for (const s of list) {
    m.set(selectionKey(s.day, s.slot), { ...s });
  }
  return m;
}

function pickMergedSelection(
  slot: DraftSlot,
  llm?: TripDraftSelection,
  algo?: TripDraftSelection,
  policy: ConvergencePolicy = DEFAULT_CONVERGENCE_POLICY,
): TripDraftSelection | undefined {
  if (!llm && !algo) return undefined;
  if (!llm) return algo;
  if (!algo) return llm;
  if (llm.placeId === algo.placeId) return llm;

  if (policy.globalBias === 'ALGO') return { ...algo, zone: llm.zone ?? algo.zone };
  if (policy.globalBias === 'LLM') return { ...llm, zone: llm.zone ?? algo.zone };

  if (MEAL_SLOTS.has(slot) && policy.preferAlgoForMeals) {
    return { ...algo, zone: algo.zone ?? llm.zone };
  }
  if (EXPERIENCE_SLOTS.has(slot) && policy.preferLlmForExperienceSlots) {
    return { ...llm, zone: llm.zone ?? algo.zone };
  }
  return { ...algo };
}

/**
 * Dual Engine Convergence：同一 TripDraftState 下 LLM 与算法两套选点的对齐、解释差异与融合方案。
 * 不是简单 diff：产出可执行的 overridePlan 与全局策略标签。
 */
export function computeDualEngineConvergence(
  llmSelections: TripDraftSelection[],
  algoSelections: TripDraftSelection[],
  policy: ConvergencePolicy = DEFAULT_CONVERGENCE_POLICY,
): ConvergenceResult {
  const diff = computeSelectionDiff(llmSelections, algoSelections);
  const mLlm = toMap(llmSelections);
  const mAlgo = toMap(algoSelections);
  const allKeys = new Set([...mLlm.keys(), ...mAlgo.keys()]);
  let matches = 0;
  for (const k of allKeys) {
    const a = mLlm.get(k);
    const b = mAlgo.get(k);
    if (a && b && a.placeId === b.placeId) matches++;
  }
  const agreementScore =
    allKeys.size === 0 ? 1 : Number((matches / allKeys.size).toFixed(4));

  const divergenceAreas: DivergenceArea[] = [];

  for (const c of diff.changed) {
    const slot = c.before.slot;
    divergenceAreas.push({
      day: c.before.day,
      slot,
      type: classifyDivergence(slot),
      llmChoice: c.before.placeId,
      algoChoice: c.after.placeId,
      reason:
        MEAL_SLOTS.has(slot as DraftSlot) && policy.preferAlgoForMeals
          ? '槽位分歧：餐饮/强约束侧倾向算法可达性（默认策略）'
          : '槽位分歧：体验槽位倾向 LLM 叙事连贯（默认策略）',
    });
  }

  for (const s of diff.added) {
    divergenceAreas.push({
      day: s.day,
      slot: s.slot,
      type: 'coverage',
      llmChoice: null,
      algoChoice: s.placeId,
      reason: '算法路径包含该槽位，LLM 未输出',
    });
  }

  for (const s of diff.removed) {
    divergenceAreas.push({
      day: s.day,
      slot: s.slot,
      type: 'coverage',
      llmChoice: s.placeId,
      algoChoice: null,
      reason: 'LLM 包含该槽位，算法未输出',
    });
  }

  const overridePlan: TripDraftSelection[] = [];
  const sortedKeys = [...allKeys].sort((x, y) => {
    const [da, sa] = x.split(':');
    const [db, sb] = y.split(':');
    if (da !== db) return Number(da) - Number(db);
    const order = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
    return order.indexOf(sa) - order.indexOf(sb);
  });

  for (const k of sortedKeys) {
    const llm = mLlm.get(k);
    const algo = mAlgo.get(k);
    const slot = (k.split(':')[1] || 'morning') as DraftSlot;
    const merged = pickMergedSelection(slot, llm, algo, policy);
    if (merged) overridePlan.push(merged);
  }

  const { winnerStrategy, convergenceMode } = inferWinnerLabels(
    agreementScore,
    divergenceAreas,
    policy,
  );

  return {
    agreementScore,
    divergenceAreas,
    winnerStrategy,
    convergenceMode,
    overridePlan,
  };
}

function inferWinnerLabels(
  agreementScore: number,
  divergences: DivergenceArea[],
  policy: ConvergencePolicy,
): { winnerStrategy: GlobalWinnerStrategy; convergenceMode: ConvergenceMode } {
  if (policy.globalBias === 'ALGO') {
    return { winnerStrategy: 'ALGO', convergenceMode: 'ALGO_WIN' };
  }
  if (policy.globalBias === 'LLM') {
    return { winnerStrategy: 'LLM', convergenceMode: 'LLM_WIN' };
  }
  if (agreementScore >= 0.95 && divergences.length === 0) {
    return { winnerStrategy: 'HYBRID', convergenceMode: 'HYBRID' };
  }

  let algoWins = 0;
  let llmWins = 0;
  for (const d of divergences) {
    if (d.type === 'meal' && policy.preferAlgoForMeals) algoWins++;
    else if (d.type === 'experience' && policy.preferLlmForExperienceSlots) llmWins++;
    else algoWins++;
  }

  if (algoWins > 0 && llmWins === 0) {
    return { winnerStrategy: 'ALGO', convergenceMode: 'ALGO_WIN' };
  }
  if (llmWins > 0 && algoWins === 0) {
    return { winnerStrategy: 'LLM', convergenceMode: 'LLM_WIN' };
  }
  return { winnerStrategy: 'HYBRID', convergenceMode: 'HYBRID' };
}
