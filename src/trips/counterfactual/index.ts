export type { CounterfactualBranch, CounterfactualPhysicsPatch } from './physics-branch.types';

export { applyCounterfactualDelta } from './merge-branch-physics';

export { generateStandardCounterfactualBranches } from './generate-branches';

export {
  regretDistributionFromDistances,
  robustnessScoreFromStabilities,
  expectedRegret,
} from './regret-model';

export {
  buildPhysicsIndexForBranch,
  evaluateCounterfactualBranches,
  evaluateBaselineBranch,
  attachRegretToEvaluations,
  type BranchEvaluation,
} from './evaluate-branches';

export {
  selectCounterfactualDecision,
  attachCounterfactualToProof,
  type CounterfactualDecisionResult,
  type CounterfactualSelectionStrategy,
} from './select-counterfactual-decision';
