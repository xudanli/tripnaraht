import { arbitrateSlots } from '../arbitration/slot-arbitration.engine';
import { computeDualEngineConvergence } from '../convergence/convergence.engine';
import { runDraftValidationGate } from '../gate/draft-validation-gate';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type { TripDraftSelection } from '../state/trip-draft-state.types';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import { applyRepairPatchToState } from './repair.engine';
import type { SlotArbitrationResult } from '../arbitration/slot-arbitration.types';
import type { DraftValidationGateResult } from '../gate/draft-validation-gate.types';
import type { ConvergenceResult } from '../convergence/convergence.types';

export interface RepairConvergenceLoopDeps {
  initialState: TripDraftState;
  candidates: CandidatePlace[];
  /** 每次迭代拉取双引擎选点（应读取最新 TripDraftState） */
  runEngines: (state: TripDraftState) => Promise<{ llm: TripDraftSelection[]; algo: TripDraftSelection[] }>;
  maxIterations?: number;
  /** Gate：是否在已完成 Slot 仲裁融合后放宽「原始分歧」阻断（推荐 Repair Loop 开启） */
  acceptSlotArbitrationMerge?: boolean;
}

export interface RepairConvergenceLoopResult {
  iterations: number;
  state: TripDraftState;
  lastGate: DraftValidationGateResult;
  lastConvergence: ConvergenceResult;
  lastArbitration: SlotArbitrationResult;
  trace: string[];
  converged: boolean;
}

/**
 * Repair Loop：NEEDS_REPAIR → .patch state → 重跑双引擎 → Slot 仲裁 → Gate，直至 APPROVED 或耗尽迭代。
 */
export async function runRepairConvergenceLoop(deps: RepairConvergenceLoopDeps): Promise<RepairConvergenceLoopResult> {
  const maxIter = deps.maxIterations ?? 5;
  const candidatesById = new Map(deps.candidates.map((c) => [c.id, c]));
  const trace: string[] = [];
  let state = deps.initialState;
  let lastGate!: DraftValidationGateResult;
  let lastConvergence!: ConvergenceResult;
  let lastArbitration!: SlotArbitrationResult;

  for (let i = 0; i < maxIter; i++) {
    const { llm, algo } = await deps.runEngines(state);

    lastArbitration = arbitrateSlots({
      llmSelections: llm,
      algoSelections: algo,
      candidatesById,
      transport: state.intent.transport,
    });

    lastConvergence = computeDualEngineConvergence(llm, algo);

    const convergenceForGate: ConvergenceResult = {
      ...lastConvergence,
      overridePlan: lastArbitration.finalSelections,
    };

    lastGate = runDraftValidationGate({
      state,
      convergence: convergenceForGate,
      llmEngineRan: true,
      algoEngineRan: true,
      options: {
        acceptSlotArbitrationMerge: deps.acceptSlotArbitrationMerge ?? true,
      },
    });

    trace.push(`iter ${i + 1}: gate=${lastGate.status}, agreement=${lastConvergence.agreementScore.toFixed(3)}`);

    if (lastGate.status === 'APPROVED') {
      state = applyRepairPatchToState(state, lastGate, lastConvergence, {
        finalSelections: lastArbitration.finalSelections,
      });
      return {
        iterations: i + 1,
        state,
        lastGate,
        lastConvergence,
        lastArbitration,
        trace,
        converged: true,
      };
    }

    state = applyRepairPatchToState(state, lastGate, lastConvergence, {
      finalSelections: lastArbitration.finalSelections,
    });
  }

  return {
    iterations: maxIter,
    state,
    lastGate,
    lastConvergence,
    lastArbitration,
    trace,
    converged: lastGate.status === 'APPROVED',
  };
}
