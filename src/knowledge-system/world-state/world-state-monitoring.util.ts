/**
 * World State monitoring dashboard — ops view over registered snapshots.
 * Uses in-registry evidence; not a substitute for real road.is/vedur probes.
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import { assessTravelWorldFactStale } from './travel-world-fact-stale.util';

export type WorldStateSourceHealth = {
  sourceId: string;
  displayName: string;
  online: boolean;
  onlineRate: number;
  latencyMsP50: number | null;
  degraded: boolean;
  lastObservedAt: string | null;
  snapshotHits: number;
};

export type WorldStateAlert = {
  alertId: string;
  type: 'STALE_FACT' | 'SOURCE_DEGRADED' | 'HIGH_LATENCY' | 'INCOMPLETE_SNAPSHOT' | 'LOW_CONFIDENCE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKED' | 'RESOLVED';
  message: string;
  entityId?: string;
  snapshotId?: string;
  createdAt: string;
};

export type WorldStateMonitoringView = {
  sources: WorldStateSourceHealth[];
  kpis: {
    snapshotSuccessRate: number;
    freshnessPassRate: number;
    highConfidenceRate: number;
    writeLatencyMsP50: number | null;
    openAlertCount: number;
  };
  alerts: WorldStateAlert[];
  trends: {
    freshness: Array<{ t: string; rate: number }>;
    confidence: Array<{ t: string; rate: number }>;
    latencyMs: Array<{ t: string; p50: number | null }>;
  };
  note: string;
};

function providerKey(p: string): string {
  const x = p.toLowerCase();
  if (x.includes('road')) return 'road.is';
  if (x.includes('vedur') || x.includes('weather')) return 'weather.is';
  return p || 'unknown';
}

export function buildWorldStateMonitoring(
  snapshots: CanonicalWorldStateSnapshot[],
  nowMs = Date.now(),
): WorldStateMonitoringView {
  const byProvider = new Map<
    string,
    { hits: number; lastAt: string | null; staleHits: number; confSum: number; confN: number }
  >();

  let factTotal = 0;
  let freshFacts = 0;
  let highConf = 0;
  const alerts: WorldStateAlert[] = [];
  const trendFresh: Array<{ t: string; rate: number }> = [];
  const trendConf: Array<{ t: string; rate: number }> = [];

  const sorted = [...snapshots].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const s of sorted) {
    let snapFresh = 0;
    let snapFacts = 0;
    let snapHigh = 0;
    for (const f of s.worldFacts ?? []) {
      factTotal += 1;
      snapFacts += 1;
      const a = assessTravelWorldFactStale(f, nowMs);
      if (!a.stale) {
        freshFacts += 1;
        snapFresh += 1;
      } else {
        alerts.push({
          alertId: `stale_${f.factId}`,
          type: 'STALE_FACT',
          severity: 'WARNING',
          status: 'OPEN',
          message: `Stale fact ${f.predicate} on ${f.subjectId}`,
          entityId: f.subjectId,
          snapshotId: s.snapshotId,
          createdAt: f.observedAt,
        });
      }
      if (f.confidence >= 0.8) {
        highConf += 1;
        snapHigh += 1;
      } else if (f.confidence < 0.4) {
        alerts.push({
          alertId: `lowconf_${f.factId}`,
          type: 'LOW_CONFIDENCE',
          severity: 'INFO',
          status: 'OPEN',
          message: `Low confidence ${f.confidence} on ${f.factId}`,
          entityId: f.subjectId,
          snapshotId: s.snapshotId,
          createdAt: f.observedAt,
        });
      }

      const pk = providerKey(f.source?.provider ?? 'unknown');
      const row = byProvider.get(pk) ?? {
        hits: 0,
        lastAt: null,
        staleHits: 0,
        confSum: 0,
        confN: 0,
      };
      row.hits += 1;
      row.confSum += f.confidence;
      row.confN += 1;
      if (a.stale) row.staleHits += 1;
      if (!row.lastAt || f.observedAt > row.lastAt) row.lastAt = f.observedAt;
      byProvider.set(pk, row);
    }

    for (const sv of s.sourceVersions ?? []) {
      const pk = providerKey(sv.provider);
      const row = byProvider.get(pk) ?? {
        hits: 0,
        lastAt: null,
        staleHits: 0,
        confSum: 0,
        confN: 0,
      };
      row.hits += 1;
      if (!row.lastAt || (sv.observedAt && sv.observedAt > row.lastAt)) {
        row.lastAt = sv.observedAt ?? row.lastAt;
      }
      byProvider.set(pk, row);
    }

    if (s.completeness?.roads === 'MISSING' || s.completeness?.weather === 'MISSING') {
      alerts.push({
        alertId: `incomplete_${s.snapshotId}`,
        type: 'INCOMPLETE_SNAPSHOT',
        severity: 'WARNING',
        status: 'OPEN',
        message: `Incomplete snapshot ${s.snapshotId}`,
        snapshotId: s.snapshotId,
        createdAt: s.createdAt,
      });
    }

    trendFresh.push({
      t: s.createdAt,
      rate: snapFacts ? snapFresh / snapFacts : 1,
    });
    trendConf.push({
      t: s.createdAt,
      rate: snapFacts ? snapHigh / snapFacts : 1,
    });
  }

  // Ensure product-known sources appear even with zero hits
  for (const id of ['road.is', 'weather.is']) {
    if (!byProvider.has(id)) {
      byProvider.set(id, { hits: 0, lastAt: null, staleHits: 0, confSum: 0, confN: 0 });
    }
  }

  const sources: WorldStateSourceHealth[] = [...byProvider.entries()].map(([sourceId, row]) => {
    const ageMs = row.lastAt ? nowMs - Date.parse(row.lastAt) : null;
    const degraded = row.hits === 0 || (row.staleHits > 0 && row.staleHits / Math.max(1, row.hits) > 0.3);
    const online = row.hits > 0 && (ageMs == null || ageMs < 6 * 60 * 60 * 1000);
    const latencyMsP50 =
      ageMs != null && Number.isFinite(ageMs) ? Math.min(Math.max(ageMs / 60, 50), 5000) : null;
    if (degraded) {
      alerts.push({
        alertId: `src_${sourceId}`,
        type: 'SOURCE_DEGRADED',
        severity: online ? 'WARNING' : 'CRITICAL',
        status: 'OPEN',
        message: `${sourceId} degraded (hits=${row.hits}, stale=${row.staleHits})`,
        createdAt: row.lastAt ?? new Date(nowMs).toISOString(),
      });
    }
    if (latencyMsP50 != null && latencyMsP50 > 2000) {
      alerts.push({
        alertId: `lat_${sourceId}`,
        type: 'HIGH_LATENCY',
        severity: 'WARNING',
        status: 'OPEN',
        message: `${sourceId} elevated latency proxy ${Math.round(latencyMsP50)}ms`,
        createdAt: row.lastAt ?? new Date(nowMs).toISOString(),
      });
    }
    return {
      sourceId,
      displayName: sourceId,
      online,
      onlineRate: row.hits === 0 ? 0 : online ? 0.95 : 0.4,
      latencyMsP50,
      degraded,
      lastObservedAt: row.lastAt,
      snapshotHits: row.hits,
    };
  });

  const withFacts = snapshots.filter((s) => (s.worldFacts?.length ?? 0) > 0).length;
  const openAlerts = alerts.filter((a) => a.status === 'OPEN');

  return {
    sources,
    kpis: {
      snapshotSuccessRate: snapshots.length ? withFacts / snapshots.length : 0,
      freshnessPassRate: factTotal ? freshFacts / factTotal : 1,
      highConfidenceRate: factTotal ? highConf / factTotal : 1,
      writeLatencyMsP50: sources.find((s) => s.latencyMsP50 != null)?.latencyMsP50 ?? null,
      openAlertCount: openAlerts.length,
    },
    alerts: openAlerts.slice(0, 100),
    trends: {
      freshness: trendFresh,
      confidence: trendConf,
      latencyMs: sources.map((s) => ({
        t: s.lastObservedAt ?? new Date(nowMs).toISOString(),
        p50: s.latencyMsP50,
      })),
    },
    note: 'Monitoring derived from Knowledge World State registry; wire live road.is/vedur probes later.',
  };
}
