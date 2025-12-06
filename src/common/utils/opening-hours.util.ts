// src/common/utils/opening-hours.util.ts
import { DateTime } from 'luxon';

export class OpeningHoursUtil {
  /**
   * 核心方法：检查店铺当前是否营业
   * @param hoursStr 营业时间字符串，例如 "09:00-22:00" 或 "18:00-02:00"
   * @param timezone 店铺所在时区，例如 "Asia/Tokyo" (非常重要！)
   * @returns boolean
   */
  static isOpenNow(hoursStr: string, timezone: string = 'Asia/Tokyo'): boolean {
    if (!hoursStr || hoursStr === 'Closed') return false;
    if (hoursStr === '24 Hours' || hoursStr === '24/7') return true;

    // 1. 获取店铺当地的"当前时间"
    const now = DateTime.now().setZone(timezone);
    
    // 2. 解析营业时间字符串 (假设格式为 "HH:mm-HH:mm")
    // 实际抓取的数据可能很乱，这里针对最常见的 "Start-End" 格式
    const [startStr, endStr] = hoursStr.split('-');
    if (!startStr || !endStr) return false; // 格式无法解析

    const currentMinutes = now.hour * 60 + now.minute;
    const startMinutes = this.parseTimeToMinutes(startStr);
    let endMinutes = this.parseTimeToMinutes(endStr);

    // 3. 处理跨午夜逻辑 (例如 18:00 - 02:00)
    // 如果结束时间比开始时间小，说明跨到了第二天，给结束时间加 24小时
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60; // 02:00 (120) -> 26:00 (1560)
    }

    // 4. 特殊情况：如果现在是凌晨（比如 01:00），且店铺是跨午夜营业的
    // 我们需要把当前时间看作是"昨天的延续"，即当前时间 + 24小时
    let checkTime = currentMinutes;
    if (checkTime < startMinutes && endMinutes > 24 * 60) {
       // 比如现在是 01:00 (60)，店铺是 18:00(1080) - 26:00(1560)
       // 我们把 01:00 视为 25:00 (1500) 来比较
       checkTime += 24 * 60;
    }

    return checkTime >= startMinutes && checkTime <= endMinutes;
  }

  /**
   * 辅助：将 "09:30" 转换为分钟数 (570)
   */
  private static parseTimeToMinutes(timeStr: string): number {
    const cleanStr = timeStr.trim();
    // 处理各种格式: "09:30", "9:30 AM", "21:00"
    const parts = cleanStr.split(':');
    if (parts.length < 2) return 0;

    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1].split(' ')[0], 10) || 0;
    
    // 处理 AM/PM 格式
    const ampm = cleanStr.toUpperCase();
    if (ampm.includes('PM') && hours !== 12) {
      hours += 12;
    } else if (ampm.includes('AM') && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  /**
   * 从 metadata 中获取今天的营业时间字符串
   */
  static getTodayHours(metadata: any, timezone: string = 'Asia/Tokyo'): string {
    if (!metadata?.openingHours) return 'Closed';

    const now = DateTime.now().setZone(timezone);
    const dayKey = now.toFormat('ccc').toLowerCase(); // 'mon', 'tue', etc.

    const hours = metadata.openingHours[dayKey];
    if (hours) return hours;

    // 如果没有按天存储，尝试使用 weekday/weekend
    const isWeekend = now.weekday >= 6; // 6 = Saturday, 7 = Sunday
    return isWeekend 
      ? (metadata.openingHours.weekend || 'Closed')
      : (metadata.openingHours.weekday || 'Closed');
  }

  /**
   * 检查指定时间点是否营业
   * 
   * 用于行程项创建时的智能校验
   * 
   * @param hoursStr 营业时间字符串，例如 "09:00-22:00" 或 "18:00-02:00"
   * @param checkDate 要检查的日期时间（Date 对象）
   * @param timezone 店铺所在时区，例如 "Asia/Tokyo"
   * @returns boolean - true 表示在指定时间营业
   */
  static isOpenAt(hoursStr: string, checkDate: Date, timezone: string = 'Asia/Tokyo'): boolean {
    if (!hoursStr || hoursStr === 'Closed') return false;
    if (hoursStr === '24 Hours' || hoursStr === '24/7') return true;

    // 1. 将检查时间转换为店铺当地时区
    const checkDateTime = DateTime.fromJSDate(checkDate).setZone(timezone);
    
    // 2. 获取星期几的键（mon, tue, wed...）
    const dayKey = checkDateTime.toFormat('ccc').toLowerCase();
    
    // 3. 解析营业时间字符串
    const [startStr, endStr] = hoursStr.split('-');
    if (!startStr || !endStr) return false; // 格式无法解析

    const checkMinutes = checkDateTime.hour * 60 + checkDateTime.minute;
    const startMinutes = this.parseTimeToMinutes(startStr);
    let endMinutes = this.parseTimeToMinutes(endStr);

    // 4. 处理跨午夜逻辑
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    // 5. 处理凌晨时段的跨午夜情况
    let checkTime = checkMinutes;
    if (checkTime < startMinutes && endMinutes > 24 * 60) {
      checkTime += 24 * 60;
    }

    return checkTime >= startMinutes && checkTime <= endMinutes;
  }

  /**
   * 从 metadata 中获取指定日期的营业时间字符串
   * 
   * @param metadata 地点元数据
   * @param checkDate 要检查的日期
   * @param timezone 时区
   * @returns 营业时间字符串
   */
  static getHoursForDate(metadata: any, checkDate: Date, timezone: string = 'Asia/Tokyo'): string {
    if (!metadata?.openingHours) return 'Closed';

    const checkDateTime = DateTime.fromJSDate(checkDate).setZone(timezone);
    const dayKey = checkDateTime.toFormat('ccc').toLowerCase(); // 'mon', 'tue', etc.

    const hours = metadata.openingHours[dayKey];
    if (hours) return hours;

    // 如果没有按天存储，尝试使用 weekday/weekend
    const isWeekend = checkDateTime.weekday >= 6; // 6 = Saturday, 7 = Sunday
    return isWeekend 
      ? (metadata.openingHours.weekend || 'Closed')
      : (metadata.openingHours.weekday || 'Closed');
  }
}

