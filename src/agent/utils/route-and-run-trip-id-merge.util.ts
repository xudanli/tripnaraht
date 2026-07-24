import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { isMemoryShellTripId } from '../../trips/iceland-self-drive/utils/iceland-memory-shell-trip-id.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 前端契约：UUID 与 `trip_<hex>` 均为合法绑定 ID，不得当占位符拒掉。
 * （空串才视为缺失；其它非空 id 仍可绑定，由下游仓储决定能否加载。）
 */
export function isAcceptableRouteAndRunTripId(tripId: string | null | undefined): boolean {
  const id = typeof tripId === 'string' ? tripId.trim() : '';
  if (!id) return false;
  return true;
}

/** 是否为契约明确列举的 ID 形态（UUID 或 memory shell `trip_<hex>`） */
export function isCanonicalRouteAndRunTripIdForm(tripId: string | null | undefined): boolean {
  const id = typeof tripId === 'string' ? tripId.trim() : '';
  if (!id) return false;
  return UUID_RE.test(id) || isMemoryShellTripId(id);
}

/**
 * 合并 camelCase、一键操作嵌套负载中的 trip_id 到顶层 `trip_id`。
 * 编排与各 enrichment 只读 `request.trip_id`；前端若只展开 `payload.message` 而丢了顶层字段会导致无行程上下文。
 */
export function mergeTripIdAliasesIntoRouteAndRunRequest(req: RouteAndRunRequestDto): void {
  const pick = (s?: string | null): string =>
    typeof s === 'string' && s.trim() ? s.trim() : '';

  const fromNested =
    pick(req.suggested_operation_payload?.trip_id) || pick(req.payload?.trip_id);

  const top = pick(req.trip_id) || pick(req.tripId);
  const merged = top || fromNested;
  if (merged) {
    req.trip_id = merged;
  }
}
