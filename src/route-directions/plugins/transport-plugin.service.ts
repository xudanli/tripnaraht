// src/route-directions/plugins/transport-plugin.service.ts
/**
 * Transport Mode Plugin Service
 * 
 * 交通模式插件：检查 requiredModes（ferry/boat/flight/rail）
 * 输出：预订提醒 + 时间窗口 + 备选交通策略（Neptune 可用）
 * 
 * 特别适合：NZ Milford、挪威峡湾、斯瓦尔巴出海
 */

import { Injectable, Logger } from '@nestjs/common';
import { RouteDirectionRecommendation } from '../services/route-direction-selector.service';
import { TripPlan, PlanDay } from '../../trips/decision/plan-model';
import { TransportModeRequirement, RouteDirectionExtensions } from '../interfaces/route-direction-extensions.interface';

export type TransportMode = 'ferry' | 'boat' | 'flight' | 'rail' | 'bus' | 'drive';

export interface TransportBookingReminder {
  mode: TransportMode;
  title: string; // 预订提醒标题
  description: string; // 详细描述
  urgency: 'low' | 'medium' | 'high' | 'critical'; // 紧急程度
  timeWindow: {
    recommendedDaysAhead: number; // 建议提前预订天数
    bookingDeadline?: string; // 预订截止日期（ISO 格式）
    seasonality?: {
      peakMonths?: number[]; // 旺季月份（需要更早预订）
      offPeakMonths?: number[]; // 淡季月份
    };
  };
  bookingInfo?: {
    operator?: string; // 运营商
    bookingLink?: string; // 预订链接
    estimatedCost?: {
      min: number;
      max: number;
      currency: string;
    };
    frequency?: string; // 班次频率（如 "daily", "3x/week"）
    duration?: string; // 预计时长（如 "2 hours", "1 day"）
  };
  alternativeStrategies?: TransportAlternativeStrategy[]; // 备选交通策略
}

export interface TransportAlternativeStrategy {
  strategy: 'replace_mode' | 'replace_activity' | 'adjust_schedule' | 'split_day';
  description: string; // 策略描述
  impact: 'low' | 'medium' | 'high'; // 对行程的影响
  feasibility: 'easy' | 'moderate' | 'difficult'; // 可行性
  details?: {
    alternativeMode?: TransportMode; // 替代交通模式
    alternativeActivity?: string; // 替代活动
    scheduleAdjustment?: string; // 日程调整说明
  };
}

export interface TransportChecklist {
  reminders: TransportBookingReminder[];
  summary: {
    totalReminders: number;
    criticalReminders: number;
    estimatedBookingDaysAhead: number; // 最早需要提前预订的天数
    unavailableModes?: TransportMode[]; // 不可用的交通模式
  };
  alternativeStrategies: TransportAlternativeStrategy[]; // 所有备选策略
  neptuneActions?: {
    action: 'REPLACE_MODE' | 'REPLACE_ACTIVITY' | 'ADJUST_SCHEDULE' | 'SPLIT_DAY';
    reason: string;
    details: any;
  }[]; // Neptune 可用的修复动作
}

@Injectable()
export class TransportPluginService {
  private readonly logger = new Logger(TransportPluginService.name);

