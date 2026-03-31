import type { WorldPoiRecord } from './poi-world-model.mock';

export interface PoiSourceContext {
  destination: string;
  researchPoiEvidence?: unknown;
}

export interface PoiSourceResult {
  source: string;
  confidence: number;
  pois: WorldPoiRecord[];
}

export interface PoiDataSourceProvider {
  name: string;
  fetch(context: PoiSourceContext): PoiSourceResult;
}

function asArray(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray((input as { pois?: unknown[] }).pois)) {
    return (input as { pois: unknown[] }).pois;
  }
  return [];
}

function isTravelCategory(rawCategory: string): boolean {
  const c = rawCategory.toUpperCase();
  if (!c) return true;
  const blocked = ['HOSPITAL', 'TRANSIT_HUB', 'GAS_STATION', 'CLINIC', 'AIRPORT_SERVICE'];
  if (blocked.some((b) => c.includes(b))) return false;
  return true;
}

function hasVectorSignals(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  if (typeof o.vector_score === 'number') return true;
  if (typeof o.similarity === 'number') return true;
  if (typeof o.embeddingScore === 'number') return true;
  const metadata = o.metadata as Record<string, unknown> | undefined;
  if (!metadata) return false;
  const source = String(metadata.source ?? metadata.engine ?? '').toLowerCase();
  return source.includes('vector') || source.includes('hybrid');
}

function inferType(raw: string): WorldPoiRecord['type'] {
  const t = raw.toLowerCase();
  if (/寺|神宫|博物馆|culture|temple/.test(t)) return 'culture';
  if (/餐|寿司|food|restaurant/.test(t)) return 'food';
  if (/公园|休息|relax/.test(t)) return 'relax';
  if (/塔|landmark|地标|tower/.test(t)) return 'landmark';
  return 'city';
}

function inferBestTime(type: WorldPoiRecord['type']): WorldPoiRecord['best_time'] {
  if (type === 'culture') return 'morning';
  if (type === 'landmark') return 'night';
  return 'afternoon';
}

function toWorldPoi(item: unknown, index: number): WorldPoiRecord | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const name = String(o.name ?? o.nameCN ?? o.title ?? '').trim();
  if (!name) return null;
  const rawCategory = String(o.category ?? o.type ?? '');
  if (!isTravelCategory(rawCategory)) return null;
  const type = inferType(String(o.type ?? o.category ?? name));
  const coordsObj = (o.coordinates ?? o.location ?? {}) as Record<string, unknown>;
  const lat = Number(coordsObj.lat ?? coordsObj.latitude ?? o.lat ?? 0);
  const lng = Number(coordsObj.lng ?? coordsObj.longitude ?? o.lng ?? 0);
  return {
    id: String(o.place_id ?? o.id ?? `research-${index}`),
    name,
    type,
    best_time: inferBestTime(type),
    duration: Number(o.duration ?? 60),
    rating: Number(o.rating ?? o.score ?? 4.2),
    price_level: (Number(o.price_level ?? 2) as 1 | 2 | 3 | 4),
    coordinates: { lat, lng },
  };
}

function isPoiWithinDestinationBounds(destination: string, poi: WorldPoiRecord): boolean {
  const d = destination.toLowerCase();
  const { lat, lng } = poi.coordinates;

  // Iceland rough bbox
  if (d.includes('冰岛') || d.includes('iceland')) {
    return lat >= 63 && lat <= 67.8 && lng >= -25.5 && lng <= -13.0;
  }

  // Tokyo rough bbox
  if (d.includes('东京') || d.includes('tokyo')) {
    return lat >= 35.4 && lat <= 35.9 && lng >= 139.4 && lng <= 140.1;
  }

  return true;
}

export class ResearchPoiProvider implements PoiDataSourceProvider {
  name = 'research';

  fetch(context: PoiSourceContext): PoiSourceResult {
    const pois = asArray(context.researchPoiEvidence)
      .map((item, idx) => toWorldPoi(item, idx))
      .filter((p): p is WorldPoiRecord => !!p)
      .filter((p) => isPoiWithinDestinationBounds(context.destination, p));
    return {
      source: this.name,
      confidence: pois.length > 0 ? 0.9 : 0,
      pois,
    };
  }
}

export class VectorSearchPoiProvider implements PoiDataSourceProvider {
  name = 'vector_search';

  fetch(context: PoiSourceContext): PoiSourceResult {
    const raw = asArray(context.researchPoiEvidence);
    const vectorCandidates = raw.filter((item) => hasVectorSignals(item));
    const pois = (vectorCandidates.length > 0 ? vectorCandidates : raw)
      .map((item, idx) => toWorldPoi(item, idx))
      .filter((p): p is WorldPoiRecord => !!p)
      .filter((p) => isPoiWithinDestinationBounds(context.destination, p));
    return {
      source: this.name,
      confidence: pois.length > 0 ? 0.95 : 0,
      pois,
    };
  }
}

export function defaultPoiProviders(): PoiDataSourceProvider[] {
  // 只返回真实检索结果；无结果时由上层 fallback 走通用行程节点，不注入硬编码 POI。
  return [new VectorSearchPoiProvider(), new ResearchPoiProvider()];
}
