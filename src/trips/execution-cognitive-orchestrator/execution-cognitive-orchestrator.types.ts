/**
 * Execution Cognitive Orchestrator (ECO) — P7–P10 as explicit control-flow stages after Neptune.
 */

import type { NeptunePatch } from '../execution-convergence-optimizer/neptune-patch.types';
import type { ExecutionConvergenceState } from '../execution-convergence-formalization/convergence-semantics.types';
import type { ExecutionFixedPoint } from '../execution-convergence-formalization/execution-convergence.types';
import type { ConvergenceProofSketch } from '../execution-convergence-formalization/convergence-proof.types';
import type { LyapunovState } from '../execution-stability/lyapunov.types';
import type { ContractionProof } from '../execution-formal-proof/contraction-proof.types';
import type { OscillationBoundResult } from '../execution-formal-proof/oscillation-bound';
import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { DisturbanceModel } from '../disturbance-model/disturbance-model.types';
import type { StochasticLyapunovState } from '../execution-stability/stochastic-lyapunov';
import type {
  BayesianCausalUpdateResult,
  ProbabilisticFixedPointSketch,
  ProbabilisticStabilityCertificate,
} from '../execution-probabilistic-dynamics';
import type { MetaExecutionState } from '../meta-dynamics/meta-state.types';
import type { AdaptiveLyapunov } from '../meta-dynamics/adaptive-lyapunov';
import type { MetaReflection } from '../meta-reflection/meta-reflection.types';
import type { ExecutionIdentity } from '../identity-preservation/identity-preservation.types';
import type { MetaStabilityGuardResult } from '../meta-dynamics/meta-stability-guard';
import type { SelfModel } from '../recursive-semantics/self-model.types';
import type { RecursiveReasoningAssessment } from '../recursive-semantics/recursive-evaluator';
import type { RecursiveBoundaryResult } from '../recursive-semantics/recursive-boundary';
import type { SemanticTrustCore } from '../recursive-semantics/semantic-trust-core';
import type { ComputationalIdentity } from '../recursive-semantics/computational-identity.types';
import type { NeptuneReflectiveSemanticAugmentation } from '../recursive-semantics/neptune-reflective-output.types';
import type { EpistemicLimit } from '../epistemic-boundary/epistemic-limit.types';
import type { UnprovableExecutionProperty } from '../epistemic-boundary/godel-boundary';
import type { ConfidenceHorizonResult } from '../epistemic-boundary/confidence-horizon';
import type { ProofBoundary } from '../epistemic-boundary/proof-incompleteness';
import type { EpistemicAssessment } from '../epistemic-boundary/neptune-epistemic-assessment.types';
import type { ExistentialIdentity } from '../computational-ontology/existential-identity.types';
import type { InvariantOntology } from '../computational-ontology/invariant-ontology';
import type { SemanticContinuity } from '../computational-ontology/semantic-continuity';
import type { MutationEnvelopeAudit } from '../computational-ontology/mutation-envelope';
import type { ExistentialAssessment } from '../computational-ontology/existential-assessment.types';
import type { IdentityContinuityProof } from '../execution-closure-persistence/eco-identity-ledger.types';
import type {
  IdentityGuardMode,
  MutationDistanceWeights,
} from '../execution-closure-persistence/eco-identity-guard.types';
import type { EcoIdentityLineage } from '../execution-closure-persistence/eco-identity-lineage.types';
import type { IdentityPathCost } from '../execution-closure-persistence/identity-trajectory.types';
import type { EcoReconciliationPolicy } from '../execution-closure-persistence/eco-reconciliation.types';

export type EcoPipelineMode = 'legacy' | 'partial' | 'full';

export interface EcoPipelinePolicy {
  /** When true, `repairPlan` runs P7–P10 pipeline after `neptuneRepairPlan` (subject to `mode`). */
  enabled?: boolean;
  /**
   * - `legacy`: no cognitive stages (same as disabled).
   * - `partial`: P7 + P9 + P10 (skip counterfactual branch scoring).
   * - `full`: P7 + P8 + P9 + P10.
   */
  mode?: EcoPipelineMode;
}

