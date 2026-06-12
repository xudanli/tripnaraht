/**
 * 订票优先级清单契约（tripnara.booking_priority_list@v1）
 *
 * 聚合 hard_booking POI 与交通插件提醒，输出可导出的结构化抢票/预约清单。
 */

export const BOOKING_PRIORITY_LIST_SCHEMA = 'tripnara.booking_priority_list@v1' as const;

export type BookingPriorityCategory =
  | 'ATTRACTION_TICKET'
  | 'TRANSPORT_FLIGHT'
  | 'SPECIAL_EXPERIENCE';

export type BookingPriorityUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface BookingPriorityItemTiming {
  /** 最晚预订建议截止日（ISO 8601 date or datetime） */
  bookByDate: string;
  /** 当地官方开抢时间点（如：提前30天上午10:00） */
  opensAtLocal?: string;
  /** 距离开抢/截止的动态秒数（相对 generatedAt 计算） */
  countdownSeconds: number;
}

export interface BookingPriorityActionPayload {
  officialBookingUrl: string;
  /** 避坑提示 HTML（可来自 poi-pitfall-cards） */
  bookingGuideHtml?: string;
  /** 一键同步到手机日历的 Deeplink，挂载抢票倒计时和备注 */
  calendarReminderDeeplink: string;
}

export interface BookingPriorityItem {
  id: string;
  category: BookingPriorityCategory;
  /** e.g. "卢浮宫门票预约" / "博斯普鲁斯海峡游船" */
  title: string;
  /** 关联的行程天数（1-based） */
  associatedDayNumber: number;
  urgencyLevel: BookingPriorityUrgency;

  timing: BookingPriorityItemTiming;
  actionPayload: BookingPriorityActionPayload;
}

export interface BookingPriorityList {
  schema: typeof BOOKING_PRIORITY_LIST_SCHEMA;
  tripId: string;
  generatedAt: string;
  items: BookingPriorityItem[];
}
