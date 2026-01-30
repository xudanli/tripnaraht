// src/trips/services/trip-insight.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import {
  TripInsightResponseDto,
  TripSummaryDto,
  FindingDto,
  FindingType,
  ReadinessSummaryDto,
  ReadinessStatus,
  OverallStatus,
} from '../dto/trip-insight.dto';

/**
 * 行程洞察服务
 * 
 * 负责生成行程洞察摘要，包括：
 * - 行程基本信息
 * - AI 发现的问题/建议
 * - 准备度摘要
 * - 整体状态
 */
@Injectable()
export class TripInsightService {
  private readonly logger = new Logger(TripInsightService.name);

  // 每天建议的最大景点数量
  private readonly MAX_PLACES_PER_DAY = 5;
  // 每天警告的景点数量阈值
  private readonly WARNING_PLACES_PER_DAY = 6;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取行程洞察摘要
   */
  async getInsight(tripId: string): Promise<TripInsightResponseDto> {
    // 1. 获取行程数据
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 2. 构建行程摘要
    const tripSummary = this.buildTripSummary(trip);

    // 3. 生成 AI 发现
    const findings = await this.generateFindings(trip);

    // 4. 获取准备度摘要
    const readiness = await this.getReadinessSummary(tripId, trip);

    // 5. 计算整体状态
    const overallStatus = this.calculateOverallStatus(findings, readiness);

    return {
      tripSummary,
      findings,
      readiness,
      overallStatus,
    };
  }

