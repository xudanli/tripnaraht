// src/planning-policy/interfaces/rest-stop.interface.ts

/**
 * 站点类型
 */
export type StopKind = 'POI' | 'REST' | 'MEAL' | 'HOTEL' | 'TRANSFER';

/**
 * 休息点/回血点
 * 
 * 用于在行程中插入休息，恢复体力（HP）
 */
export interface RestStop {
  /** 休息点 ID */
  id: string;
  /** 类型（必须是 'REST'） */
  kind: 'REST';
  /** 名称 */
  name: string;
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 标签（cafe/park/bench/mall/lounge/toilet） */
  tags: string[];

  /** 休息收益（回血/舒适） */
  restBenefit: {
    /** 直接回血（绝对值） */
    regenHp: number;
    /** 舒适分（用于排序，越高越好） */
    comfortScore: number;
    /** 建议休息时长（分钟） */
    recommendedMin: number;
    /** 最短可用时长（分钟） */
    minMin: number;
  };

  /** 是否轮椅可达 */
  wheelchairAccess?: boolean;
  /** 附近是否有洗手间 */
  restroomNearby?: boolean;
  /** 是否有座位可用 */
  seatingAvailable?: boolean;
}