export interface EcoOrchestrationDigest {
  ran: boolean;
  mode: EcoPipelineMode;
  skippedReason?: string;
  stages?: {
    p7?: boolean;
    p8?: boolean;
    p9?: boolean;
    p10?: boolean;
  };
  p7ConsensusStable?: boolean;
  p8ChosenBranchId?: string;
  p9UtilityScore?: number;
  p10DriftScore?: number;
  /** ECO–Neptune closure policy outcome (optional second repair pass). */
  ecoClosure?: EcoClosureDigestSlice;
  /** P-E2 — optional lineage pointer after accepted ledger commit (audit / replay). */
  lineageRef?: EcoIdentityLineage;
  /** P-E3 — path cost over the accepted identity trajectory (derived; audit only). */
  trajectory?: IdentityPathCost;
}

/** Neptune retry + threshold tuning (see `closure-controller.ts`). */
export interface EcoClosurePolicy {
  allowNeptuneRetry?: boolean;
  driftMax?: number;
  stabilityMin?: number;
  convergenceMin?: number;
  maxExtraNeptunePasses?: number;
  /**
   * Second pass after unstable closure:
   * - `full_neptune_retry`: legacy duplicate repair on same witness.
   * - `minimal_patch_then_neptune`: apply {@link NeptunePatch} deltas then one Neptune on patched witness.
   * Env: `TRIP_ECO_CORRECTION_STRATEGY=minimal_patch_then_neptune|full_neptune_retry` (default **full**).
   */
  correctionStrategy?: 'full_neptune_retry' | 'minimal_patch_then_neptune';
  /** P-ECO-Closure-3 — ε thresholds for {@link ExecutionConvergenceState}. */
  convergenceSemantics?: import('../execution-convergence-formalization/convergence-semantics.types').ConvergenceSemanticsOptions;
  /**
   * Use `evaluateFixedPoint` / `shouldContinueIteration` instead of heuristic `shouldRerunNeptune` to decide the second pass.
   * Env: `TRIP_ECO_FP_GATE=1`.
   */
  useFixedPointIterationGate?: boolean;
  /**
   * When false (default), second Neptune / correction path may be gated by persisted {@link EcoIdentityLedgerSnapshot} carry-forward flags.
   * Set true or `TRIP_ECO_DISABLE_ENFORCEMENT=1` to ignore gates (debug / A-B).
   */
  disableEcoClosureEnforcement?: boolean;
  /**
   * When false, do not write `ecoIdentityLedger` after closure (default: persist).
   */
  persistEcoIdentityLedger?: boolean;
  /**
   * Server-side: Prisma `Trip.id` — copied to `state.signals.ecoLedgerTripId` at `generatePlan` / `repairPlan` entry when signals omit it.
   */
  boundTripId?: string;
  /**
   * P-Evolution-1 — identity guardrail before in-memory ledger commit (`commitEcoIdentityLedger`).
   * Env: `TRIP_IDENTITY_GUARD_ENFORCE=1`, `TRIP_IDENTITY_GUARD_THRESHOLD` (number string).
   */
  identityGuard?: {
    mode?: IdentityGuardMode;
    mutationDistanceThreshold?: number;
    weights?: MutationDistanceWeights;
  };
  /** P-E2 — default branch label for new lineage nodes (`main` if omitted). */
  identityLineage?: {
    branchId?: string;
  };
  /**
   * P-E4 — reconciliation over P-E3 path cost before ledger commit.
   * Env: `TRIP_IDENTITY_RECONCILIATION_ENABLE=1` (unless `enabled: false`).
   */
  reconciliation?: EcoReconciliationPolicy;
  /**
   * P-CI-4 skeleton — tuning for `computeControlSignal` in `execution-closure-persistence/p-ci-4.ts`.
   * Env fallbacks: TRIP_PCI4_ALPHA, TRIP_PCI4_INSTABILITY_THRESHOLD, TRIP_PCI4_RISK_THRESHOLD.
   */
  pci4PressureControl?: {
    controlAlpha?: number;
    instabilityThreshold?: number;
    riskThreshold?: number;
  };
}

export interface EcoNeptuneClosureEvaluation {
  ecoDriftScore: number;
  stabilityScore: number;
  semanticConvergence: number;
  shouldRerunNeptune: boolean;
  reasons: string[];
  thresholds: {
    driftMax: number;
    stabilityMin: number;
    convergenceMin: number;
  };
}

