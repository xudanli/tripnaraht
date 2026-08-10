/**
 * P0 — Policy for high-risk direct plan mutations.
 *
 * When EFFECTIVE_PLAN_WRITE_CHAIN is on (default in production):
 * - PROPOSAL_ONLY / LEGACY_CLOSED / ADMIN_ONLY / BLOCK entries are gated here.
 * Escape: platform ADMIN/OPERATOR roles, or P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS=1.
 */

import { BadRequestException } from '@nestjs/common';
import { hasAdminPlatformAccess } from '../../auth/platform-roles';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import {
  buildEffectivePlanWriteChainBadRequestBody,
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
} from './effective-plan-write-chain-blocked.util';
import { getWriteEntryById } from './write-entry-registry';
import type { WriteEntryDisposition } from './write-entry-registry.types';

export type P0BypassContext = {
  entryId: string;
  /** JWT / resolved platform roles */
  roles?: string[];
  /** True when already inside EffectivePlanWriteGuard.runWithAuthority */
  hasWriteAuthority?: boolean;
};

function isAdminBypassEnvEnabled(): boolean {
  const v = process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isGuideLegacyAcceptEnvEnabled(): boolean {
  const v = process.env.GUIDE_LEGACY_ACCEPT?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Master kill-switch for P0 gates (tests / emergency). Default: follow write chain. */
export function isP0DirectPlanMutationEnforced(): boolean {
  const raw = process.env.P0_DIRECT_PLAN_MUTATION_POLICY?.trim().toUpperCase();
  if (raw === 'OFF') return false;
  if (raw === 'ENFORCE' || raw === 'ON') return true;
  return isEffectivePlanWriteChainEnabled();
}

export function canUseAdminDirectPlanMutationBypass(roles?: string[]): boolean {
  if (isAdminBypassEnvEnabled()) return true;
  return hasAdminPlatformAccess(roles);
}

function dispositionMessage(
  entryId: string,
  disposition: WriteEntryDisposition,
): string {
  switch (disposition) {
    case 'PROPOSAL_ONLY':
      return `Direct mutation blocked (${entryId}): use proposal → apply under EffectivePlanWriter`;
    case 'LEGACY_CLOSED':
      return `Legacy path closed (${entryId}): use canonical Guide accept / formal write chain`;
    case 'ADMIN_ONLY':
      return `Direct mutation admin-only (${entryId}): use DecisionCore apply, or Internal Admin bypass`;
    case 'BLOCK':
      return `Mutation blocked (${entryId})`;
    case 'REQUIRE_GUARD':
      return `Plan mutation requires write authority (${entryId})`;
    default:
      return `Plan mutation gated (${entryId})`;
  }
}

/**
 * Enforce P0 disposition for a registered write entry.
 * No-op when P0 policy is OFF or entry is FORMAL_CHAIN / ALLOW_METADATA.
 */
export function assertP0WriteEntryAllowed(ctx: P0BypassContext): void {
  if (!isP0DirectPlanMutationEnforced()) return;

  const entry = getWriteEntryById(ctx.entryId);
  if (!entry) {
    throw new BadRequestException(
      buildEffectivePlanWriteChainBadRequestBody(
        ctx.entryId,
        `Unknown write entry (${ctx.entryId}): register in WRITE_ENTRY_REGISTRY`,
      ),
    );
  }

  const { disposition } = entry;
  if (disposition === 'FORMAL_CHAIN' || disposition === 'ALLOW_METADATA') {
    return;
  }

  if (ctx.hasWriteAuthority) {
    return;
  }

  if (disposition === 'LEGACY_CLOSED') {
    if (isGuideLegacyAcceptEnvEnabled() && canUseAdminDirectPlanMutationBypass(ctx.roles)) {
      return;
    }
    throw new BadRequestException({
      ...buildEffectivePlanWriteChainBadRequestBody(
        ctx.entryId,
        dispositionMessage(ctx.entryId, disposition),
      ),
      disposition,
      code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    });
  }

  if (
    disposition === 'ADMIN_ONLY' ||
    disposition === 'PROPOSAL_ONLY' ||
    disposition === 'BLOCK'
  ) {
    if (
      disposition === 'ADMIN_ONLY' &&
      canUseAdminDirectPlanMutationBypass(ctx.roles)
    ) {
      return;
    }
    // PROPOSAL_ONLY and BLOCK never allow admin to skip into direct apply
    // except ADMIN_ONLY; for PROPOSAL_ONLY admin still must use proposal path
    // unless they set admin bypass env (ops escape).
    if (
      disposition === 'PROPOSAL_ONLY' &&
      canUseAdminDirectPlanMutationBypass(ctx.roles) &&
      isAdminBypassEnvEnabled()
    ) {
      return;
    }
    throw new BadRequestException({
      ...buildEffectivePlanWriteChainBadRequestBody(
        ctx.entryId,
        dispositionMessage(ctx.entryId, disposition),
      ),
      disposition,
      code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    });
  }

  if (disposition === 'REQUIRE_GUARD') {
    throw new BadRequestException({
      ...buildEffectivePlanWriteChainBadRequestBody(
        ctx.entryId,
        dispositionMessage(ctx.entryId, disposition),
      ),
      disposition,
      code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    });
  }
}

/** True when arrange/attraction direct commitMode must be rejected. */
export function isDirectCommitModeBlocked(roles?: string[]): boolean {
  if (!isP0DirectPlanMutationEnforced()) return false;
  if (canUseAdminDirectPlanMutationBypass(roles) && isAdminBypassEnvEnabled()) {
    return false;
  }
  return true;
}
