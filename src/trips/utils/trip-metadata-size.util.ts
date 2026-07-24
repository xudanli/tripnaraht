import { READINESS_CAUSAL_PREANALYSIS_METADATA_KEY } from '../readiness/utils/readiness-causal-preanalysis.util';
import { READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY } from '../readiness/utils/readiness-guardian-negotiation.util';
import {
  embeddedHikingBadRequest,
  getTripMetadataMaxBytes,
} from './embedded-hiking-trip-metadata.util';

const FEASIBILITY_MONTE_CARLO_SNAPSHOT_KEY = 'feasibilityMonteCarloSnapshot';

/** 可重算 / 可丢弃的缓存型 metadata 键（持久化前优先裁剪） */
const EPHEMERAL_METADATA_KEYS = [
  READINESS_CAUSAL_PREANALYSIS_METADATA_KEY,
  FEASIBILITY_MONTE_CARLO_SNAPSHOT_KEY,
  READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY,
] as const;

export function measureMetadataBytes(metadata: Record<string, unknown>): number {
  return JSON.stringify(metadata).length;
}

export function topMetadataKeysBySize(
  metadata: Record<string, unknown>,
  limit = 8,
): Array<{ key: string; bytes: number }> {
  return Object.entries(metadata)
    .map(([key, value]) => ({
      key,
      bytes: JSON.stringify(value ?? null).length,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

/** 去掉 plans.*.uiOutput 等大 payload，保留 plan 索引 */
export function compactPlansMetadata(plans: unknown): Record<string, unknown> | undefined {
  if (!plans || typeof plans !== 'object') return undefined;
  const src = plans as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [planId, raw] of Object.entries(src)) {
    if (!raw || typeof raw !== 'object') {
      out[planId] = raw;
      continue;
    }
    const row = raw as Record<string, unknown>;
    out[planId] = {
      planVersion: row.planVersion,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      ...(row.planStateSummary != null ? { planStateSummary: row.planStateSummary } : {}),
    };
  }
  return out;
}

function planUpdatedAtMs(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const ts = (raw as Record<string, unknown>).updatedAt;
  if (typeof ts !== 'string') return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * 超限时裁剪可重算 metadata，使 constraints / pacing 等小 patch 可写入。
 * 返回人类可读的操作摘要（便于日志）。
 */
export function prepareMetadataForPersist(metadata: Record<string, unknown>): string[] {
  const max = getTripMetadataMaxBytes();
  const actions: string[] = [];

  if (measureMetadataBytes(metadata) <= max) return actions;

  for (const key of EPHEMERAL_METADATA_KEYS) {
    if (!(key in metadata)) continue;
    delete metadata[key];
    actions.push(`dropped ${key}`);
    if (measureMetadataBytes(metadata) <= max) return actions;
  }

  if (metadata.plans != null) {
    metadata.plans = compactPlansMetadata(metadata.plans);
    actions.push('compacted plans (stripped uiOutput)');
    if (measureMetadataBytes(metadata) <= max) return actions;
  }

  while (measureMetadataBytes(metadata) > max && metadata.plans && typeof metadata.plans === 'object') {
    const plans = metadata.plans as Record<string, unknown>;
    const ids = Object.keys(plans);
    if (ids.length <= 1) break;
    const oldestId = ids.sort((a, b) => planUpdatedAtMs(plans[a]) - planUpdatedAtMs(plans[b]))[0];
    delete plans[oldestId];
    actions.push(`dropped plan ${oldestId}`);
    if (Object.keys(plans).length === 0) {
      delete metadata.plans;
    }
    if (measureMetadataBytes(metadata) <= max) return actions;
  }

  return actions;
}

export function assertMetadataSizeLimit(metadata: Record<string, unknown>): void {
  prepareMetadataForPersist(metadata);
  const size = measureMetadataBytes(metadata);
  const max = getTripMetadataMaxBytes();
  if (size <= max) return;

  const top = topMetadataKeysBySize(metadata);
  const topSummary = top
    .map(({ key, bytes }) => `${key} (${Math.round(bytes / 1024)}KB)`)
    .join(', ');

  throw embeddedHikingBadRequest(
    'METADATA_TOO_LARGE',
    `metadata serialized size ${size} exceeds limit ${max} bytes. Top keys: ${topSummary}`,
  );
}
