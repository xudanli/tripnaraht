// src/skills/exec/exec-remind.skill.ts
/**
 * skill.exec.remind
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Reminder, ReminderType } from './shared/execution-state.types';
import { PrismaService } from '../../prisma/prisma.service';
import { loadDetailTripData } from '../detail/utils/detail-data.util';

export interface ExecRemindInput extends SkillInput {
  tripId: string;
  currentDate: string;
  reminderTypes?: ReminderType[];
  advanceHours?: number;
}

export interface ExecRemindOutput extends SkillOutput {
  reminders: Reminder[];
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class ExecRemindSkill implements Skill<ExecRemindInput, ExecRemindOutput> {
  private readonly logger = new Logger(ExecRemindSkill.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  metadata = {
    name: 'exec.remind',
    description: '生成 exec 阶段管家式提醒（出发/入住/交通/天气/安全/预算）。在 trip 进入执行期或用户需要行前/行中提醒时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: ExecRemindInput): Promise<ExecRemindOutput> {
    this.logger.debug(`执行 exec.remind: tripId=${input.tripId}, currentDate=${input.currentDate}`);

    const advanceHours = input.advanceHours ?? 24;
    const currentDate = new Date(input.currentDate);
    const reminderTypes = input.reminderTypes ?? [
      'departure',
      'check_in',
      'activity_start',
      'transport',
      'weather',
      'safety',
      'budget',
    ];

    if (!this.prisma) {
      return {
        reminders: this.buildGenericReminders(reminderTypes, currentDate, advanceHours),
        degraded: true,
        degradedReason: 'PrismaService unavailable',
      };
    }

    const tripData = await loadDetailTripData(this.prisma, input.tripId);
    if (!tripData) {
      return {
        reminders: [],
        degraded: true,
        degradedReason: `Trip ${input.tripId} not found`,
      };
    }

    const reminders: Reminder[] = [];
    const windowEnd = new Date(currentDate);
    windowEnd.setHours(windowEnd.getHours() + advanceHours);

    for (const day of tripData.days) {
      const dayDate = new Date(day.date);
      if (dayDate < currentDate || dayDate > windowEnd) {
        continue;
      }

      for (const item of day.items) {
        if (!item.startTime) {
          continue;
        }
        const start = new Date(item.startTime);
        if (start < currentDate || start > windowEnd) {
          continue;
        }

        const triggerTime = new Date(start);
        triggerTime.setHours(triggerTime.getHours() - Math.min(advanceHours, 2));

        if (reminderTypes.includes('transport') && item.type === 'TRANSIT') {
          reminders.push({
            id: `reminder_${item.id}_transport`,
            type: 'transport',
            title: '交通提醒',
            message: `${item.name || '下一段交通'} 将于 ${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 开始，请预留转场时间。`,
            triggerTime: triggerTime.toISOString(),
            priority: 'high',
            relatedItemId: item.id,
          });
        }

        if (reminderTypes.includes('activity_start') && item.type === 'ACTIVITY') {
          reminders.push({
            id: `reminder_${item.id}_activity`,
            type: 'activity_start',
            title: '活动提醒',
            message: `${item.name || '活动'} 即将开始。`,
            triggerTime: triggerTime.toISOString(),
            priority: 'medium',
            relatedItemId: item.id,
          });
        }

        if (reminderTypes.includes('check_in') && item.type === 'REST') {
          reminders.push({
            id: `reminder_${item.id}_check_in`,
            type: 'check_in',
            title: '入住/休息提醒',
            message: `${item.name || '休息点'} 请按计划办理入住或休整。`,
            triggerTime: triggerTime.toISOString(),
            priority: 'medium',
            relatedItemId: item.id,
          });
        }
      }
    }

    if (reminderTypes.includes('departure') && tripData.startDate) {
      const tripStart = new Date(tripData.startDate);
      if (tripStart >= currentDate && tripStart <= windowEnd) {
        reminders.push({
          id: `reminder_${input.tripId}_departure`,
          type: 'departure',
          title: '出发提醒',
          message: `行程「${tripData.destination}」即将开始，请确认证件与行李。`,
          triggerTime: new Date(tripStart.getTime() - advanceHours * 3600_000).toISOString(),
          priority: 'high',
        });
      }
    }

    if (reminderTypes.includes('safety')) {
      reminders.push({
        id: `reminder_${input.tripId}_safety`,
        type: 'safety',
        title: '安全提醒',
        message: '请关注当地天气与路况，遵守法规。',
        triggerTime: currentDate.toISOString(),
        priority: 'high',
      });
    }

    if (reminderTypes.includes('weather')) {
      reminders.push({
        id: `reminder_${input.tripId}_weather`,
        type: 'weather',
        title: '天气提醒',
        message: `出发前请查看 ${tripData.destination} 天气预报。`,
        triggerTime: currentDate.toISOString(),
        priority: 'medium',
      });
    }

    if (reminderTypes.includes('budget')) {
      reminders.push({
        id: `reminder_${input.tripId}_budget`,
        type: 'budget',
        title: '预算提醒',
        message: '请对照行程项核对当日花费，避免超支。',
        triggerTime: currentDate.toISOString(),
        priority: 'low',
      });
    }

    return { reminders };
  }

  private buildGenericReminders(
    types: ReminderType[],
    currentDate: Date,
    advanceHours: number,
  ): Reminder[] {
    const targetDate = new Date(currentDate);
    targetDate.setHours(targetDate.getHours() + advanceHours);
    const reminders: Reminder[] = [];
    const push = (type: ReminderType, title: string, message: string, priority: Reminder['priority']) => {
      if (types.includes(type)) {
        reminders.push({
          id: `reminder_${Date.now()}_${type}`,
          type,
          title,
          message,
          triggerTime: targetDate.toISOString(),
          priority,
        });
      }
    };
    push('departure', '出发提醒', '您的行程即将开始，请确认已准备好所有必需品。', 'high');
    push('transport', '交通提醒', '请提前到达交通站点，预留充足时间。', 'high');
    push('safety', '安全提醒', '请注意安全，遵守当地法律法规。', 'high');
    return reminders;
  }
}
