import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';
import type {
  LegacyWriteSnapshot,
  ShadowReconcileDiff,
  ShadowValidateReport,
} from './corridor-handler.types';
import {
  AuthoritativeWriteHandlerRegistryService,
  getOrCreateHandlerRegistry,
  setHandlerRegistryForTests,
} from './corridor-handler.registry';
import {
  resolveCorridorWriteMode,
  type ResolvedCorridorWriteMode,
} from './corridor-write-mode.config';
import { reconcileShadowWithLegacy } from './shadow-reconcile.util';

export type ShadowProbeAuditEntry = {
  corridor: AuthoritativeWriteCorridorId;
  mode: ResolvedCorridorWriteMode;
  report: ShadowValidateReport | null;
  diff: ShadowReconcileDiff | null;
  skipped?: string;
  error?: string;
  at: string;
};

const AUDIT_CAP = 200;
const auditRing: ShadowProbeAuditEntry[] = [];

export function getShadowProbeAuditEntries(): readonly ShadowProbeAuditEntry[] {
  return auditRing;
}

export function clearShadowProbeAuditEntries(): void {
  auditRing.length = 0;
}

function pushAudit(entry: ShadowProbeAuditEntry): void {
  auditRing.push(entry);
  if (auditRing.length > AUDIT_CAP) auditRing.shift();
}

let probeSingleton: AuthoritativeWriteShadowProbeService | null = null;

export function getAuthoritativeWriteShadowProbe(): AuthoritativeWriteShadowProbeService | null {
  return probeSingleton;
}

export function setAuthoritativeWriteShadowProbeForTests(
  probe: AuthoritativeWriteShadowProbeService | null,
): void {
  probeSingleton = probe;
}

/**
 * Shadow probe — never mutates trip state.
 * Legacy HTTP remains the sole writer while mode === SHADOW_VALIDATE.
 */
@Injectable()
export class AuthoritativeWriteShadowProbeService implements OnModuleInit {
  private readonly logger = new Logger(AuthoritativeWriteShadowProbeService.name);

  constructor(
    private readonly registry: AuthoritativeWriteHandlerRegistryService,
  ) {}

  onModuleInit(): void {
    probeSingleton = this;
    setHandlerRegistryForTests(this.registry);
  }

  probeActionsCommit(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probe('ACTIONS_COMMIT', legacyRequest, legacySnapshot);
  }

  probeItineraryAdjust(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probe('ITINERARY_ADJUST', legacyRequest, legacySnapshot);
  }

  probeUnifiedExecute(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probe('UNIFIED_EXECUTE', legacyRequest, legacySnapshot);
  }

  /**
   * Safe fire-and-forget wrapper for legacy call sites — never throws to caller.
   */
  safeProbe(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): void {
    try {
      this.probe(corridor, legacyRequest, legacySnapshot);
    } catch (err) {
      this.logger.warn(
        `UWC shadow probe failed corridor=${corridor}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private probe(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    const mode = resolveCorridorWriteMode(corridor);
    const at = new Date().toISOString();

    if (mode.authoritativeHardBlocked) {
      const entry: ShadowProbeAuditEntry = {
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: mode.blockReason,
        at,
      };
      pushAudit(entry);
      return entry;
    }

    if (mode.effective === 'DISABLED') {
      const entry: ShadowProbeAuditEntry = {
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: 'DISABLED',
        at,
      };
      pushAudit(entry);
      return entry;
    }

    if (mode.effective === 'AUTHORITATIVE') {
      // Should be unreachable while UWC_1C_OCC_UNLOCKED=false
      const entry: ShadowProbeAuditEntry = {
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: 'AUTHORITATIVE_NOT_ENABLED_IN_PROBE',
        error: 'use legacy path; authoritative apply hard-blocked',
        at,
      };
      pushAudit(entry);
      return entry;
    }

    // SHADOW_VALIDATE
    const handler = this.registry.get(corridor);
    const command = handler.buildCommand(legacyRequest);
    const report = handler.shadowValidate(command);

    if (report.writesPerformed !== false) {
      throw new Error('UWC shadow invariant violated: writesPerformed must be false');
    }

    const diff = legacySnapshot
      ? reconcileShadowWithLegacy(report, legacySnapshot)
      : null;

    const entry: ShadowProbeAuditEntry = {
      corridor,
      mode,
      report,
      diff,
      at,
    };
    pushAudit(entry);

    if (diff && !diff.match) {
      this.logger.debug(
        `UWC shadow diff corridor=${corridor} divergences=${diff.divergences.join(',')}`,
      );
    }

    return entry;
  }
}

/** Util-path helper when Nest DI is unavailable. */
export function safeProbeItineraryAdjustStandalone(
  legacyRequest: Record<string, unknown>,
  legacySnapshot?: LegacyWriteSnapshot,
): void {
  try {
    const existing = getAuthoritativeWriteShadowProbe();
    if (existing) {
      existing.safeProbe('ITINERARY_ADJUST', legacyRequest, legacySnapshot);
      return;
    }
    const registry = getOrCreateHandlerRegistry();
    const probe = new AuthoritativeWriteShadowProbeService(registry);
    probe.safeProbe('ITINERARY_ADJUST', legacyRequest, legacySnapshot);
  } catch {
    // never break legacy apply
  }
}
