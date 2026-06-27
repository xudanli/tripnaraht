import { createHash } from 'crypto';

export function buildScheduleTimelineQueryFingerprint(query: {
  include?: string;
  dates?: string;
  from?: number;
  limit?: number;
  travelInfoMode?: string;
}): string {
  const parts = [
    query.include ?? '',
    query.dates ?? '',
    query.from ?? '',
    query.limit ?? '',
    query.travelInfoMode ?? 'cached',
  ];
  return parts.join('|');
}

export function buildScheduleTimelineEtag(input: {
  tripUpdatedAt: Date;
  queryFingerprint: string;
  dayCount: number;
  itemCount: number;
}): string {
  const raw = [
    input.tripUpdatedAt.toISOString(),
    input.queryFingerprint,
    input.dayCount,
    input.itemCount,
  ].join(':');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/** Strip weak prefix and surrounding quotes per RFC 7232. */
export function normalizeEtagToken(value: string): string {
  return value
    .trim()
    .replace(/\r/g, '')
    .replace(/^W\//i, '')
    .replace(/^"/, '')
    .replace(/"$/, '');
}

export function parseIfNoneMatch(header: string | undefined): string[] {
  if (!header?.trim()) return [];
  return header
    .split(',')
    .map((part) => normalizeEtagToken(part))
    .filter(Boolean);
}

export function etagMatches(ifNoneMatch: string | undefined, etag: string | undefined): boolean {
  if (!ifNoneMatch?.trim() || !etag?.trim()) return false;
  const target = normalizeEtagToken(etag);
  return parseIfNoneMatch(ifNoneMatch).some((candidate) => candidate === target);
}

export function formatEtagHeader(etag: string): string {
  return `"${normalizeEtagToken(etag)}"`;
}
