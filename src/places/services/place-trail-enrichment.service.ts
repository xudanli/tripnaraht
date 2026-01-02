// src/places/services/place-trail-enrichment.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlaceMetadata } from '../interfaces/place-metadata.interface';
import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';

/**
 * Place Trail Enrichment Service
 * 
 * 快招3：将徒步类 POI 强绑定到 Trail 表
 * 通过 place.metadata.trailId 或 routeId 获取 elevation gain、distance、duration、difficulty
 */
@Injectable()
export class PlaceTrailEnrichmentService {
  constructor(private prisma: PrismaService) {}

  /**
   * 从 Trail 表获取数据并增强 physicalMetadata
   * 
   * @param metadata Place 的 metadata（包含 trailId 或 routeId）
   * @returns 增强后的 physicalMetadata 补丁，如果没有关联的 Trail 则返回 null
   */
  async enrichFromTrail(
    metadata: PlaceMetadata
  ): Promise<Partial<PhysicalMetadata> | null> {
    // 优先使用 trailId（内部 Trail 表）
    if (metadata.trailId) {
      const trail = await this.prisma.trail.findUnique({
        where: { id: metadata.trailId },
      });

      if (trail) {
        return this.buildPhysicalMetadataFromTrail(trail);
      }
    }

    // 如果有 routeId 和 routeSource，可以从外部系统获取
    // 这里暂时只支持 internal，外部系统需要另外实现
    if (metadata.routeId && metadata.routeSource === 'internal') {
      // 可以尝试通过 metadata.routeId 查找 Trail
      // 例如：metadata.routeId 可能是 Trail 的 uuid
      const trail = await this.prisma.trail.findUnique({
        where: { uuid: metadata.routeId },
      });

      if (trail) {
        return this.buildPhysicalMetadataFromTrail(trail);
      }
    }

    return null;
  }

  /**
   * 从 Trail 记录构建 physicalMetadata 补丁
   */
  private buildPhysicalMetadataFromTrail(trail: any): Partial<PhysicalMetadata> {
    const patch: Partial<PhysicalMetadata> = {};

    // 从 estimatedDurationHours 转换（小时 -> 分钟）
    if (trail.estimatedDurationHours) {
      patch.estimated_duration_min = Math.round(trail.estimatedDurationHours * 60);
    }

    // 从 difficultyLevel 提取（如果存在）
    if (trail.difficultyLevel) {
      // difficultyLevel 会在 PhysicalMetadataGenerator 的 applyDifficultyModifier 中处理
      // 这里只是提供数据，不直接设置 intensity_factor
    }

    // 从 elevationGainM 和 distanceKm 可以推断强度
    // 但这些已经在 Trail 表的 fatigueScore 中体现，不需要在这里重复计算

    return patch;
  }

  /**
   * 批量获取多个 POI 的 Trail 数据
   */
  async enrichMultipleFromTrails(
    places: Array<{ id: number; metadata: PlaceMetadata }>
  ): Promise<Map<number, Partial<PhysicalMetadata>>> {
    const results = new Map<number, Partial<PhysicalMetadata>>();

    // 收集所有 trailId 和 routeId
    const trailIds: number[] = [];
    const routeIds: string[] = [];

    for (const place of places) {
      const metadata = place.metadata;
      if (metadata.trailId) {
        trailIds.push(metadata.trailId);
      }
      if (metadata.routeId && metadata.routeSource === 'internal') {
        routeIds.push(metadata.routeId);
      }
    }

    // 批量查询 Trail
    const trailsById = new Map<number, any>();
    const trailsByUuid = new Map<string, any>();

    if (trailIds.length > 0) {
      const trails = await this.prisma.trail.findMany({
        where: { id: { in: trailIds } },
      });
      for (const trail of trails) {
        trailsById.set(trail.id, trail);
      }
    }

    if (routeIds.length > 0) {
      const trails = await this.prisma.trail.findMany({
        where: { uuid: { in: routeIds } },
      });
      for (const trail of trails) {
        trailsByUuid.set(trail.uuid, trail);
      }
    }

    // 为每个 POI 构建 physicalMetadata 补丁
    for (const place of places) {
      const metadata = place.metadata;
      let trail: any = null;

      if (metadata.trailId) {
        trail = trailsById.get(metadata.trailId);
      } else if (metadata.routeId && metadata.routeSource === 'internal') {
        trail = trailsByUuid.get(metadata.routeId);
      }

      if (trail) {
        results.set(place.id, this.buildPhysicalMetadataFromTrail(trail));
      }
    }

    return results;
  }
}

