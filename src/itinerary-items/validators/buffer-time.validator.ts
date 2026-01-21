// src/itinerary-items/validators/buffer-time.validator.ts

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
 * 缓冲时间校验器
 * 
 * 检测行程项之间的缓冲时间是否充足
 * 严重程度：INFO（仅提示，不阻止）
 */
@Injectable()
export class BufferTimeValidator extends BaseValidator {
  /** 最小建议缓冲时间（分钟） */
  private readonly MIN_BUFFER_MINUTES = 15;
  
  /** 建议缓冲时间（分钟） */
  private readonly RECOMMENDED_BUFFER_MINUTES = 30;

  getCode(): ValidationCode {
    return ValidationCode.SHORT_BUFFER;
  }

  getSeverity(): ValidationSeverity {
    return ValidationSeverity.INFO;
  }

  async validate(context: ValidationContext): Promise<ValidationResult | null> {
    const { newItem, previousItem } = context;

    // 如果没有前序行程项，跳过校验
    if (!previousItem) {
      return this.pass();
    }

    const prevEnd = DateTime.fromJSDate(previousItem.endTime);
    const newStart = DateTime.fromJSDate(newItem.startTime);
    const bufferMinutes = newStart.diff(prevEnd, 'minutes').minutes;

    // 如果缓冲时间小于最小值但大于0（不是重叠），给出提示
    if (bufferMinutes > 0 && bufferMinutes < this.MIN_BUFFER_MINUTES) {
      const prevName = previousItem.place?.name || '前一活动';
      const additionalBuffer = this.RECOMMENDED_BUFFER_MINUTES - bufferMinutes;
      
      return this.createResult(
        true, // INFO 级别不阻止操作
        `缓冲时间较短：与「${prevName}」仅间隔 ${Math.round(bufferMinutes)} 分钟，建议至少 ${this.RECOMMENDED_BUFFER_MINUTES} 分钟以应对意外延误`,
        {
          previousItemId: previousItem.id,
          previousItemName: prevName,
          bufferMinutes: Math.round(bufferMinutes),
          minBuffer: this.MIN_BUFFER_MINUTES,
          recommendedBuffer: this.RECOMMENDED_BUFFER_MINUTES,
        },
        [
          {
            action: 'ADD_BUFFER',
            description: `建议将开始时间延后 ${Math.ceil(additionalBuffer)} 分钟`,
            suggestedValue: {
              startTime: newStart.plus({ minutes: additionalBuffer }).toISO() || undefined,
            },
            estimatedImprovement: '降低因前一活动延误而导致整体行程混乱的风险',
          },
        ]
      );
    }

    return this.pass();
  }
}
