import type { TripTaskMemory } from '../interfaces/trip-task-memory.interface';

/**
 * 取 `history` 中最新一条 `replan_lineage`，生成一行可读摘要（注入 Context 块）。
 */
export function formatLatestReplanLineageLine(history?: TripTaskMemory['history']): string | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e?.event !== 'replan_lineage' || !e.payload || typeof e.payload !== 'object') continue;
    const p = e.payload as Record<string, unknown>;
    const prev = p.previous_plan_version;
    const np = p.new_plan_version;
    const hashRaw = p.previous_world_snapshot_hash;
    const hash =
      typeof hashRaw === 'string' && hashRaw.trim()
        ? `${hashRaw.trim().slice(0, 20)}…`
        : '';
    const req = typeof p.requestId === 'string' ? p.requestId : '';
    const parts: string[] = ['Replan继承'];
    if (prev !== undefined && Number.isFinite(Number(prev))) parts.push(`上一版v=${prev}`);
    if (np !== undefined && Number.isFinite(Number(np))) parts.push(`本轮v=${np}`);
    if (hash) parts.push(`快照=${hash}`);
    if (req) parts.push(`req=${req}`);
    return parts.join(' ');
  }
  return undefined;
}
