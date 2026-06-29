import { createHash } from 'crypto';

export interface JourneyMapEtagInput {
  tripId: string;
  tripUpdatedAt?: string | Date | null;
  coverageCalculatedAt?: string | Date | null;
  itemCount: number;
  /** 必须与响应 query 一致 */
  fields: 'full' | 'minimal';
  includeInspector: boolean;
}

/** 去掉引号 / W/ 前缀，用于比较 */
export function normalizeEtag(value?: string | null): string | undefined {
  if (!value) return undefined;
  let v = value.trim();
  if (v.startsWith('W/')) v = v.slice(2).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v || undefined;
}

/** HTTP 响应头格式（前端会原样回传 If-None-Match） */
export function formatEtagHeader(raw: string): string {
  return `"${normalizeEtag(raw) ?? raw}"`;
}

export function computeJourneyMapEtag(input: JourneyMapEtagInput): string {
  const payload = [
    input.tripId,
    input.tripUpdatedAt ? new Date(input.tripUpdatedAt).toISOString() : '',
    input.coverageCalculatedAt ? new Date(input.coverageCalculatedAt).toISOString() : '',
    String(input.itemCount),
    input.fields,
    input.includeInspector ? '1' : '0',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function computeJourneyMapInspectorActivityEtag(
  input: JourneyMapEtagInput & { activityId: string },
): string {
  const base = computeJourneyMapEtag({ ...input, includeInspector: true });
  return createHash('sha256')
    .update(`${base}|${input.activityId.trim()}`)
    .digest('hex')
    .slice(0, 16);
}

export function ifNoneMatchMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  const client = normalizeEtag(ifNoneMatch);
  const server = normalizeEtag(etag);
  return Boolean(client && server && client === server);
}
