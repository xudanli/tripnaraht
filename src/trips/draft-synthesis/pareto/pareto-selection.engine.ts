import type { TravelPersona, TravelPersonaType } from '../persona-policy/travel-persona.types';
import type { ObjectiveVector } from './objective-vector.types';

/** Persona → 各目标线性加权（用于从 Pareto 前沿选「偏好点」）。 */
const PERSONA_OBJECTIVE_WEIGHTS: Record<
  TravelPersonaType,
  Record<keyof ObjectiveVector, number>
> = {
  RELAXER: { satisfaction: 0.12, efficiency: 0.08, cost: 0.12, fatigue: 0.38, experience: 0.1, risk: 0.2 },
  EFFICIENCY_HUNTER: { satisfaction: 0.1, efficiency: 0.42, cost: 0.15, fatigue: 0.08, experience: 0.08, risk: 0.17 },
  FOODIE: { satisfaction: 0.22, efficiency: 0.06, cost: 0.12, fatigue: 0.08, experience: 0.38, risk: 0.14 },
  EXPLORER: { satisfaction: 0.18, efficiency: 0.12, cost: 0.08, fatigue: 0.12, experience: 0.32, risk: 0.18 },
  CULTURE_DEEP_DIVER: { satisfaction: 0.18, efficiency: 0.1, cost: 0.1, fatigue: 0.14, experience: 0.36, risk: 0.12 },
  FREE_SPIRIT: { satisfaction: 0.15, efficiency: 0.08, cost: 0.1, fatigue: 0.18, experience: 0.28, risk: 0.21 },
};

/** 人格效用标量（Negotiation / Multi-Agent 与 Pareto 选点共用）。 */
export function personaUtilityScore(o: ObjectiveVector, personaType: TravelPersonaType): number {
  const w = PERSONA_OBJECTIVE_WEIGHTS[personaType];
  let s = 0;
  (Object.keys(w) as (keyof ObjectiveVector)[]).forEach((k) => {
    s += o[k] * w[k];
  });
  return s;
}

/**
 * 在前沿集合上按人格偏好做标量化，返回得分最高的方案。
 */
export function selectFromParetoFront<T extends { objectives: ObjectiveVector }>(
  front: T[],
  persona: TravelPersona,
): T {
  if (front.length === 0) {
    throw new Error('selectFromParetoFront: empty front');
  }
  if (front.length === 1) return front[0];

  let best = front[0];
  let bestScore = personaUtilityScore(best.objectives, persona.type);
  for (let i = 1; i < front.length; i++) {
    const sc = personaUtilityScore(front[i].objectives, persona.type);
    if (sc > bestScore) {
      bestScore = sc;
      best = front[i];
    }
  }
  return best;
}
