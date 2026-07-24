/**
 * Independent compensation execution gate (UWC-1d).
 * Orthogonal to AUTHORITATIVE write unlock and to corridor Shadow mode.
 */

export const UWC_1D_COMPENSATION_CONTRACT_COMPLETE = true as const;

/**
 * Explicit authorization to *execute* compensating writes.
 * Remains false after UWC-1d — Shadow / dry-run only until ops unlock.
 */
export const UWC_1D_COMPENSATION_EXEC_AUTHORIZED = false as const;

export const UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON =
  'COMPENSATION_EXEC_HARD_BLOCKED_PENDING_AUTH_GATE' as const;

export const UWC_COMPENSATION_AUTH_GATE_STATUS = {
  contractComplete: UWC_1D_COMPENSATION_CONTRACT_COMPLETE,
  execAuthorized: UWC_1D_COMPENSATION_EXEC_AUTHORIZED,
  mayExecuteWrites:
    UWC_1D_COMPENSATION_CONTRACT_COMPLETE && UWC_1D_COMPENSATION_EXEC_AUTHORIZED,
} as const;

export function isCompensationExecAuthorized(): boolean {
  return UWC_COMPENSATION_AUTH_GATE_STATUS.mayExecuteWrites;
}
