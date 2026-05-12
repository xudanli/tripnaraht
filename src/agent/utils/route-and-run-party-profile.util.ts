import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RouteRunPartyProfileSnapshot } from '../memory/interfaces/agent-memory-context.interface';

/**
 * 合并 `structured_travel_input.party_profile`、顶层 `party_profile` 与快捷 `fitness_level`。
 * 优先级：顶层 `party_profile` > `structured_travel_input.party_profile`；`fitness_level` 顶层快捷字段最后覆盖 fitness。
 */
export function resolveRouteRunPartyProfileSnapshot(
  request: RouteAndRunRequestDto,
): RouteRunPartyProfileSnapshot | null {
  const st = request.structured_travel_input?.party_profile;
  const top = request.party_profile;
  const merged: RouteRunPartyProfileSnapshot = {
    ...(st ?? {}),
    ...(top ?? {}),
  };
  const flRaw = request.fitness_level?.trim().toLowerCase();
  if (flRaw === 'low' || flRaw === 'medium' || flRaw === 'high') {
    merged.fitness_level = flRaw;
  }
  const hasCore =
    merged.fitness_level != null ||
    merged.risk_tolerance != null ||
    (merged.party_total != null && Number.isFinite(merged.party_total) && merged.party_total >= 1) ||
    merged.has_children === true ||
    merged.has_elderly === true ||
    (typeof merged.mobility_note_zh === 'string' && merged.mobility_note_zh.trim().length > 0);
  if (!hasCore) return null;
  if (merged.party_total != null) {
    const n = Number(merged.party_total);
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      delete merged.party_total;
    } else {
      merged.party_total = Math.floor(n);
    }
  }
  if (typeof merged.mobility_note_zh === 'string') {
    merged.mobility_note_zh = merged.mobility_note_zh.trim().slice(0, 500);
    if (!merged.mobility_note_zh) delete merged.mobility_note_zh;
  }
  return merged;
}
