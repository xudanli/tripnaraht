/**
 * Nara Trust Map — 研究用户对不同 Decision 类型的信任结构。
 * V1.1 应优先优化：用户价值高但当前信任不足的决策区（非能力缺失最多处）。
 */

export const NARA_TRUST_MAP_SCHEMA = 'nara.trust_map@v1' as const;

export type TrustDecisionBand =
  | 'FACT_QUERY'
  | 'LIGHT_ADJUST'
  | 'EXPERIENCE_CHOICE'
  | 'LODGING_ROUTE_TRADEOFF'
  | 'HIGH_COST_DECISION'
  | 'LIVE_EXECUTION_JUDGMENT'
  | 'SAFETY_RELATED';

export type TrustLevel =
  | 'VERY_HIGH'
  | 'HIGH'
  | 'MID_HIGH'
  | 'MEDIUM'
  | 'CAUTIOUS'
  | 'EVIDENCE_DEPENDENT'
  | 'HIGH_BAR';

export type TrustMapCellV1 = {
  band: TrustDecisionBand;
  trustLevel: TrustLevel;
  /** 0–1 观测到的托付意愿 */
  observedWillingness: number;
  /** 用户价值（战略优先级输入） */
  userValue: number;
  noteZh?: string;
};

export type NaraTrustMapV1 = {
  schemaId: typeof NARA_TRUST_MAP_SCHEMA;
  version: 1;
  cells: TrustMapCellV1[];
  /** 高价值但信任不足 → V1.1 更可能的优化区 */
  highValueLowTrustBands: TrustDecisionBand[];
  optimizeTrustGapNotMaxCapabilityGap: true;
  reasonsZh: string[];
};

const DEFAULT_SEED: TrustMapCellV1[] = [
  {
    band: 'FACT_QUERY',
    trustLevel: 'VERY_HIGH',
    observedWillingness: 0.92,
    userValue: 0.7,
    noteZh: '事实查询 — 很愿意交给 Nara',
  },
  {
    band: 'LIGHT_ADJUST',
    trustLevel: 'HIGH',
    observedWillingness: 0.8,
    userValue: 0.75,
    noteZh: '轻量调整 — 较高',
  },
  {
    band: 'EXPERIENCE_CHOICE',
    trustLevel: 'MID_HIGH',
    observedWillingness: 0.72,
    userValue: 0.8,
    noteZh: '体验选择 — 中高',
  },
  {
    band: 'LODGING_ROUTE_TRADEOFF',
    trustLevel: 'MEDIUM',
    observedWillingness: 0.58,
    userValue: 0.85,
    noteZh: '住宿/路线 Tradeoff — 中等',
  },
  {
    band: 'HIGH_COST_DECISION',
    trustLevel: 'CAUTIOUS',
    observedWillingness: 0.45,
    userValue: 0.9,
    noteZh: '高成本决策 — 较谨慎',
  },
  {
    band: 'LIVE_EXECUTION_JUDGMENT',
    trustLevel: 'EVIDENCE_DEPENDENT',
    observedWillingness: 0.55,
    userValue: 0.88,
    noteZh: '实时执行判断 — 取决于 Evidence',
  },
  {
    band: 'SAFETY_RELATED',
    trustLevel: 'HIGH_BAR',
    observedWillingness: 0.35,
    userValue: 0.95,
    noteZh: '安全相关决策 — 高门槛',
  },
];

/**
 * 由观测 willingness 覆盖种子图；高价值低信任带优先标出。
 */
export function buildNaraTrustMap(input?: {
  cells?: TrustMapCellV1[];
  highValueThreshold?: number;
  lowTrustWillingness?: number;
}): NaraTrustMapV1 {
  const cells = input?.cells ?? DEFAULT_SEED;
  const hv = input?.highValueThreshold ?? 0.8;
  const lt = input?.lowTrustWillingness ?? 0.6;
  const highValueLowTrustBands = cells
    .filter((c) => c.userValue >= hv && c.observedWillingness < lt)
    .map((c) => c.band);

  return {
    schemaId: NARA_TRUST_MAP_SCHEMA,
    version: 1,
    cells,
    highValueLowTrustBands,
    optimizeTrustGapNotMaxCapabilityGap: true,
    reasonsZh: [
      '产品研究对象：为什么想到/没想到、相信/不相信、接受/自己决定、越来越依赖/开始忽略',
      highValueLowTrustBands.length
        ? `V1.1 候选优先信任缺口区: ${highValueLowTrustBands.join(',')}`
        : '暂无高价值低信任带（继续积累真实 Trip）',
    ],
  };
}
