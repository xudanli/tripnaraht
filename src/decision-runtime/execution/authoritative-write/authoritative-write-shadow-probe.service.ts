import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { AuthoritativeWriteCommand, AuthoritativeWriteCorridorId } from './authoritative-write.types';
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
import {
  evaluateAtomicOccDecision,
  type OccDecision,
} from './expected-write-version';
import { reconcileShadowWithLegacy } from './shadow-reconcile.util';

export type ShadowCaptureToken = {
  id: string;
  corridor: AuthoritativeWriteCorridorId;
  mode: ResolvedCorridorWriteMode;
  command: AuthoritativeWriteCommand;
  /** Pre-write OCC decision using expected vs observed captured before legacy write */
  preWriteOcc: OccDecision | null;
  capturedAt: string;
  writesPerformed: false;
};

export type ShadowProbeAuditEntry = {
  corridor: AuthoritativeWriteCorridorId;
  mode: ResolvedCorridorWriteMode;
  report: ShadowValidateReport | null;
  diff: ShadowReconcileDiff | null;
  preWriteOcc?: OccDecision | null;
  capturePhase?: 'begin' | 'complete' | 'legacy_compat';
  skipped?: string;
  error?: string;
  at: string;
};

const AUDIT_CAP = 200;
const auditRing: ShadowProbeAuditEntry[] = [];
const openCaptures = new Map<string, ShadowCaptureToken>();

export function getShadowProbeAuditEntries(): readonly ShadowProbeAuditEntry[] {
  return auditRing;
}