  /**
   * 生成交通模式检查清单
   */
  generateChecklist(
    routeDirection: RouteDirectionRecommendation,
    itineraryDraft?: TripPlan,
    availableModes?: TransportMode[], // 可用的交通模式（从外部系统获取）
    userBookingStatus?: {
      ferryBooked?: boolean;
      flightBooked?: boolean;
      railBooked?: boolean;
    }
  ): TransportChecklist {
    const rd = routeDirection.routeDirection as any;
    const extensions = (rd.metadata?.extensions || {}) as RouteDirectionExtensions;
    const transport = extensions.transport;
    const countryCode = rd.countryCode || '';

    const reminders: TransportBookingReminder[] = [];
    const alternativeStrategies: TransportAlternativeStrategy[] = [];
    const unavailableModes: TransportMode[] = [];

    // 1. 检查必需的交通模式
    if (transport?.requiredModes && transport.requiredModes.length > 0) {
      for (const requirement of transport.requiredModes) {
        if (!requirement.required) continue;

        const mode = requirement.mode as TransportMode;
        
        // 检查是否可用
        const isAvailable = availableModes ? availableModes.includes(mode) : true;
        if (!isAvailable) {
          unavailableModes.push(mode);
        }

        // 检查用户是否已预订
        const isBooked = this.checkBookingStatus(mode, userBookingStatus);

        // 生成预订提醒
        const reminder = this.createBookingReminder(
          mode,
          requirement,
          countryCode,
          isAvailable,
          isBooked
        );

        if (reminder) {
          reminders.push(reminder);

          // 如果不可用或未预订，生成备选策略
          if (!isAvailable || !isBooked) {
            const strategies = this.generateAlternativeStrategies(
              mode,
              requirement,
              countryCode,
              itineraryDraft
            );
            alternativeStrategies.push(...strategies);
          }
        }
      }
    }

    // 2. 检查可选的交通模式（如果有特殊要求）
    if (transport?.optionalModes && transport.optionalModes.length > 0) {
      for (const requirement of transport.optionalModes) {
        if (requirement.required) {
          // 虽然是 optional，但 marked as required
          const mode = requirement.mode as TransportMode;
          const reminder = this.createBookingReminder(
            mode,
            requirement,
            countryCode,
            true,
            false
          );
          if (reminder) {
            reminders.push(reminder);
          }
        }
      }
    }

    // 3. 生成 Neptune 修复动作
    const neptuneActions = this.generateNeptuneActions(
      unavailableModes,
      alternativeStrategies,
      reminders
    );

    // 4. 计算摘要
    const summary = {
      totalReminders: reminders.length,
      criticalReminders: reminders.filter(r => r.urgency === 'critical' || r.urgency === 'high').length,
      estimatedBookingDaysAhead: Math.max(...reminders.map(r => r.timeWindow.recommendedDaysAhead), 0),
      unavailableModes: unavailableModes.length > 0 ? unavailableModes : undefined,
    };

    return {
      reminders,
      summary,
      alternativeStrategies,
      neptuneActions,
    };
  }

  /**
   * 创建预订提醒
   */
  private createBookingReminder(
    mode: TransportMode,
    requirement: TransportModeRequirement,
    countryCode: string,
    isAvailable: boolean,
    isBooked: boolean
  ): TransportBookingReminder | null {
    const config = this.getModeConfig(mode, countryCode);

    if (!config) {
      return null;
    }

    return {
      mode,
      title: config.title,
      description: isBooked
        ? `${config.title}已预订。`
        : isAvailable
          ? `${config.title}需要提前预订。${config.description}`
          : `${config.title}当前不可用。建议使用备选方案。`,
      urgency: isBooked
        ? 'low'
        : !isAvailable
          ? 'critical'
          : config.urgency,
      timeWindow: {
        recommendedDaysAhead: config.recommendedDaysAhead,
        bookingDeadline: config.bookingDeadline,
        seasonality: config.seasonality,
      },
      bookingInfo: {
        operator: requirement.hints?.operator || config.operator,
        bookingLink: requirement.hints?.bookingLink || config.bookingLink,
        estimatedCost: config.estimatedCost,
        frequency: requirement.hints?.frequency || config.frequency,
        duration: requirement.hints?.duration || config.duration,
      },
      alternativeStrategies: !isAvailable || !isBooked
        ? this.generateAlternativeStrategies(mode, requirement, countryCode)
        : undefined,
    };
  }

