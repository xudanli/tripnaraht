// src/itinerary-optimization/interfaces/route-optimization.interface.ts

import { PlaceCategory } from '@prisma/client';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';

/**
 * 地点节点（用于路线优化）
 */
export interface PlaceNode {
  /** 地点 ID */
  id: number;
  
  /** 地点名称 */
  name: string;
  
  /** 类别 */
  category: PlaceCategory;
  
  /** 位置坐标 */
  location: { lat: number; lng: number };
  
  /** 体力消耗元数据 */
  physicalMetadata?: PhysicalMetadata;
  
  /** 强度等级 (LOW, MEDIUM, HIGH) */
  intensity?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 预估游玩时长（分钟） */
  estimatedDuration?: number;
  
  /** 营业时间（用于约束） */
  openingHours?: {
    start?: string; // "09:00"
    end?: string;   // "18:00"
  };
  
  /** VRPTW 时间窗约束 [最早到达时间, 最晚到达时间] (ISO 8601 datetime) */
  timeWindow?: {
    earliest: string; // ISO 8601 datetime, 例如: "2024-01-01T09:00:00+09:00"
    latest: string;   // ISO 8601 datetime, 例如: "2024-01-01T22:00:00+09:00"
  };
  
  /** VRPTW 服务时长（分钟）- 在地点必须停留的时间 */
  serviceTime?: number; // 分钟，例如: 120 (游玩2小时)
  
  /** 是否为餐厅 */
  isRestaurant?: boolean;
  
  /** 是否为休息点 */
  isRest?: boolean;

  /** 关联的Trail ID（如果是徒步路线） */
  trailId?: number;

  /** Trail数据（如果关联了Trail） */
  trailData?: {
    distanceKm: number;
    elevationGainM: number;
    maxElevationM?: number;
    difficultyLevel?: string;
    estimatedDurationHours?: number;
  };
}

/**
 * 路线方案（优化后的行程安排）
 */
export interface RouteSolution {
  /** 路线中的节点序列 */
  nodes: PlaceNode[];
  
  /** 每个节点的时间安排 */
  schedule: Array<{
    nodeIndex: number;
    startTime: string; // ISO 8601
    endTime: string;   // ISO 8601
    transportTime?: number; // 到下一个点的交通时间（分钟）
  }>;
  
  /** 快乐值总分 */
  happinessScore: number;
  
  /** 分数明细 */
  scoreBreakdown: {
    interestScore: number;      // 兴趣分
    distancePenalty: number;    // 距离惩罚
    tiredPenalty: number;       // 疲劳惩罚
    boredPenalty: number;       // 厌倦惩罚
    starvePenalty: number;      // 饥饿惩罚
    clusteringBonus: number;    // 聚类奖励
    bufferBonus: number;        // 留白奖励
  };
  
  /** 聚类区域（Zone） */
  zones?: Zone[];
}

/**
 * 聚类区域（Zone）
 */
export interface Zone {
  /** 区域 ID */
  id: number;
  
  /** 区域中心点 */
  centroid: { lat: number; lng: number };
  
  /** 区域内的地点 */
  places: PlaceNode[];
  
  /** 区域半径（米） */
  radius: number;
}

/**
 * 优化配置
 */
export interface OptimizationConfig {
  /** 行程日期 */
  date: string; // ISO 8601 date
  
  /** 开始时间 */
  startTime: string; // ISO 8601 datetime
  
  /** 结束时间 */
  endTime: string; // ISO 8601 datetime
  
  /** 节奏因子（1.0 = 标准, 1.5 = 慢节奏, 0.7 = 快节奏） */
  pacingFactor: number;
  
  /** 是否带小孩 */
  hasChildren?: boolean;
  
  /** 是否带老人 */
  hasElderly?: boolean;
  
  /** 午餐时间窗 */
  lunchWindow?: {
    start: string; // "12:00"
    end: string;   // "13:30"
  };
  
  /** 晚餐时间窗 */
  dinnerWindow?: {
    start: string; // "18:00"
    end: string;   // "20:00"
  };
  
  /** 聚类参数 */
  clustering?: {
    /** 最小聚类点数 */
    minPoints?: number;
    /** 聚类半径（米） */
    epsilon?: number;
  };
  
  /** 是否启用 VRPTW 算法（带时间窗约束） */
  useVRPTW?: boolean;
}

/**
 * VRPTW 输入数据结构
 */
export interface VRPTWInput {
  /** 地点列表 */
  locations: Array<{
    id: number;
    name: string;
    /** 时间窗 [最早到达时间, 最晚到达时间] (ISO 8601 datetime) */
    window?: [string, string];
    /** 服务时长（分钟） */
    duration: number;
  }>;
  
  /** 时间矩阵 (N×N 矩阵，表示从地点 i 到地点 j 的旅行时间，单位：分钟) */
  timeMatrix: number[][];
  
  /** 起点索引（通常是酒店，索引为 0） */
  startIndex?: number;
  
  /** 终点索引（如果与起点不同） */
  endIndex?: number;
}

/**
 * VRPTW 输出结果
 */
export interface VRPTWResult {
  /** 优化后的路线（地点索引序列） */
  route: number[];
  
  /** 每个地点的到达时间 (ISO 8601 datetime) */
  arrivalTimes: string[];
  
  /** 每个地点的离开时间 (ISO 8601 datetime) */
  departureTimes: string[];
  
  /** 是否满足所有时间窗约束 */
  feasible: boolean;
  
  /** 违反的时间窗约束（如果有） */
  violations?: Array<{
    locationId: number;
    locationName: string;
    expectedWindow: [string, string];
    actualArrival: string;
    violationType: 'EARLY' | 'LATE';
  }>;
}