export function clearShadowProbeAuditEntries(): void {
  auditRing.length = 0;
  openCaptures.clear();
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
 * UWC-1c: beginCapture BEFORE legacy write; completeCapture AFTER.
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

  /**
   * Pre-legacy-write: capture expected/observed versions + run shadow gates / OCC.
   * Returns null when DISABLED / hard-blocked.
   */
  beginCapture(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
  ): ShadowCaptureToken | null {
    try {
      return this.beginCaptureUnsafe(corridor, legacyRequest);
    } catch (err) {
      this.logger.warn(
        `UWC beginCapture failed corridor=${corridor}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Post-legacy-write: reconcile with legacy outcome. Still zero UWC writes.
   */
  completeCapture(
    token: ShadowCaptureToken | null,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry | null {
    if (!token) return null;
    try {
      return this.completeCaptureUnsafe(token, legacySnapshot);
    } catch (err) {
      this.logger.warn(
        `UWC completeCapture failed corridor=${token.corridor}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /** @deprecated Prefer beginCapture + completeCapture. Kept for one-shot probes in tests. */
  probeActionsCommit(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probeOneShot('ACTIONS_COMMIT', legacyRequest, legacySnapshot);
  }

  probeItineraryAdjust(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probeOneShot('ITINERARY_ADJUST', legacyRequest, legacySnapshot);
  }

  probeUnifiedExecute(
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    return this.probeOneShot('UNIFIED_EXECUTE', legacyRequest, legacySnapshot);
  }

  private probeOneShot(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    const before = getShadowProbeAuditEntries().length;
    const token = this.beginCapture(corridor, legacyRequest);
    if (!token) {
      const last = getShadowProbeAuditEntries()[getShadowProbeAuditEntries().length - 1];
      if (last && last.corridor === corridor && getShadowProbeAuditEntries().length > before) {
        return last;
      }
      return this.skippedEntry(corridor, 'PROBE_FAILED');
    }
    return (
      this.completeCapture(token, legacySnapshot) ??
      this.skippedEntry(corridor, 'PROBE_FAILED')
    );
  }

  safeProbe(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
    legacySnapshot?: LegacyWriteSnapshot,
  ): void {
    try {
      const token = this.beginCapture(corridor, legacyRequest);
      this.completeCapture(token, legacySnapshot);
    } catch (err) {
      this.logger.warn(
        `UWC shadow probe failed corridor=${corridor}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private beginCaptureUnsafe(
    corridor: AuthoritativeWriteCorridorId,
    legacyRequest: Record<string, unknown>,
  ): ShadowCaptureToken | null {
    const mode = resolveCorridorWriteMode(corridor);
    const at = new Date().toISOString();

    if (mode.authoritativeHardBlocked) {
      pushAudit({
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: mode.blockReason,
        capturePhase: 'begin',
        at,
      });
      return null;
    }
    if (mode.effective === 'DISABLED') {
      pushAudit({
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: 'DISABLED',
        capturePhase: 'begin',
        at,
      });
      return null;
    }
    if (mode.effective === 'AUTHORITATIVE') {
      pushAudit({
        corridor,
        mode,
        report: null,
        diff: null,
        skipped: 'AUTHORITATIVE_NOT_ENABLED_IN_PROBE',
        capturePhase: 'begin',
        at,
      });
      return null;
    }

    const handler = this.registry.get(corridor);
    const command = handler.buildCommand(legacyRequest);
    const report = handler.shadowValidate(command);
    if (report.writesPerformed !== false) {
      throw new Error('UWC shadow invariant violated: writesPerformed must be false');
    }

    const preWriteOcc =
      command.observedWriteVersion != null
        ? evaluateAtomicOccDecision({
            idempotencyKey: command.idempotency.key,
            prior: null,
            expected: command.expectedWriteVersion,
            observed: command.observedWriteVersion,
          })
        : null;

    const token: ShadowCaptureToken = {
      id: `cap_${corridor}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      corridor,
      mode,
      command,
      preWriteOcc,
      capturedAt: at,
      writesPerformed: false,
    };
    openCaptures.set(token.id, token);

    pushAudit({
      corridor,
      mode,
      report,
      diff: null,
      preWriteOcc,
      capturePhase: 'begin',
      at,
    });

    return token;
  }

  private completeCaptureUnsafe(
    token: ShadowCaptureToken,
    legacySnapshot?: LegacyWriteSnapshot,
  ): ShadowProbeAuditEntry {
    openCaptures.delete(token.id);
    const handler = this.registry.get(token.corridor);
    const report = handler.shadowValidate(token.command);
    const diff = legacySnapshot
      ? reconcileShadowWithLegacy(report, legacySnapshot)
      : null;

    const entry: ShadowProbeAuditEntry = {
      corridor: token.corridor,
      mode: token.mode,
      report,
      diff,
      preWriteOcc: token.preWriteOcc,
      capturePhase: 'complete',
      at: new Date().toISOString(),
    };
    pushAudit(entry);

    if (diff && !diff.match) {
      this.logger.debug(
        `UWC shadow diff corridor=${token.corridor} divergences=${diff.divergences.join(',')}`,
      );
    }
    return entry;
  }

  private skippedEntry(
    corridor: AuthoritativeWriteCorridorId,
    skipped: string,
  ): ShadowProbeAuditEntry {
    return {
      corridor,
      mode: resolveCorridorWriteMode(corridor),
      report: null,
      diff: null,
      skipped,
      at: new Date().toISOString(),
    };
  }
}

export function safeBeginItineraryAdjustCapture(
  legacyRequest: Record<string, unknown>,
): ShadowCaptureToken | null {
  try {
    const existing = getAuthoritativeWriteShadowProbe();
    if (existing) return existing.beginCapture('ITINERARY_ADJUST', legacyRequest);
    const registry = getOrCreateHandlerRegistry();
    const probe = new AuthoritativeWriteShadowProbeService(registry);
    return probe.beginCapture('ITINERARY_ADJUST', legacyRequest);
  } catch {
    return null;
  }
}

export function safeCompleteItineraryAdjustCapture(
  token: ShadowCaptureToken | null,
  legacySnapshot?: LegacyWriteSnapshot,
): void {
  try {
    const existing = getAuthoritativeWriteShadowProbe();
    if (existing) {
      existing.completeCapture(token, legacySnapshot);
      return;
    }
    if (!token) return;
    const registry = getOrCreateHandlerRegistry();
    const probe = new AuthoritativeWriteShadowProbeService(registry);
    probe.completeCapture(token, legacySnapshot);
  } catch {
    // never break legacy
  }
}

/** @deprecated use begin+complete */
export function safeProbeItineraryAdjustStandalone(
  legacyRequest: Record<string, unknown>,
  legacySnapshot?: LegacyWriteSnapshot,
): void {
  const token = safeBeginItineraryAdjustCapture(legacyRequest);
  safeCompleteItineraryAdjustCapture(token, legacySnapshot);
}
