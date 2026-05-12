import {
  evaluateNarrativeSafety,
  buildNarrativeSafetyPromptLines,
} from './narrative-safety-evaluator.util';
import type { InventorySnapshotsMetaPayload } from './lightweight-live-inventory.registry';

function metaPayload(sensors: InventorySnapshotsMetaPayload['sensors']): InventorySnapshotsMetaPayload {
  return { registry_version: 1, sensors };
}

describe('evaluateNarrativeSafety', () => {
  const t0 = '2026-05-08T10:00:00.000Z';

  it('returns safe when no meta', () => {
    const r = evaluateNarrativeSafety(undefined);
    expect(r.mode).toBe('safe');
    expect(r.stale_domains).toEqual([]);
    expect(r.consistency_risk).toBe('low');
  });

  it('refresh_required when flight stale (hard domain)', () => {
    const pastStale = '2026-05-08T09:00:00.000Z';
    const m = metaPayload([
      {
        sensor_id: 'flight',
        captured_at_iso: t0,
        stale_after_iso: pastStale,
        default_ttl_seconds: 1200,
        depends_on: ['trip_dates'],
      },
    ]);
    const r = evaluateNarrativeSafety(m, { nowMs: Date.parse('2026-05-08T12:00:00.000Z') });
    expect(r.mode).toBe('refresh_required');
    expect(r.stale_domains).toContain('flight');
    expect(r.consistency_risk).toBe('high');
    expect(r.reasons.some((x) => x.startsWith('hard_inventory_stale'))).toBe(true);
  });

  it('refresh_required when hotel stale', () => {
    const pastStale = '2026-05-08T09:30:00.000Z';
    const m = metaPayload([
      {
        sensor_id: 'hotel',
        captured_at_iso: t0,
        stale_after_iso: pastStale,
        default_ttl_seconds: 600,
        depends_on: ['trip_dates'],
      },
    ]);
    const r = evaluateNarrativeSafety(m, { nowMs: Date.parse('2026-05-08T11:00:00.000Z') });
    expect(r.mode).toBe('refresh_required');
    expect(r.stale_domains).toContain('hotel');
  });

  it('tentative when only weather stale', () => {
    const pastStale = '2026-05-08T09:00:00.000Z';
    const m = metaPayload([
      {
        sensor_id: 'weather',
        captured_at_iso: t0,
        stale_after_iso: pastStale,
        default_ttl_seconds: 900,
        depends_on: ['location_anchor'],
      },
    ]);
    const r = evaluateNarrativeSafety(m, { nowMs: Date.parse('2026-05-08T12:00:00.000Z') });
    expect(r.mode).toBe('tentative');
    expect(r.stale_domains).toContain('weather');
    expect(r.consistency_risk).toBe('medium');
  });

  it('tentative when temporal skew exceeds threshold', () => {
    const m = metaPayload([
      {
        sensor_id: 'flight',
        captured_at_iso: '2026-05-08T10:00:00.000Z',
        stale_after_iso: '2026-05-08T10:40:00.000Z',
        default_ttl_seconds: 1200,
        depends_on: ['trip_dates'],
      },
      {
        sensor_id: 'hotel',
        captured_at_iso: '2026-05-08T10:25:00.000Z',
        stale_after_iso: '2026-05-08T10:35:00.000Z',
        default_ttl_seconds: 600,
        depends_on: ['trip_dates'],
      },
    ]);
    const nowMs = Date.parse('2026-05-08T10:30:00.000Z');
    const r = evaluateNarrativeSafety(m, {
      nowMs,
      temporalSkewThresholdMs: 10 * 60 * 1000,
    });
    expect(r.mode).toBe('tentative');
    expect(r.reasons).toContain('temporal_skew_across_snapshots');
    expect(r.temporal_skew_ms).toBe(25 * 60 * 1000);
  });

  it('safe when all fresh and skew below threshold', () => {
    const m = metaPayload([
      {
        sensor_id: 'weather',
        captured_at_iso: '2026-05-08T10:00:00.000Z',
        stale_after_iso: '2026-05-08T10:25:00.000Z',
        default_ttl_seconds: 900,
        depends_on: ['location_anchor'],
      },
    ]);
    const r = evaluateNarrativeSafety(m, { nowMs: Date.parse('2026-05-08T10:10:00.000Z') });
    expect(r.mode).toBe('safe');
    expect(r.consistency_risk).toBe('low');
  });
});

describe('buildNarrativeSafetyPromptLines', () => {
  it('returns empty for safe', () => {
    expect(buildNarrativeSafetyPromptLines(evaluateNarrativeSafety(undefined))).toEqual([]);
  });

  it('includes gate headers for refresh_required', () => {
    const lines = buildNarrativeSafetyPromptLines({
      mode: 'refresh_required',
      reasons: ['x'],
      stale_domains: ['flight'],
      consistency_risk: 'high',
    });
    expect(lines.some((l) => l.includes('refresh_required'))).toBe(true);
    expect(lines.some((l) => l.includes('禁止'))).toBe(true);
  });
});
