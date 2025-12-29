// src/trips/decision/graph-db/graph-data-converter.service.ts
/**
 * Graph Data Converter Service
 * 
 * 在现有数据模型和图数据模型之间转换
 * 
 * 功能：
 * 1. 将 Place 转换为图节点
 * 2. 将 RouteSegment 转换为图节点和关系
 * 3. 将 RouteDirection 转换为图节点
 * 4. 从图数据模型转换回现有数据模型
 */

import { Injectable, Logger } from '@nestjs/common';
import { Place } from '@prisma/client';
import {
  GraphNode,
  GraphRelation,
  GraphNodeType,
  GraphRelationType,
  PlaceNodeProperties,
  RouteSegmentNodeProperties,
  RouteDirectionNodeProperties,
  HumanCapabilityProfileNodeProperties,
} from './graph-db.interface';
import { RouteSegment } from '../shared/world-model.types';
import { RouteDirectionWithPhilosophy } from '../shared/world-model.types';
import { HumanCapabilityModel } from '../models/human-capability.model';

@Injectable()
export class GraphDataConverterService {
  private readonly logger = new Logger(GraphDataConverterService.name);

  /**
   * 将 Place 转换为图节点
   */
  convertPlaceToGraphNode(
    place: Place,
    options?: {
      countryCode?: string;
      regionId?: string;
      demEvidence?: {
        cumulativeAscent?: number;
        maxSlopePct?: number;
        fatigueIndex?: number;
      };
    }
  ): GraphNode {
    // 提取坐标
    // 注意：Place 类型可能没有 location 属性（取决于 Prisma schema）
    // 使用类型断言访问 PostGIS geography 字段
    let latitude = 0;
    let longitude = 0;
    const placeWithLocation = place as any;
    if (placeWithLocation.location) {
      // PostGIS geography 格式: "POINT(lng lat)"
      const locationStr = String(placeWithLocation.location);
      const match = locationStr.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        longitude = parseFloat(match[1]);
        latitude = parseFloat(match[2]);
      }
    }

    // 提取 elevation（从 metadata 或 physicalMetadata）
    let elevation: number | undefined;
    const metadata = place.metadata as any;
    const physicalMetadata = place.physicalMetadata as any;
    if (metadata?.elevationMeters) {
      elevation = metadata.elevationMeters;
    } else if (physicalMetadata?.elevation) {
      elevation = physicalMetadata.elevation;
    }

    const properties: PlaceNodeProperties = {
      name: place.nameCN,
      nameCN: place.nameCN,
      nameEN: place.nameEN || undefined,
      latitude,
      longitude,
      elevation,
      countryCode: options?.countryCode || '',
      regionId: options?.regionId,
      poiType: place.category,
    };

    // 添加 DEM 证据（如果有）
    if (options?.demEvidence) {
      properties.demEvidence = options.demEvidence;
    }

