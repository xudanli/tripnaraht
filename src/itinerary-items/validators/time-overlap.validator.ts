// src/itinerary-items/validators/time-overlap.validator.ts

import { Injectable } from '@nestjs/common';
import { BaseValidator } from './base.validator';
import { 
  ValidationCode, 
  ValidationSeverity, 
  ValidationResult, 
  ValidationContext 
} from '../interfaces/validation.interface';
import { DateTime } from 'luxon';

/**
 * 时间重叠校验器
 * 
 * 检测新行程项是否与同日现有行程项存在时间重叠
 * 严重程度：ERROR（必须阻止）
 */
@Injectable()
export class TimeOverlapValidator extends BaseValidator {
  getCode(): ValidationCode {
    return ValidationCode.TIME_OVERLAP;
  }

  getSeverity(): ValidationSeverity {
    return ValidationSeverity.ERROR;
  }

  async validate(context: ValidationContext): Promise<ValidationResult | null> {
    const { newItem, existingItems } = context;
    const newStart = DateTime.fromJSDate(newItem.startTime);
    const newEnd = DateTime.fromJSDate(newItem.endTime);

    for (const existing of existingItems) {
      const existStart = DateTime.fromJSDate(existing.startTime);
      const existEnd = DateTime.fromJSDate(existing.endTime);

      // 检查时间重叠：新项开始 < 现有结束 AND 新项结束 > 现有开始
      if (newStart < existEnd && newEnd > existStart) {
        // 计算重叠时间
        const overlapStart = newStart > existStart ? newStart : existStart;
        const overlapEnd = newEnd < existEnd ? newEnd : existEnd;
        const overlapMinutes = overlapEnd.diff(overlapStart, 'minutes').minutes;

        // 计算建议的开始时间（现有项结束 + 15分钟缓冲）
        const suggestedStart = existEnd.plus({ minutes: 15 });
        const duration = newEnd.diff(newStart, 'minutes').minutes;
        const suggestedEnd = suggestedStart.plus({ minutes: duration });

        const placeName = existing.place?.name || '未知活动';

        return this.fail(
          `时间冲突：与「${placeName}」(${existStart.toFormat('HH:mm')}-${existEnd.toFormat('HH:mm')}) 存在 ${Math.ceil(overlapMinutes)} 分钟重叠`,
          {
            conflictingItemId: existing.id,
            conflictingItemName: placeName,
            conflictingTimeRange: {
              start: existing.startTime.toISOString(),
              end: existing.endTime.toISOString(),
            },
            requestedTimeRange: {
              start: newItem.startTime.toISOString(),
              end: newItem.endTime.toISOString(),
            },
            overlapMinutes: Math.ceil(overlapMinutes),
            suggestedStartTime: suggestedStart.toISO(),
          },
          [
            {
              action: 'ADJUST_TIME',
              description: `将开始时间调整为 ${suggestedStart.toFormat('HH:mm')}，避免与「${placeName}」冲突`,
              suggestedValue: {
                startTime: suggestedStart.toISO() || undefined,
                endTime: suggestedEnd.toISO() || undefined,
              },
              estimatedImprovement: '消除时间重叠',
            },
          ]
        );
      }
    }

    return this.pass();
  }
}
