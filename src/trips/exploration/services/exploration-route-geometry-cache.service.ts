import { Injectable } from '@nestjs/common';
import { explorationRouteGeometryCacheTtlSec } from '../config/exploration-route-generation.config';
import type { RouteLineCoordinates } from '../config/iceland-route-detail.catalog';

interface CacheEntry {
  points: RouteLineCoordinates;
  expiresAt: number;
}

@Injectable()
export class ExplorationRouteGeometryCacheService {
  private readonly store = new Map<string, CacheEntry>();

  getSegmentKey(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
    return `${fromLng.toFixed(5)},${fromLat.toFixed(5)};${toLng.toFixed(5)},${toLat.toFixed(5)}`;
  }

  get(key: string): RouteLineCoordinates | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.points;
  }

  set(key: string, points: RouteLineCoordinates): void {
    this.store.set(key, {
      points,
      expiresAt: Date.now() + explorationRouteGeometryCacheTtlSec() * 1000,
    });
  }

  clear(): void {
    this.store.clear();
  }
}
