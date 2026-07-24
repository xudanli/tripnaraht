import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';
import type {
  HikePlanChecklistGroup,
  HikePlanPermitItem,
  HikePlanPrepState,
} from '../types/hike-plan.types';

type PermitSource = {
  id?: string;
  titleZh?: string;
  name?: string;
  nameCN?: string;
  nameEN?: string;
  required?: boolean;
  bookingUrl?: string;
  noteZh?: string;
  obtained?: boolean;
  status?: string;
};

/** 从 hikingDetail 模板生成前端 Prep 结构 */
export function buildPrepFromHikingDetail(
  detail: HikingTrailDetail | null,
): HikePlanPrepState {
  const checklist =
    detail?.checklistTemplates?.map((t) => ({
      id: t.id,
      category: t.category,
      items: t.items.map((item) => ({
        id: item.id,
        name: item.labelZh,
        nameCN: item.labelZh,
        required: item.required ?? false,
        checked: false,
      })),
    })) ?? [];

  const permits = mapPermitsFromSources(detail?.permits ?? [], { obtainedDefault: false });
  const transport = buildTransportFromDetail(detail);

  return recomputePrepFlags({
    checklist,
    permits,
    transport,
    checklistComplete: false,
    permitsComplete: false,
    offlineReady: false,
  });
}

/** 解析展示名：nameCN 优先中文，name 可用英文或回退中文 */
export function resolvePermitLabels(source: PermitSource): {
  name: string;
  nameCN: string;
} {
  const nameCN = String(
    source.nameCN ?? source.titleZh ?? source.name ?? source.id ?? '许可',
  ).trim();
  const name = String(source.nameEN ?? source.name ?? nameCN).trim();
  return { name, nameCN };
}

/** 仅当 required === true 时计入 permitsComplete */
export function computePermitsComplete(permits: HikePlanPermitItem[]): boolean {
  const required = permits.filter((p) => p.required);
  if (required.length === 0) return true;
  return required.every((p) => p.obtained);
}

function mapPermitsFromSources(
  sources: PermitSource[],
  options: { obtainedDefault: boolean },
): HikePlanPermitItem[] {
  const rows = sources.map((p, index) => {
    const { name, nameCN } = resolvePermitLabels({
      ...p,
      nameCN: p.nameCN ?? (p as { titleZh?: string }).titleZh,
    });
    const id = String(p.id ?? `permit-${index + 1}`).trim() || `permit-${index + 1}`;
    return {
      id,
      name,
      nameCN,
      required: p.required === true,
      obtained:
        p.obtained === true || p.status === 'done' || options.obtainedDefault,
      bookingUrl: p.bookingUrl,
      noteZh: p.noteZh,
    };
  });
  return ensureUniquePermitIds(rows);
}

/** 重复 id 追加 -2、-3 后缀，避免 PATCH 合并 obtained 串项 */
export function ensureUniquePermitIds(
  permits: HikePlanPermitItem[],
): HikePlanPermitItem[] {
  const seen = new Map<string, number>();
  return permits.map((p) => {
    const baseId = p.id;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    if (count === 0) return p;
    return { ...p, id: `${baseId}-${count + 1}` };
  });
}

function normalizePermitItems(raw: unknown[]): HikePlanPermitItem[] {
  const sources = raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => row as PermitSource);
  return mapPermitsFromSources(sources, { obtainedDefault: false });
}

/** 过滤 PATCH/库内脏数据中的 null 项，避免读 required 抛错 */
export function normalizeChecklistGroups(raw: unknown): HikePlanChecklistGroup[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((g) => g != null && typeof g === 'object')
    .map((g, gi) => {
      const group = g as Record<string, unknown>;
      const itemsRaw = Array.isArray(group.items) ? group.items : [];
      const items = itemsRaw
        .filter((item) => item != null && typeof item === 'object')
        .map((item, ii) => {
          const it = item as Record<string, unknown>;
          const nameCN = String(
            it.nameCN ?? it.labelZh ?? it.name ?? `item-${gi + 1}-${ii + 1}`,
          ).trim();
          const name = String(it.name ?? nameCN).trim();
          return {
            id: String(it.id ?? `item-${gi + 1}-${ii + 1}`).trim() || `item-${gi + 1}-${ii + 1}`,
            name,
            nameCN,
            required: it.required === true,
            checked: it.checked === true,
          };
        });

      return {
        id: String(group.id ?? `group-${gi + 1}`).trim() || `group-${gi + 1}`,
        category: String(group.category ?? 'essential'),
        items,
      };
    });
}

function buildTransportFromDetail(
  detail: HikingTrailDetail | null,
): HikePlanPrepState['transport'] {
  if (!detail?.access && !detail?.timeWindows) return undefined;

  const driving = detail.access?.driving;
  const transit = detail.access?.transit;
  const tw = detail.timeWindows;

  let type: 'drive' | 'transit' | 'mixed' = 'transit';
  if (driving && transit) type = 'mixed';
  else if (driving) type = 'drive';
  else if (transit) type = 'transit';

  return {
    type,
    toTrailhead: driving
      ? {
          method: driving.parkingNameZh ?? '自驾',
          estimatedDuration: driving.driveDurationMin,
          driveDistanceKm: driving.driveDistanceKm,
          noteZh: driving.noteZh,
        }
      : transit?.scheduleZh
        ? {
            method: '公共交通',
            scheduleZh: transit.scheduleZh,
            seasonNoteZh: transit.seasonNoteZh,
          }
        : undefined,
    fromTrailhead:
      transit || tw?.lastReturnBusTime
        ? {
            method: transit?.scheduleZh ? '班车/接驳' : '下撤交通',
            lastDeparture: tw?.lastReturnBusTime,
            suggestedDepartTime: tw?.suggestedDepartTime,
            seasonNoteZh: transit?.seasonNoteZh,
            bookingUrl: transit?.bookingUrl,
          }
        : undefined,
    confirmed: false,
  };
}

