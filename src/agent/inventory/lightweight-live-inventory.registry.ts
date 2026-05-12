/**
 * 轻量路径 Live Inventory：Sensor 注册声明 + 依赖标签 + 默认陈旧 TTL。
 * 编排仍由各 Branch 实现；此处提供单一真相与 snapshot 元数据组装（后续 Arbitration / refresh 可扩展）。
 */

export const LIGHTWEIGHT_INVENTORY_REGISTRY_VERSION = 1 as const;

export type LightweightInventorySensorId = 'weather' | 'flight' | 'hotel' | 'car_rental';

/** 逻辑依赖键（可与 Trip 字段、门禁对齐；仲裁层消费） */
export type LightweightInventoryDependencyKey =
  | 'location_anchor'
  | 'trip_dates'
  | 'nightly_anchor'
  | 'driving_region'
  | 'route_topology'
  | 'amadeus_credentials';

export const LIGHTWEIGHT_INVENTORY_SENSOR_DECLARATIONS: Record<
  LightweightInventorySensorId,
  {
    depends_on: readonly LightweightInventoryDependencyKey[];
    /** 建议陈旧阈值（秒）；solver 前应校验或与 observability 对齐 */
    default_ttl_seconds: number;
  }
> = {
  weather: {
    depends_on: ['location_anchor'],
    default_ttl_seconds: 15 * 60,
  },
  flight: {
    depends_on: ['trip_dates', 'amadeus_credentials'],
    default_ttl_seconds: 20 * 60,
  },
  hotel: {
    depends_on: ['trip_dates', 'nightly_anchor'],
    default_ttl_seconds: 10 * 60,
  },
  car_rental: {
    depends_on: ['trip_dates', 'driving_region'],
    default_ttl_seconds: 30 * 60,
  },
};

export type InventorySnapshotSensorMeta = {
  sensor_id: LightweightInventorySensorId;
  captured_at_iso: string;
  stale_after_iso: string;
  default_ttl_seconds: number;
  depends_on: readonly LightweightInventoryDependencyKey[];
};

export type InventorySnapshotsMetaPayload = {
  registry_version: typeof LIGHTWEIGHT_INVENTORY_REGISTRY_VERSION;
  sensors: InventorySnapshotSensorMeta[];
};

function staleAfterIso(capturedAtIso: string, ttlSeconds: number): string {
  const t = Date.parse(capturedAtIso);
  if (!Number.isFinite(t)) return capturedAtIso;
  return new Date(t + ttlSeconds * 1000).toISOString();
}

/**
 * 根据各 sensor 完成快照的 ISO 时间组装统一 freshness 块（仅包含本次实际产出快照的 sensor）。
 */
export function buildInventorySnapshotsMeta(
  capturedAtBySensor: Partial<Record<LightweightInventorySensorId, string | undefined>>,
): InventorySnapshotsMetaPayload | undefined {
  const sensors: InventorySnapshotSensorMeta[] = [];
  for (const id of Object.keys(LIGHTWEIGHT_INVENTORY_SENSOR_DECLARATIONS) as LightweightInventorySensorId[]) {
    const raw = capturedAtBySensor[id]?.trim();
    if (!raw) continue;
    const decl = LIGHTWEIGHT_INVENTORY_SENSOR_DECLARATIONS[id];
    sensors.push({
      sensor_id: id,
      captured_at_iso: raw,
      stale_after_iso: staleAfterIso(raw, decl.default_ttl_seconds),
      default_ttl_seconds: decl.default_ttl_seconds,
      depends_on: decl.depends_on,
    });
  }
  if (sensors.length === 0) return undefined;
  return {
    registry_version: LIGHTWEIGHT_INVENTORY_REGISTRY_VERSION,
    sensors,
  };
}
