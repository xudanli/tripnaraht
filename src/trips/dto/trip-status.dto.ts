// src/trips/dto/trip-status.dto.ts
/**
 * 行程状态枚举
 *
 * Lifecycle States (Trip Lifecycle Runtime):
 * - DRAFT: 草稿（行程刚创建，未公开）
 * - RECRUITING: 招募中（寻找同行成员）
 * - FORMING: 预成团（确认成员与基本规则）
 * - PLANNING: 规划中（生成可执行旅行方案）
 * - TRAVELING: 旅行中（行程正在进行）
 * - COMPLETED: 已完成（行程已结束）
 * - CANCELLED: 已取消（行程被取消）
 *
 * Legacy Compatibility:
 * - IN_PROGRESS: 已废弃，映射到 TRAVELING（保留用于数据库兼容）
 */
export enum TripStatus {
  DRAFT = 'DRAFT',
  RECRUITING = 'RECRUITING',
  FORMING = 'FORMING',
  PLANNING = 'PLANNING',
  TRAVELING = 'TRAVELING',
  IN_PROGRESS = 'IN_PROGRESS', // @deprecated - use TRAVELING instead
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * 将旧状态映射到新状态（用于向后兼容）
 */
export function normalizeTripStatus(status: string | null): TripStatus {
  if (!status) return TripStatus.DRAFT;

  // IN_PROGRESS 映射到 TRAVELING
  if (status === TripStatus.IN_PROGRESS) {
    return TripStatus.TRAVELING;
  }

  // 如果已经是有效的新状态，直接返回
  if (Object.values(TripStatus).includes(status as TripStatus)) {
    return status as TripStatus;
  }

  // 默认返回 DRAFT
  return TripStatus.DRAFT;
}