/** 读取库内 prep：兼容旧版扁平 checklist */
export function normalizePrepState(raw: unknown): HikePlanPrepState {
  if (!raw || typeof raw !== 'object') {
    return emptyPrep();
  }
  const p = raw as Record<string, unknown>;

  if (Array.isArray(p.checklist) && p.checklist.length > 0) {
    const first = p.checklist[0] as Record<string, unknown>;
    if (first.labelZh != null && first.items == null) {
      return migrateLegacyPrep(p);
    }
  }

  const prep: HikePlanPrepState = {
    checklist: normalizeChecklistGroups(p.checklist),
    permits: Array.isArray(p.permits) ? normalizePermitItems(p.permits) : [],
    transport: p.transport as HikePlanPrepState['transport'],
    checklistComplete: !!p.checklistComplete,
    permitsComplete: !!p.permitsComplete,
    offlineReady: !!p.offlineReady,
  };
  return recomputePrepFlags(prep);
}

function migrateLegacyPrep(p: Record<string, unknown>): HikePlanPrepState {
  const flat = (Array.isArray(p.checklist) ? p.checklist : []).filter(
    (item) => item != null && typeof item === 'object',
  ) as Array<{
    id: string;
    labelZh: string;
    checked: boolean;
    required?: boolean;
  }>;
  const legacyPermits = (p.permits as Array<{
    id: string;
    titleZh?: string;
    status?: string;
    bookingUrl?: string;
  }>) ?? [];

  const prep: HikePlanPrepState = {
    checklist: [
      {
        id: 'migrated',
        category: 'essential',
        items: flat.map((item) => ({
          id: item.id,
          name: item.labelZh,
          nameCN: item.labelZh,
          required: item.required ?? false,
          checked: item.checked,
        })),
      },
    ],
    permits: mapPermitsFromSources(
      legacyPermits.map((perm) => ({
        id: perm.id,
        titleZh: perm.titleZh,
        required: true,
        status: perm.status,
        bookingUrl: perm.bookingUrl,
      })),
      { obtainedDefault: false },
    ),
    transport: p.transport as HikePlanPrepState['transport'],
    checklistComplete: !!p.checklistComplete,
    permitsComplete: !!p.permitsComplete,
    offlineReady: !!p.offlineReady,
  };
  return recomputePrepFlags(prep);
}

export function emptyPrep(): HikePlanPrepState {
  return recomputePrepFlags({
    checklist: [],
    permits: [],
    checklistComplete: false,
    permitsComplete: false,
    offlineReady: false,
  });
}

/** PATCH 后重算完成标记 */
/** 用新模板刷新 prep，保留同 id 的 checked / obtained / offlineReady */
export function mergePrepTemplatePreservingUserState(
  current: HikePlanPrepState,
  fresh: HikePlanPrepState,
): HikePlanPrepState {
  const checkedById = new Map<string, boolean>();
  for (const g of current.checklist) {
    for (const item of g.items) {
      checkedById.set(item.id, item.checked);
    }
  }

  const obtainedById = new Map<string, boolean>();
  for (const p of current.permits) {
    obtainedById.set(p.id, p.obtained);
  }

  const checklist = normalizeChecklistGroups(fresh.checklist).map((g) => ({
    ...g,
    items: g.items.map((item) => ({
      ...item,
      checked: checkedById.get(item.id) ?? false,
    })),
  }));

  const permits = fresh.permits.map((p) => ({
    ...p,
    obtained: obtainedById.get(p.id) ?? false,
  }));

  return recomputePrepFlags({
    checklist,
    permits,
    transport: fresh.transport ?? current.transport,
    offlineReady: current.offlineReady,
    checklistComplete: false,
    permitsComplete: false,
  });
}

export function recomputePrepFlags(prep: HikePlanPrepState): HikePlanPrepState {
  const checklist = normalizeChecklistGroups(prep.checklist);
  const allItems = checklist.flatMap((g) => g.items);
  const checklistComplete =
    allItems.length === 0 ||
    allItems
      .filter((i) => i.required === true)
      .every((i) => i.checked === true);

  const permits = ensureUniquePermitIds(
    (prep.permits ?? [])
      .filter((p) => p != null && typeof p === 'object')
      .map((p) => {
        const { name, nameCN } = resolvePermitLabels(p);
        return {
          ...p,
          name: p.name?.trim() ? p.name : name,
          nameCN: p.nameCN?.trim() ? p.nameCN : nameCN,
          required: p.required === true,
          obtained: p.obtained === true,
        };
      }),
  );

  return {
    ...prep,
    checklist,
    permits,
    checklistComplete,
    permitsComplete: computePermitsComplete(permits),
  };
}
