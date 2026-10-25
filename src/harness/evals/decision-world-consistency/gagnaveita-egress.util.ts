/**
 * Load Frankfurt-collector Gagnaveita fixtures for staging shadow.
 * Live DNS from devbox is often UNRESOLVABLE — replay is the portable path.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  mapGagnaveitaPayloadToF208Status,
  type GagnaveitaFaerdRecord,
  type GagnaveitaRealShapeFixture,
} from '../../../trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import { GAGNAVEITA_FAERD2017_URL } from '../../../trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';

export const GAGNAVEITA_CLOSED_REPLAY_FIXTURE = join(
  process.cwd(),
  'scripts/fixtures/gagnaveita-f208-closed-real-shape.json',
);

export function loadGagnaveitaRealShapeFixture(
  path = GAGNAVEITA_CLOSED_REPLAY_FIXTURE,
): GagnaveitaRealShapeFixture {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as GagnaveitaRealShapeFixture;
  if (!Array.isArray(raw.gagnaveitaRecords)) {
    throw new Error(`invalid gagnaveita fixture: ${path}`);
  }
  return raw;
}

/** Map fixture → RoadStatus; refresh lastVerifiedAt so tick freshness stays valid. */
export function roadStatusFromGagnaveitaReplayFixture(input?: {
  path?: string;
  roadId?: string;
  freshObservedAt?: boolean;
}): {
  fixture: GagnaveitaRealShapeFixture;
  roadStatus: RoadStatus;
  records: GagnaveitaFaerdRecord[];
} {
  const fixture = loadGagnaveitaRealShapeFixture(input?.path);
  const records = fixture.gagnaveitaRecords;
  const roadId = (input?.roadId ?? fixture.fixtureMeta.roadId ?? 'F208').toUpperCase();
  const mapped =
    roadId === 'F208'
      ? mapGagnaveitaPayloadToF208Status(records)
      : null;
  if (!mapped) {
    throw new Error(`gagnaveita fixture did not map ${roadId}`);
  }
  const roadStatus: RoadStatus = {
    ...mapped,
    lastVerifiedAt:
      input?.freshObservedAt === false
        ? mapped.lastVerifiedAt
        : new Date(),
  };
  return { fixture, roadStatus, records };
}

export type LiveGagnaveitaProbe =
  | { ok: true; httpStatus: number; recordCount: number; elapsedMs: number }
  | { ok: false; reason: string; elapsedMs: number };

/** Best-effort live probe (devbox often fails DNS without Frankfurt egress). */
export async function probeLiveGagnaveita(opts?: {
  url?: string;
  timeoutMs?: number;
}): Promise<LiveGagnaveitaProbe> {
  const url = opts?.url ?? GAGNAVEITA_FAERD2017_URL;
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, elapsedMs };
    }
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, reason: 'payload_not_array', elapsedMs };
    }
    return {
      ok: true,
      httpStatus: res.status,
      recordCount: parsed.length,
      elapsedMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const nestedCause =
      err instanceof Error
        ? (err as Error & { cause?: unknown }).cause
        : undefined;
    const cause =
      nestedCause instanceof Error ? nestedCause.message : '';
    const combined = `${msg} ${cause}`.toLowerCase();
    return {
      ok: false,
      reason:
        combined.includes('enotfound') ||
        combined.includes('getaddrinfo') ||
        combined.includes('could not resolve')
          ? 'dns_unresolvable'
          : (cause || msg).slice(0, 160),
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isDecisionWorldLiveShadowEnabled(): boolean {
  return (process.env.DECISION_WORLD_LIVE_SHADOW ?? '').trim() === '1';
}
