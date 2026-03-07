/**
 * TripNara 空间聚类引擎
 *
 * 将城市/目的地拆成若干区域（如东京：浅草、上野、银座、新宿、涩谷、台场）
 * 算法：K-means clustering
 * 输入：places lat/lng
 * 输出：clusterId（供约束引擎使用：同一天 cluster 不超过 2 个）
 *
 * @see docs/Decision_OS_实施例_旅行规划.md
 */

import { Injectable, Logger } from '@nestjs/common';

export interface Point2D {
  id: number;
  lat: number;
  lng: number;
}

/** 带 clusterId 的点 */
export interface ClusteredPoint extends Point2D {
  clusterId: number;
}

const MAX_ITERATIONS = 50;
const EPSILON = 1e-6;

@Injectable()
export class SpatialClusteringEngine {
  private readonly logger = new Logger(SpatialClusteringEngine.name);

  /**
   * K-means 聚类
   * @param points 带 id 的经纬度点
   * @param k 聚类数（默认根据点数动态计算）
   * @returns Map<placeId, clusterId>
   */
  cluster(points: Point2D[], k?: number): Map<number, number> {
    if (points.length === 0) return new Map();
    if (points.length < 3) {
      const m = new Map<number, number>();
      points.forEach((p, i) => m.set(p.id, i));
      return m;
    }

    const kVal = k ?? this.suggestK(points.length);
    const centroids = this.initCentroidsKMeansPlusPlus(points, kVal);
    let assignments = this.assignToCentroids(points, centroids);
    let iter = 0;

    while (iter < MAX_ITERATIONS) {
      const newCentroids = this.recomputeCentroids(points, assignments, kVal);
      const newAssignments = this.assignToCentroids(points, newCentroids);

      if (this.assignmentEqual(assignments, newAssignments)) break;

      assignments = newAssignments;
      iter++;
    }

    const result = new Map<number, number>();
    assignments.forEach((clusterId, placeId) => result.set(placeId, clusterId));

    this.logger.debug(`K-means 完成: ${points.length} 点 -> ${kVal} 簇, ${iter} 轮`);

    return result;
  }

  /**
   * 为候选地点附加 clusterId
   */
  attachClusterIds<T extends { id: number; lat: number; lng: number }>(
    items: T[],
    k?: number,
  ): (T & { clusterId: number })[] {
    if (items.length === 0) return [];

    const points: Point2D[] = items.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
    const clusterMap = this.cluster(points, k);

    return items.map((item) => ({
      ...item,
      clusterId: clusterMap.get(item.id) ?? 0,
    }));
  }

  /** 根据点数建议 K（城市典型 4-8 个区域） */
  private suggestK(n: number): number {
    if (n <= 10) return Math.min(3, n);
    if (n <= 30) return 4;
    if (n <= 80) return 6;
    if (n <= 150) return 8;
    return Math.min(12, Math.ceil(Math.sqrt(n)));
  }

  /** K-means++ 初始化质心 */
  private initCentroidsKMeansPlusPlus(points: Point2D[], k: number): number[][] {
    const centroids: number[][] = [];
    const idx = Math.floor(Math.random() * points.length);
    centroids.push([points[idx].lat, points[idx].lng]);

    for (let c = 1; c < k; c++) {
      const distances = points.map((p) => {
        const d = Math.min(...centroids.map((c) => this.haversineMeters(p.lat, p.lng, c[0], c[1])));
        return d * d;
      });
      const total = distances.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let chosen = 0;
      for (let i = 0; i < distances.length; i++) {
        r -= distances[i];
        if (r <= 0) {
          chosen = i;
          break;
        }
      }
      centroids.push([points[chosen].lat, points[chosen].lng]);
    }

    return centroids;
  }

  private assignToCentroids(points: Point2D[], centroids: number[][]): Map<number, number> {
    const m = new Map<number, number>();
    for (const p of points) {
      let minD = Infinity;
      let best = 0;
      for (let i = 0; i < centroids.length; i++) {
        const d = this.haversineMeters(p.lat, p.lng, centroids[i][0], centroids[i][1]);
        if (d < minD) {
          minD = d;
          best = i;
        }
      }
      m.set(p.id, best);
    }
    return m;
  }

  private recomputeCentroids(
    points: Point2D[],
    assignments: Map<number, number>,
    k: number,
  ): number[][] {
    const sums: number[][] = Array.from({ length: k }, () => [0, 0]);
    const counts: number[] = Array(k).fill(0);

    for (const p of points) {
      const c = assignments.get(p.id) ?? 0;
      sums[c][0] += p.lat;
      sums[c][1] += p.lng;
      counts[c]++;
    }

    return sums.map((s, i) =>
      counts[i] > 0 ? [s[0] / counts[i], s[1] / counts[i]] : [sums[i][0], sums[i][1]],
    );
  }

  private assignmentEqual(a: Map<number, number>, b: Map<number, number>): boolean {
    if (a.size !== b.size) return false;
    for (const [id, c] of a) {
      if (b.get(id) !== c) return false;
    }
    return true;
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
}
