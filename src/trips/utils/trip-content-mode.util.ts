import {
  inferHikingProfile,
  parseHikingSegments,
} from './embedded-hiking-trip-metadata.util';

/** 历史成团实例化策略（metadata.matchSquareInstantiation.strategy） */
export type TripInstantiationStrategy =
  | 'reuse_trekking_spawn'
  | 'trekking_spawn'
  | 'route_template'
  | 'minimal_trip';

/** 行程内容交付模式 — 供前端决定展示 POI 时间轴 vs 徒步骨架 vs 空态 */
export type TripContentMode =
  | 'poi_itinerary'
  | 'hiking_primary'
  | 'skeleton_only'
  | 'generating_poi'
  | 'mixed';

export type TripGenerationProgress = {
  status: 'generating' | 'completed' | 'failed';
  stage: string;
  message: string;
  itemsCount?: number;
  updatedAt?: string;
  contentMode?: TripContentMode;
};

type LegacyInstantiationMeta = {
  strategy?: TripInstantiationStrategy;
  routeDirectionName?: string | null;
};

function readInstantiation(metadata: unknown): LegacyInstantiationMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const inst = (metadata as Record<string, unknown>).matchSquareInstantiation;
  if (!inst || typeof inst !== 'object') return null;
  return inst as LegacyInstantiationMeta;
}

/** 徒步向骨架是否已就绪（不依赖 ItineraryItem 数量） */
export function hasHikingSkeletonReady(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const meta = metadata as Record<string, unknown>;
  if (parseHikingSegments(metadata).length > 0) return true;
  if (meta.hardTrekTrailPlan) return true;
  if (meta.trekkingSpawn && typeof meta.trekkingSpawn === 'object') return true;

  const inst = readInstantiation(metadata);
  return inst?.strategy === 'trekking_spawn' || inst?.strategy === 'reuse_trekking_spawn';
}

/** 路线/日程是否对当前 contentMode 视为「已交付」 */
export function isRouteEstablishedForTrip(metadata: unknown, totalItems: number): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const meta = metadata as Record<string, unknown>;

  if (meta.routeDirectionId != null || meta.route_direction_id != null) return true;

  const decisionState = meta.decisionState as { completedSteps?: { routeSelection?: boolean } } | undefined;
  if (decisionState?.completedSteps?.routeSelection === true) return true;

  const inst = readInstantiation(metadata);
  if (inst?.routeDirectionName) return true;

  if (hasHikingSkeletonReady(metadata)) return true;

  return totalItems > 0;
}

/** 阶段 3「可执行日程」是否对当前行程类型视为完成 */
export function isExecutableScheduleReady(
  metadata: unknown,
  totalItems: number,
  daysWithItems: number,
  totalDays: number,
): boolean {
  const contentMode = resolveTripContentMode(metadata, totalItems);

  if (contentMode === 'hiking_primary') {
    return hasHikingSkeletonReady(metadata);
  }
  if (contentMode === 'skeleton_only') {
    const gp = resolveEffectiveGenerationProgress(metadata, totalItems);
    return gp?.status === 'completed' && gp.stage === 'skeleton_only';
  }
  if (contentMode === 'generating_poi') {
    return false;
  }

  return totalDays > 0 && totalItems > 0 && daysWithItems === totalDays;
}

export function readGenerationProgress(metadata: unknown): TripGenerationProgress | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const gp = (metadata as Record<string, unknown>).generationProgress;
  if (!gp || typeof gp !== 'object') return null;
  const raw = gp as TripGenerationProgress;
  if (raw.status !== 'generating' && raw.status !== 'completed' && raw.status !== 'failed') {
    return null;
  }
  return raw;
}

export function resolveTripContentMode(metadata: unknown, totalItems: number): TripContentMode {
  const gp = readGenerationProgress(metadata);
  if (gp?.status === 'generating') return 'generating_poi';
  if (gp?.contentMode) return gp.contentMode;

  const inst = readInstantiation(metadata);
  if (inst?.strategy) {
    switch (inst.strategy) {
      case 'trekking_spawn':
      case 'reuse_trekking_spawn':
        return totalItems > 0 ? 'mixed' : 'hiking_primary';
      case 'minimal_trip':
        return 'skeleton_only';
      case 'route_template':
        return totalItems > 0 ? 'poi_itinerary' : 'skeleton_only';
      default:
        break;
    }
  }

  const hikingProfile = inferHikingProfile(metadata);
  if (hikingProfile === 'primary' || hikingProfile === 'embedded') {
    return totalItems > 0 ? 'mixed' : 'hiking_primary';
  }

  if (totalItems > 0) return 'poi_itinerary';
  if (gp?.status === 'completed') {
    return gp.contentMode ?? 'skeleton_only';
  }
  return 'skeleton_only';
}

export function buildInstantiationGenerationProgress(
  strategy: TripInstantiationStrategy,
  itemCount: number,
): TripGenerationProgress {
  const updatedAt = new Date().toISOString();

  switch (strategy) {
    case 'trekking_spawn':
    case 'reuse_trekking_spawn':
      return {
        status: 'completed',
        stage: 'hiking_skeleton',
        message: '徒步骨架已就绪（路线片段与行程计划），无需从地点库生成 POI 行程项',
        itemsCount: itemCount,
        contentMode: 'hiking_primary',
        updatedAt,
      };
    case 'route_template':
      return {
        status: 'completed',
        stage: itemCount > 0 ? 'completed' : 'template_empty',
        message:
          itemCount > 0
            ? `已从路线模板生成 ${itemCount} 个行程项`
            : '路线模板实例化完成，但未匹配到可落库的地点行程项',
        itemsCount: itemCount,
        contentMode: itemCount > 0 ? 'poi_itinerary' : 'skeleton_only',
        updatedAt,
      };
    case 'minimal_trip':
    default:
      return {
        status: 'completed',
        stage: 'skeleton_only',
        message: '行程骨架已创建，请补充路线模板或发起日程编排',
        itemsCount: itemCount,
        contentMode: 'skeleton_only',
        updatedAt,
      };
  }
}

/** 对历史实例化行程在读取时补齐 generationProgress（不落库） */
export function resolveEffectiveGenerationProgress(
  metadata: unknown,
  totalItems: number,
): TripGenerationProgress | null {
  const stored = readGenerationProgress(metadata);
  if (stored) return stored;

  const inst = readInstantiation(metadata);
  if (!inst?.strategy) return null;

  return buildInstantiationGenerationProgress(inst.strategy, totalItems);
}

export function isTripGeneratingItems(
  metadata: unknown,
  totalItems: number,
): boolean {
  const gp = resolveEffectiveGenerationProgress(metadata, totalItems);
  return gp?.status === 'generating';
}

/** 历史实例化行程缺少 generationProgress 时需回填 */
export function needsGenerationProgressBackfill(metadata: unknown): boolean {
  if (readGenerationProgress(metadata)) return false;
  return readInstantiation(metadata)?.strategy != null;
}
