// src/places/interfaces/place-graph.interface.ts
/**
 * Place 图数据库扩展接口
 * 
 * 为 Place 模型添加图数据库支持字段
 * 这些字段不会存储在 Prisma 中，而是用于图数据库（Neo4j）的节点表示
 */

import { Place } from '@prisma/client';
import { PlaceNodeProperties, GraphNode, GraphRelation } from '../../trips/decision/graph-db/graph-db.interface';

/**
 * Place 图节点扩展
 * 
 * 在 Place 基础上添加图数据库相关字段
 */
export interface PlaceWithGraph extends Place {
  /** 图节点 ID（用于图数据库） */
  graphNodeId?: string;
  
  /** 图节点属性（从 Place 数据提取） */
  graphProperties?: PlaceNodeProperties;
  
  /** 图关系（从 Place 的关联数据提取） */
  graphRelations?: {
    /** 连接到其他 Place 的关系 */
    connectsTo?: Array<{
      placeId: string;
      distance?: number;
      relationType?: 'CONNECTS_TO' | 'NEARBY' | 'ALONG_ROUTE';
    }>;
    /** 所属的 RouteDirection */
    belongsTo?: Array<{
      routeDirectionId: string;
      relationType?: 'BELONGS_TO';
    }>;
    /** 所属的国家 */
    inCountry?: {
      countryCode: string;
      relationType?: 'IN_COUNTRY';
    };
    /** 所属的区域 */
    inRegion?: {
      regionId: string;
      relationType?: 'IN_REGION';
    };
  };
}

/**
 * Place 到图节点的转换选项
 */
export interface PlaceToGraphNodeOptions {
  /** 是否包含 DEM 证据 */
  includeDemEvidence?: boolean;
  
  /** 是否包含关联关系 */
  includeRelations?: boolean;
  
  /** 关联的 RouteDirection ID（用于生成 BELONGS_TO 关系） */
  routeDirectionId?: string;
  
  /** 关联的国家代码 */
  countryCode?: string;
  
  /** 关联的区域 ID */
  regionId?: string;
}

