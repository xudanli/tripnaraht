// src/trips/decision/graph-db/graph-db.interface.ts
/**
 * 图数据库接口设计
 * 
 * 基于 Neo4j 或 ArangoDB 的知识图谱
 * 
 * 设计原则：
 * - 按图的数据结构设计 Data Object
 * - 支持高效的关系查询
 * - 支持图算法（Dijkstra、A* 等）
 * 
 * 注意：这是接口设计，实际实现需要：
 * 1. 安装 Neo4j 或 ArangoDB
 * 2. 迁移现有数据到图数据库
 * 3. 在 Priority 1 阶段先按图结构设计，Priority 2 再上库
 */

/**
 * 图节点类型
 */
export type GraphNodeType =
  | 'Place'
  | 'RouteDirection'
  | 'RouteSegment'
  | 'Country'
  | 'Region'
  | 'HumanCapabilityProfile';

/**
 * 图关系类型
 */
export type GraphRelationType =
  | 'CONNECTS_TO'
  | 'BELONGS_TO'
  | 'HAS_SEGMENT'
  | 'IN_COUNTRY'
  | 'IN_REGION'
  | 'SUITABLE_FOR'
  | 'REQUIRES'
  | 'AVOIDS';

/**
 * 图节点基础接口
 */
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  properties: Record<string, any>;
}

/**
 * 图关系接口
 */
export interface GraphRelation {
  id: string;
  type: GraphRelationType;
  from: string; // 源节点 ID
  to: string; // 目标节点 ID
  properties: Record<string, any>;
}

/**
 * Place 节点属性
 */
export interface PlaceNodeProperties {
  name: string;
  nameCN?: string;
  nameEN?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  slope?: number;
  distance?: number; // 到下一个节点的距离（米）
  demEvidence?: {
    cumulativeAscent?: number;
    maxSlopePct?: number;
    fatigueIndex?: number;
  };
  poiType?: string;
  countryCode: string;
  regionId?: string;
}

/**
 * RouteDirection 节点属性
 */
export interface RouteDirectionNodeProperties {
  name: string;
  nameCN: string;
  countryCode: string;
  tags: string[];
  philosophy?: string;
  constraints?: Record<string, any>;
}

/**
 * RouteSegment 节点属性
 */
export interface RouteSegmentNodeProperties {
  segmentId: string;
  dayIndex: number;
  distanceKm: number;
  ascentM: number;
  slopePct: number;
  fatigueIndex: number;
  rollingAscent3Days: number;
  routeDirectionId: string;
}

/**
 * HumanCapabilityProfile 节点属性
 */
export interface HumanCapabilityProfileNodeProperties {
  profileId: string;
  maxDailyAscentM: number;
  rollingAscent3DaysM: number;
  maxSlopePct: number;
  preferredPace: 'SLOW' | 'MEDIUM' | 'FAST';
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 图查询结果
 */
export interface GraphQueryResult {
  nodes: GraphNode[];
  relations: GraphRelation[];
  paths?: Array<{
    nodes: GraphNode[];
    relations: GraphRelation[];
    totalDistance?: number;
    totalAscent?: number;
    fatigueIndex?: number;
  }>;
}

/**
 * 图数据库服务接口
 */
export interface IGraphDatabaseService {
  /**
   * 创建节点
   */
  createNode(node: GraphNode): Promise<void>;

  /**
   * 创建关系
   */
  createRelation(relation: GraphRelation): Promise<void>;

  /**
   * 查询节点
   */
  findNode(id: string, type?: GraphNodeType): Promise<GraphNode | null>;

  /**
   * 查询关系
   */
  findRelations(
    fromId: string,
    toId?: string,
    relationType?: GraphRelationType
  ): Promise<GraphRelation[]>;

  /**
   * 查询路径（支持图算法）
   */
  findPath(
    fromId: string,
    toId: string,
    options?: {
      maxDistance?: number;
      maxAscent?: number;
      maxFatigueIndex?: number;
      maxRollingAscent?: number;
      humanCapabilityProfileId?: string;
    }
  ): Promise<GraphQueryResult>;

  /**
   * 查询适合某个用户画像的地点
   */
  findSuitablePlaces(
    humanCapabilityProfileId: string,
    options?: {
      countryCode?: string;
      regionId?: string;
      maxDistance?: number;
      limit?: number;
    }
  ): Promise<GraphNode[]>;

  /**
   * 批量导入数据
   */
  importData(nodes: GraphNode[], relations: GraphRelation[]): Promise<void>;
}

/**
 * Cypher 查询示例（Neo4j）
 * 
 * 查询适合 Dr.Dre 节奏的替代路径：
 * 
 * ```cypher
 * MATCH (start:Place {id: $startId})
 * MATCH (end:Place {id: $endId})
 * MATCH path = (start)-[:CONNECTS_TO*..5]-(end)
 * WHERE ALL(segment IN path.segments WHERE 
 *   segment.fatigueIndex < $maxFatigue AND
 *   segment.rollingAscent3Days < $maxRollingAscent
 * )
 * RETURN path
 * ORDER BY path.totalAscent ASC
 * LIMIT 10
 * ```
 */

