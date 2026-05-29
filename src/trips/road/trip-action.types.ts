/**
 * Trip repair intent — 不直接改 Plan，供 Repair / Neptune / Agent 消费
 */

/** 结构修复类（改日程/槽位） */
export type TripRepairAction =
  | { type: 'REMOVE_POI'; poiId: string }
  | { type: 'SHIFT_DAY'; dayId: string; deltaMinutes: number }
  | { type: 'REORDER_SLOT'; slotIds: string[] }
  | { type: 'MARK_INFEASIBLE'; poiId: string };

/**
 * 世界观测类（VOI）：不直接改 Plan，由 Decision OS / 编排层在 RESEARCH 等阶段作为一等步骤调度。
 * `estimatedCost01`：API / 时延 / 合规等综合成本，归一化到 [0,1]，供 VOI 与期望效用同扣减。
 */
export type TripObservationAction =
  | {
      type: 'OBSERVATION_SNS_CRAWL';
      center?: { lat: number; lng: number };
      radiusKm?: number;
      queryTerms?: string[];
      estimatedCost01?: number;
      rationale?: string;
    }
  | {
      type: 'OBSERVATION_POI_VERIFY';
      poiId: string;
      verifyChannels?: Array<'WEB' | 'PHONE' | 'OPERATOR_API'>;
      estimatedCost01?: number;
      rationale?: string;
    };

export type TripAction = TripRepairAction | TripObservationAction;
