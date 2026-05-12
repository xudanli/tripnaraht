/**
 * P-Next 5 — Deterministic proof bundle from physics index, overlay, DAG/IR/VM summaries, and Neptune decision.
 */

import { createHash } from 'crypto';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionTraceEvent } from '../execution-vm/execution-trace.types';
import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import {
  EXECUTION_PROOF_SCHEMA_VERSION,
  type ExecutionProof,
  type ExecutionProofWitness,
  type TraceSegment,
} from './execution-proof.types';
import { DEFAULT_EXECUTION_INVARIANTS } from '../execution-invariants/default-invariants';
import {
  DEFAULT_EXECUTION_SEMANTICS_V1,
  SEMANTICS_PROFILE_DEFAULT_V1,
} from '../execution-semantics/default-execution-semantics-v1';
import type { ExecutionSemanticsSpec } from '../execution-semantics/execution-semantics-spec.types';
import { evaluateExecutionSemantics } from '../execution-semantics/evaluate-execution-semantics';

export interface BuildExecutionProofInput {
  physicsFieldIndex?: PhysicsFieldIndex | null;
  executionOverlayFrames?: ExecutionOverlayFrame[] | null;
  executionTruthDAG?: ExecutionTruthDAG | null;
  executionIR?: ExecutionIR | null;
  irVmRun?: { pathCost: number; ok: boolean };
  executionTrace?: ExecutionTraceEvent[];
  triggers: Array<{ code: string }>;
  changedSlotIds: string[];
  /** P-Next 6 — override default profile (same version family). */
  executionSemanticsSpec?: ExecutionSemanticsSpec | null;
  /** P-Next 6 — attach graded semantic evaluations + optional daylight hints in witness. */
  attachSemanticLayer?: boolean;
}

function sha256hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Stable commitment over overlay frames (full hex — root-of-state). */
export function hashOverlayFramesCommitment(frames: ExecutionOverlayFrame[] | undefined): string {
  if (!frames?.length) {
    return sha256hex('overlay:empty');
  }
  const sorted = [...frames].sort((a, b) => a.legId.localeCompare(b.legId));
  return sha256hex(JSON.stringify(sorted));
}

function buildWitness(input: BuildExecutionProofInput): ExecutionProofWitness {
  const physicsByLegId: ExecutionProofWitness['physicsByLegId'] = {};
  const idx = input.physicsFieldIndex;
  if (idx?.byLegId) {
    for (const [legId, row] of Object.entries(idx.byLegId)) {
      physicsByLegId[legId] = {
        derived: row.derived,
        mobility: row.stateVector.mobility,
        exposure: row.stateVector.exposure,
        energy: row.stateVector.energy,
        temporalPressure: row.stateVector.temporalPressure,
      };
    }
  }

  const overlayLegIdsSorted = [...new Set((input.executionOverlayFrames ?? []).map(f => f.legId))].sort();
  const overlayContentHash = hashOverlayFramesCommitment(input.executionOverlayFrames ?? undefined);

  const dag = input.executionTruthDAG;
  const ir = input.executionIR;
  const trace = input.executionTrace ?? [];

  return {
    schemaVersion: EXECUTION_PROOF_SCHEMA_VERSION,
    physicsByLegId,
    overlayLegIdsSorted,
    overlayContentHash,
    dagSummary: {
      nodeCount: dag?.nodes?.length ?? 0,
      edgeCount: dag?.edges?.length ?? 0,
    },
    irSummary: {
      stepCount: ir?.steps?.length ?? 0,
      dagId: ir?.meta?.dagId ?? '',
    },
    vmSummary: {
      traceSteps: trace.length,
      pathCost: input.irVmRun?.pathCost ?? 0,
      ok: input.irVmRun?.ok ?? false,
    },
    decisionSummary: {
      triggerCodesSorted: [...new Set(input.triggers.map(t => t.code))].sort(),
      changedSlotIdsSorted: [...new Set(input.changedSlotIds)].sort(),
    },
    ...(input.attachSemanticLayer &&
    (input.executionOverlayFrames ?? []).some(f => f.temporal.daylightViolation)
      ? {
          semanticOverlayHints: {
            daylightViolationLegIds: [
              ...new Set(
                (input.executionOverlayFrames ?? [])
                  .filter(f => f.temporal.daylightViolation)
                  .map(f => f.legId),
              ),
            ].sort(),
          },
        }
      : {}),
  };
}

