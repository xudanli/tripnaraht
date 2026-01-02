// src/common/utils/osm-opening-hours-parser.util.ts

import { PlaceMetadata } from '../../places/interfaces/place-metadata.interface';

/**
 * OSM opening_hours 解析器
 * 
 * 将 OSM 格式的 opening_hours 字符串转换为结构化的 openingHours 格式
 * 
 * 支持的格式：
 * - "Mo-Fr 09:00-18:00" - 周一到周五 9点到18点
 * - "Mo,Tu,We,Th,Fr 09:00-18:00" - 周一到周五
 * - "Mo-Fr 09:00-18:00; Sa 10:00-16:00" - 工作日和周六不同时间
 * - "24/7" - 全天开放
 * - "Mo-Su 08:00-20:00" - 每天
 * - "Mo-Fr 09:00-18:00; Sa-Su 10:00-16:00; PH off" - 包含节假日
 */
export class OsmOpeningHoursParser {
  /**
   * 解析 OSM opening_hours 字符串
   * 
   * @param osmHours OSM 格式的 opening_hours 字符串
   * @returns 结构化的 openingHours 对象，如果无法解析则返回 undefined
   */
  static parse(osmHours: string): PlaceMetadata['openingHours'] | undefined {
    if (!osmHours || typeof osmHours !== 'string') {
      return undefined;
    }

    const trimmed = osmHours.trim();
    if (!trimmed) {
      return undefined;
    }

    // 处理 24/7
    if (trimmed === '24/7' || trimmed.toLowerCase() === '24 hours') {
      return {
        weekday: '24 Hours',
        weekend: '24 Hours',
        mon: '24 Hours',
        tue: '24 Hours',
        wed: '24 Hours',
        thu: '24 Hours',
        fri: '24 Hours',
        sat: '24 Hours',
        sun: '24 Hours',
        osmFormat: trimmed,
      };
    }

    const result: PlaceMetadata['openingHours'] = {
      osmFormat: trimmed,
    };

    // 分割多个时间段（用分号分隔）
    const periods = trimmed.split(';').map(p => p.trim()).filter(p => p && !p.match(/^PH\s+(off|closed)$/i));

    for (const period of periods) {
      const parsed = this.parsePeriod(period);
      if (parsed) {
        // 合并到结果中
        Object.assign(result, parsed);
      }
    }

    // 如果没有解析到任何内容，返回 undefined
    if (!result.mon && !result.tue && !result.wed && !result.thu && !result.fri && !result.sat && !result.sun && !result.weekday && !result.weekend) {
      return undefined;
    }

    // 设置 weekday 和 weekend 的默认值（如果所有工作日相同）
    if (!result.weekday && result.mon && result.mon === result.tue && result.mon === result.wed && result.mon === result.thu && result.mon === result.fri) {
      result.weekday = result.mon;
    }

    if (!result.weekend && result.sat && result.sat === result.sun) {
      result.weekend = result.sat;
    }

    return result;
  }

  /**
   * 解析单个时间段（如 "Mo-Fr 09:00-18:00"）
   */
  private static parsePeriod(period: string): Partial<PlaceMetadata['openingHours']> | null {
    // 匹配格式：日期范围 时间范围
    // 例如：Mo-Fr 09:00-18:00
    const match = period.match(/^([^0-9]+)\s+(.+)$/);
    if (!match) {
      return null;
    }

    const daysStr = match[1].trim();
    const timeStr = match[2].trim();

    // 解析时间范围（如 "09:00-18:00"）
    const timeRange = this.parseTimeRange(timeStr);
    if (!timeRange) {
      return null;
    }

    // 解析日期范围
    const days = this.parseDays(daysStr);
    if (days.length === 0) {
      return null;
    }

    // 为每个日期设置时间
    const result: Partial<PlaceMetadata['openingHours']> = {};
    for (const day of days) {
      result[day] = timeRange;
    }

    return result;
  }

  /**
   * 解析日期范围字符串（如 "Mo-Fr", "Mo,Tu,We", "Sa-Su"）
   */
  private static parseDays(daysStr: string): Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> {
    const dayMap: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
      'mo': 'mon',
      'tu': 'tue',
      'we': 'wed',
      'th': 'thu',
      'fr': 'fri',
      'sa': 'sat',
      'su': 'sun',
    };

    const days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = [];
    const upper = daysStr.toUpperCase();

    // 处理范围（如 "Mo-Fr"）
    const rangeMatch = upper.match(/^([A-Z]{2})\s*-\s*([A-Z]{2})$/);
    if (rangeMatch) {
      const start = rangeMatch[1].toLowerCase();
      const end = rangeMatch[2].toLowerCase();
      
      if (dayMap[start] && dayMap[end]) {
        const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const startIndex = dayOrder.indexOf(dayMap[start]);
        const endIndex = dayOrder.indexOf(dayMap[end]);
        
        if (startIndex !== -1 && endIndex !== -1) {
          for (let i = startIndex; i <= endIndex; i++) {
            days.push(dayOrder[i] as any);
          }
        }
      }
      return days;
    }

    // 处理逗号分隔的列表（如 "Mo,Tu,We"）
    const parts = daysStr.split(',').map(p => p.trim().toLowerCase());
    for (const part of parts) {
      const day = dayMap[part];
      if (day && !days.includes(day)) {
        days.push(day);
      }
    }

    return days;
  }

  /**
   * 解析时间范围字符串（如 "09:00-18:00"）
   */
  private static parseTimeRange(timeStr: string): string | null {
    // 匹配格式：HH:mm-HH:mm
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (match) {
      const startHour = parseInt(match[1], 10);
      const startMin = parseInt(match[2], 10);
      const endHour = parseInt(match[3], 10);
      const endMin = parseInt(match[4], 10);

      if (startHour >= 0 && startHour < 24 && startMin >= 0 && startMin < 60 &&
          endHour >= 0 && endHour < 24 && endMin >= 0 && endMin < 60) {
        return `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      }
    }

    return null;
  }
}