export interface EcoClosureDigestSlice {
  neptunePasses: 1 | 2;
  beforeRetry?: EcoNeptuneClosureEvaluation;
  final: EcoNeptuneClosureEvaluation;
  correctionPath?: 'full_neptune_retry' | 'minimal_patch_then_neptune';
  /** Populated when `correctionPath === 'minimal_patch_then_neptune'`. */
  appliedMinimalPatches?: NeptunePatch[];
  /** P-ECO-Closure-3 — fixed-point / residual / contraction view of this tick. */
  convergence?: ExecutionConvergenceState;
  /** Operator-level fixed-point certificate (hash + ±1 contraction step). */
  fixedPoint?: ExecutionFixedPoint;
  /** P-ECO-Closure-4 — Lyapunov / monotonicity / divergence sketch (audit). */
  convergenceProof?: ConvergenceProofSketch;
  /** Execution Lyapunov energy V(S) step audit (dissipation vs injection). */
  lyapunov?: LyapunovState;
  /** P-ECO-Closure-5 — empirical contraction / Lipschitz certificate on formal snapshots. */
  contractionProof?: ContractionProof;
  /** Oscillation bounded predicate along this arc. */
  oscillationBound?: OscillationBoundResult;
  /** P-ECO-Closure-6 — pooled epistemic uncertainty over signals. */
  executionUncertainty?: ExecutionUncertainty;
  /** P6 — named disturbance channels ξ(t). */
  disturbanceModel?: DisturbanceModel;
  /** P6 — E[V] step under disturbance budgets. */
  stochasticLyapunov?: StochasticLyapunovState;
  /** P6 — posterior sketch over causal edges. */
  bayesianCausal?: BayesianCausalUpdateResult;
  /** P6 — P(V < ε) stability certificate. */
  probabilisticStability?: ProbabilisticStabilityCertificate;
  /** P6 — high-probability fixed-point sketch vs residual noise. */
  probabilisticFixedPoint?: ProbabilisticFixedPointSketch;
  /** P-ECO-Closure-7 — evolving policy bundle Φ over dynamics F. */
  metaExecutionState?: MetaExecutionState;
  /** P7 — Lyapunov surrogate keyed by semantics + retention under Φ. */
  adaptiveLyapunov?: AdaptiveLyapunov;
  /** P7 — second-order drift vs defaults / causal churn. */
  metaReflection?: MetaReflection;
  /** P7 — stable identity envelope across mutation. */
  executionIdentity?: ExecutionIdentity;
  /** P7 — freeze policy evolution when meta-divergence exceeds budget. */
  metaStabilityGuard?: MetaStabilityGuardResult;
  /** P-ECO-Closure-8 — explicit beliefs + meta-beliefs. */
  selfModel?: SelfModel;
  /** P8 — reasoning-about-reasoning audit. */
  recursiveReasoning?: RecursiveReasoningAssessment;
  /** P8 — halt excessive reflective regress. */
  recursiveBoundary?: RecursiveBoundaryResult;
  /** P8 — axiomatic kernel (non-recursively revisable in policy). */
  semanticTrustCore?: SemanticTrustCore;
  /** P8 — computational “self” vs trusted kernel. */
  computationalIdentity?: ComputationalIdentity;
  /** P8 — reflective semantics surfaced alongside Neptune closure digest. */
  neptuneReflectiveSemantics?: NeptuneReflectiveSemanticAugmentation;
  /** P-ECO-Closure-9 — catalogue of unknowable / undecidable facets. */
  epistemicLimit?: EpistemicLimit;
  /** P9 — Gödel-style internally unprovable execution properties. */
  godelUnprovableProperties?: UnprovableExecutionProperty[];
  /** P9 — confidence saturation vs observation gain. */
  confidenceHorizonAudit?: ConfidenceHorizonResult;
  /** P9 — proof status partition (provable / empirical / …). */
  proofBoundary?: ProofBoundary;
  /** P9 — bounded epistemic reasoner summary (Neptune digest facet). */
  epistemicAssessment?: EpistemicAssessment;
  /** P-ECO-Closure-10 — what persists as the same system (existential core). */
  existentialIdentity?: ExistentialIdentity;
  /** P10 — which obligations must remain true for self-sameness. */
  invariantOntology?: InvariantOntology;
  /** P10 — lineage + drift + continuity confidence. */
  semanticContinuity?: SemanticContinuity;
  /** P10 — mutation within identity-preserving region. */
  mutationEnvelopeAudit?: MutationEnvelopeAudit;
  /** P10 — identity-preserving kernel assessment (Neptune digest facet). */
  existentialAssessment?: ExistentialAssessment;
  /** Cross-run continuity vs persisted {@link TripWorldState.signals.ecoIdentityLedger}. */
  identityContinuityProof?: IdentityContinuityProof;
}
