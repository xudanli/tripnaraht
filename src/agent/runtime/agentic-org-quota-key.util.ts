/**
 * 从 route_and_run 请求解析 Agentic org 配额键（Harness Cost：org spend cap）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export function resolveAgenticQuotaOrgId(request: RouteAndRunRequestDto): string | null {
  const fromOptions = String(
    (request.options as { organization_id?: string; org_id?: string } | undefined)?.organization_id ??
      (request.options as { org_id?: string } | undefined)?.org_id ??
      '',
  ).trim();
  if (fromOptions) return fromOptions;
  return null;
}
