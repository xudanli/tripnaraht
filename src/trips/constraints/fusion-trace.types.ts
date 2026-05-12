/**
 * Fusion trace SSOT（避免 constraint-fusion ↔ unified-execution 循环依赖）
 */

export interface SlotConstraintFusionTraceV0 {
  readonly fusionVersion: '1';
  readonly blockedSlots: ReadonlyArray<{
    readonly slotId: string;
    readonly blockingDomains: readonly string[];
    readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
    readonly riskScore: number;
  }>;
  readonly hasMultiDomainHardConflict: boolean;
}
