export interface AffectedSlotRef {
  day: number;
  slot: string;
}

export type ImpactSeverity = 'low' | 'medium' | 'high';

export interface ImpactAnalysisResult {
  affectedSlots: AffectedSlotRef[];
  /** 同日后续时段 + 后续日（局部重规划窗口） */
  downstreamSlots: AffectedSlotRef[];
  impactType: ImpactSeverity;
  reason: string;
  constraintsBroken?: string[];
}
