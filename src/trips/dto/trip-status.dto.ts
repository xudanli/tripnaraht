// src/trips/dto/trip-status.dto.ts
/**
 * 行程状态枚举
 * 
 * - PLANNING: 规划中（行程尚未开始）
 * - IN_PROGRESS: 进行中（行程正在进行）
 * - COMPLETED: 已完成（行程已结束）
 * - CANCELLED: 已取消（行程被取消）
 */
export enum TripStatus {
  PLANNING = 'PLANNING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
