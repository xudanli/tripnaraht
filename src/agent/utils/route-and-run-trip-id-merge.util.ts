import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

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
