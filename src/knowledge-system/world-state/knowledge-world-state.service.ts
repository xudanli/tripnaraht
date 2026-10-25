import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import { TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA } from '../../decision-runtime/contracts/world-state-snapshot';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
} from '../../travel-ontology/contracts/travel-world-fact.types';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { softValidateWorldFactSubjectId } from '../identity/entity-identity-registry.service';
import {
  buildProductWorldStateDiff,
  recentChangeCategories,
  snapshotListStatus,
} from './world-state-diff-product.util';
import { buildWorldStateMonitoring } from './world-state-monitoring.util';
import { ensureSnapshotWorldFacts } from './ensure-snapshot-world-facts.util';
import {
  assessTravelWorldFactStale,
  filterFactsForHardBlock,
  type FactStaleAssessment,
} from './travel-world-fact-stale.util';
import { assertDecisionConsumerUsesSnapshot } from './snapshot-ssot.guard.util';
import { randomUUID } from 'crypto';

@Injectable()
export class KnowledgeWorldStateService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeWorldStateService.name);
  private readonly byId = new Map<string, CanonicalWorldStateSnapshot>();
  /** tripId → snapshotIds newest last */
  private readonly byTrip = new Map<string, string[]>();

  constructor(private readonly identity: EntityIdentityRegistryService) {}

  onModuleInit(): void {
    this.seedDemoSnapshots();
    this.logger.log(`KnowledgeWorldStateService seeded snapshots=${this.byId.size}`);
  }

  registerSnapshot(snapshot: CanonicalWorldStateSnapshot): CanonicalWorldStateSnapshot {
    const withFacts = ensureSnapshotWorldFacts(snapshot);
    this.byId.set(withFacts.snapshotId, withFacts);
    const list = this.byTrip.get(withFacts.tripId) ?? [];
    if (!list.includes(withFacts.snapshotId)) list.push(withFacts.snapshotId);
    this.byTrip.set(withFacts.tripId, list);
    return withFacts;
  }

  getSnapshot(snapshotId: string): CanonicalWorldStateSnapshot {
    const s = this.byId.get(snapshotId);
    if (!s) throw new NotFoundException(`Snapshot not found: ${snapshotId}`);
    return s;
  }

  listSnapshots(filter?: {
    tripId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): {
    items: Array<{
      snapshotId: string;
      tripId: string;
      createdAt: string;
      revision: string;
      roadCount: number;
      weatherCount: number;
      poiCount: number;
      factCount: number;
      staleFactCount: number;
      status: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'INCOMPLETE';
      recentChangeCategories: Array<'road' | 'weather' | 'poi' | 'activity'>;
      freshnessSummary: { fresh: number; stale: number };
    }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    let snaps = [...this.byId.values()];
    if (filter?.tripId) snaps = snaps.filter((s) => s.tripId === filter.tripId);
    snaps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const enriched = snaps.map((s, idx) => {
      const facts = s.worldFacts ?? [];
      let stale = 0;
      for (const f of facts) {
        if (assessTravelWorldFactStale(f).stale) stale += 1;
      }
      const older = snaps[idx + 1] ?? null;
      const status = snapshotListStatus({
        staleCount: stale,
        factCount: facts.length,
        completeness: s.completeness,
      });
      return {
        snapshotId: s.snapshotId,
        tripId: s.tripId,
        createdAt: s.createdAt,
        revision: s.revision,
        roadCount: s.roads.length,
        weatherCount: s.weather.length,
        poiCount: s.poiStates.length,
        factCount: facts.length,
        staleFactCount: stale,
        status,
        recentChangeCategories: recentChangeCategories(s, older),
        freshnessSummary: { fresh: facts.length - stale, stale },
      };
    });

    let items = enriched;
    if (filter?.status) {
      items = items.filter((i) => i.status === filter.status);
    }
    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter?.pageSize ?? 20));
    const total = items.length;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
    };
  }

  getSnapshotDetail(snapshotId: string) {
    const s = this.getSnapshot(snapshotId);
    const facts = s.worldFacts ?? [];
    const staleAssessments = facts.map((f) => assessTravelWorldFactStale(f));
    const { eligible, excluded } = filterFactsForHardBlock(facts);
    const unresolvedSubjects = this.identity.checkSubjects(
      facts.map((f) => ({ subjectId: f.subjectId, subjectType: f.subjectType })),
    ).unresolved;

    return {
      ...s,
      freshnessSummary: {
        fresh: staleAssessments.filter((a) => !a.stale).length,
        stale: staleAssessments.filter((a) => a.stale).length,
        hardBlockEligibleFactCount: eligible.length,
        hardBlockExcludedFactCount: excluded.length,
      },
      unresolvedSubjects,
      providerVersions: s.sourceVersions,
    };
  }

  listFacts(filter?: {
    entityId?: string;
    predicate?: string;
    /** Alias of predicate family / fact type */
    factType?: string;
    entityType?: string;
    country?: string;
    provider?: string;
    source?: string;
    freshness?: 'FRESH' | 'STALE' | 'ALL';
    confidenceMin?: number;
    confidenceMax?: number;
    timeFrom?: string;
    timeTo?: string;
    tripId?: string;
    snapshotId?: string;
    page?: number;
    pageSize?: number;
  }): {
    items: Array<
      TravelWorldFact & {
        staleAssessment: FactStaleAssessment;
        snapshotId: string;
        provenance: {
          provider: string;
          evidenceId?: string;
          jobId?: string | null;
          dataset?: string | null;
          license?: string | null;
          contractVersion?: string | null;
        };
      }
    >;
    total: number;
    page: number;
    pageSize: number;
    filtersApplied: Record<string, unknown>;
  } {
    const snaps = filter?.snapshotId
      ? [this.getSnapshot(filter.snapshotId)]
      : filter?.tripId
        ? [...this.byId.values()].filter((s) => s.tripId === filter.tripId)
        : [...this.byId.values()];

    let rows: Array<
      TravelWorldFact & {
        staleAssessment: FactStaleAssessment;
        snapshotId: string;
        provenance: {
          provider: string;
          evidenceId?: string;
          jobId?: string | null;
          dataset?: string | null;
          license?: string | null;
          contractVersion?: string | null;
        };
      }
    > = [];
    for (const s of snaps) {
      for (const f of s.worldFacts ?? []) {
        const staleAssessment = assessTravelWorldFactStale(f);
        rows.push({
          ...f,
          staleAssessment,
          snapshotId: s.snapshotId,
          provenance: this.factProvenance(f),
        });
      }
    }
    if (filter?.entityId) {
      rows = rows.filter(
        (r) => r.subjectId === filter.entityId || r.subjectId.includes(filter.entityId!),
      );
    }
    if (filter?.predicate) rows = rows.filter((r) => r.predicate === filter.predicate);
    if (filter?.factType) {
      const ft = filter.factType.toLowerCase();
      rows = rows.filter((r) => r.predicate.toLowerCase().includes(ft));
    }
    if (filter?.entityType) {
      rows = rows.filter(
        (r) => r.subjectType.toLowerCase() === filter.entityType!.toLowerCase(),
      );
    }
    if (filter?.country) {
      const c = filter.country.toUpperCase();
      rows = rows.filter((r) => (r.scope?.country ?? '').toUpperCase() === c);
    }
    const provider = filter?.provider ?? filter?.source;
    if (provider) {
      const p = provider.toLowerCase();
      rows = rows.filter((r) => (r.source?.provider ?? '').toLowerCase().includes(p));
    }
    if (filter?.freshness === 'STALE') rows = rows.filter((r) => r.staleAssessment.stale);
    if (filter?.freshness === 'FRESH') rows = rows.filter((r) => !r.staleAssessment.stale);
    if (filter?.confidenceMin != null) {
      rows = rows.filter((r) => r.confidence >= filter.confidenceMin!);
    }
    if (filter?.confidenceMax != null) {
      rows = rows.filter((r) => r.confidence <= filter.confidenceMax!);
    }
    if (filter?.timeFrom) {
      rows = rows.filter((r) => r.observedAt >= filter.timeFrom!);
    }
    if (filter?.timeTo) {
      rows = rows.filter((r) => r.observedAt <= filter.timeTo!);
    }

    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter?.pageSize ?? 50));
    const total = rows.length;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      filtersApplied: {
        entityId: filter?.entityId,
        predicate: filter?.predicate,
        factType: filter?.factType,
        entityType: filter?.entityType,
        country: filter?.country,
        provider: provider,
        freshness: filter?.freshness ?? 'ALL',
        confidenceMin: filter?.confidenceMin,
        confidenceMax: filter?.confidenceMax,
        timeFrom: filter?.timeFrom,
        timeTo: filter?.timeTo,
        tripId: filter?.tripId,
        snapshotId: filter?.snapshotId,
      },
    };
  }

  getFact(factId: string) {
    for (const s of this.byId.values()) {
      const f = (s.worldFacts ?? []).find((x) => x.factId === factId);
      if (f) {
        return {
          ...f,
          snapshotId: s.snapshotId,
          tripId: s.tripId,
          staleAssessment: assessTravelWorldFactStale(f),
          identityCheck: softValidateWorldFactSubjectId(
            this.identity,
            f.subjectType,
            f.subjectId,
          ),
          provenance: this.factProvenance(f),
        };
      }
    }
    throw new NotFoundException(`Fact not found: ${factId}`);
  }

  listStaleFacts(tripId?: string) {
    const data = this.listFacts({
      tripId,
      freshness: 'STALE',
      page: 1,
      pageSize: 200,
    });
    return {
      items: data.items,
      total: data.total,
      note: 'Stale facts must be excluded from HARD BLOCK (filterFactsForHardBlock)',
    };
  }

  diff(fromSnapshotId: string, toSnapshotId: string) {
    const from = this.getSnapshot(fromSnapshotId);
    const to = this.getSnapshot(toSnapshotId);
    const product = buildProductWorldStateDiff(from, to);
    return {
      ...product,
      // backward-compatible top-level aliases
      summary: product.summary,
      changes: product.changes,
      engineSummary: product.engine.summary,
      engineChanges: product.engine.changes,
    };
  }

  monitoring() {
    return buildWorldStateMonitoring([...this.byId.values()]);
  }

  /**
   * Generate a demo/ops snapshot for a trip (distinct from register).
   * Does not call live road.is — clones latest or seeds a synthetic tick.
   */
  generateSnapshot(input: {
    tripId: string;
    mode?: 'clone_latest' | 'demo_tick';
    note?: string;
  }): CanonicalWorldStateSnapshot {
    const tripId = input.tripId.trim();
    if (!tripId) throw new NotFoundException('tripId required');

    const ids = this.byTrip.get(tripId) ?? [];
    const latestId = ids[ids.length - 1];
    const mode = input.mode ?? (latestId ? 'clone_latest' : 'demo_tick');

    if (mode === 'clone_latest' && latestId) {
      const latest = this.getSnapshot(latestId);
      const generated: CanonicalWorldStateSnapshot = {
        ...latest,
        snapshotId: `ws_gen_${tripId}_${Date.now()}`.slice(0, 64),
        revision: String(Number(latest.revision || '0') + 1),
        createdAt: new Date().toISOString(),
        sourceVersions: [
          ...(latest.sourceVersions ?? []),
          {
            provider: 'knowledge-control-center',
            version: 'generate',
            observedAt: new Date().toISOString(),
          },
        ],
      };
      return this.registerSnapshot(generated);
    }

    const now = new Date().toISOString();
    const generated: CanonicalWorldStateSnapshot = {
      schemaId: TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA,
      snapshotId: `ws_gen_${tripId}_${Date.now()}`.slice(0, 64),
      tripId,
      revision: '1',
      createdAt: now,
      weather: [],
      roads: [],
      hazards: [],
      ferries: [],
      poiStates: [],
      travelMatrix: { matrixId: `m_${randomUUID().slice(0, 8)}`, entries: [] },
      completeness: {
        roads: 'MISSING',
        weather: 'MISSING',
        hazards: 'MISSING',
        ferries: 'MISSING',
        openingHours: 'MISSING',
      },
      sourceVersions: [
        {
          provider: 'knowledge-control-center',
          version: input.note ?? 'demo_tick',
          observedAt: now,
        },
      ],
      worldFacts: [],
    };
    return this.registerSnapshot(generated);
  }

  /** Runtime helper — Gate/Evaluate entry */
  requireSsotSnapshot(snapshot: CanonicalWorldStateSnapshot) {
    const s = assertDecisionConsumerUsesSnapshot('Gate', { snapshot });
    return ensureSnapshotWorldFacts(s);
  }

  coverageStats() {
    const snaps = [...this.byId.values()];
    const withFacts = snaps.filter((s) => (s.worldFacts?.length ?? 0) > 0).length;
    const stale = this.listStaleFacts().total;
    let factTotal = 0;
    for (const s of snaps) factTotal += s.worldFacts?.length ?? 0;
    return {
      snapshotCount: snaps.length,
      snapshotSsotCoverage: snaps.length ? withFacts / snaps.length : 0,
      staleFactCount: stale,
      staleFactRate: factTotal ? stale / factTotal : 0,
      factTotal,
    };
  }

  private factProvenance(f: TravelWorldFact) {
    const meta =
      f.source && typeof f.source === 'object'
        ? (f.source as {
            provider: string;
            evidenceId?: string;
            contractVersion?: string;
            jobId?: string;
            dataset?: string;
            license?: string;
          })
        : { provider: 'unknown' };
    return {
      provider: meta.provider ?? 'unknown',
      evidenceId: meta.evidenceId,
      jobId: meta.jobId ?? null,
      dataset: meta.dataset ?? null,
      license: meta.license ?? null,
      contractVersion: meta.contractVersion ?? null,
    };
  }

  private seedDemoSnapshots(): void {
    const tripId = 'demo-ks-phase2';
    const baseTime = Date.parse('2026-02-12T08:00:00.000Z');

    const mkFact = (
      factId: string,
      subjectId: string,
      predicate: string,
      value: unknown,
      observedAt: string,
      extras?: Partial<TravelWorldFact>,
    ): TravelWorldFact => ({
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId,
      subjectType: 'RouteSegment',
      subjectId,
      predicate,
      value,
      scope: { tripId, country: 'IS' },
      authorityLevel: 'OFFICIAL_OPERATOR',
      source: { provider: 'road.is' },
      observedAt,
      confidence: 0.95,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
      ...extras,
    });

    const snapOpen: CanonicalWorldStateSnapshot = {
      schemaId: TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA,
      snapshotId: 'ws_demo_phase2_open',
      tripId,
      revision: '1',
      createdAt: new Date(baseTime).toISOString(),
      weather: [
        {
          date: '2026-02-12',
          locationId: 'weather-region:is:south_coast',
          windSpeedMs: 8,
          alertLevel: 'NONE',
          sourceRef: 'vedur',
        },
      ],
      roads: [
        {
          roadId: 'F208',
          segmentId: 'segment:is:f208',
          status: 'OPEN',
          sourceRef: 'road.is',
        },
      ],
      hazards: [],
      ferries: [],
      poiStates: [{ poiId: 'is.reynisfjara', open: true }],
      travelMatrix: { matrixId: 'm_open', entries: [] },
      completeness: {
        roads: 'COMPLETE',
        weather: 'COMPLETE',
        hazards: 'PARTIAL',
        ferries: 'MISSING',
        openingHours: 'PARTIAL',
        poiIdentity: 'PARTIAL',
      },
      sourceVersions: [
        { provider: 'road.is', version: 'demo', observedAt: new Date(baseTime).toISOString() },
      ],
      worldFacts: [
        mkFact(
          'demo_f208_open',
          'segment:is:f208',
          TRAVEL_WORLD_PREDICATES.CURRENT_ROAD_STATUS,
          'OPEN',
          new Date(baseTime).toISOString(),
        ),
      ],
    };

    const snapClosed: CanonicalWorldStateSnapshot = {
      ...snapOpen,
      snapshotId: 'ws_demo_phase2_closed',
      revision: '2',
      createdAt: new Date(baseTime + 45 * 60 * 1000).toISOString(),
      roads: [
        {
          roadId: 'F208',
          segmentId: 'segment:is:f208',
          status: 'CLOSED',
          sourceRef: 'road.is',
          reasonCode: 'WINTER',
        },
      ],
      weather: [
        {
          date: '2026-02-12',
          locationId: 'weather-region:is:south_coast',
          windSpeedMs: 18,
          alertLevel: 'ORANGE',
          sourceRef: 'vedur',
        },
      ],
      worldFacts: [
        mkFact(
          'demo_f208_closed',
          'segment:is:f208',
          TRAVEL_WORLD_PREDICATES.CURRENT_ROAD_STATUS,
          'CLOSED',
          new Date(baseTime + 45 * 60 * 1000).toISOString(),
          { replanTrigger: true },
        ),
        mkFact(
          'demo_wx_stale',
          'weather-region:is:south_coast',
          TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL,
          'ORANGE',
          new Date(baseTime - 2 * 60 * 60 * 1000).toISOString(),
          {
            subjectType: 'WeatherRegion',
            freshness: 'STALE',
            source: { provider: 'vedur' },
          },
        ),
      ],
      sourceVersions: [
        {
          provider: 'road.is',
          version: 'demo',
          observedAt: new Date(baseTime + 45 * 60 * 1000).toISOString(),
        },
      ],
    };

    this.registerSnapshot(snapOpen);
    this.registerSnapshot(snapClosed);
  }
}
