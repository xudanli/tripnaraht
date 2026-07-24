/**
 * Per-corridor Recovery Profile registry (UWC-1d).
 */

import { ACTIONS_ROLLBACK_PRODUCT_STATUS } from '../../../agent/contracts/rollback-corridor.product.constants';
import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';
import type {
  ExternalCompensationSurface,
  InternalReverseWriteTarget,
  RecoveryCapability,
  RecoveryLayer,
} from './recovery-contract.types';
import {
  EXTERNAL_COMPENSATION_SURFACES,
  INTERNAL_REVERSE_WRITE_TARGETS,
} from './recovery-contract.types';

export type CorridorRecoveryProfile = {
  corridor: AuthoritativeWriteCorridorId;
  /** Layers this corridor may use */
  layers: readonly RecoveryLayer[];
  capabilities: readonly RecoveryCapability[];
  internalReverseTargets: readonly InternalReverseWriteTarget[];
  /** All external surfaces are unsupported in 1d */
  externalCompensation: 'EXTERNAL_COMPENSATION_UNSUPPORTED';
  externalSurfaces: readonly ExternalCompensationSurface[];
  /** Product label linkage */
  productNotes: string;
};

export const CORRIDOR_RECOVERY_PROFILES: Record<
  AuthoritativeWriteCorridorId,
  CorridorRecoveryProfile
> = {
  ACTIONS_COMMIT: {
    corridor: 'ACTIONS_COMMIT',
    layers: ['TRANSACTION_ABORT'],
    capabilities: [
      'NO_EFFECTIVE_SIDE_EFFECT',
      'EXTERNAL_COMPENSATION_UNSUPPORTED',
    ],
    internalReverseTargets: [],
    externalCompensation: 'EXTERNAL_COMPENSATION_UNSUPPORTED',
    externalSurfaces: [...EXTERNAL_COMPENSATION_SURFACES],
    productNotes: `Actions rollback remains ${ACTIONS_ROLLBACK_PRODUCT_STATUS}; UWC marks NO_EFFECTIVE_SIDE_EFFECT — no compensating writes.`,
  },
  ITINERARY_ADJUST: {
    corridor: 'ITINERARY_ADJUST',
    layers: ['TRANSACTION_ABORT', 'POST_EFFECTIVE_COMPENSATING_WRITE'],
    capabilities: [
      'REVERSE_DIFF_INTERNAL',
      'EXTERNAL_COMPENSATION_UNSUPPORTED',
    ],
    internalReverseTargets: ['ItineraryItem', 'Trip'],
    externalCompensation: 'EXTERNAL_COMPENSATION_UNSUPPORTED',
    externalSurfaces: [...EXTERNAL_COMPENSATION_SURFACES],
    productNotes:
      'Post-effective recovery via reverse-diff on ItineraryItem/Trip revision chain — never restore old snapshot blob.',
  },
  UNIFIED_EXECUTE: {
    corridor: 'UNIFIED_EXECUTE',
    layers: ['TRANSACTION_ABORT', 'POST_EFFECTIVE_COMPENSATING_WRITE'],
    capabilities: [
      'REVERSE_DIFF_INTERNAL',
      'EXTERNAL_COMPENSATION_UNSUPPORTED',
    ],
    internalReverseTargets: ['PlanVersion', 'Trip', 'ItineraryItem'],
    externalCompensation: 'EXTERNAL_COMPENSATION_UNSUPPORTED',
    externalSurfaces: [...EXTERNAL_COMPENSATION_SURFACES],
    productNotes:
      'Compensating PlanVersion reverse-diff against current effective; parent pointer restore is a reverse-diff op, not snapshot replay.',
  },
};

export function getCorridorRecoveryProfile(
  corridor: AuthoritativeWriteCorridorId,
): CorridorRecoveryProfile {
  return CORRIDOR_RECOVERY_PROFILES[corridor];
}

export function assertsInternalTargetsAllowed(
  corridor: AuthoritativeWriteCorridorId,
  targets: readonly InternalReverseWriteTarget[],
): string[] {
  const profile = getCorridorRecoveryProfile(corridor);
  const allowed = new Set(profile.internalReverseTargets);
  return targets.filter((t) => !allowed.has(t)).map((t) => `TARGET_NOT_IN_PROFILE:${t}`);
}

export function listSupportedInternalTargets(): readonly InternalReverseWriteTarget[] {
  return INTERNAL_REVERSE_WRITE_TARGETS;
}
