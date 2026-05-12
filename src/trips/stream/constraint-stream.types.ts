/**
 * Constraint stream — raw ingress + normalized continuous updates
 */

export type RoadAccessStatus = 'OPEN' | 'IMPASSABLE' | 'ADVISORY' | 'UNKNOWN';

export type SlotRoadMask = Readonly<Record<string, RoadAccessStatus>>;

export type BookingLifecycleStatus = 'CONFIRMED' | 'CANCELLED' | 'PENDING';

export interface RoadState {
  readonly roadId: string;
  readonly status: RoadAccessStatus;
  readonly updatedAt: number;
}

export interface POIState {
  readonly poiId: string;
  /** POI 可达性等业务快照（由 normalizer 写入） */
  readonly reachable: boolean;
  readonly updatedAt: number;
}

export interface SlotConstraintState {
  readonly slotId: string;
  /** 用于增量 diff 的确定性摘要（非日志） */
  readonly constraintFingerprint: string;
  readonly updatedAt: number;
  /** 与该槽位相关的路网状态合并（多事件流式叠加） */
  readonly roadMask?: SlotRoadMask;
  readonly bookingStatus?: BookingLifecycleStatus;
  readonly poiReachable?: boolean;
  /** 天气切片聚合键（简化） */
  readonly weatherAnchor?: string;
}

/** 原始域事件（流入口）；可由网关按 topic 映射而来 */
export type RawConstraintEvent =
  | RawRoadConstraintEvent
  | RawWeatherConstraintEvent
  | RawBookingConstraintEvent;

export interface RawRoadConstraintEvent {
  readonly kind: 'ROAD';
  readonly roadId: string;
  readonly status: RoadAccessStatus;
  /** epoch ms */
  readonly at: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /**
   * 由上游 Trip Impact / 绑定图解析的受影响槽位；缺省时 normalizer 输出空数组。
   */
  readonly affectedSlotIds?: readonly string[];
}

export interface RawWeatherConstraintEvent {
  readonly kind: 'WEATHER';
  readonly at: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly affectedSlotIds: readonly string[];
  /** 可选：按日聚合键 */
  readonly date?: string;
}

export interface RawBookingConstraintEvent {
  readonly kind: 'BOOKING';
  readonly at: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly slotId: string;
  readonly bookingStatus: BookingLifecycleStatus;
}

/**
 * 归一化后的约束更新（写入 ConstraintStateStore 的单条命令）
 */
export interface NormalizedConstraintEvent {
  readonly id: string;
  readonly at: number;
  readonly domain: 'ROAD' | 'WEATHER' | 'BOOKING';
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly affectedSlotIds: readonly string[];
  readonly roads?: ReadonlyArray<{
    readonly roadId: string;
    readonly status: RoadAccessStatus;
  }>;
  readonly poi?: { readonly poiId: string; readonly reachable: boolean };
  readonly booking?: {
    readonly slotId: string;
    readonly bookingStatus: BookingLifecycleStatus;
  };
  readonly weatherDate?: string;
}

export interface ConstraintDiff {
  readonly changedSlots: readonly string[];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly requiresReplan: boolean;
  readonly isMeaningfulChange: boolean;
}