    return {
      id: `place-${place.uuid}`,
      type: 'Place',
      properties,
    };
  }

  /**
   * 将 RouteSegment 转换为图节点和关系
   */
  convertRouteSegmentToGraph(
    segment: RouteSegment,
    options?: {
      routeDirectionId: string;
      fromPlaceId?: string;
      toPlaceId?: string;
    }
  ): {
    node?: GraphNode;
    relations: GraphRelation[];
  } {
    const relations: GraphRelation[] = [];

    // 如果 segment 有 graphRelations，使用它们
    if (segment.graphRelations) {
      const graphRel = segment.graphRelations;
      
      // 创建 CONNECTS_TO 关系
      if (graphRel.fromPlaceId && graphRel.toPlaceId) {
        relations.push({
          id: `rel-${segment.segmentId}`,
          type: 'CONNECTS_TO',
          from: `place-${graphRel.fromPlaceId}`,
          to: `place-${graphRel.toPlaceId}`,
          properties: {
            segmentId: segment.segmentId,
            dayIndex: segment.dayIndex,
            distanceKm: segment.distanceKm,
            ascentM: segment.ascentM,
            slopePct: segment.slopePct,
          },
        });
      }

      // 创建 HAS_SEGMENT 关系（RouteDirection -> Segment）
      if (options?.routeDirectionId) {
        relations.push({
          id: `rel-rd-seg-${segment.segmentId}`,
          type: 'HAS_SEGMENT',
          from: `route-direction-${options.routeDirectionId}`,
          to: `segment-${segment.segmentId}`,
          properties: {
            dayIndex: segment.dayIndex,
          },
        });
      }
    }

    // 创建 Segment 节点（可选，如果 segment 本身需要作为节点）
    const node: GraphNode | undefined = segment.graphRelations?.graphNodeId
      ? {
          id: `segment-${segment.segmentId}`,
          type: 'RouteSegment',
          properties: {
            segmentId: segment.segmentId,
            dayIndex: segment.dayIndex,
            distanceKm: segment.distanceKm,
            ascentM: segment.ascentM,
            slopePct: segment.slopePct,
            fatigueIndex: 0, // 需要从 DEM 证据计算
            rollingAscent3Days: 0, // 需要从 DEM 证据计算
            routeDirectionId: options?.routeDirectionId || '',
          } as RouteSegmentNodeProperties,
        }
      : undefined;

    return {
      node,
      relations,
    };
  }

  /**
   * 将 RouteDirection 转换为图节点
   */
  convertRouteDirectionToGraphNode(routeDirection: RouteDirectionWithPhilosophy): GraphNode {
    const properties: RouteDirectionNodeProperties = {
      name: routeDirection.name,
      nameCN: routeDirection.nameCN,
      countryCode: routeDirection.countryCode,
      tags: routeDirection.tags || [],
      philosophy: typeof routeDirection.philosophy === 'string'
        ? routeDirection.philosophy
        : routeDirection.philosophy?.coreStatement,
      constraints: routeDirection.constraints as any,
    };

    const routeDirectionId = (routeDirection as any).uuid || String((routeDirection as any).id);

    return {
      id: `route-direction-${routeDirectionId}`,
      type: 'RouteDirection',
      properties,
    };
  }

  /**
   * 将 HumanCapabilityModel 转换为图节点
   */
  convertHumanCapabilityToGraphNode(
    humanCapability: HumanCapabilityModel,
    profileId?: string
  ): GraphNode {
    const properties: HumanCapabilityProfileNodeProperties = {
      profileId: profileId || humanCapability.profileId,
      maxDailyAscentM: humanCapability.maxDailyAscentM,
      rollingAscent3DaysM: humanCapability.rollingAscent3DaysM,
      maxSlopePct: humanCapability.maxSlopePct,
      preferredPace: humanCapability.preferredPace,
      riskTolerance: humanCapability.riskTolerance,
    };

    return {
      id: `human-capability-${profileId || humanCapability.profileId}`,
      type: 'HumanCapabilityProfile',
      properties,
    };
  }

  /**
   * 批量转换 Place 列表为图节点
   */
  convertPlacesToGraphNodes(
    places: Place[],
    options?: {
      countryCode?: string;
      regionId?: string;
    }
  ): GraphNode[] {
    return places.map(place => this.convertPlaceToGraphNode(place, options));
  }

  /**
   * 批量转换 RouteSegment 列表为图节点和关系
   */
  convertRouteSegmentsToGraph(
    segments: RouteSegment[],
    options?: {
      routeDirectionId: string;
    }
  ): {
    nodes: GraphNode[];
    relations: GraphRelation[];
  } {
    const nodes: GraphNode[] = [];
    const relations: GraphRelation[] = [];

    for (const segment of segments) {
      const result = this.convertRouteSegmentToGraph(segment, options);
      if (result.node) {
        nodes.push(result.node);
      }
      relations.push(...result.relations);
    }

    return { nodes, relations };
  }

  /**
   * 从图节点转换回 Place（部分信息）
   * 
   * 注意：这只能恢复部分信息，完整信息需要从数据库查询
   */
  convertGraphNodeToPlace(node: GraphNode): Partial<Place> {
    if (node.type !== 'Place') {
      throw new Error(`节点类型不是 Place: ${node.type}`);
    }

    const props = node.properties as PlaceNodeProperties;

    return {
      nameCN: props.nameCN || props.name,
      nameEN: props.nameEN,
      category: props.poiType as any,
      metadata: {
        elevationMeters: props.elevation,
        countryCode: props.countryCode,
        regionId: props.regionId,
        demEvidence: props.demEvidence,
      } as any,
    };
  }

  /**
   * 生成 Cypher 查询（用于 Neo4j）
   * 
   * 示例：查询适合某个用户画像的地点
   */
  generateCypherQueryForSuitablePlaces(
    humanCapabilityProfileId: string,
    options?: {
      countryCode?: string;
      maxDistance?: number;
      limit?: number;
    }
  ): string {
    let query = `
      MATCH (profile:HumanCapabilityProfile {profileId: $profileId})
      MATCH (place:Place)
    `;

    const conditions: string[] = [];
    const params: Record<string, any> = {
      profileId: humanCapabilityProfileId,
    };

    if (options?.countryCode) {
      conditions.push('place.countryCode = $countryCode');
      params.countryCode = options.countryCode;
    }

    if (options?.maxDistance) {
      conditions.push('place.distance <= $maxDistance');
      params.maxDistance = options.maxDistance;
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      MATCH (place)-[:SUITABLE_FOR]->(profile)
      RETURN place
      ORDER BY place.elevation ASC
      LIMIT ${options?.limit || 10}
    `;

    return query;
  }

  /**
   * 生成 Cypher 查询：查找路径
   */
  generateCypherQueryForPath(
    fromPlaceId: string,
    toPlaceId: string,
    options?: {
      maxDistance?: number;
      maxAscent?: number;
      maxFatigueIndex?: number;
      maxRollingAscent?: number;
      humanCapabilityProfileId?: string;
    }
  ): string {
    let query = `
      MATCH (start:Place {id: $fromPlaceId})
      MATCH (end:Place {id: $toPlaceId})
      MATCH path = (start)-[:CONNECTS_TO*..5]-(end)
    `;

    const conditions: string[] = [];
    const params: Record<string, any> = {
      fromPlaceId: `place-${fromPlaceId}`,
      toPlaceId: `place-${toPlaceId}`,
    };

    if (options?.maxDistance) {
      conditions.push('reduce(total = 0, segment in path.segments | total + segment.distanceKm) <= $maxDistance');
      params.maxDistance = options.maxDistance;
    }

    if (options?.maxAscent) {
      conditions.push('reduce(total = 0, segment in path.segments | total + segment.ascentM) <= $maxAscent');
      params.maxAscent = options.maxAscent;
    }

    if (options?.maxFatigueIndex) {
      conditions.push('ALL(segment IN path.segments WHERE segment.fatigueIndex < $maxFatigueIndex)');
      params.maxFatigueIndex = options.maxFatigueIndex;
    }

    if (options?.maxRollingAscent) {
      conditions.push('ALL(segment IN path.segments WHERE segment.rollingAscent3Days < $maxRollingAscent)');
      params.maxRollingAscent = options.maxRollingAscent;
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      RETURN path
      ORDER BY reduce(total = 0, segment in path.segments | total + segment.ascentM) ASC
      LIMIT 10
    `;

    return query;
  }
}