  /**
   * 生成备选策略
   */
  private generateAlternativeStrategies(
    mode: TransportMode,
    requirement: TransportModeRequirement,
    countryCode: string,
    itineraryDraft?: TripPlan
  ): TransportAlternativeStrategy[] {
    const strategies: TransportAlternativeStrategy[] = [];

    // 1. 替换交通模式
    const alternativeMode = this.getAlternativeMode(mode, countryCode);
    if (alternativeMode) {
      strategies.push({
        strategy: 'replace_mode',
        description: `使用${this.getModeName(alternativeMode)}替代${this.getModeName(mode)}`,
        impact: 'medium',
        feasibility: 'moderate',
        details: {
          alternativeMode,
        },
      });
    }

    // 2. 替换活动
    const alternativeActivity = this.getAlternativeActivity(mode, countryCode);
    if (alternativeActivity) {
      strategies.push({
        strategy: 'replace_activity',
        description: `改为${alternativeActivity}，无需${this.getModeName(mode)}`,
        impact: 'high',
        feasibility: 'easy',
        details: {
          alternativeActivity,
        },
      });
    }

    // 3. 调整日程
    strategies.push({
      strategy: 'adjust_schedule',
      description: `调整日程，避开${this.getModeName(mode)}的依赖`,
      impact: 'low',
      feasibility: 'moderate',
      details: {
        scheduleAdjustment: '重新安排活动顺序，使用其他交通方式',
      },
    });

    // 4. 拆分日程
    if (mode === 'ferry' || mode === 'boat') {
      strategies.push({
        strategy: 'split_day',
        description: '将行程拆分为两天，使用陆路交通',
        impact: 'medium',
        feasibility: 'moderate',
        details: {
          scheduleAdjustment: '增加一天行程，使用陆路替代水路',
        },
      });
    }

    return strategies;
  }

  /**
   * 生成 Neptune 修复动作
   */
  private generateNeptuneActions(
    unavailableModes: TransportMode[],
    alternativeStrategies: TransportAlternativeStrategy[],
    reminders: TransportBookingReminder[]
  ): TransportChecklist['neptuneActions'] {
    const actions: TransportChecklist['neptuneActions'] = [];

    // 如果有不可用的模式，生成 REPLACE_MODE 动作
    for (const mode of unavailableModes) {
      const strategy = alternativeStrategies.find(s => 
        s.strategy === 'replace_mode' && s.details?.alternativeMode
      );
      if (strategy) {
        actions.push({
          action: 'REPLACE_MODE',
          reason: `${this.getModeName(mode)}不可用`,
          details: {
            originalMode: mode,
            alternativeMode: strategy.details?.alternativeMode,
          },
        });
      }
    }

    // 如果有替换活动的策略，生成 REPLACE_ACTIVITY 动作
    const replaceActivityStrategy = alternativeStrategies.find(s => 
      s.strategy === 'replace_activity'
    );
    if (replaceActivityStrategy) {
      actions.push({
        action: 'REPLACE_ACTIVITY',
        reason: '交通模式不可用，建议替换活动',
        details: {
          alternativeActivity: replaceActivityStrategy.details?.alternativeActivity,
        },
      });
    }

    // 如果有调整日程的策略，生成 ADJUST_SCHEDULE 动作
    const adjustScheduleStrategy = alternativeStrategies.find(s => 
      s.strategy === 'adjust_schedule'
    );
    if (adjustScheduleStrategy) {
      actions.push({
        action: 'ADJUST_SCHEDULE',
        reason: '需要调整日程以避开不可用的交通模式',
        details: {
          scheduleAdjustment: adjustScheduleStrategy.details?.scheduleAdjustment,
        },
      });
    }

    return actions.length > 0 ? actions : undefined;
  }

  /**
   * 检查预订状态
   */
  private checkBookingStatus(
    mode: TransportMode,
    userBookingStatus?: {
      ferryBooked?: boolean;
      flightBooked?: boolean;
      railBooked?: boolean;
    }
  ): boolean {
    if (!userBookingStatus) return false;

    switch (mode) {
      case 'ferry':
      case 'boat':
        return userBookingStatus.ferryBooked || false;
      case 'flight':
        return userBookingStatus.flightBooked || false;
      case 'rail':
        return userBookingStatus.railBooked || false;
      default:
        return false;
    }
  }

