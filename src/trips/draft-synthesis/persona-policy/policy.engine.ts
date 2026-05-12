import type { DraftContractMode } from '../contract/trip-draft-contract.types';
import type { TravelPersona } from './travel-persona.types';
import type {
  ExecutionPolicy,
  GateProfile,
  RepairAggressiveness,
  SimulationLevel,
} from './execution-policy.types';

function normalizeWeights(llm: number, algo: number, solver: number): Pick<ExecutionPolicy, 'llmWeight' | 'algoWeight' | 'solverWeight'> {
  const s = llm + algo + solver;
  const n = s > 0 ? s : 1;
  return {
    llmWeight: llm / n,
    algoWeight: algo / n,
    solverWeight: solver / n,
  };
}

function constraintOrderFromPersona(p: TravelPersona): string[] {
  const c = p.constraintSensitivity;
  const entries: [string, number][] = [
    ['timing', c.timing],
    ['distance', c.distance],
    ['fatigue', c.fatigue],
    ['cost', c.cost],
  ];
  return [...entries].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/**
 * 人格 → 执行策略：仿真强度 / 修复侵略性 / 门控档位 / 引擎权重（归一化）。
 */
export class PolicyEngine {
  static selectExecutionPolicy(persona: TravelPersona, _ctx: { mode: DraftContractMode }): ExecutionPolicy {
    const w = normalizeWeights(
      persona.engineWeights.llm,
      persona.engineWeights.algo,
      persona.engineWeights.solver,
    );

    let simulationLevel: SimulationLevel = 'FULL';
    let repairAggressiveness: RepairAggressiveness = 'MEDIUM';
    let gateProfile: GateProfile = 'STANDARD';

    switch (persona.type) {
      case 'RELAXER':
        simulationLevel = 'LIGHT';
        repairAggressiveness = 'LOW';
        gateProfile = 'SOFT';
        break;
      case 'EFFICIENCY_HUNTER':
        simulationLevel = 'FULL';
        repairAggressiveness = 'MEDIUM';
        gateProfile = 'STRICT';
        break;
      case 'FOODIE':
        simulationLevel = 'FULL';
        repairAggressiveness = 'MEDIUM';
        gateProfile = 'SOFT';
        break;
      case 'EXPLORER':
        simulationLevel = 'FULL';
        repairAggressiveness = 'HIGH';
        gateProfile = 'STANDARD';
        break;
      case 'CULTURE_DEEP_DIVER':
        simulationLevel = 'FULL';
        repairAggressiveness = 'MEDIUM';
        gateProfile = 'STANDARD';
        break;
      case 'FREE_SPIRIT':
        simulationLevel = 'LIGHT';
        repairAggressiveness = 'LOW';
        gateProfile = 'SOFT';
        break;
      default:
        break;
    }

    return {
      ...w,
      simulationLevel,
      repairAggressiveness,
      constraintPriorityOrder: constraintOrderFromPersona(persona),
      gateProfile,
    };
  }
}

/** 门控阈值：与 draft-validation-gate 默认对齐（STANDARD）。 */
export function gateNumericOptions(profile: GateProfile): {
  minAgreementToApprove: number;
  maxDivergenceSlots: number;
  hardRejectBelowAgreement: number;
} {
  switch (profile) {
    case 'SOFT':
      return {
        minAgreementToApprove: 0.48,
        maxDivergenceSlots: 14,
        hardRejectBelowAgreement: 0.12,
      };
    case 'STRICT':
      return {
        minAgreementToApprove: 0.62,
        maxDivergenceSlots: 6,
        hardRejectBelowAgreement: 0.18,
      };
    case 'STANDARD':
    default:
      return {
        minAgreementToApprove: 0.55,
        maxDivergenceSlots: 8,
        hardRejectBelowAgreement: 0.15,
      };
  }
}