  /**
   * 构建行程基本信息摘要
   */
  private buildTripSummary(trip: any): TripSummaryDto {
    const startDate = trip.startDate ? DateTime.fromJSDate(trip.startDate) : null;
    const endDate = trip.endDate ? DateTime.fromJSDate(trip.endDate) : null;
    
    // 计算天数
    const days = startDate && endDate 
      ? Math.floor(endDate.diff(startDate, 'days').days) + 1
      : trip.TripDay.length;

    // 计算景点数量（去重，只统计有 Place 的活动类型项）
    const placeIds = new Set<string>();
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId && item.type === 'ACTIVITY') {
          placeIds.add(item.placeId);
        }
      }
    }

    // 获取目的地名称
    const destination = this.getDestinationName(trip.destination);

    return {
      destination,
      days,
      placesCount: placeIds.size,
      startDate: startDate ? startDate.toISODate()! : '',
      endDate: endDate ? endDate.toISODate()! : '',
    };
  }

  /**
   * 获取目的地名称（从国家代码转换）
   */
  private getDestinationName(countryCode: string): string {
    // 常见国家代码映射
    const countryNames: Record<string, string> = {
      'CN': '中国',
      'JP': '日本',
      'KR': '韩国',
      'TH': '泰国',
      'VN': '越南',
      'SG': '新加坡',
      'MY': '马来西亚',
      'ID': '印度尼西亚',
      'PH': '菲律宾',
      'US': '美国',
      'CA': '加拿大',
      'AU': '澳大利亚',
      'NZ': '新西兰',
      'GB': '英国',
      'FR': '法国',
      'DE': '德国',
      'IT': '意大利',
      'ES': '西班牙',
      'IS': '冰岛',
      'NO': '挪威',
      'SE': '瑞典',
      'FI': '芬兰',
      'DK': '丹麦',
      'CH': '瑞士',
      'AT': '奥地利',
      'NL': '荷兰',
      'BE': '比利时',
      'PT': '葡萄牙',
      'GR': '希腊',
      'TR': '土耳其',
      'AE': '阿联酋',
      'EG': '埃及',
      'ZA': '南非',
      'BR': '巴西',
      'AR': '阿根廷',
      'MX': '墨西哥',
      'IN': '印度',
      'RU': '俄罗斯',
    };

    return countryNames[countryCode?.toUpperCase()] || countryCode || '未知目的地';
  }

  /**
   * 生成 AI 发现
   */
  private async generateFindings(trip: any): Promise<FindingDto[]> {
    const findings: FindingDto[] = [];

    // 分析每天的行程
    for (let dayIndex = 0; dayIndex < trip.TripDay.length; dayIndex++) {
      const day = trip.TripDay[dayIndex];
      const dayNumber = dayIndex + 1;
      const activityItems = day.ItineraryItem.filter((item: any) => item.type === 'ACTIVITY');

      // 1. 检查每天景点数量
      if (activityItems.length >= this.WARNING_PLACES_PER_DAY) {
        findings.push({
          type: FindingType.WARNING,
          icon: 'clock',
          title: `Day ${dayNumber} 安排较紧凑`,
          message: `第${dayNumber}天安排了 ${activityItems.length} 个景点，可能需要更多休息时间`,
          actionLabel: `优化 Day ${dayNumber}`,
          actionPrompt: `帮我优化第${dayNumber}天的行程，适当减少景点或调整顺序`,
        });
      }

      // 2. 检查是否有连续的长途交通
      const transitItems = day.ItineraryItem.filter((item: any) => item.type === 'TRANSIT');
      let totalTransitMinutes = 0;
      for (const transit of transitItems) {
        if (transit.startTime && transit.endTime) {
          const start = DateTime.fromJSDate(transit.startTime);
          const end = DateTime.fromJSDate(transit.endTime);
          totalTransitMinutes += end.diff(start, 'minutes').minutes;
        }
      }

      if (totalTransitMinutes > 180) { // 超过 3 小时
        findings.push({
          type: FindingType.SUGGESTION,
          icon: 'route',
          title: `Day ${dayNumber} 交通时间较长`,
          message: `第${dayNumber}天交通时间约 ${Math.round(totalTransitMinutes / 60)} 小时，建议调整路线顺序`,
          actionLabel: '优化路线',
          actionPrompt: `帮我优化第${dayNumber}天的路线顺序，减少交通时间`,
        });
      }
    }

    // 3. 检查相邻天的路线是否有绕路
    const routeOptimizationFinding = this.checkRouteOptimization(trip);
    if (routeOptimizationFinding) {
      findings.push(routeOptimizationFinding);
    }

    // 4. 检查节奏是否合理
    const pacingFinding = this.checkPacing(trip);
    if (pacingFinding) {
      findings.push(pacingFinding);
    }

    // 5. 如果没有问题，添加正面反馈
    if (findings.length === 0) {
      findings.push({
        type: FindingType.POSITIVE,
        icon: 'check',
        title: '行程安排合理',
        message: '整体节奏良好，景点安排适中',
        actionLabel: null,
        actionPrompt: null,
      });
    }

    // 限制最多返回 5 条发现
    return findings.slice(0, 5);
  }

  /**
   * 检查路线是否有优化空间
   */
  private checkRouteOptimization(trip: any): FindingDto | null {
    // 简化实现：检查是否有连续两天的路线可能存在绕路
    // 实际应该使用地理位置计算
    
    if (trip.TripDay.length < 2) {
      return null;
    }

    // 获取每天的第一个和最后一个景点位置
    const dayLocations: Array<{ first: any; last: any }> = [];
    
    for (const day of trip.TripDay) {
      const activities = day.ItineraryItem.filter((item: any) => 
        item.type === 'ACTIVITY' && item.Place
      );
      
      if (activities.length > 0) {
        dayLocations.push({
          first: activities[0].Place,
          last: activities[activities.length - 1].Place,
        });
      }
    }

    // 检查相邻天是否有绕路（简化：检查最后一个景点到下一天第一个景点的距离）
    for (let i = 0; i < dayLocations.length - 1; i++) {
      const currentDay = dayLocations[i];
      const nextDay = dayLocations[i + 1];
      
      if (currentDay.last?.location && nextDay.first?.location) {
        // 这里应该计算实际距离，简化版只检查是否有数据
        // 如果有更完整的路线数据，可以做更精确的判断
      }
    }

    // 暂时返回 null，需要更多数据支持
    return null;
  }

  /**
   * 检查节奏是否合理
   */
  private checkPacing(trip: any): FindingDto | null {
    // 获取节奏配置
    const pacingConfig = trip.pacingConfig as any;
    
    // 计算每天的活动数量
    const dailyActivityCounts = trip.TripDay.map((day: any) => 
      day.ItineraryItem.filter((item: any) => item.type === 'ACTIVITY').length
    );

    // 计算平均值和标准差
    const avg = dailyActivityCounts.reduce((a: number, b: number) => a + b, 0) / dailyActivityCounts.length;
    const variance = dailyActivityCounts.reduce((sum: number, count: number) => 
      sum + Math.pow(count - avg, 2), 0
    ) / dailyActivityCounts.length;
    const stdDev = Math.sqrt(variance);

    // 如果标准差小，说明节奏比较均匀
    if (stdDev < 1.5 && avg <= this.MAX_PLACES_PER_DAY) {
      // 根据节奏配置判断是否符合偏好
      const style = pacingConfig?.style || 'balanced';
      
      if (style === 'relaxed' && avg <= 3) {
        return {
          type: FindingType.POSITIVE,
          icon: 'check',
          title: '节奏合理',
          message: '整体节奏符合「轻松」偏好设定',
          actionLabel: null,
          actionPrompt: null,
        };
      } else if (style === 'balanced' && avg <= 4) {
        return {
          type: FindingType.POSITIVE,
          icon: 'check',
          title: '节奏均衡',
          message: '整体节奏符合「均衡」偏好设定',
          actionLabel: null,
          actionPrompt: null,
        };
      }
    }

    // 如果节奏不均匀，给出建议
    if (stdDev > 2) {
      const maxDay = dailyActivityCounts.indexOf(Math.max(...dailyActivityCounts)) + 1;
      const minDay = dailyActivityCounts.indexOf(Math.min(...dailyActivityCounts)) + 1;
      
      return {
        type: FindingType.SUGGESTION,
        icon: 'balance',
        title: '行程节奏不均',
        message: `第${maxDay}天活动较多，第${minDay}天较少，建议平衡调整`,
        actionLabel: '平衡节奏',
        actionPrompt: `帮我平衡行程节奏，把第${maxDay}天的部分活动调整到第${minDay}天`,
      };
    }

    return null;
  }

  /**
   * 获取准备度摘要
   * 
   * 基于行程数据估算准备度状态
   */
  private async getReadinessSummary(_tripId: string, trip: any): Promise<ReadinessSummaryDto> {
    // 基于行程数据估算准备度
    return this.estimateReadiness(trip);
  }

  /**
   * 基于行程数据估算准备度
   */
  private estimateReadiness(trip: any): ReadinessSummaryDto {
    let blockers = 0;
    let must = 0;  // 🆕 统一字段命名
    let should = 0;  // 🆕 统一字段命名

    // 检查各种潜在问题
    
    // 1. 检查是否有日期信息
    if (!trip.startDate || !trip.endDate) {
      blockers++;
    }

    // 2. 检查每天的行程密度
    for (const day of trip.TripDay) {
      const activityCount = day.ItineraryItem.filter((item: any) => 
        item.type === 'ACTIVITY'
      ).length;
      
      if (activityCount > 8) {
        must++;  // 🆕 高密度行程 → must
      } else if (activityCount > 6) {
        should++;  // 🆕 中等密度 → should
      }
    }

    // 3. 检查是否有缺失的景点信息
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.type === 'ACTIVITY' && !item.placeId) {
          should++;  // 🆕 缺失信息 → should
        }
      }
    }

    // 4. 检查预算配置
    const budgetConfig = trip.budgetConfig as any;
    if (!budgetConfig?.totalBudget) {
      should++;  // 🆕 预算缺失 → should
    }

    // 确定状态
    let status: ReadinessStatus;
    if (blockers > 0) {
      status = ReadinessStatus.BLOCK;
    } else if (must > 0) {
      status = ReadinessStatus.WARN;
    } else {
      status = ReadinessStatus.PASS;
    }

    return {
      status,
      blockers,
      must,  // 🆕 统一字段命名
      should: Math.min(should, 10),  // 🆕 统一字段命名，限制最大数量
      // 向后兼容：保留旧字段
      warnings: must,
      suggestions: Math.min(should, 10),
    };
  }

  /**
   * 计算整体状态
   */
  private calculateOverallStatus(
    findings: FindingDto[],
    readiness: ReadinessSummaryDto
  ): OverallStatus {
    // 如果有阻塞项，状态为 has_issues
    if (readiness.status === ReadinessStatus.BLOCK) {
      return OverallStatus.HAS_ISSUES;
    }

    // 如果有警告类型的发现或准备度警告，状态为 needs_attention
    const hasWarningFinding = findings.some(f => f.type === FindingType.WARNING);
    if (hasWarningFinding || readiness.status === ReadinessStatus.WARN) {
      return OverallStatus.NEEDS_ATTENTION;
    }

    // 否则状态为 good
    return OverallStatus.GOOD;
  }
}