  /**
   * 获取交通模式配置
   */
  private getModeConfig(
    mode: TransportMode,
    countryCode: string
  ): {
    title: string;
    description: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    recommendedDaysAhead: number;
    bookingDeadline?: string;
    seasonality?: {
      peakMonths?: number[];
      offPeakMonths?: number[];
    };
    operator?: string;
    bookingLink?: string;
    estimatedCost?: {
      min: number;
      max: number;
      currency: string;
    };
    frequency?: string;
    duration?: string;
  } | null {
    const configs: Record<string, Record<string, any>> = {
      'NZ': {
        ferry: {
          title: 'Milford Sound 渡轮',
          description: 'Milford Sound 是新西兰最著名的峡湾，需要提前预订渡轮票。',
          urgency: 'high',
          recommendedDaysAhead: 30,
          seasonality: {
            peakMonths: [12, 1, 2], // 夏季旺季
            offPeakMonths: [6, 7, 8], // 冬季淡季
          },
          operator: 'Real Journeys',
          bookingLink: 'https://www.realjourneys.co.nz',
          estimatedCost: { min: 80, max: 150, currency: 'NZD' },
          frequency: 'multiple daily',
          duration: '2-3 hours',
        },
      },
      'NO': {
        ferry: {
          title: '挪威峡湾渡轮',
          description: '挪威峡湾渡轮是探索峡湾的主要方式，旺季需要提前预订。',
          urgency: 'high',
          recommendedDaysAhead: 21,
          seasonality: {
            peakMonths: [6, 7, 8],
            offPeakMonths: [12, 1, 2],
          },
          operator: 'Fjord1',
          bookingLink: 'https://www.fjord1.no',
          estimatedCost: { min: 200, max: 500, currency: 'NOK' },
          frequency: 'multiple daily',
          duration: '1-4 hours',
        },
      },
      'SJ': { // Svalbard
        boat: {
          title: '斯瓦尔巴出海',
          description: '斯瓦尔巴出海需要提前预订，受天气影响较大。',
          urgency: 'critical',
          recommendedDaysAhead: 60,
          seasonality: {
            peakMonths: [6, 7, 8],
            offPeakMonths: [12, 1, 2, 3],
          },
          operator: 'Svalbard Travel',
          bookingLink: 'https://www.svalbardtravel.com',
          estimatedCost: { min: 1000, max: 3000, currency: 'NOK' },
          frequency: 'daily (weather permitting)',
          duration: 'full day',
        },
      },
    };

    return configs[countryCode]?.[mode] || null;
  }

  /**
   * 获取替代交通模式
   */
  private getAlternativeMode(mode: TransportMode, countryCode: string): TransportMode | null {
    const alternatives: Record<string, Record<string, TransportMode | null>> = {
      ferry: {
        'NZ': 'drive', // Milford Sound 可以开车绕行
        'NO': 'drive', // 挪威峡湾可以开车
        default: 'bus',
      },
      boat: {
        'SJ': null, // 斯瓦尔巴出海没有替代
        default: 'ferry',
      },
      flight: {
        default: 'rail',
      },
      rail: {
        default: 'bus',
      },
    };

    return alternatives[mode]?.[countryCode] || alternatives[mode]?.default || null;
  }

  /**
   * 获取替代活动
   */
  private getAlternativeActivity(mode: TransportMode, countryCode: string): string | null {
    const alternatives: Record<string, Record<string, string | null>> = {
      ferry: {
        'NZ': 'Te Anau 湖游船或 Doubtful Sound 陆路探索',
        'NO': '峡湾观景台或陆路探索',
        default: '陆路替代活动',
      },
      boat: {
        'SJ': null, // 斯瓦尔巴出海没有替代
        default: '陆路替代活动',
      },
      flight: {
        default: '使用其他交通方式',
      },
      rail: {
        default: '使用巴士或自驾',
      },
    };

    return alternatives[mode]?.[countryCode] || alternatives[mode]?.default || null;
  }

  /**
   * 获取交通模式名称
   */
  private getModeName(mode: TransportMode): string {
    const names: Record<TransportMode, string> = {
      ferry: '渡轮',
      boat: '出海',
      flight: '航班',
      rail: '铁路',
      bus: '巴士',
      drive: '自驾',
    };
    return names[mode] || mode;
  }
}

