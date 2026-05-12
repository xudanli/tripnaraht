/**
 * Global SPCL — aggregate shadow–execution error across requests before applying one ECPSθ update.
 *
 * Complements per-request `applySpclCalibration`; used for online batch learning without full offline trainer.
 */

/** Summary after merging a batch (audit / metrics). */
export interface GlobalSpclFlushSummary {
  sampleCount: number;
  /** True when buffer was cleared after merging non-trivial ε into bias. */
  applied: boolean;
}
