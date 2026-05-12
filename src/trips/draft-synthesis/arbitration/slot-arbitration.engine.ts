import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { DraftSlot, TripDraftSelection } from '../state/trip-draft-state.types';
import type {
  HybridScoreBreakdown,
  SlotArbitrationParams,
  SlotArbitrationResult,
  SlotDecision,
  SlotDecisionSource,
} from './slot-arbitration.types';

const SLOT_ORDER: DraftSlot[] = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];

/** 体验优先槽（餐饮 / 夜生活 / 风格叙事）— 无硬损伤时倾向 LLM */
const EXPERIENCE_FIRST_SLOTS = new Set<DraftSlot>(['lunch', 'dinner', 'evening']);

/** HYBRID 打分默认权重 */
const W_CONTINUITY = 0.5;
const W_PREF = 0.3;
const W_GEO = 0.2;

function selectionKey(day: number, slot: string): string {
  return `${day}:${slot}`;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function maxJumpKm(transport?: string): number {
  const t = (transport || 'walk').toLowerCase();
  if (t === 'car') return 120;
  if (t === 'transit') return 35;
  return 8;
}

function isHardInfeasible(
  sel: TripDraftSelection | undefined,
  prevPlace: CandidatePlace | undefined,
  candidatesById: Map<number, CandidatePlace>,
  transport?: string,
): boolean {
  if (!sel) return true;
  const p = candidatesById.get(sel.placeId);
  if (!p) return true;
  if (!prevPlace) return false;
  const km = haversineKm(prevPlace, p);
  return km > maxJumpKm(transport);
}

function continuityScore(place: CandidatePlace | undefined, prev: CandidatePlace | undefined): number {
  if (!place || !prev) return 0.55;
  if (place.clusterId != null && prev.clusterId != null && place.clusterId === prev.clusterId) return 1;
  const km = haversineKm(prev, place);
  return Math.max(0, 1 - km / 50);
}

function preferenceScore(place: CandidatePlace | undefined): number {
  const r = (place?.rating ?? 3) / 5;
  return Math.min(1, Math.max(0, r));
}

function geoScore(place: CandidatePlace | undefined, prev: CandidatePlace | undefined): number {
  if (!place || !prev) return 0.5;
  const km = haversineKm(prev, place);
  return 1 / (1 + km / 15);
}

function hybridBreakdown(
  sel: TripDraftSelection,
  prev: CandidatePlace | undefined,
  candidatesById: Map<number, CandidatePlace>,
): HybridScoreBreakdown {
  const p = candidatesById.get(sel.placeId);
  const c = continuityScore(p, prev);
  const pr = preferenceScore(p);
  const g = geoScore(p, prev);
  const total = W_CONTINUITY * c + W_PREF * pr + W_GEO * g;
  return { continuity: c, preferenceMatch: pr, geoEfficiency: g, total };
}

/**
 * Slot-level Arbitration：逐槽裁决，而非整条 plan 二选一。
 * - 硬约束（距离跳跃过大）→ 倾向 ALGO（若算法侧可行），否则仍选较可行一侧并标注 reason。
 * - 餐饮 / 夜生活 / 体验槽 → 若 LLM 无硬伤 → LLM。
 * - 其余：HYBRID 加权分。
 */
export function arbitrateSlots(params: SlotArbitrationParams): SlotArbitrationResult {
  const { llmSelections, algoSelections, candidatesById, transport, hybridEngineWeights } = params;
  const wL = hybridEngineWeights?.llm ?? 0.5;
  const wA = hybridEngineWeights?.algo ?? 0.5;
  const mLlm = new Map<string, TripDraftSelection>();
  const mAlgo = new Map<string, TripDraftSelection>();
  for (const s of llmSelections) mLlm.set(selectionKey(s.day, s.slot), s);
  for (const s of algoSelections) mAlgo.set(selectionKey(s.day, s.slot), s);

  const daySet = new Set<number>();
  for (const s of llmSelections) daySet.add(s.day);
  for (const s of algoSelections) daySet.add(s.day);
  const days = [...daySet].sort((a, b) => a - b);

  const slotDecisions: SlotDecision[] = [];
  const overrideTrace: string[] = [];
  const finalSelections: TripDraftSelection[] = [];

  for (const day of days) {
    let lastPlace: CandidatePlace | undefined;

    for (const slot of SLOT_ORDER) {
      const k = selectionKey(day, slot);
      const llm = mLlm.get(k) ?? null;
      const algo = mAlgo.get(k) ?? null;

      if (!llm && !algo) continue;

      const llmHard = llm ? isHardInfeasible(llm, lastPlace, candidatesById, transport) : true;
      const algoHard = algo ? isHardInfeasible(algo, lastPlace, candidatesById, transport) : true;

      let finalChoice: TripDraftSelection;
      let source: SlotDecisionSource;
      let reason: string;
      let hybridScores: SlotDecision['hybridScores'];

      if (llm && !algo) {
        finalChoice = { ...llm };
        source = 'LLM';
        reason = '仅 LLM 给出该槽位';
      } else if (!llm && algo) {
        finalChoice = { ...algo };
        source = 'ALGO';
        reason = '仅算法给出该槽位';
      } else if (llm && algo && llm.placeId === algo.placeId) {
        finalChoice = { ...llm };
        source = 'HYBRID';
        reason = '双引擎一致';
      } else {
        const llmS = llm!;
        const algoS = algo!;

        if (llmHard && !algoHard) {
          finalChoice = { ...algoS };
          source = 'ALGO';
          reason = '硬约束：LLM 选点在可达/距离上不可行，算法侧通过';
        } else if (!llmHard && algoHard) {
          finalChoice = { ...llmS };
          source = 'LLM';
          reason = '硬约束：算法选点不可行，LLM 侧通过';
        } else if (!llmHard && EXPERIENCE_FIRST_SLOTS.has(slot)) {
          finalChoice = { ...llmS };
          source = 'LLM';
          reason = '体验策略：餐饮/夜生活等槽位优先叙事与偏好（无硬伤）';
        } else {
          const hsLlm = hybridBreakdown(llmS, lastPlace, candidatesById);
          const hsAlgo = hybridBreakdown(algoS, lastPlace, candidatesById);
          hybridScores = { llm: hsLlm, algo: hsAlgo };
          const adjLlm = hsLlm.total * wL;
          const adjAlgo = hsAlgo.total * wA;
          if (adjLlm >= adjAlgo) {
            finalChoice = { ...llmS };
            source = 'HYBRID';
            reason = `HYBRID×人格权重(LLM×${wL.toFixed(2)},Algo×${wA.toFixed(2)})：${adjLlm.toFixed(3)} ≥ ${adjAlgo.toFixed(3)} (raw LLM ${hsLlm.total.toFixed(3)} / Algo ${hsAlgo.total.toFixed(3)})`;
          } else {
            finalChoice = { ...algoS };
            source = 'HYBRID';
            reason = `HYBRID×人格权重(LLM×${wL.toFixed(2)},Algo×${wA.toFixed(2)})：${adjAlgo.toFixed(3)} > ${adjLlm.toFixed(3)} (raw Algo ${hsAlgo.total.toFixed(3)} / LLM ${hsLlm.total.toFixed(3)})`;
          }
        }
      }

      const cp = candidatesById.get(finalChoice.placeId);
      if (cp) lastPlace = cp;

      overrideTrace.push(`Day${day} ${slot}: ${source} → placeId=${finalChoice.placeId} (${reason})`);

      slotDecisions.push({
        day,
        slot,
        llmChoice: llm,
        algoChoice: algo,
        finalChoice,
        decisionSource: source,
        reason,
        hybridScores,
      });
      finalSelections.push(finalChoice);
    }
  }

  return { slotDecisions, finalSelections, overrideTrace };
}
