// src/planning-policy/interfaces/transit-segment.interface.ts

/**
 * 交通方式
 */
export type TransitMode = 'WALK' | 'BUS' | 'SUBWAY' | 'TAXI' | 'TRAIN' | 'FERRY';

/**
 * 交通段结构（路径边）
 * 
 * 包含一段路径的完整信息，用于计算代价
 */
export interface TransitSegment {
  /** 交通方式 */
  mode: TransitMode;
  /** 预计时长（分钟） */
  durationMin: number;
  /** 步行时间（分钟，包含站内步行） */
  walkMin: number;
  /** 换乘次数 */
  transferCount: number;

  // 可达性关键（P0：没有这些，LIMITED/ACTIVE_SENIOR 落不了地）
  /** 楼梯段数 */
  stairsCount?: number;
  /** 是否有电梯 */
  elevatorAvailable?: boolean;
  /** 是否轮椅可达 */
  wheelchairAccessible?: boolean;

  // 动态因素（用于蒙特卡洛）
  /** 拥挤等级（0低~3高） */
  crowdLevel?: 0 | 1 | 2 | 3;
  /** 可靠性（0~1，越低越不稳） */
  reliability?: number;
  /** 费用（元） */
  costCny?: number;
}
