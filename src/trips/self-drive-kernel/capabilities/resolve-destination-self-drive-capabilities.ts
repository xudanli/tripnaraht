/**
 * 从 Destination Pack 加载自驾 capabilities；未知国家返回保守 NONE/PARTIAL 默认。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  DESTINATION_SELF_DRIVE_CAPABILITIES_SCHEMA,
  type CapabilityLevel,
  type DestinationSelfDriveCapabilities,
  type DestinationSelfDriveCapabilityFlags,
} from '../contracts/destination-self-drive-capabilities.types';

const NONE_FLAGS: DestinationSelfDriveCapabilityFlags = {
  road_status: 'NONE',
  vehicle_road_fit: 'NONE',
  altitude_risk: 'NONE',
  restricted_area: 'NONE',
  seasonal_window: 'NONE',
  ferry: 'NONE',
  toll: 'NONE',
  live_traffic: 'NONE',
  checkpoint: 'NONE',
  fuel_density: 'NONE',
  charging: 'NONE',
};

const PACK_DIR_BY_COUNTRY: Record<string, { dir: string; packId: string }> = {
  CN: { dir: 'cn', packId: 'destination.cn' },
  CHN: { dir: 'cn', packId: 'destination.cn' },
  CHINA: { dir: 'cn', packId: 'destination.cn' },
  IS: { dir: 'is', packId: 'destination.is' },
  ICELAND: { dir: 'is', packId: 'destination.is' },
  NZ: { dir: 'nz', packId: 'destination.nz' },
};

const cache = new Map<string, DestinationSelfDriveCapabilities>();

function normalizeCountry(code: string | null | undefined): string {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/^中国$/, 'CN');
}

function asLevel(raw: unknown, fallback: CapabilityLevel = 'NONE'): CapabilityLevel {
  const v = String(raw ?? '').toUpperCase();
  if (
    v === 'NONE' ||
    v === 'PARTIAL' ||
    v === 'SUPPORTED' ||
    v === 'PROVIDER_DEPENDENT'
  ) {
    return v;
  }
  return fallback;
}

function mergeFlags(
  partial: Partial<Record<keyof DestinationSelfDriveCapabilityFlags, unknown>> | null,
): DestinationSelfDriveCapabilityFlags {
  return {
    road_status: asLevel(partial?.road_status),
    vehicle_road_fit: asLevel(partial?.vehicle_road_fit),
    altitude_risk: asLevel(partial?.altitude_risk),
    restricted_area: asLevel(partial?.restricted_area),
    seasonal_window: asLevel(partial?.seasonal_window),
    ferry: asLevel(partial?.ferry),
    toll: asLevel(partial?.toll),
    live_traffic: asLevel(partial?.live_traffic),
    checkpoint: asLevel(partial?.checkpoint),
    fuel_density: asLevel(partial?.fuel_density),
    charging: asLevel(partial?.charging),
  };
}

function fallbackCapabilities(countryCode: string): DestinationSelfDriveCapabilities {
  const mapped = PACK_DIR_BY_COUNTRY[countryCode];
  const packId = mapped?.packId ?? `destination.${countryCode.toLowerCase() || 'unknown'}`;
  return {
    schemaId: DESTINATION_SELF_DRIVE_CAPABILITIES_SCHEMA,
    packId,
    countryCode: countryCode || 'UNKNOWN',
    version: '0.0.0-fallback',
    capabilities: { ...NONE_FLAGS },
    notes: 'No self-drive-capabilities.v1.json; Kernel treats destination as capability-empty.',
  };
}

export function resolveDestinationPackId(countryCode: string | null | undefined): string {
  const cc = normalizeCountry(countryCode);
  return PACK_DIR_BY_COUNTRY[cc]?.packId ?? `destination.${(cc || 'unknown').toLowerCase()}`;
}

export function resolveDestinationSelfDriveCapabilities(
  countryCode: string | null | undefined,
): DestinationSelfDriveCapabilities {
  const cc = normalizeCountry(countryCode);
  if (cache.has(cc)) return cache.get(cc)!;

  const mapped = PACK_DIR_BY_COUNTRY[cc];
  if (!mapped) {
    const fb = fallbackCapabilities(cc);
    cache.set(cc, fb);
    return fb;
  }

  const filePath = path.join(
    process.cwd(),
    'data/destination-packs',
    mapped.dir,
    'self-drive-capabilities.v1.json',
  );

  if (!fs.existsSync(filePath)) {
    const fb = fallbackCapabilities(cc);
    cache.set(cc, fb);
    return fb;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const caps = mergeFlags(
      (raw.capabilities as Partial<
        Record<keyof DestinationSelfDriveCapabilityFlags, unknown>
      >) ?? null,
    );
    const resolved: DestinationSelfDriveCapabilities = {
      schemaId: DESTINATION_SELF_DRIVE_CAPABILITIES_SCHEMA,
      packId: String(raw.packId ?? mapped.packId),
      countryCode: String(raw.countryCode ?? cc),
      version: String(raw.version ?? '0.0.0'),
      capabilities: caps,
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    };
    cache.set(cc, resolved);
    return resolved;
  } catch {
    const fb = fallbackCapabilities(cc);
    cache.set(cc, fb);
    return fb;
  }
}

/** 测试用：清空文件缓存 */
export function clearDestinationSelfDriveCapabilitiesCache(): void {
  cache.clear();
}
