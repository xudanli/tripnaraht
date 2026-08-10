import { EffectivePlanWriteBypassError } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  isOntologyAuthorityKillSwitchEngaged,
  ontologyAuthorityMayWriteEffectivePlan,
  resolveOntologyAuthorityRolloutMode,
} from '../../decision-runtime/constraints/ontology-authority-rollout.config';
import { recordAuthorityConsumptionTrace } from './record-authority-consumption-trace.util';

export class OntologyWriteFailedSafeError extends EffectivePlanWriteBypassError {
  readonly code = 'FAILED_SAFE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'OntologyWriteFailedSafeError';
  }
}

export interface CanonicalEffectiveWriteRequest {
  caller: string;
  assessmentId: string | null | undefined;
  authorityRunId: string | null | undefined;
  basedOnRevision: number | null | undefined;
  semanticScope?: string;
  tripId?: string | null;
  /** Forbidden unless ONTOLOGY_ALLOW_TEP_DIRECT_WRITE=true (escape hatch). */
  directSetEffective?: boolean;
  /** Must be true for Canonical Apply seal path. */
  canonicalApply?: boolean;
}

/**
 * Seal: plan mutation must go through Canonical Apply with complete authority fields.
 * directSetEffective=true always fails closed (unless explicit escape env).
 */
export function assertCanonicalEffectiveWriteOrFailedSafe(
  input: CanonicalEffectiveWriteRequest,
): void {
  const mode = resolveOntologyAuthorityRolloutMode();
  const missing: string[] = [];
  if (!input.assessmentId) missing.push('assessmentId');
  if (!input.authorityRunId) missing.push('authorityRunId');
  if (input.basedOnRevision == null) missing.push('basedOnRevision');

  const mayWrite = ontologyAuthorityMayWriteEffectivePlan({ tripId: input.tripId });
  const sealDirect =
    input.directSetEffective === true &&
    process.env.ONTOLOGY_ALLOW_TEP_DIRECT_WRITE?.trim().toLowerCase() !== 'true';
  const allowCanonical =
    input.canonicalApply === true && missing.length === 0 && mayWrite && !sealDirect;

  recordAuthorityConsumptionTrace({
    consumer: 'execute.set_effective',
    tripId: input.tripId ?? undefined,
    inputRevision: input.basedOnRevision ?? 'missing',
    assessmentId: input.assessmentId ?? null,
    runtimeAuthority: allowCanonical
      ? 'ONTOLOGY_CANONICAL'
      : mode === 'SHADOW'
        ? 'GATEWAY_SHADOW'
        : 'LEGACY',
    factsUsed: [],
    constraintVersion: 'ontology-write-seal',
    outputRevision: null,
    legacyWriteAttempted: !allowCanonical,
    reasonCodes: missing.length
      ? ['FAILED_SAFE_MISSING_FIELDS', ...missing]
      : sealDirect
        ? ['ONT-WRITE-004_DIRECT_SETEFFECTIVE']
        : allowCanonical
          ? ['ONT_P0_07D_CANONICAL_APPLY']
          : ['ONTOLOGY_AUTHORITY_WRITE_BLOCKED'],
  });

  if (missing.length > 0) {
    throw new OntologyWriteFailedSafeError(
      `FAILED_SAFE: missing ${missing.join(', ')} for effective write (caller=${input.caller})`,
    );
  }
  if (sealDirect) {
    throw new OntologyWriteFailedSafeError(
      `ONT-WRITE-004 FAILED_SAFE: Repair/TEP must not setEffective directly; use Canonical Apply (caller=${input.caller}, scope=${input.semanticScope ?? 'n/a'})`,
    );
  }
  if (!input.canonicalApply) {
    throw new OntologyWriteFailedSafeError(
      `FAILED_SAFE: effective write must go through Ontology Canonical Apply (caller=${input.caller})`,
    );
  }
  if (!mayWrite) {
    const kill = isOntologyAuthorityKillSwitchEngaged();
    throw new OntologyWriteFailedSafeError(
      kill
        ? `FAILED_SAFE: Ontology authority kill switch engaged (caller=${input.caller})`
        : `FAILED_SAFE: Ontology authority mode=${mode} cannot mint effective Revision (caller=${input.caller})`,
    );
  }
}
