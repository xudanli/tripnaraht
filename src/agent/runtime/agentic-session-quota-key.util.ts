/**
 * 从 route_and_run 请求解析 Agentic session 配额键（Harness Cost：session spend cap）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export function resolveAgenticQuotaSessionId(request: RouteAndRunRequestDto): string | null {
  const fromOptions = String(request.options?.client_session_id ?? '').trim();
  if (fromOptions) return fromOptions;
  const fromMeta = String(request.meta?.conversation_id ?? '').trim();
  if (fromMeta) return fromMeta;
  return null;
}