/** Same commitments as {@link buildExecutionProof} — used by the verifier. */
export function recomputeHashesFromWitness(witness: ExecutionProofWitness): {
  rootStateHash: string;
  decisionHash: string;
} {
  const physicsPayload = JSON.stringify(
    Object.keys(witness.physicsByLegId)
      .sort()
      .map(k => [k, witness.physicsByLegId[k]] as const),
  );
  const physicsRoot = sha256hex(physicsPayload);

  const rootPayload =
    witness.semanticOverlayHints?.daylightViolationLegIds?.length &&
    witness.semanticOverlayHints.daylightViolationLegIds.length > 0
      ? {
          overlayRoot: witness.overlayContentHash,
          physicsRoot,
          schemaVersion: witness.schemaVersion,
          semanticHintsRoot: sha256hex(
            JSON.stringify([...witness.semanticOverlayHints.daylightViolationLegIds].sort()),
          ),
        }
      : {
          overlayRoot: witness.overlayContentHash,
          physicsRoot,
          schemaVersion: witness.schemaVersion,
        };

  const rootStateHash = sha256hex(JSON.stringify(rootPayload));

  const decisionHash = sha256hex(
    JSON.stringify({
      triggers: witness.decisionSummary.triggerCodesSorted,
      slots: witness.decisionSummary.changedSlotIdsSorted,
    }),
  );

  return { rootStateHash, decisionHash };
}

function buildCompressedTrace(
  input: BuildExecutionProofInput,
  witness: ExecutionProofWitness,
): TraceSegment[] {
  const physicsDigest = sha256hex(
    JSON.stringify(
      Object.keys(witness.physicsByLegId)
        .sort()
        .map(k => [k, witness.physicsByLegId[k]] as const),
    ),
  );

  const dagPayload = JSON.stringify(witness.dagSummary);
  const irPayload = JSON.stringify(witness.irSummary);
  const vmPayload = JSON.stringify(witness.vmSummary);
  const decisionPayload = JSON.stringify(witness.decisionSummary);

  return [
    {
      kind: 'PHYSICS_DIGEST',
      label: 'PhysicsFieldIndex.byLegId',
      payloadHash: physicsDigest,
    },
    {
      kind: 'OVERLAY_DIGEST',
      label: 'ExecutionOverlayFrame[]',
      payloadHash: witness.overlayContentHash,
    },
    {
      kind: 'DAG_DIGEST',
      label: 'ExecutionTruthDAG',
      payloadHash: sha256hex(dagPayload),
    },
    {
      kind: 'IR_DIGEST',
      label: 'ExecutionIR.meta+steps',
      payloadHash: sha256hex(irPayload),
    },
    {
      kind: 'VM_DIGEST',
      label: 'VM trace + pathCost',
      payloadHash: sha256hex(vmPayload),
    },
    {
      kind: 'DECISION_DIGEST',
      label: 'Neptune triggers + changed slots',
      payloadHash: sha256hex(decisionPayload),
    },
  ];
}

/**
 * Builds a verifiable proof bundle. Hashes are full-length sha256 hex (64 chars).
 */
export function buildExecutionProof(input: BuildExecutionProofInput): ExecutionProof {
  const witness = buildWitness(input);
  const { rootStateHash, decisionHash } = recomputeHashesFromWitness(witness);
  const compressedTrace = buildCompressedTrace(input, witness);

  const base: ExecutionProof = {
    rootStateHash,
    decisionHash,
    compressedTrace,
    invariants: DEFAULT_EXECUTION_INVARIANTS.map(i => i.id),
    witness,
  };

  const hasPhysics =
    input.attachSemanticLayer &&
    input.physicsFieldIndex?.byLegId &&
    Object.keys(input.physicsFieldIndex.byLegId).length > 0;

  if (!hasPhysics) {
    return base;
  }

  const spec = input.executionSemanticsSpec ?? DEFAULT_EXECUTION_SEMANTICS_V1;
  const semantic = evaluateExecutionSemantics(spec, {
    physicsFieldIndex: input.physicsFieldIndex ?? null,
    executionOverlayFrames: input.executionOverlayFrames ?? null,
    semanticsProfileId: SEMANTICS_PROFILE_DEFAULT_V1,
  });

  return {
    ...base,
    semanticsVersion: semantic.semanticsVersion,
    semanticsProfileId: semantic.semanticsProfileId,
    evaluations: semantic.evaluations,
    violations: semantic.violations,
    semanticAggregateDistance: semantic.semanticAggregateDistance,
  };
}
