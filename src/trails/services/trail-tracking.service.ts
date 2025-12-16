// src/trails/services/trail-tracking.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TrailTrackingPoint {
  /** 时间戳 */
  timestamp: string;
  /** 纬度 */
  latitude: number;
  /** 经度 */
  longitude: number;
  /** 海拔（可选） */
  elevation?: number;
  /** 精度（米） */
  accuracy?: number;
  /** 速度（米/秒，可选） */
  speed?: number;
}

export interface TrailTrackingSession {
  /** 会话ID */
  sessionId: string;
  /** 关联的Trail ID */
  trailId: number;
  /** 关联的ItineraryItem ID */
  itineraryItemId?: string;
  /** 开始时间 */
  startTime: string;
  /** 结束时间（如果还在进行中则为null） */
  endTime?: string;
  /** 轨迹点列表 */
  points: TrailTrackingPoint[];
  /** 统计信息 */
  statistics: {
    totalDistanceKm: number;
    totalElevationGainM: number;
    averageSpeedKmh: number;
    maxSpeedKmh: number;
    durationMinutes: number;
  };
}

/**
 * 实时轨迹追踪服务
 * 
 * 支持实时记录用户位置，与计划轨迹对比
 */
@Injectable()
export class TrailTrackingService {
  // 内存中的活跃会话（实际应该使用Redis）
  private activeSessions = new Map<string, TrailTrackingSession>();

  constructor(private prisma: PrismaService) {}

  /**
   * 开始追踪会话
   */
  async startTracking(
    trailId: number,
    itineraryItemId?: string
  ): Promise<{ sessionId: string }> {
    const sessionId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: TrailTrackingSession = {
      sessionId,
      trailId,
      itineraryItemId,
      startTime: new Date().toISOString(),
      points: [],
      statistics: {
        totalDistanceKm: 0,
        totalElevationGainM: 0,
        averageSpeedKmh: 0,
        maxSpeedKmh: 0,
        durationMinutes: 0,
      },
    };

    this.activeSessions.set(sessionId, session);

    return { sessionId };
  }

  /**
   * 添加追踪点
   */
  async addTrackingPoint(
    sessionId: string,
    point: TrailTrackingPoint
  ): Promise<{ success: boolean; deviation?: number }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`追踪会话不存在: ${sessionId}`);
    }

    // 添加点
    session.points.push(point);

    // 更新统计信息
    this.updateStatistics(session);

    // 计算与计划轨迹的偏差
    const deviation = await this.calculateDeviation(session.trailId, point);

    return {
      success: true,
      deviation,
    };
  }

  /**
   * 结束追踪会话
   */
  async stopTracking(sessionId: string): Promise<TrailTrackingSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`追踪会话不存在: ${sessionId}`);
    }

    session.endTime = new Date().toISOString();
    this.updateStatistics(session);

    // 保存到数据库（可选）
    // await this.saveTrackingSession(session);

    // 从内存中移除
    this.activeSessions.delete(sessionId);

    return session;
  }

  /**
   * 获取追踪会话
   */
  getTrackingSession(sessionId: string): TrailTrackingSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * 计算与计划轨迹的偏差
   */
  private async calculateDeviation(
    trailId: number,
    currentPoint: TrailTrackingPoint
  ): Promise<number> {
    // 获取Trail的计划轨迹
    const trail = await this.prisma.trail.findUnique({
      where: { id: trailId },
    });

    if (!trail || !trail.gpxData) {
      return 0;
    }

    // 解析GPX数据
    let plannedPoints: Array<{ lat: number; lng: number }> = [];
    try {
      const gpx = typeof trail.gpxData === 'string' 
        ? JSON.parse(trail.gpxData) 
        : trail.gpxData;
      
      if (gpx.points && Array.isArray(gpx.points)) {
        plannedPoints = gpx.points;
      }
    } catch (e) {
      return 0;
    }

    if (plannedPoints.length === 0) {
      return 0;
    }

    // 计算到计划轨迹的最短距离
    const minDistance = plannedPoints.reduce((min, planned) => {
      const dist = this.haversineDistance(
        currentPoint.latitude,
        currentPoint.longitude,
        planned.lat,
        planned.lng
      );
      return Math.min(min, dist);
    }, Infinity);

    return minDistance * 1000; // 转为米
  }

  /**
   * 更新统计信息
   */
  private updateStatistics(session: TrailTrackingSession): void {
    if (session.points.length < 2) {
      return;
    }

    let totalDistance = 0;
    let totalElevationGain = 0;
    const speeds: number[] = [];

    for (let i = 1; i < session.points.length; i++) {
      const prev = session.points[i - 1];
      const curr = session.points[i];

      // 计算距离
      const distance = this.haversineDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude
      );
      totalDistance += distance;

      // 计算爬升
      if (prev.elevation && curr.elevation) {
        const elevationDiff = curr.elevation - prev.elevation;
        if (elevationDiff > 0) {
          totalElevationGain += elevationDiff;
        }
      }

      // 计算速度（如果有时间戳）
      if (prev.timestamp && curr.timestamp) {
        const timeDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000; // 秒
        if (timeDiff > 0) {
          const speed = (distance * 1000) / timeDiff; // 米/秒
          speeds.push(speed);
        }
      }
    }

    // 计算平均速度和最大速度
    const averageSpeed = speeds.length > 0
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length
      : 0;
    const maxSpeed = speeds.length > 0
      ? Math.max(...speeds)
      : 0;

    // 计算持续时间
    const startTime = new Date(session.startTime).getTime();
    const endTime = session.endTime 
      ? new Date(session.endTime).getTime()
      : Date.now();
    const durationMinutes = (endTime - startTime) / (1000 * 60);

    session.statistics = {
      totalDistanceKm: totalDistance,
      totalElevationGainM: totalElevationGain,
      averageSpeedKmh: averageSpeed * 3.6, // 转为km/h
      maxSpeedKmh: maxSpeed * 3.6,
      durationMinutes,
    };
  }

  /**
   * Haversine距离计算（公里）
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

