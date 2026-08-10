/**
 * Compensation evaluation pipeline (UWC-1d).
 * Stages: profile → forbidden → auth gate → authority → verification →
 * idempotency → OCC → atomic_write → audit.
 *
 * Under Shadow / closed exec gate: decision only, writesPerformed=false.
 */

import { evaluateAtomicOccDecision } from './expected-write-version';
import {
  isCompensationExecAuthorized,
  UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON,
} from './compensation-auth.gate';
import { getCorridorRecoveryProfile } from './corridor-recovery.profile';
import type {
  CompensationCommand,
  CompensationDecision,
  CompensationOutcome,
} from './recovery-contract.types';
import { UWC_RECOVERY_FORBIDDEN } from './recovery-contract.types';

export type CompensationEvalOptions = {
  /** Prior compensation idempotency hit */
  priorCompensationApplied?: boolean;
  /**
   * When true, treat as dry-run even if exec gate open (Shadow).
   * Default true for UWC shadow era.
   */
  shadowOnly?: boolean;
};

export function evaluateCompensationDecision(
  command: CompensationCommand,
  opts: CompensationEvalOptions = {},
): CompensationDecision {
  const shadowOnly = opts.shadowOnly !== false;
  const stages: CompensationDecision['stages'][number][] = [];
  const reasonCodes: string[] = [];
  const profile = getCorridorRecoveryProfile(command.corridor);

  // recovery_profile
  const layerOk = profile.layers.includes(command.layer);
  stages.push({
    stage: 'recovery_profile',
    pass: layerOk,
    detail: `layer=${command.layer} allowed=${profile.layers.join(',')}`,
  });
  if (!layerOk) {
    return finish(command, 'REJECTED', ['LAYER_NOT_IN_PROFILE', ...reasonCodes], stages, false);
  }

  // forbidden_pattern — reverseDiff must not claim snapshot restore
  const opsJson = JSON.stringify(command.reverseDiff.reverseOps);
  const looksLikeSnapshotRestore =
    opsJson.includes('RESTORE_OLD_SNAPSHOT') ||
    opsJson.includes('universal_rollback') ||
    Boolean((command.reverseDiff as { restoreSnapshotId?: string }).restoreSnapshotId);
  stages.push({
    stage: 'forbidden_pattern',
    pass: !looksLikeSnapshotRestore,
    detail: looksLikeSnapshotRestore
      ? UWC_RECOVERY_FORBIDDEN[1]
      : 'reverse_diff_ok',
  });
  if (looksLikeSnapshotRestore) {
    return finish(
      command,
      'REJECTED',
      ['RESTORE_OLD_SNAPSHOT_FORBIDDEN', ...UWC_RECOVERY_FORBIDDEN],
      stages,
      false,
    );
  }

  // reverseDiff basedOn must match expectedCurrentVersion kind
  if (
    command.reverseDiff.basedOnCurrentVersion.kind !==
    command.expectedCurrentVersion.kind
  ) {
    reasonCodes.push('REVERSE_DIFF_VERSION_KIND_MISMATCH');
  }

  // External surfaces
  if (command.reverseDiff.externalSurfacesTouched.length > 0) {
    stages.push({
      stage: 'recovery_profile',
      pass: false,
      detail: 'EXTERNAL_COMPENSATION_UNSUPPORTED',
    });
    return finish(
      command,
      'EXTERNAL_UNSUPPORTED',
      ['EXTERNAL_COMPENSATION_UNSUPPORTED', ...reasonCodes],
      stages,
      false,
    );
  }

  // ACTIONS stub
  if (profile.capabilities.includes('NO_EFFECTIVE_SIDE_EFFECT')) {
    if (command.layer === 'POST_EFFECTIVE_COMPENSATING_WRITE') {
      return finish(
        command,
        'REJECTED',
        ['NO_EFFECTIVE_SIDE_EFFECT', 'POST_EFFECTIVE_NOT_SUPPORTED'],
        stages,
        false,
      );
    }
    stages.push({
      stage: 'atomic_write',
      pass: true,
      detail: 'NO_EFFECTIVE_SIDE_EFFECT',
    });
    stages.push({
      stage: 'audit',
      pass: true,
      detail: 'stub_recorded',
    });
    return finish(command, 'NO_EFFECT', ['NO_EFFECTIVE_SIDE_EFFECT'], stages, false);
  }

  // compensation_auth_gate
  const gateOpen = isCompensationExecAuthorized();
  const execOk = gateOpen && !shadowOnly;
  stages.push({
    stage: 'compensation_auth_gate',
    pass: true, // gate check always runs; failure changes outcome not stage crash
    detail: execOk
      ? 'EXEC_AUTHORIZED'
      : gateOpen
        ? 'SHADOW_ONLY_NO_WRITE'
        : UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON,
  });

  // Layer 1: transaction abort — no compensating write
  if (command.layer === 'TRANSACTION_ABORT') {
    stages.push({
      stage: 'authority',
      pass: command.authorityVerdict === 'ALLOW',
      detail: command.authorityVerdict,
    });
    if (command.authorityVerdict !== 'ALLOW') {
      return finish(
        command,
        'REJECTED',
        [...command.authorityReasonCodes, 'AUTHORITY_DENIED'],
        stages,
        false,
      );
    }
    stages.push({
      stage: 'audit',
      pass: Boolean(command.audit.tripId && command.audit.requestedAt),
      detail: 'pre_effective_abort',
    });
    return finish(
      command,
      'ABORTED_PRE_EFFECTIVE',
      ['TRANSACTION_ABORT'],
      stages,
      false,
    );
  }

  // Layer 2: post-effective compensating write
  // authority
  const authPass = command.authorityVerdict === 'ALLOW';
  stages.push({
    stage: 'authority',
    pass: authPass,
    detail: command.authorityVerdict,
  });
  if (!authPass) {
    return finish(
      command,
      'REJECTED',
      [...command.authorityReasonCodes, 'AUTHORITY_DENIED'],
      stages,
      false,
    );
  }

  // verification (optional token — if profile requires reverse write, recommend present)
  const verifyPass = true;
  stages.push({
    stage: 'verification',
    pass: verifyPass,
    detail: command.verificationToken ? 'token_present' : 'token_optional_shadow',
  });

  // idempotency before OCC
  if (opts.priorCompensationApplied) {
    stages.push({
      stage: 'idempotency',
      pass: true,
      detail: 'ALREADY_APPLIED',
    });
    stages.push({
      stage: 'occ',
      pass: true,
      detail: 'skipped_after_idempotent_hit',
    });
    stages.push({
      stage: 'atomic_write',
      pass: true,
      detail: 'no_write_replay',
    });
    stages.push({
      stage: 'audit',
      pass: true,
      detail: 'idempotent_replay',
    });
    return finish(command, 'ALREADY_APPLIED', ['ALREADY_APPLIED'], stages, false);
  }
  stages.push({
    stage: 'idempotency',
    pass: Boolean(command.compensationIdempotencyKey?.trim()),
    detail: 'key_ok',
  });
  if (!command.compensationIdempotencyKey?.trim()) {
    return finish(command, 'REJECTED', ['IDEMPOTENCY_KEY_MISSING'], stages, false);
  }

  // OCC against current version — conflict if changed since expected
  const occ = evaluateAtomicOccDecision({
    idempotencyKey: command.compensationIdempotencyKey,
    prior: null,
    expected: command.expectedCurrentVersion,
    observed: command.observedCurrentVersion,
  });
  const occPass = occ.decision === 'PROCEED';
  stages.push({
    stage: 'occ',
    pass: occPass,
    detail: occ.decision,
  });
  if (occ.decision === 'VERSION_CONFLICT') {
    return finish(
      command,
      'COMPENSATION_CONFLICT',
      ['COMPENSATION_CONFLICT', ...occ.reasonCodes],
      stages,
      false,
    );
  }
  if (occ.decision !== 'PROCEED' && occ.decision !== 'ALREADY_APPLIED') {
    return finish(command, 'REJECTED', occ.reasonCodes, stages, false);
  }

  // Internal targets must be in profile
  const disallowed = command.reverseDiff.internalTargets.filter(
    (t) => !profile.internalReverseTargets.includes(t),
  );
  if (disallowed.length) {
    return finish(
      command,
      'REJECTED',
      disallowed.map((t) => `TARGET_NOT_IN_PROFILE:${t}`),
      stages,
      false,
    );
  }

  // atomic_write — only if exec authorized and not shadow
  if (!execOk) {
    stages.push({
      stage: 'atomic_write',
      pass: true,
      detail: 'SHADOW_OR_GATE_CLOSED_NO_WRITE',
    });
    stages.push({
      stage: 'audit',
      pass: true,
      detail: 'decision_only',
    });
    const blockReasons = gateOpen
      ? (['SHADOW_ONLY_NO_WRITE', 'WOULD_APPLY_IF_NOT_SHADOW'] as const)
      : ([UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON, 'WOULD_APPLY_IF_AUTHORIZED'] as const);
    return finish(
      command,
      'NOT_AUTHORIZED',
      [...blockReasons],
      stages,
      false,
    );
  }

  stages.push({
    stage: 'atomic_write',
    pass: true,
    detail: 'COMPENSATION_WRITE',
  });
  stages.push({
    stage: 'audit',
    pass: true,
    detail: 'compensation_applied',
  });
  return finish(command, 'COMPENSATION_APPLIED', ['COMPENSATION_APPLIED'], stages, true);
}

function finish(
  command: CompensationCommand,
  outcome: CompensationOutcome,
  reasonCodes: string[],
  stages: CompensationDecision['stages'][number][],
  writesPerformed: boolean,
): CompensationDecision {
  return {
    schemaId: 'tripnara.compensation_decision@v1',
    outcome,
    reasonCodes,
    corridor: command.corridor,
    layer: command.layer,
    writesPerformed,
    stages,
  };
}
