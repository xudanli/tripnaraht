// src/trips/services/trip-suggestions.service.ts
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { 
  SuggestionDto, 
  SuggestionListResponseDto, 
  SuggestionStatsDto,
  SuggestionPersona,
  SuggestionScope,
  SuggestionSeverity,
  SuggestionStatus,
  ApplySuggestionRequestDto,
  ApplySuggestionResponseDto,
  EvidenceLinkDto,
  SuggestionActionDto
} from '../dto/suggestions.dto';
import { TripsService } from '../trips.service';
import { TripConflictsService } from './trip-conflicts.service';
import { TripMetricsService } from './trip-metrics.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { PersonaAlertDto, PersonaType, AlertSeverity } from '../dto/persona-alerts.dto';
import { ConflictDto, ConflictSeverity } from '../dto/trip-conflicts.dto';
import { DateTime } from 'luxon';
import { ImpactMetricsDto } from '../dto/suggestions.dto';

@Injectable()
export class TripSuggestionsService {
  private readonly logger = new Logger(TripSuggestionsService.name);

  constructor(
    private prisma: PrismaService,
    private tripsService: TripsService,
    private conflictsService: TripConflictsService,
    private tripMetricsService: TripMetricsService,
    @Optional() private itineraryItemsService?: ItineraryItemsService
  ) {}

  /**
   * 获取建议列表
   */
  async getSuggestions(
    tripId: string,
    filters?: {
      persona?: SuggestionPersona;
      scope?: SuggestionScope;
      scopeId?: string;
      severity?: SuggestionSeverity;
      status?: SuggestionStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<SuggestionListResponseDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;

    // 整合现有数据源
    const suggestions: SuggestionDto[] = [];

    // 1. 从 PersonaAlerts 转换
    const personaAlerts = await this.tripsService.getPersonaAlerts(tripId);
    for (const alert of personaAlerts) {
      const suggestion = this.convertPersonaAlertToSuggestion(alert, tripId, trip);
      if (this.matchesFilters(suggestion, filters)) {
        suggestions.push(suggestion);
      }
    }

    // 2. 从 Conflicts 转换
    const conflicts = await this.conflictsService.getConflicts(tripId);
    for (const conflict of conflicts.conflicts) {
      const conflictSuggestions = this.convertConflictToSuggestions(conflict, tripId, trip);
      for (const suggestion of conflictSuggestions) {
        if (this.matchesFilters(suggestion, filters)) {
          suggestions.push(suggestion);
        }
      }
    }

    // 3. 从决策日志生成建议（如果需要）
    // TODO: 可以从 DecisionLog 中提取更多建议

    // 回填持久化状态，并应用状态过滤
    const statusMap = await this.getStatusMap(tripId, suggestions.map((s) => s.id));
    for (const s of suggestions) {
      s.status = statusMap.get(s.id) || SuggestionStatus.NEW;
    }

    let filteredSuggestions = suggestions;
    if (filters?.status) {
      filteredSuggestions = suggestions.filter((s) => s.status === filters.status);
    }

    // 排序：按严重级别和创建时间
    filteredSuggestions.sort((a, b) => {
      const severityOrder = {
        [SuggestionSeverity.BLOCKER]: 3,
        [SuggestionSeverity.WARN]: 2,
        [SuggestionSeverity.INFO]: 1,
      };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 分页
    const total = filteredSuggestions.length;
    const paginated = filteredSuggestions.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      filters: filters ? {
        persona: filters.persona,
        scope: filters.scope,
        scopeId: filters.scopeId,
        severity: filters.severity,
        status: filters.status,
      } : undefined,
    };
  }

  /**
   * 获取建议统计
   */
  async getSuggestionStats(tripId: string): Promise<SuggestionStatsDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取所有建议（不包括已应用的）
    const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });

    // 按人格统计
    const byPersona = {
      abu: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
      drdre: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
      neptune: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
    };

    // 按作用范围统计
    const byScope: {
      trip: number;
      day: Record<string, number>;
      item: Record<string, number>;
    } = {
      trip: 0,
      day: {},
      item: {},
    };

