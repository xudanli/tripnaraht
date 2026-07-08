import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildRouteDetailPreview,
  resolveIcelandRouteDetail,
  type ExplorationRouteDetailCatalogEntry,
  type ExplorationRouteDetailPayload,
} from '../config/iceland-route-detail.catalog';
import type {
  ExplorationRouteDetailView,
  ExplorationRoutePreviewView,
} from '../types/exploration.types';

interface VariantOverlay {
  title?: string | null;
  narrative?: string | null;
  routeDetail?: unknown;
  tagline?: string | null;
}

@Injectable()
export class ExplorationRouteDetailService {
  getRouteDetail(routeId: string, variant?: VariantOverlay): ExplorationRouteDetailView | null {
    const stored = this.parseStoredDetail(variant?.routeDetail);
    const entry = stored ? this.entryFromStored(routeId, stored) : resolveIcelandRouteDetail(routeId);
    if (!entry) return null;
    return this.toDetailView(entry, variant);
  }

  getRoutePreview(
    routeId: string,
    variant?: Pick<VariantOverlay, 'routeDetail'>,
  ): ExplorationRoutePreviewView | null {
    const stored = this.parseStoredDetail(variant?.routeDetail);
    const entry = stored ? this.entryFromStored(routeId, stored) : resolveIcelandRouteDetail(routeId);
    if (!entry) return null;
    return {
      routeId: entry.routeId,
      tagline: entry.tagline,
      badge: entry.badge,
      preview: buildRouteDetailPreview(entry),
    };
  }

  requireRouteDetail(routeId: string, variant?: VariantOverlay): ExplorationRouteDetailView {
    const detail = this.getRouteDetail(routeId, variant);
    if (!detail) {
      throw new NotFoundException(`Route detail not found for ${routeId}`);
    }
    return detail;
  }

  /** 解析已持久化的 routeDetail JSON（供 CPRE resolvedPois 回写） */
  parseStoredRouteDetail(raw: unknown): ExplorationRouteDetailPayload | null {
    return this.parseStoredDetail(raw);
  }

  private parseStoredDetail(raw: unknown): ExplorationRouteDetailPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as ExplorationRouteDetailPayload;
    if (!Array.isArray(d.days) || !d.map?.mainLine) return null;
    return d;
  }

  private entryFromStored(
    routeId: string,
    detail: ExplorationRouteDetailPayload,
  ): ExplorationRouteDetailCatalogEntry | null {
    const catalog = resolveIcelandRouteDetail(routeId);
    if (!catalog) {
      return {
        strategyId: routeId.replace(/^route_/, ''),
        routeId,
        title: routeId,
        tagline: '',
        badge: { label: '个性化', tone: 'balanced' },
        detail,
      };
    }
    return { ...catalog, detail };
  }

  private toDetailView(
    entry: ExplorationRouteDetailCatalogEntry,
    variant?: VariantOverlay,
  ): ExplorationRouteDetailView {
    const detail = entry.detail;
    return {
      routeId: entry.routeId,
      strategyId: entry.strategyId,
      title: variant?.title?.trim() || entry.title,
      tagline: variant?.tagline?.trim() || entry.tagline,
      badge: entry.badge,
      detail: {
        ...detail,
        resolvedPois: detail.resolvedPois ?? [],
      },
    };
  }
}
