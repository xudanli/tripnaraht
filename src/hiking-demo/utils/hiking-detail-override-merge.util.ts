import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';
import type {
  HikingDetailOverrideV1,
  HikingDetailOverrideHardGate,
  HikingDetailOverrideEmergency,
  HikingDetailOverrideAccess,
  HikingDetailOverrideSupplyPoiRef,
  HikingDetailOverrideShelter,
  HikingDetailOverrideTimeWindow,
  HikingDetailOverrideChecklistGroup,
  HikingDetailOverridePermit,
} from '../../route-directions/types/hiking-detail-override.types';
import { getHighlandPoiById } from './highland-poi-catalog.util';
import { normalizeHikingDetailPermits } from './hiking-detail-permits.util';

/** C 端详情响应：不暴露未合并的 override 原文 */
export function stripHikingDetailOverrideFromMetadata(
  metadata: unknown,
): Record<string, unknown> | null | undefined {
  if (metadata == null) return metadata as null | undefined;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  const { hikingDetailOverride: _removed, ...rest } = metadata as Record<string, unknown>;
  return rest;
}

export function extractHikingDetailOverride(
  metadata: unknown,
): HikingDetailOverrideV1 {
  if (!metadata || typeof metadata !== 'object') return {};
  const m = metadata as Record<string, unknown>;
  const ov = m.hikingDetailOverride;
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return {};
  return ov as HikingDetailOverrideV1;
}