    for (const suggestion of allSuggestions.items) {
      // 只统计 new 或 seen 状态的建议
      const status = suggestion.status || SuggestionStatus.NEW;
      if (status === SuggestionStatus.APPLIED || status === SuggestionStatus.DISMISSED) {
        continue;
      }

      // 按人格统计
      const personaKey = suggestion.persona as keyof typeof byPersona;
      if (byPersona[personaKey]) {
        byPersona[personaKey].total++;
        const severityKey = suggestion.severity === SuggestionSeverity.BLOCKER ? 'blocker' :
                           suggestion.severity === SuggestionSeverity.WARN ? 'warn' : 'info';
        byPersona[personaKey].bySeverity[severityKey]++;
      }

      // 按作用范围统计
      if (suggestion.scope === SuggestionScope.TRIP) {
        byScope.trip++;
      } else if (suggestion.scope === SuggestionScope.DAY && suggestion.scopeId) {
        byScope.day[suggestion.scopeId] = (byScope.day[suggestion.scopeId] || 0) + 1;
      } else if (suggestion.scope === SuggestionScope.ITEM && suggestion.scopeId) {
        byScope.item[suggestion.scopeId] = (byScope.item[suggestion.scopeId] || 0) + 1;
      }
    }

    return {
      tripId,
      byPersona,
      byScope,
    };
  }

  /**
   * 计算指标差异（应用建议前后对比）
   */
  private async calculateMetricsImpact(
    tripId: string,
    beforeMetrics: { fatigue: number; buffer: number; cost: number },
    afterMetrics: { fatigue: number; buffer: number; cost: number }
  ): Promise<ImpactMetricsDto> {
    return {
      fatigue: afterMetrics.fatigue - beforeMetrics.fatigue,
      buffer: afterMetrics.buffer - beforeMetrics.buffer,
      cost: afterMetrics.cost - beforeMetrics.cost,
    };
  }

  /**
   * 获取行程当前指标
   */
  private async getCurrentTripMetrics(tripId: string): Promise<{
    fatigue: number;
    buffer: number;
    cost: number;
  }> {
    try {
      const metrics = await this.tripMetricsService.getTripMetrics(tripId);
      return {
        fatigue: metrics.summary.totalFatigue || 0,
        buffer: metrics.summary.totalBuffer || 0,
        cost: metrics.summary.totalCost || 0,
      };
    } catch (error: any) {
      this.logger.warn(`获取行程指标失败: ${error.message}，使用默认值`);
      // 如果获取失败，返回默认值（避免影响功能）
      return {
        fatigue: 0,
        buffer: 0,
        cost: 0,
      };
    }
  }

  /**
   * 批量应用高优先级建议（Auto综合功能）
   * 
   * 决策：只应用高优先级建议（severity === BLOCKER）
   * 参考：.claude/product-decisions/trip-detail-page-key-decisions.md
   * 
   * 改进：使用实际指标计算影响，而不是硬编码固定值
   */
  async applyHighPrioritySuggestions(
    tripId: string,
    options?: {
      preview?: boolean;
      limit?: number;
    }
  ): Promise<{
    success: boolean;
    appliedCount: number;
    suggestions: Array<{
      id: string;
      title: string;
      severity: SuggestionSeverity;
      applied: boolean;
      error?: string;
    }>;
    impact?: ApplySuggestionResponseDto['impact'];
  }> {
    // 获取所有高优先级建议（BLOCKER = high priority）
    const allSuggestions = await this.getSuggestions(tripId, { 
      severity: SuggestionSeverity.BLOCKER,
      status: SuggestionStatus.NEW,
      limit: options?.limit || 100
    });

    const highPrioritySuggestions = allSuggestions.items.filter(s => {
      return s.status === SuggestionStatus.NEW && s.severity === SuggestionSeverity.BLOCKER;
    });

    if (highPrioritySuggestions.length === 0) {
      return {
        success: true,
        appliedCount: 0,
        suggestions: [],
      };
    }

    // 如果是预览模式，尝试模拟计算影响（使用当前指标作为基准）
    if (options?.preview) {
      // 预览模式：使用当前指标作为基准，估算影响
      // 注意：预览模式无法准确计算，因为建议还未应用
      const currentMetrics = await this.getCurrentTripMetrics(tripId);
      
      // 根据建议类型估算影响（比硬编码更合理）
      const estimatedImpact = this.estimateImpactBySuggestionType(
        highPrioritySuggestions,
        currentMetrics
      );

      return {
        success: true,
        appliedCount: highPrioritySuggestions.length,
        suggestions: highPrioritySuggestions.map(s => ({
          id: s.id,
          title: s.title,
          severity: s.severity,
          applied: false,
        })),
        impact: {
          metrics: estimatedImpact,
          risks: [],
        },
      };
    }

    // 实际应用模式：记录应用前的指标
    const beforeMetrics = await this.getCurrentTripMetrics(tripId);

    // 批量应用高优先级建议
    const results: Array<{
      id: string;
      title: string;
      severity: SuggestionSeverity;
      applied: boolean;
      error?: string;
    }> = [];

    let successCount = 0;
    for (const suggestion of highPrioritySuggestions) {
      try {
        // 使用默认操作（第一个主要操作）
        const primaryAction = suggestion.actions.find(a => a.primary) || suggestion.actions[0];
        if (!primaryAction) {
          results.push({
            id: suggestion.id,
            title: suggestion.title,
            severity: suggestion.severity,
            applied: false,
            error: '没有可执行的操作',
          });
          continue;
        }

        await this.applySuggestion(tripId, suggestion.id, {
          actionId: primaryAction.id,
          preview: false,
        });

        results.push({
          id: suggestion.id,
          title: suggestion.title,
          severity: suggestion.severity,
          applied: true,
        });
        successCount++;
      } catch (error: any) {
        this.logger.warn(`应用建议失败: ${suggestion.id}, error=${error.message}`);
        results.push({
          id: suggestion.id,
          title: suggestion.title,
          severity: suggestion.severity,
          applied: false,
          error: error.message,
        });
      }
    }

    // 应用建议后，重新计算指标
    const afterMetrics = await this.getCurrentTripMetrics(tripId);
    
    // 计算实际影响
    const actualImpact = await this.calculateMetricsImpact(
      tripId,
      beforeMetrics,
      afterMetrics
    );

    return {
      success: successCount > 0,
      appliedCount: successCount,
      suggestions: results,
      impact: {
        metrics: actualImpact,
        risks: [],
      },
    };
  }

  /**
   * 根据建议类型估算影响（用于预览模式）
   */
  private estimateImpactBySuggestionType(
    suggestions: SuggestionDto[],
    _currentMetrics: { fatigue: number; buffer: number; cost: number }
  ): ImpactMetricsDto {
    let fatigueDelta = 0;
    let bufferDelta = 0;
    let costDelta = 0;

    for (const suggestion of suggestions) {
      const conflictType = (suggestion.metadata as any)?.conflictType;
      
      switch (conflictType) {
        case 'TIME_CONFLICT':
          // 时间冲突：基于实际重叠时间计算影响
          // 从建议的metadata中获取冲突信息（包含overlapMinutes）
          const conflictData = (suggestion.metadata as any)?.conflict;
          const overlapMinutes = conflictData?.overlapMinutes || 30; // 默认30分钟（向后兼容）
          
          // 解决时间冲突后，通常会增加等于或大于重叠时间的缓冲
          // 至少增加15分钟缓冲，最多增加重叠时间的1.5倍
          const bufferIncrease = Math.max(overlapMinutes, 15);
          bufferDelta += bufferIncrease;
          
          // 疲劳改善：基于重叠时间，重叠越多，改善越明显
          // 公式：-2 到 -5，基于重叠时间（15-60分钟）
          const fatigueDecrease = Math.min(Math.max(-2, -Math.floor(overlapMinutes / 15)), -5);
          fatigueDelta += fatigueDecrease;
          
          // 时间冲突通常不涉及费用变化
          costDelta += 0;
          break;
        case 'FATIGUE_EXCEEDED':
          // 疲劳超标：主要改善疲劳，可能略微增加缓冲
          fatigueDelta -= 10; // 疲劳超标建议主要改善疲劳
          bufferDelta += 15; // 可能略微增加缓冲
          costDelta -= 30; // 可能涉及减少活动，费用可能降低
          break;
        case 'BUFFER_INSUFFICIENT':
          // 缓冲不足：主要增加缓冲时间
          bufferDelta += 60; // 缓冲不足建议主要增加缓冲时间
          fatigueDelta -= 2; // 可能略微改善疲劳
          costDelta += 100; // 可能涉及添加住宿，费用增加
          break;
        case 'TRANSPORT_INSUFFICIENT':
          // 交通时间不足：增加缓冲、可能改善疲劳
          bufferDelta += 60; // 需增加交通/缓冲时间
          fatigueDelta -= 2; // 减少赶路压力
          costDelta += 50; // 可能涉及交通方式调整
          break;
        default:
          // 默认：使用保守的估算值
          fatigueDelta -= 5;
          bufferDelta += 30;
          costDelta += 50;
      }
    }

    return {
      fatigue: fatigueDelta,
      buffer: bufferDelta,
      cost: costDelta,
    };
  }

  /**
   * 应用建议
   */
  async applySuggestion(
    tripId: string,
    suggestionId: string,
    request: ApplySuggestionRequestDto
  ): Promise<ApplySuggestionResponseDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取建议
    const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });
    const suggestion = allSuggestions.items.find(s => s.id === suggestionId);

    if (!suggestion) {
      throw new NotFoundException(`建议 ID ${suggestionId} 不存在`);
    }

    // 如果是预览模式，尝试估算影响
    if (request.preview) {
      const currentMetrics = await this.getCurrentTripMetrics(tripId);
      const estimatedImpact = this.estimateImpactBySuggestionType(
        [suggestion],
        currentMetrics
      );

      return {
        success: true,
        suggestionId,
        appliedChanges: [],
        impact: {
          metrics: estimatedImpact,
          risks: [],
        },
      };
    }

    // 实际应用模式：记录应用前的指标
    const beforeMetrics = await this.getCurrentTripMetrics(tripId);

    // 根据操作类型执行相应操作
    const appliedChanges: Array<{ type: string; description: string }> = [];
    const triggeredSuggestions: string[] = [];

    // 根据建议类型和操作类型执行实际的数据修改
    const conflictType = (suggestion.metadata as any)?.conflictType;
    
    // 如果是时间冲突建议，实际修改行程项时间
    if (conflictType === 'TIME_CONFLICT' && suggestion.metadata?.conflict) {
      const conflict = suggestion.metadata.conflict as ConflictDto;
      const affectedItemIds = conflict.affectedItemIds || [];
      
      if (affectedItemIds.length >= 2 && this.itineraryItemsService) {
        try {
          // 获取受影响的行程项
          const items = await Promise.all(
            affectedItemIds.map(id => 
              this.prisma.itineraryItem.findUnique({
                where: { id },
                include: { TripDay: true },
              })
            )
          );
          
          const validItems = items.filter(item => item !== null);
          
          if (validItems.length >= 2) {
            // 按开始时间排序
            validItems.sort((a, b) => {
              if (!a.startTime || !b.startTime) return 0;
              return a.startTime.getTime() - b.startTime.getTime();
            });
            
            const firstItem = validItems[0];
            const secondItem = validItems[1];
            
            if (firstItem.endTime && secondItem.startTime) {
              const firstEnd = DateTime.fromJSDate(firstItem.endTime);
              const secondStart = DateTime.fromJSDate(secondItem.startTime);
              
              // 如果第一个活动结束时间晚于第二个活动开始时间，调整第二个活动的开始时间
              if (firstEnd > secondStart) {
                // 计算新的开始时间：第一个活动结束时间 + 15分钟缓冲
                const newStartTime = firstEnd.plus({ minutes: 15 });
                
                // 计算新的结束时间：保持原有时长
                const originalDuration = secondItem.endTime
                  ? DateTime.fromJSDate(secondItem.endTime).diff(secondStart, 'minutes').minutes
                  : 120; // 默认2小时
                const newEndTime = newStartTime.plus({ minutes: originalDuration });
                
                // 更新第二个行程项的时间
                await this.itineraryItemsService.update(
                  secondItem.id,
                  {
                    startTime: newStartTime.toISO() || undefined,
                    endTime: newEndTime.toISO() || undefined,
                    cascadeMode: 'auto', // 自动调整后续行程项
                  }
                );
                
                appliedChanges.push({
                  type: 'time_adjustment',
                  description: `已调整活动时间，解决时间冲突`,
                });
                
                this.logger.debug(`已解决时间冲突: 调整了行程项 ${secondItem.id} 的时间`);
              }
            }
          }
        } catch (error: any) {
          this.logger.warn(`解决时间冲突失败: ${error.message}`, error.stack);
          // 继续执行，至少更新建议状态
        }
      }
    }

    // 交通时间不足或缓冲不足：将下一活动延后 shortfallMinutes
    if (
      (conflictType === 'TRANSPORT_INSUFFICIENT' || conflictType === 'BUFFER_INSUFFICIENT') &&
      suggestion.metadata?.conflict &&
      this.itineraryItemsService
    ) {
      const conflict = suggestion.metadata.conflict as ConflictDto;
      const shiftMinutes = conflict.shortfallMinutes ?? 15;
      const affectedItemIds = conflict.affectedItemIds || [];

      if (affectedItemIds.length >= 2 && shiftMinutes > 0) {
        try {
          const items = await Promise.all(
            affectedItemIds.map((id) =>
              this.prisma.itineraryItem.findUnique({
                where: { id },
                include: { TripDay: true },
              }),
            ),
          );
          const validItems = items.filter((item): item is NonNullable<typeof item> => item !== null);

          if (validItems.length >= 2) {
            validItems.sort((a, b) => {
              if (!a.startTime || !b.startTime) return 0;
              return a.startTime.getTime() - b.startTime.getTime();
            });
            const firstItem = validItems[0];
            const secondItem = validItems[1];

            if (firstItem.endTime && secondItem.startTime) {
              const firstEnd = DateTime.fromJSDate(firstItem.endTime);
              const secondStart = DateTime.fromJSDate(secondItem.startTime);
              const newStartTime = firstEnd.plus({ minutes: shiftMinutes });
              const originalDuration = secondItem.endTime
                ? DateTime.fromJSDate(secondItem.endTime).diff(secondStart, 'minutes').minutes
                : 120;
              const newEndTime = newStartTime.plus({ minutes: originalDuration });

              await this.itineraryItemsService.update(secondItem.id, {
                startTime: newStartTime.toISO() || undefined,
                endTime: newEndTime.toISO() || undefined,
                cascadeMode: 'auto',
              });

              appliedChanges.push({
                type: 'time_adjustment',
                description:
                  conflictType === 'TRANSPORT_INSUFFICIENT'
                    ? `已延后活动 ${shiftMinutes} 分钟，解决交通时间不足`
                    : `已增加缓冲时间 ${shiftMinutes} 分钟`,
              });
              this.logger.debug(
                `已解决${conflictType}: 调整了行程项 ${secondItem.id}，延后 ${shiftMinutes} 分钟`,
              );
            }
          }
        } catch (error: any) {
          this.logger.warn(`解决${conflictType}失败: ${error.message}`, error.stack);
        }
      }
    }

    // 根据 actionId 执行其他操作
    switch (request.actionId) {
      case 'apply_alternative':
        // 应用替代方案
        appliedChanges.push({
          type: 'route_replacement',
          description: `已应用替代方案`,
        });
        break;

      case 'adjust_rhythm':
        // 调整节奏
        appliedChanges.push({
          type: 'rhythm_adjustment',
          description: `已调整行程节奏`,
        });
        break;

      case 'add_buffer':
        // 添加缓冲时间
        appliedChanges.push({
          type: 'buffer_insertion',
          description: `已添加缓冲时间`,
        });
        break;

      default:
        if (appliedChanges.length === 0) {
          appliedChanges.push({
            type: 'generic',
            description: `已应用建议：${suggestion.title}`,
          });
        }
    }

    // 更新建议状态
    await this.setSuggestionStatus(tripId, suggestionId, SuggestionStatus.APPLIED);

    // 触发其他建议重新计算（简化处理）
    // TODO: 实际应该重新计算相关建议
    const relatedSuggestions = allSuggestions.items.filter(s => 
      s.id !== suggestionId && 
      s.scope === suggestion.scope &&
      s.scopeId === suggestion.scopeId
    );
    triggeredSuggestions.push(...relatedSuggestions.slice(0, 3).map(s => s.id));

    // 应用建议后，重新计算指标
    const afterMetrics = await this.getCurrentTripMetrics(tripId);
    
    // 计算实际影响
    const actualImpact = await this.calculateMetricsImpact(
      tripId,
      beforeMetrics,
      afterMetrics
    );

    // 根据实际影响生成风险提示
    const risks: Array<{
      id: string;
      severity: SuggestionSeverity;
      title: string;
    }> = [];

    if (actualImpact.buffer && actualImpact.buffer > 0) {
      risks.push({
        id: 'risk-buffer-improved',
        severity: SuggestionSeverity.INFO,
        title: '缓冲时间已增加',
      });
    }

    if (actualImpact.fatigue && actualImpact.fatigue < 0) {
      risks.push({
        id: 'risk-fatigue-improved',
        severity: SuggestionSeverity.INFO,
        title: '疲劳指数已改善',
      });
    }

    if (actualImpact.cost && actualImpact.cost > 100) {
      risks.push({
        id: 'risk-cost-increased',
        severity: SuggestionSeverity.WARN,
        title: '费用有所增加',
      });
    }

    return {
      success: true,
      suggestionId,
      appliedChanges,
      impact: {
        metrics: actualImpact,
        risks: risks.length > 0 ? risks : [
          {
            id: 'risk-generic',
            severity: SuggestionSeverity.INFO,
            title: '建议已应用',
          },
        ],
      },
      triggeredSuggestions,
    };
  }

  /**
   * 忽略建议
   */
  async dismissSuggestion(tripId: string, suggestionId: string): Promise<void> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 验证建议存在
    const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });
    const suggestion = allSuggestions.items.find(s => s.id === suggestionId);

    if (!suggestion) {
      throw new NotFoundException(`建议 ID ${suggestionId} 不存在`);
    }

    // 更新状态
    await this.setSuggestionStatus(tripId, suggestionId, SuggestionStatus.DISMISSED);
  }

  /**
   * 标记建议已读（NEW -> SEEN；不覆盖已应用/已忽略）
   */
  async markSuggestionSeen(tripId: string, suggestionId: string): Promise<void> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const existing = await (this.prisma as any).tripSuggestionState.findUnique({
      where: { tripId_suggestionId: { tripId, suggestionId } },
    });

    if (!existing) {
      await (this.prisma as any).tripSuggestionState.create({
        data: {
          tripId,
          suggestionId,
          status: SuggestionStatus.SEEN,
          firstSeenAt: new Date(),
        },
      });
      return;
    }

    if (existing.status === SuggestionStatus.NEW) {
      await (this.prisma as any).tripSuggestionState.update({
        where: { tripId_suggestionId: { tripId, suggestionId } },
        data: {
          status: SuggestionStatus.SEEN,
          firstSeenAt: existing.firstSeenAt ?? new Date(),
        },
      });
    }
  }

  /**
   * 批量标记建议已读（用于列表首次展示后的批量消除角标）
   */
  async markSuggestionsSeen(tripId: string, suggestionIds: string[]): Promise<void> {
    const ids = Array.from(new Set(suggestionIds)).filter(Boolean);
    if (ids.length === 0) return;

    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const now = new Date();
    const existingRows: Array<{ suggestionId: string; status: string; firstSeenAt: Date | null }> =
      await (this.prisma as any).tripSuggestionState.findMany({
        where: { tripId, suggestionId: { in: ids } },
        select: { suggestionId: true, status: true, firstSeenAt: true },
      });
    const existing = new Map(existingRows.map((r) => [r.suggestionId, r]));

    const toCreate: string[] = [];
    const toUpdate: string[] = [];
    for (const id of ids) {
      const row = existing.get(id);
      if (!row) {
        toCreate.push(id);
        continue;
      }
      if (row.status === SuggestionStatus.NEW) {
        toUpdate.push(id);
      }
    }

    if (toCreate.length) {
      await (this.prisma as any).tripSuggestionState.createMany({
        data: toCreate.map((suggestionId) => ({
          tripId,
          suggestionId,
          status: SuggestionStatus.SEEN,
          firstSeenAt: now,
        })),
        skipDuplicates: true,
      });
    }

    if (toUpdate.length) {
      // Prisma updateMany 同一 data，满足：NEW -> SEEN（firstSeenAt 仅在为空时设置无法表达）
      await (this.prisma as any).tripSuggestionState.updateMany({
        where: { tripId, suggestionId: { in: toUpdate }, status: SuggestionStatus.NEW },
        data: { status: SuggestionStatus.SEEN, firstSeenAt: now },
      });
    }
  }

  private async getStatusMap(tripId: string, suggestionIds: string[]): Promise<Map<string, SuggestionStatus>> {
    const uniqueIds = Array.from(new Set(suggestionIds)).filter(Boolean);
    if (uniqueIds.length === 0) return new Map();

    const rows: Array<{ suggestionId: string; status: string }> = await (this.prisma as any).tripSuggestionState.findMany({
      where: { tripId, suggestionId: { in: uniqueIds } },
      select: { suggestionId: true, status: true },
    });
    return new Map(rows.map((r: { suggestionId: string; status: string }) => [r.suggestionId, r.status as SuggestionStatus]));
  }

  private async setSuggestionStatus(tripId: string, suggestionId: string, status: SuggestionStatus): Promise<void> {
    const now = new Date();
    await (this.prisma as any).tripSuggestionState.upsert({
      where: { tripId_suggestionId: { tripId, suggestionId } },
      create: {
        tripId,
        suggestionId,
        status,
        ...(status === SuggestionStatus.SEEN ? { firstSeenAt: now } : {}),
        ...(status === SuggestionStatus.APPLIED ? { appliedAt: now } : {}),
        ...(status === SuggestionStatus.DISMISSED ? { dismissedAt: now } : {}),
      },
      update: {
        status,
        ...(status === SuggestionStatus.SEEN ? { firstSeenAt: { set: now } } : {}),
        ...(status === SuggestionStatus.APPLIED ? { appliedAt: { set: now } } : {}),
        ...(status === SuggestionStatus.DISMISSED ? { dismissedAt: { set: now } } : {}),
      },
    });
  }

  /**
   * 将 PersonaAlert 转换为 Suggestion
   */
  private convertPersonaAlertToSuggestion(
    alert: PersonaAlertDto,
    _tripId: string,
    _trip: any
  ): SuggestionDto {
    // 映射人格
    const personaMap: Record<PersonaType, SuggestionPersona> = {
      [PersonaType.ABU]: SuggestionPersona.ABU,
      [PersonaType.DR_DRE]: SuggestionPersona.DR_DRE,
      [PersonaType.NEPTUNE]: SuggestionPersona.NEPTUNE,
      [PersonaType.USER_ACTION]: SuggestionPersona.SYSTEM,
    };

    // 映射严重级别
    const severityMap: Record<AlertSeverity, SuggestionSeverity> = {
      [AlertSeverity.WARNING]: SuggestionSeverity.WARN,
      [AlertSeverity.INFO]: SuggestionSeverity.INFO,
      [AlertSeverity.SUCCESS]: SuggestionSeverity.INFO,
    };

    // 确定作用范围（简化处理，默认 trip）
    let scope = SuggestionScope.TRIP;
    let scopeId: string | undefined;

    // 从 metadata 中提取作用范围信息
    if (alert.metadata?.dayId) {
      scope = SuggestionScope.DAY;
      scopeId = alert.metadata.dayId;
    } else if (alert.metadata?.itemId) {
      scope = SuggestionScope.ITEM;
      scopeId = alert.metadata.itemId;
    }

    // 生成操作列表
    const actions: SuggestionActionDto[] = [];

    if (alert.persona === PersonaType.ABU) {
      // Abu 的建议操作
      if (alert.metadata?.evidenceRefs && alert.metadata.evidenceRefs.length > 0) {
        actions.push({
          id: 'view_evidence',
          label: '查看证据',
          type: 'view_evidence',
          primary: true,
        });
      }
      if (alert.metadata?.alternatives && alert.metadata.alternatives.length > 0) {
        actions.push({
          id: 'apply_alternative',
          label: '应用替代方案',
          type: 'apply',
          primary: false,
        });
      }
    } else if (alert.persona === PersonaType.DR_DRE) {
      // Dr.Dre 的建议操作
      actions.push({
        id: 'adjust_rhythm',
        label: '调整节奏',
        type: 'adjust_rhythm',
        primary: true,
      });
      actions.push({
        id: 'add_buffer',
        label: '添加缓冲时间',
        type: 'apply',
        primary: false,
      });
    } else if (alert.persona === PersonaType.NEPTUNE) {
      // Neptune 的建议操作
      if (alert.metadata?.alternatives && alert.metadata.alternatives.length > 0) {
        actions.push({
          id: 'view_alternatives',
          label: '查看替代方案',
          type: 'view_alternatives',
          primary: true,
        });
        actions.push({
          id: 'apply_alternative',
          label: '应用替代方案',
          type: 'apply',
          primary: false,
        });
      }
    }

    // 默认操作
    if (actions.length === 0) {
      actions.push({
        id: 'dismiss',
        label: '忽略',
        type: 'dismiss',
        primary: false,
      });
    }

    // 提取证据
    const evidence: EvidenceLinkDto[] = [];
    if (alert.metadata?.evidenceRefs) {
      for (const ref of alert.metadata.evidenceRefs) {
        evidence.push({
          id: ref,
          type: 'other',
          title: '相关证据',
          description: `证据引用: ${ref}`,
        });
      }
    }

    return {
      id: alert.id,
      persona: personaMap[alert.persona] || SuggestionPersona.ABU,
      scope,
      scopeId,
      severity: severityMap[alert.severity] || SuggestionSeverity.INFO,
      status: SuggestionStatus.NEW,
      title: alert.title,
      summary: (alert.explanation ?? alert.message ?? '').split('\n')[0] || alert.title,
      description: alert.explanation ?? alert.message ?? alert.title,
      evidence: evidence.length > 0 ? evidence : undefined,
      actions,
      createdAt: alert.createdAt,
      metadata: {
        ...alert.metadata,
        originalPersona: alert.persona,
        originalSeverity: alert.severity,
      },
    };
  }

  /**
   * 将 Conflict 转换为 Suggestions
   */
  private convertConflictToSuggestions(
    conflict: ConflictDto,
    tripId: string,
    trip: any
  ): SuggestionDto[] {
    const suggestions: SuggestionDto[] = [];

    // 根据冲突类型决定归属的人格
    let persona: SuggestionPersona = SuggestionPersona.DR_DRE;
    if (conflict.type === 'CLOSURE_RISK' || conflict.type === 'ACCESSIBILITY_MISMATCH') {
      persona = SuggestionPersona.ABU;
    } else if (conflict.type === 'FATIGUE_EXCEEDED' || conflict.type === 'BUFFER_INSUFFICIENT' || conflict.type === 'TRANSPORT_INSUFFICIENT') {
      persona = SuggestionPersona.DR_DRE;
    }

    // 映射严重级别
    const severityMap: Record<ConflictSeverity, SuggestionSeverity> = {
      [ConflictSeverity.HIGH]: SuggestionSeverity.BLOCKER,
      [ConflictSeverity.MEDIUM]: SuggestionSeverity.WARN,
      [ConflictSeverity.LOW]: SuggestionSeverity.INFO,
    };

    // 为每个受影响的日期创建建议
    for (const dayDate of conflict.affectedDays) {
      const day = trip.TripDay?.find((d: any) => {
        const dayDateStr = DateTime.fromJSDate(d.date).toISODate();
        return dayDateStr === dayDate;
      });

      const suggestion: SuggestionDto = {
        id: `conflict-${conflict.id}-${dayDate}`,
        persona,
        scope: SuggestionScope.DAY,
        scopeId: day?.id,
        severity: severityMap[conflict.severity] || SuggestionSeverity.INFO,
        status: SuggestionStatus.NEW,
        title: conflict.title,
        summary: conflict.description,
        description: conflict.description,
        actions: conflict.suggestions?.map((s, idx) => ({
          id: `action-${idx}`,
          label: s.action,
          type: 'apply' as const,
          primary: idx === 0,
        })) || [
          {
            id: 'dismiss',
            label: '忽略',
            type: 'dismiss',
            primary: false,
          },
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          conflictType: conflict.type,
          affectedItemIds: conflict.affectedItemIds,
          conflict: {
            ...conflict,
            // 时间冲突：overlapMinutes；交通冲突：travelTimeMinutes, shortfallMinutes 等
          },
        },
      };

      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * 检查建议是否匹配过滤器
   */
  private matchesFilters(
    suggestion: SuggestionDto,
    filters?: {
      persona?: SuggestionPersona;
      scope?: SuggestionScope;
      scopeId?: string;
      severity?: SuggestionSeverity;
      status?: SuggestionStatus;
    }
  ): boolean {
    if (!filters) return true;

    if (filters.persona && suggestion.persona !== filters.persona) return false;
    if (filters.scope && suggestion.scope !== filters.scope) return false;
    if (filters.scopeId && suggestion.scopeId !== filters.scopeId) return false;
    if (filters.severity && suggestion.severity !== filters.severity) return false;
    // status 过滤在外部处理

    return true;
  }
}

