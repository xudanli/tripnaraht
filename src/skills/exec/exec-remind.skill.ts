// src/skills/exec/exec-remind.skill.ts
/**
 * skill.exec.remind
 * 
 * 目的：生成贴心管家式的提醒
 * 
 * System 1 技能：快速生成提醒
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Reminder, ReminderType } from './shared/execution-state.types';

export interface ExecRemindInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 当前日期 */
  currentDate: string; // ISO date
  
  /** 提醒类型（可选，如果不提供则生成所有相关提醒） */
  reminderTypes?: ReminderType[];
  
  /** 提前时间（小时，默认 24） */
  advanceHours?: number;
}

export interface ExecRemindOutput extends SkillOutput {
  /** 生成的提醒列表 */
  reminders: Reminder[];
}

@Injectable()
export class ExecRemindSkill implements Skill<ExecRemindInput, ExecRemindOutput> {
  private readonly logger = new Logger(ExecRemindSkill.name);

  metadata = {
    name: 'exec.remind',
    description: '生成贴心管家式的提醒（出发、入住、活动、交通、天气、安全、预算等）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: ExecRemindInput): Promise<ExecRemindOutput> {
    this.logger.debug(`执行 exec.remind: tripId=${input.tripId}, currentDate=${input.currentDate}`);

    try {
      const reminders: Reminder[] = [];
      const advanceHours = input.advanceHours || 24;
      const currentDate = new Date(input.currentDate);
      const targetDate = new Date(currentDate);
      targetDate.setHours(targetDate.getHours() + advanceHours);

      // 这里应该从数据库获取行程信息
      // 简化实现，实际应该查询 Trip 和 ItineraryItem
      
      const reminderTypes = input.reminderTypes || [
        'departure',
        'check_in',
        'activity_start',
        'transport',
        'weather',
        'safety',
        'budget',
      ];

      // 生成各类提醒（简化版）
      if (reminderTypes.includes('departure')) {
        reminders.push({
          id: `reminder_${Date.now()}_departure`,
          type: 'departure',
          title: '出发提醒',
          message: `您的行程即将开始，请确认已准备好所有必需品。`,
          triggerTime: targetDate.toISOString(),
          priority: 'high',
        });
      }

      if (reminderTypes.includes('check_in')) {
        reminders.push({
          id: `reminder_${Date.now()}_check_in`,
          type: 'check_in',
          title: '入住提醒',
          message: `请记得在指定时间办理入住手续。`,
          triggerTime: targetDate.toISOString(),
          priority: 'medium',
        });
      }

      if (reminderTypes.includes('activity_start')) {
        reminders.push({
          id: `reminder_${Date.now()}_activity`,
          type: 'activity_start',
          title: '活动提醒',
          message: `您有活动即将开始，请提前到达。`,
          triggerTime: targetDate.toISOString(),
          priority: 'medium',
        });
      }

      if (reminderTypes.includes('transport')) {
        reminders.push({
          id: `reminder_${Date.now()}_transport`,
          type: 'transport',
          title: '交通提醒',
          message: `请提前到达交通站点，预留充足时间。`,
          triggerTime: targetDate.toISOString(),
          priority: 'high',
        });
      }

      if (reminderTypes.includes('weather')) {
        reminders.push({
          id: `reminder_${Date.now()}_weather`,
          type: 'weather',
          title: '天气提醒',
          message: `请注意查看当地天气预报，做好相应准备。`,
          triggerTime: targetDate.toISOString(),
          priority: 'medium',
        });
      }

      if (reminderTypes.includes('safety')) {
        reminders.push({
          id: `reminder_${Date.now()}_safety`,
          type: 'safety',
          title: '安全提醒',
          message: `请注意安全，遵守当地法律法规。`,
          triggerTime: targetDate.toISOString(),
          priority: 'high',
        });
      }

      if (reminderTypes.includes('budget')) {
        reminders.push({
          id: `reminder_${Date.now()}_budget`,
          type: 'budget',
          title: '预算提醒',
          message: `请注意控制支出，避免超支。`,
          triggerTime: targetDate.toISOString(),
          priority: 'low',
        });
      }

      return {
        reminders,
      };
    } catch (error: any) {
      this.logger.error(`生成提醒失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
