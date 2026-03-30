// src/itinerary-optimization/itinerary-optimization.controller.ts
import { Controller, Post, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { RouteOptimizationService } from './itinerary-optimization.service';
import { TripOptimizationService } from '../trips/services/trip-optimization.service';
import { TripConflictsService } from '../trips/services/trip-conflicts.service';
import { TripIntentService } from '../trips/services/trip-intent.service';
import { PrismaService } from '../prisma/prisma.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { DateTime } from 'luxon';
import { ConflictType } from '../trips/dto/trip-conflicts.dto';

@ApiTags('itinerary-optimization')
@Controller('itinerary-optimization')
export class ItineraryOptimizationController {
  constructor(
    private readonly routeOptimizationService: RouteOptimizationService,
    private readonly tripOptimizationService: TripOptimizationService,
    private readonly tripConflictsService: TripConflictsService,
    private readonly tripIntentService: TripIntentService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('optimize')
  @ApiOperation({
    summary: '优化行程路线',
    description:
      '根据地点 ID 列表和配置，使用 VRPTW 等算法优化当日行程顺序与时间安排。' +
      '必须提供 tripId 和 dayId，优化结果将自动应用到指定行程日。' +
      '未传 config.defaultTravelMode 时，自动从行程 intent（pacingConfig.travelMode）补齐，与 assess 保持一致。' +
      '会基于 TRANSPORT_INSUFFICIENT 冲突提取最小交通时间约束，减少优化后冲突。' +
      '返回 optimization、applied、conflictSummary、conflictsBefore、conflictsAfter。',
  })
  @ApiBody({ type: OptimizeRouteDto })
  @ApiResponse({
    status: 200,
    description: '优化成功。data 含 optimization、applied、conflictSummary（before/after/resolved/hasNew）、conflictsBefore、conflictsAfter',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '地点或行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async optimize(@Body() dto: OptimizeRouteDto) {
    try {
      // 校验 dayId 属于 tripId，并获取当日行程项（用于从冲突中提取 place 对约束）
      const tripDay = await this.prisma.tripDay.findFirst({
        where: { id: dto.dayId, tripId: dto.tripId },
        include: { ItineraryItem: { orderBy: { startTime: 'asc' } } },
      });
      if (!tripDay) {
        throw new NotFoundException(`行程日 ${dto.dayId} 不存在或不属于行程 ${dto.tripId}`);
      }

      // 强制使用 TripDay 的日期，确保优化结果的 schedule 与目标日匹配（避免 applyOptimization 按日期分组时找不到对应 TripDay）
      const dayDateIso = DateTime.fromJSDate(tripDay.date).toISODate() ?? dto.config.date;
      const startFromConfig = dto.config.startTime ? DateTime.fromISO(dto.config.startTime) : null;
      const endFromConfig = dto.config.endTime ? DateTime.fromISO(dto.config.endTime) : null;
      const dtoWithDayConfig = {
        ...dto,
        config: {
          ...dto.config,
          date: dayDateIso ?? dto.config.date,
          startTime:
            startFromConfig?.isValid && dayDateIso
              ? `${dayDateIso}T${startFromConfig.toFormat('HH:mm:ss')}.000Z`
              : `${dayDateIso}T09:00:00.000Z`,
          endTime:
            endFromConfig?.isValid && dayDateIso
              ? `${dayDateIso}T${endFromConfig.toFormat('HH:mm:ss')}.000Z`
              : `${dayDateIso}T18:00:00.000Z`,
        },
      };

      // 若请求未传 defaultTravelMode，从行程 intent 补齐（与 assessTrip 保持一致，请求参数优先）
      const configWithIntent = { ...dtoWithDayConfig.config };
      if (!configWithIntent.defaultTravelMode && dto.tripId) {
        try {
          const intent = await this.tripIntentService.getIntent(dto.tripId);
          const tm = (intent.pacingConfig as { travelMode?: string })?.travelMode;
          if (tm) {
            const map: Record<string, 'TRANSIT' | 'WALKING' | 'DRIVING'> = {
              DRIVING: 'DRIVING',
              PUBLIC_TRANSIT: 'TRANSIT',
              MIXED: 'TRANSIT',
            };
            configWithIntent.defaultTravelMode = map[tm] ?? undefined;
          }
        } catch {
          // 静默忽略，使用 RouteOptimizer 的 hasElderly/hasChildren 逻辑
        }
      }

      // 优化前：获取当日冲突列表（用于前后对比 + 提取约束）
      const dayDateStr = dayDateIso ?? dto.config.date;
      const conflictsBefore = await this.tripConflictsService.getConflicts(
        dto.tripId,
        dayDateStr,
      );

      // 从 TRANSPORT_INSUFFICIENT 冲突提取最小交通时间约束（确保优化后不再产生该冲突）
      const itemIdToPlaceId = new Map<string, number>();
      for (const item of tripDay.ItineraryItem || []) {
        if (item.placeId != null) {
          itemIdToPlaceId.set(item.id, item.placeId);
        }
      }
      const minTravelTimeOverrides: Record<string, number> = {};
      for (const c of conflictsBefore.conflicts) {
        if (c.type !== ConflictType.TRANSPORT_INSUFFICIENT || !c.travelTimeMinutes || !c.affectedItemIds?.length) continue;
        const [fromItemId, toItemId] = c.affectedItemIds;
        const fromPlaceId = fromItemId ? itemIdToPlaceId.get(fromItemId) : undefined;
        const toPlaceId = toItemId ? itemIdToPlaceId.get(toItemId) : undefined;
        if (fromPlaceId != null && toPlaceId != null && dto.placeIds.includes(fromPlaceId) && dto.placeIds.includes(toPlaceId)) {
          const key = `${fromPlaceId}-${toPlaceId}`;
          // 使用实际交通时间作为最小约束，schedule 的 buffer 公式会在此基础上加缓冲
          minTravelTimeOverrides[key] = Math.max(minTravelTimeOverrides[key] ?? 0, c.travelTimeMinutes);
        }
      }

      const dtoWithConflicts = {
        ...dtoWithDayConfig,
        config: {
          ...configWithIntent,
          ...(Object.keys(minTravelTimeOverrides).length > 0 && { minTravelTimeOverrides }),
        },
      };

      const result = await this.routeOptimizationService.optimizeRoute(dtoWithConflicts);

      // 应用优化结果到指定行程日（只保留有 startTime 的节点，否则 applyOptimization 会跳过）
      // schedule[i].transportTime = 从 node i 到 node i+1 的交通时间；故 node i+1 的 travelFromPreviousDuration = schedule[i].transportTime
      const routeForApply = result.nodes
        .map((node, i) => {
          const s = result.schedule[i];
          if (!s?.startTime) return null;
          const travelFromPreviousDuration =
            i >= 1 ? result.schedule[i - 1].transportTime : undefined;
          return {
            id: node.id,
            placeId: node.id,
            startTime: s.startTime,
            endTime: s.endTime,
            category: node.category,
            travelFromPreviousDuration,
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);

      if (routeForApply.length === 0) {
        throw new BadRequestException(
          '优化结果为空，无法应用。请检查 placeIds 是否有效，以及 config 的时间窗是否合理。',
        );
      }

      const applyResult = await this.tripOptimizationService.applyOptimization(dto.tripId, {
        result: { route: { nodes: routeForApply } },
        options: { replaceExisting: true, dayId: dto.dayId },
      });

      // 优化后：获取当日冲突列表（用于前后对比）
      const conflictsAfter = await this.tripConflictsService.getConflicts(
        dto.tripId,
        dayDateStr,
      );

      const beforeTotal = conflictsBefore.total;
      const afterTotal = conflictsAfter.total;
      const resolved = Math.max(0, beforeTotal - afterTotal);
      const hasNew = afterTotal > beforeTotal;

      return successResponse({
        optimization: result,
        applied: applyResult,
        conflictSummary: {
          before: beforeTotal,
          after: afterTotal,
          resolved,
          hasNew,
        },
        conflictsBefore: {
          total: beforeTotal,
          conflicts: conflictsBefore.conflicts,
        },
        conflictsAfter: {
          total: afterTotal,
          conflicts: conflictsAfter.conflicts,
        },
      });
    } catch (error: any) {
      if (error?.status === 404 || error?.name === 'NotFoundException') {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error?.status === 400 || error?.name === 'BadRequestException') {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
