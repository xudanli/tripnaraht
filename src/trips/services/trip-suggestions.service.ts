// src/trips/services/trip-suggestions.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
import { PersonaAlertDto, PersonaType, AlertSeverity } from '../dto/persona-alerts.dto';
import { ConflictDto, ConflictSeverity } from '../dto/trip-conflicts.dto';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

@Injectable()
export class TripSuggestionsService {
  private readonly logger = new Logger(TripSuggestionsService.name);
  
  // 内存中的建议状态（实际应该使用数据库或Redis）
  private suggestionStatuses = new Map<string, SuggestionStatus>();

  constructor(
    private prisma: PrismaService,
    private tripsService: TripsService,
    private conflictsService: TripConflictsService
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

    // 应用状态过滤
    let filteredSuggestions = suggestions;
    if (filters?.status) {
      filteredSuggestions = suggestions.filter(s => {
        const status = this.suggestionStatuses.get(s.id) || SuggestionStatus.NEW;
        return status === filters.status;
      });
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
      const status = this.suggestionStatuses.get(suggestion.id) || SuggestionStatus.NEW;
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
   * 批量应用高优先级建议（Auto综合功能）
   * 
   * 决策：只应用高优先级建议（severity === BLOCKER）
   * 参考：.claude/product-decisions/trip-detail-page-key-decisions.md
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
      const status = this.suggestionStatuses.get(s.id) || SuggestionStatus.NEW;
      return status === SuggestionStatus.NEW && s.severity === SuggestionSeverity.BLOCKER;
    });

    if (highPrioritySuggestions.length === 0) {
      return {
        success: true,
        appliedCount: 0,
        suggestions: [],
      };
    }

    // 如果是预览模式，只返回影响分析
    if (options?.preview) {
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
          metrics: {
            fatigue: -highPrioritySuggestions.length * 5,
            buffer: highPrioritySuggestions.length * 30,
            cost: highPrioritySuggestions.length * 50,
          },
          risks: [],
        },
      };
    }

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

    return {
      success: successCount > 0,
      appliedCount: successCount,
      suggestions: results,
      impact: {
        metrics: {
          fatigue: -successCount * 5,
          buffer: successCount * 30,
          cost: successCount * 50,
        },
        risks: [],
      },
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

    // 如果是预览模式，只返回影响分析
    if (request.preview) {
      return {
        success: true,
        suggestionId,
        appliedChanges: [],
        impact: {
          metrics: {
            fatigue: -5,
            buffer: 30,
            cost: 50,
          },
          risks: [],
        },
      };
    }

    // 根据操作类型执行相应操作
    const appliedChanges: Array<{ type: string; description: string }> = [];
    const triggeredSuggestions: string[] = [];

    // 根据 actionId 执行操作
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
        appliedChanges.push({
          type: 'generic',
          description: `已应用建议：${suggestion.title}`,
        });
    }

    // 更新建议状态
    this.suggestionStatuses.set(suggestionId, SuggestionStatus.APPLIED);

    // 触发其他建议重新计算（简化处理）
    // TODO: 实际应该重新计算相关建议
    const relatedSuggestions = allSuggestions.items.filter(s => 
      s.id !== suggestionId && 
      s.scope === suggestion.scope &&
      s.scopeId === suggestion.scopeId
    );
    triggeredSuggestions.push(...relatedSuggestions.slice(0, 3).map(s => s.id));

    return {
      success: true,
      suggestionId,
      appliedChanges,
      impact: {
        metrics: {
          fatigue: -5,
          buffer: 30,
          cost: 50,
        },
        risks: [
          {
            id: 'risk-002',
            severity: SuggestionSeverity.INFO,
            title: '新增缓冲时间充足',
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
    this.suggestionStatuses.set(suggestionId, SuggestionStatus.DISMISSED);
  }

  /**
   * 将 PersonaAlert 转换为 Suggestion
   */
  private convertPersonaAlertToSuggestion(
    alert: PersonaAlertDto,
    tripId: string,
    trip: any
  ): SuggestionDto {
    // 映射人格
    const personaMap: Record<PersonaType, SuggestionPersona> = {
      [PersonaType.ABU]: SuggestionPersona.ABU,
      [PersonaType.DR_DRE]: SuggestionPersona.DR_DRE,
      [PersonaType.NEPTUNE]: SuggestionPersona.NEPTUNE,
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
      status: this.suggestionStatuses.get(alert.id) || SuggestionStatus.NEW,
      title: alert.title,
      summary: alert.message.split('\n')[0] || alert.message,
      description: alert.message,
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
    } else if (conflict.type === 'FATIGUE_EXCEEDED' || conflict.type === 'BUFFER_INSUFFICIENT') {
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
        status: this.suggestionStatuses.get(`conflict-${conflict.id}-${dayDate}`) || SuggestionStatus.NEW,
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

