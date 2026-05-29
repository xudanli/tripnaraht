import * as fs from 'fs';
import * as path from 'path';

export type HighlandPoiRow = {
  id: string;
  nameCN: string;
  nameEN: string;
  nameIS?: string;
  subCategory: string;
  lat: number;
  lng: number;
  description?: string;
  role?: string;
  elevation_m?: number;
  capacity?: number;
  facilities?: {
    requiresBooking?: boolean;
    hasHeating?: boolean;
    allowsCamping?: boolean;
    hasSignal?: boolean;
  };
  operator?: string;
  riverInfo?: Record<string, unknown>;
  warnings?: string[];
};

let cachedPois: Map<string, HighlandPoiRow> | null = null;

export function getHighlandPoiById(id: string): HighlandPoiRow | undefined {
  return loadHighlandPoiCatalog().get(id);
}

export function getHighlandPoisByIds(ids: readonly string[]): HighlandPoiRow[] {
  const catalog = loadHighlandPoiCatalog();
  return ids.map((id) => catalog.get(id)).filter((p): p is HighlandPoiRow => !!p);
}

function loadHighlandPoiCatalog(): Map<string, HighlandPoiRow> {
  if (cachedPois) return cachedPois;
  const filePath = path.join(process.cwd(), 'data', 'iceland', 'highland-froad-pois.json');
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { pois?: HighlandPoiRow[] };
    cachedPois = new Map((raw.pois ?? []).map((p) => [p.id, p]));
  } catch {
    cachedPois = new Map();
  }
  return cachedPois;
}
