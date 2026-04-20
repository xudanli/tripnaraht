import type { PendingMigrationRequest } from './decision-state.types';
import type { ItineraryLike } from './interfaces/phase-executor.interface';

function sliceDayDate(d: string): string {
  return String(d ?? '').slice(0, 10);
}

function itemMatchesNodeId(it: any, nodeId: string): boolean {
  const nid = String(nodeId ?? '').trim();
  if (!nid) return false;
  const pid = String(it?.location_ref?.place_id ?? it?.poi_id ?? it?.id ?? '').trim();
  return pid === nid || String(it?.id ?? '').trim() === nid;
}

/**
 * 将 pending MIGRATION_REQUEST 落到 planDraft：从 fromDay 移除节点，插入 toDay（默认 append）。
 * 返回应用成功的 migration id 列表，供从 DSO.systemState.pendingMigrations 剔除。
 */
export function applyPendingMigrationsToPlanDraft(
  itinerary: ItineraryLike,
  migrations: PendingMigrationRequest[],
): { itinerary: ItineraryLike; appliedIds: string[] } {
  const appliedIds: string[] = [];
  if (!migrations?.length) return { itinerary, appliedIds };
  const days = (itinerary.days as any[]) ?? [];
  if (!Array.isArray(days) || days.length === 0) return { itinerary, appliedIds };

  const next: ItineraryLike = {
    ...itinerary,
    days: days.map((d) => ({
      ...d,
      items: [...(Array.isArray(d.items) ? d.items : [])],
    })),
    metadata: { ...(itinerary.metadata ?? {}) },
  };

  const nextDays = next.days as any[];

  for (const m of migrations) {
    if (m.kind !== 'MIGRATION_REQUEST') continue;
    const fromDay = nextDays.find((d) => sliceDayDate(String(d.date)) === sliceDayDate(m.fromDayDate));
    const toDay = nextDays.find((d) => sliceDayDate(String(d.date)) === sliceDayDate(m.toDayDate));
    if (!fromDay || !toDay) continue;
    const items: any[] = Array.isArray(fromDay.items) ? fromDay.items : [];
    const idx = items.findIndex((it) => itemMatchesNodeId(it, m.nodeId));
    if (idx < 0) continue;
    const [removed] = items.splice(idx, 1);
    fromDay.items = items;
    const copy = JSON.parse(JSON.stringify(removed));
    copy.metadata = {
      ...(copy.metadata ?? {}),
      migratedFromDay: m.fromDayDate,
      migrationId: m.id,
      migrationReason: m.reason,
    };
    if (!Array.isArray(toDay.items)) toDay.items = [];
    toDay.items.push(copy);
    appliedIds.push(m.id);
  }

  if (appliedIds.length > 0) {
    const el = [...((next.metadata as any)?.explain_logs ?? [])];
    el.push(`[跨日迁移] 已按 pendingMigrations 将 ${appliedIds.length} 个节点注入目标日行程草案。`);
    next.metadata = { ...(next.metadata ?? {}), explain_logs: el };
  }

  return { itinerary: next, appliedIds };
}
