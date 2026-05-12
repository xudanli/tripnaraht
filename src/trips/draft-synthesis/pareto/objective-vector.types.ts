/**
 * 多目标决策空间：各维度已规范到「越高越好」（疲劳/风险为高表示更轻松/更安全）。
 */
export interface ObjectiveVector {
  satisfaction: number;
  efficiency: number;
  /** 成本友好度（越高表示预算压力越低 / 越省钱） */
  cost: number;
  /** 疲劳舒缓度（越高表示更轻松） */
  fatigue: number;
  experience: number;
  /** 风险可控度（越高表示绕行/跳点等风险更低） */
  risk: number;
}
