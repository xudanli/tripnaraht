/**
 * Reality Read Audit — graded bypass logging for Snapshot governance.
 * Wire adapters when reading external world without snapshot binding.
 */

import type { Logger } from '@nestjs/common';
import { getRealityBypassEscalation } from './reality-enforcement.env';

export type RealityBypassSeverity = 'info' | 'warn' | 'error';

export class RealityBypassBlockedError extends Error {
  override readonly name = 'RealityBypassBlockedError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isRealityReadAuditEnabled(): boolean {
  const v = String(process.env.REALITY_READ_AUDIT ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Audit trail OR boundary mode — either enables graded bypass logs */
export function isRealityBypassLoggingEnabled(): boolean {
  if (isRealityReadAuditEnabled()) return true;
  const v = String(process.env.REALITY_READ_BOUNDARY ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

type LogLike = Pick<Logger, 'log' | 'warn' | 'error'> | {
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

const BYPASS_LOG_THROTTLE_MS = 15000;
const bypassLogThrottle = new Map<string, { at: number; suppressed: number }>();

/** Prefer Nest Logger; routes by severity (default warn). */
export function logRealityBypass(
  logger: LogLike,
  component: string,
  detail: string,
  severity: RealityBypassSeverity = 'warn',
): void {
  if (!isRealityBypassLoggingEnabled()) return;
  const escalation = getRealityBypassEscalation();
  let effective: RealityBypassSeverity = severity;
  if (escalation === 'error' || escalation === 'block') {
    effective = severity === 'info' ? 'warn' : 'error';
  }

  const throttleKey = `${effective}:${component}:${detail}`;
  const now = Date.now();
  const prev = bypassLogThrottle.get(throttleKey);
  if (prev && now - prev.at < BYPASS_LOG_THROTTLE_MS) {
    prev.suppressed += 1;
    return;
  }

  let suppressedSuffix = '';
  if (prev && prev.suppressed > 0) {
    suppressedSuffix = ` (suppressed ${prev.suppressed} similar in ${BYPASS_LOG_THROTTLE_MS / 1000}s)`;
  }
  bypassLogThrottle.set(throttleKey, { at: now, suppressed: 0 });

  const msg = `[REALITY_BYPASS][${effective.toUpperCase()}] ${component} ${detail}${suppressedSuffix}`;
  switch (effective) {
    case 'info':
      logger.log?.(msg);
      break;
    case 'error':
      logger.error?.(msg);
      break;
    default:
      logger.warn?.(msg);
  }
  /** BLOCK is enforced only via {@link assertRealityWorldReadAllowed} / {@link evaluateWorldRead} — single policy entry. */
}