export function deepMergeRecords(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === 'object' &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMergeRecords(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isExplicitClear(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function mapHardGates(gates: HikingDetailOverrideHardGate[]): HikingTrailDetail['hardGates'] {
  return gates.map((g) => ({
    id: g.id,
    category: mapSeverityToCategory(g.severity),
    titleZh: g.titleZh ?? g.title ?? g.id,
    ruleZh: g.ruleZh ?? g.description ?? '',
    threshold: g.threshold,
  }));
}

function mapSeverityToCategory(
  severity?: string,
): 'wind' | 'precipitation' | 'temperature' | 'visibility' | 'other' {
  if (!severity) return 'other';
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'critical') return 'wind';
  return 'other';
}

function mapEmergency(em: HikingDetailOverrideEmergency): HikingTrailDetail['emergency'] {
  const extra = [em.rangerContact ? `护林/巡逻：${em.rangerContact}` : undefined, em.notes]
    .filter(Boolean)
    .join('；');
  const reg = em.registrationPointZh ?? em.registrationPoint;
  return {
    rescuePhone: em.rescuePhone,
    registrationPointZh: reg && extra ? `${reg}（${extra}）` : reg ?? (extra || undefined),
  };
}

function mapAccess(acc: HikingDetailOverrideAccess): NonNullable<HikingTrailDetail['access']> {
  const transitParts = [acc.byBus, acc.byShuttle].filter(Boolean);
  const scheduleZh = transitParts.join('；') || acc.transit?.scheduleZh;
  return {
    ...(acc.byCar || acc.driving
      ? {
          driving: {
            parkingNameZh: acc.byCar ?? '驾车到达',
            noteZh: typeof acc.driving === 'object' ? JSON.stringify(acc.driving) : acc.byCar,
            ...(typeof acc.driving === 'object' ? (acc.driving as object) : {}),
          },
        }
      : {}),
    ...(scheduleZh || acc.transit
      ? {
          transit: {
            scheduleZh: String(scheduleZh),
            seasonNoteZh: acc.notes,
            ...(typeof acc.transit === 'object' ? (acc.transit as object) : {}),
          },
        }
      : {}),
  };
}

function mapTimeWindow(tw: HikingDetailOverrideTimeWindow): HikingTrailDetail['timeWindows'] {
  return {
    suggestedDepartTime: tw.suggestedDepartTime ?? tw.suggestedDeparture,
    lastReturnBusTime: tw.lastReturnBus,
    sunsetBufferMin: tw.sunsetBufferMin,
    daylightHoursNoteZh: tw.notes ?? tw.daylightHoursNoteZh,
  };
}

function hydrateSupplyPois(refs: HikingDetailOverrideSupplyPoiRef[]): HikingTrailDetail['supplyPois'] {
  return refs.map((ref) => {
    const poi = ref.id ? getHighlandPoiById(ref.id) : undefined;
    return {
      id: ref.id,
      nameCN: ref.nameCN ?? poi?.nameCN ?? ref.id,
      nameEN: ref.nameEN ?? poi?.nameEN ?? ref.id,
      subCategory: ref.subCategory ?? poi?.subCategory ?? 'SUPPLY',
      lat: ref.lat ?? poi?.lat ?? 0,
      lng: ref.lng ?? poi?.lng ?? 0,
      role: ref.role ?? poi?.role,
      elevation_m: poi?.elevation_m,
      capacity: poi?.capacity,
      bookingRequired: poi?.facilities?.requiresBooking,
    };
  });
}

function hydrateShelters(items: HikingDetailOverrideShelter[]): HikingTrailDetail['shelters'] {
  return items.map((s) => {
    const poi = s.id ? getHighlandPoiById(s.id) : undefined;
    return {
      id: s.id,
      nameCN: s.nameCN ?? poi?.nameCN ?? s.id,
      nameEN: s.nameEN ?? poi?.nameEN,
      lat: s.lat ?? poi?.lat ?? 0,
      lng: s.lng ?? poi?.lng ?? 0,
      elevation_m: poi?.elevation_m,
      capacity: poi?.capacity,
      bookingRequired: s.bookingRequired ?? poi?.facilities?.requiresBooking ?? true,
      feeZh: s.feeZh,
      openSeason: undefined,
    };
  });
}

/**
 * 将 metadata.hikingDetailOverride 合并进已组装的 hikingDetail（override 优先）
 */
export function applyHikingDetailOverride(
  base: HikingTrailDetail,
  override: HikingDetailOverrideV1,
): HikingTrailDetail {
  const out = { ...base };

  if (override.riskMatrix !== undefined) {
    if (isExplicitClear(override.riskMatrix)) {
      out.riskMatrixRows = [];
    } else if (Array.isArray(override.riskMatrix)) {
      out.riskMatrixRows = override.riskMatrix;
    }
  }

  if (override.hardGates !== undefined) {
    if (isExplicitClear(override.hardGates)) {
      out.hardGates = [];
    } else if (Array.isArray(override.hardGates)) {
      out.hardGates = mapHardGates(override.hardGates);
    }
  }

  if (override.emergency !== undefined) {
    if (isExplicitClear(override.emergency)) {
      out.emergency = {};
    } else if (override.emergency && typeof override.emergency === 'object') {
      out.emergency = {
        ...out.emergency,
        ...mapEmergency(override.emergency),
      };
    }
  }

  if (override.access !== undefined) {
    if (isExplicitClear(override.access)) {
      out.access = undefined;
    } else if (override.access && typeof override.access === 'object') {
      const mapped = mapAccess(override.access);
      const driving =
        mapped.driving || out.access?.driving
          ? {
              parkingNameZh:
                mapped.driving?.parkingNameZh ??
                out.access?.driving?.parkingNameZh ??
                '驾车到达',
              ...out.access?.driving,
              ...mapped.driving,
            }
          : undefined;
      const transit =
        mapped.transit || out.access?.transit
          ? {
              scheduleZh:
                mapped.transit?.scheduleZh ??
                out.access?.transit?.scheduleZh ??
                '',
              ...out.access?.transit,
              ...mapped.transit,
            }
          : undefined;
      out.access = {
        ...(driving ? { driving } : {}),
        ...(transit ? { transit } : {}),
      };
    }
  }

  if (override.supplyPois !== undefined) {
    if (isExplicitClear(override.supplyPois)) {
      out.supplyPois = [];
    } else if (Array.isArray(override.supplyPois)) {
      out.supplyPois = hydrateSupplyPois(override.supplyPois);
    }
  }

  if (override.shelters !== undefined) {
    if (isExplicitClear(override.shelters)) {
      out.shelters = [];
    } else if (Array.isArray(override.shelters)) {
      out.shelters = hydrateShelters(override.shelters);
    }
  }

  if (override.timeWindow !== undefined) {
    if (isExplicitClear(override.timeWindow)) {
      out.timeWindows = undefined;
    } else if (override.timeWindow && typeof override.timeWindow === 'object') {
      out.timeWindows = {
        ...out.timeWindows,
        ...mapTimeWindow(override.timeWindow),
      };
    }
  }

  if (override.checklistTemplates !== undefined) {
    if (isExplicitClear(override.checklistTemplates)) {
      out.checklistTemplates = [];
    } else if (Array.isArray(override.checklistTemplates)) {
      out.checklistTemplates = mapOverrideChecklistTemplates(override.checklistTemplates);
    }
  }

  if (override.permits !== undefined) {
    if (isExplicitClear(override.permits)) {
      out.permits = [];
    } else if (Array.isArray(override.permits)) {
      out.permits = mapOverridePermits(override.permits);
    }
  }

  if (override.alternatives !== undefined && !isExplicitClear(override.alternatives)) {
    const alt = override.alternatives as NonNullable<HikingTrailDetail['alternatives']>;
    out.alternatives = {
      planBRoutes: alt.planBRoutes ?? out.alternatives?.planBRoutes ?? [],
      exitPoints: alt.exitPoints ?? out.alternatives?.exitPoints ?? [],
      repairHints: alt.repairHints ?? out.alternatives?.repairHints ?? [],
    };
  }

  return out;
}

function mapOverrideChecklistTemplates(
  groups: HikingDetailOverrideChecklistGroup[],
): NonNullable<HikingTrailDetail['checklistTemplates']> {
  return groups.map((g) => ({
    id: g.id,
    category: (g.category || 'essential') as 'gear' | 'safety' | 'logistics' | 'permits',
    titleZh: g.titleZh ?? g.id,
    items: (g.items ?? []).map((item) => ({
      id: item.id,
      labelZh: item.labelZh ?? item.nameCN ?? item.name ?? item.id,
      required: item.required ?? false,
    })),
  }));
}

function mapOverridePermits(
  permits: HikingDetailOverridePermit[],
): NonNullable<HikingTrailDetail['permits']> {
  return normalizeHikingDetailPermits(
    permits.map((p) => ({
      id: p.id,
      titleZh: p.titleZh ?? p.nameCN ?? p.name ?? p.id,
      name: p.name,
      nameCN: p.nameCN,
      required: p.required ?? true,
      bookingUrl: p.bookingUrl,
      noteZh: p.noteZh,
    })),
  );
}

/** 合并 metadata 时保留其它键，并 deep-merge hikingDetailOverride */
export function mergeRouteDirectionMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const prev = existing ?? {};
  const next = incoming ?? {};
  const merged = { ...prev, ...next };
  if (next.hikingDetailOverride !== undefined) {
    const prevOv = extractHikingDetailOverride(prev);
    const nextOv =
      next.hikingDetailOverride && typeof next.hikingDetailOverride === 'object'
        ? (next.hikingDetailOverride as HikingDetailOverrideV1)
        : {};
    merged.hikingDetailOverride = deepMergeOverride(prevOv, nextOv);
  }
  return merged;
}

export function deepMergeOverride(
  prev: HikingDetailOverrideV1,
  patch: HikingDetailOverrideV1,
): HikingDetailOverrideV1 {
  const out: HikingDetailOverrideV1 = { ...prev };
  for (const key of Object.keys(patch) as (keyof HikingDetailOverrideV1)[]) {
    const v = patch[key];
    if (v === undefined) continue;
    if (key === 'emergency' || key === 'access' || key === 'timeWindow') {
      if (v === null) {
        (out as Record<string, unknown>)[key] = null;
      } else if (typeof v === 'object' && !Array.isArray(v)) {
        (out as Record<string, unknown>)[key] = deepMergeRecords(
          (prev[key] as Record<string, unknown>) ?? {},
          v as Record<string, unknown>,
        );
      } else {
        (out as Record<string, unknown>)[key] = v;
      }
    } else {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
