import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DECISION_EPISODE_SCHEMA, type DecisionEpisodeV1 } from '../../travel-memory/episode/decision-episode.types';
import { TravelMemoryRuntimeService } from '../../travel-memory/runtime/travel-memory-runtime.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  KnowledgeDecisionCase,
  KnowledgeDecisionCaseListFilter,
  SimilarCasesQuery,
} from '../contracts/knowledge-decision-case.types';
import {
  projectEpisodeToKnowledgeCase,
  scoreSimilarCase,
} from './project-episode-to-case.util';
import {
  loadKnowledgeDecisionCases,
  querySimilarKnowledgeDecisionCases,
  upsertKnowledgeDecisionCase,
} from './knowledge-decision-case.store';

function parseTags(raw?: string | string[]): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.map((t) => t.trim()).filter(Boolean);
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

@Injectable()
export class KnowledgeDecisionCaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeDecisionCaseService.name);
  /** Hot + durable cache — Prisma is SSOT when DB available */
  private readonly byId = new Map<string, KnowledgeDecisionCase>();
  private readonly byEpisode = new Map<string, string>();
  private prismaPersisted = 0;

  constructor(
    private readonly memoryRuntime: TravelMemoryRuntimeService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const loaded = await loadKnowledgeDecisionCases(this.prisma);
    for (const c of loaded) {
      this.byId.set(c.caseId, c);
      this.byEpisode.set(c.episodeId, c.caseId);
    }
    this.prismaPersisted = loaded.length;
    if (this.byId.size === 0) {
      this.seedDemoCases();
      await this.flushAllToPrisma();
    }
    this.logger.log(
      `KnowledgeDecisionCaseService ready cases=${this.byId.size} prismaLoaded=${loaded.length}`,
    );
  }

  registerCase(c: KnowledgeDecisionCase): KnowledgeDecisionCase {
    const durable = { ...c, durable: true };
    this.byId.set(durable.caseId, durable);
    this.byEpisode.set(durable.episodeId, durable.caseId);
    void upsertKnowledgeDecisionCase(this.prisma, durable).then((ok) => {
      if (ok) this.prismaPersisted = Math.max(this.prismaPersisted, this.byId.size);
    });
    return durable;
  }

  ingestEpisode(
    episode: DecisionEpisodeV1,
    opts?: {
      country?: string;
      situationSnapshotId?: string | null;
      constraintIds?: string[];
      userGoal?: string;
    },
  ): KnowledgeDecisionCase {
    const projected = projectEpisodeToKnowledgeCase({
      episode,
      country: opts?.country,
      situationSnapshotId: opts?.situationSnapshotId,
      constraintIds: opts?.constraintIds,
      userGoal: opts?.userGoal,
      durable: true,
    });
    return this.registerCase(projected);
  }

  /**
   * Reproject episodes from TravelMemoryRuntime hot Map into durable registry.
   */
  reprojectFromRuntime(filter?: { tripId?: string; country?: string }): {
    ingested: number;
    caseIds: string[];
  } {
    const episodes = this.memoryRuntime.getRelevantDecisions({
      tripId: filter?.tripId,
      limit: 500,
    });
    const caseIds: string[] = [];
    for (const ep of episodes) {
      if (filter?.tripId && ep.context.tripId !== filter.tripId) continue;
      const c = this.ingestEpisode(ep, { country: filter?.country });
      caseIds.push(c.caseId);
    }
    return { ingested: caseIds.length, caseIds };
  }

  get(caseId: string): KnowledgeDecisionCase {
    const c = this.byId.get(caseId);
    if (!c) throw new NotFoundException(`Decision case not found: ${caseId}`);
    return c;
  }

  list(filter?: KnowledgeDecisionCaseListFilter): {
    items: KnowledgeDecisionCase[];
    total: number;
    page: number;
    pageSize: number;
  } {
    let items = [...this.byId.values()];
    if (filter?.country) {
      const c = filter.country.toUpperCase();
      items = items.filter((x) => x.country.toUpperCase() === c);
    }
    if (filter?.decisionType) {
      const t = filter.decisionType.toUpperCase();
      items = items.filter((x) => x.decisionType.toUpperCase().includes(t));
    }
    const tags = parseTags(filter?.situationTags);
    if (tags?.length) {
      items = items.filter((x) => {
        const set = new Set(x.situationTags.map((t) => t.toUpperCase()));
        return tags.some((t) => set.has(t.toUpperCase()));
      });
    }
    if (filter?.riskType) {
      const r = filter.riskType.toUpperCase();
      items = items.filter((x) => x.riskType?.toUpperCase() === r);
    }
    if (filter?.outcome) {
      const o = String(filter.outcome).toUpperCase();
      items = items.filter((x) => x.outcome.label === o);
    }
    if (filter?.userChoice) {
      const u = String(filter.userChoice).toUpperCase();
      items = items.filter((x) => x.userChoice.action === u);
    }
    if (filter?.regret !== undefined && filter.regret !== null && filter.regret !== '') {
      const rg = String(filter.regret).toUpperCase();
      items = items.filter((x) => (x.regret ?? 'NULL') === (rg === 'NULL' ? 'NULL' : rg));
    }
    if (filter?.tripId) {
      items = items.filter((x) => x.tripId === filter.tripId);
    }

    items.sort((a, b) => b.projectedAt.localeCompare(a.projectedAt));
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

  /**
   * V1 similar: country + decisionType + situationTags + riskType (no embedding).
   * Prefers in-memory score; optionally merges Prisma SQL facet hits.
   */
  async similar(caseId: string, query?: Omit<SimilarCasesQuery, 'excludeCaseId'>): Promise<{
    seed: KnowledgeDecisionCase;
    items: Array<KnowledgeDecisionCase & { similarityScore: number }>;
    sqlHitCount: number;
  }> {
    const seed = this.get(caseId);
    const scored = [...this.byId.values()]
      .filter((c) => c.caseId !== caseId)
      .map((c) => ({
        ...c,
        similarityScore: scoreSimilarCase(
          {
            country: query?.country ?? seed.country,
            decisionType: query?.decisionType ?? seed.decisionType,
            situationTags: query?.situationTags ?? seed.situationTags,
            riskType: query?.riskType !== undefined ? query.riskType : seed.riskType,
          },
          c,
        ),
      }))
      .filter((c) => c.similarityScore > 0)
      .sort((a, b) => b.similarityScore - a.similarityScore);

    const sqlRows = await querySimilarKnowledgeDecisionCases(this.prisma, {
      country: query?.country ?? seed.country,
      decisionType: query?.decisionType ?? seed.decisionType,
      situationTags: query?.situationTags ?? seed.situationTags,
      riskType: query?.riskType !== undefined ? query.riskType : seed.riskType,
      excludeCaseId: caseId,
      limit: query?.limit ?? 10,
    });

    const limit = Math.min(50, Math.max(1, query?.limit ?? 10));
    return {
      seed,
      items: scored.slice(0, limit),
      sqlHitCount: sqlRows.length,
    };
  }

  coverageStats(): {
    caseCount: number;
    withOutcome: number;
    withRegret: number;
    decisionCaseCaptureRate: number;
    evidenceMissingRate: number;
    prismaPersisted: number;
  } {
    const cases = [...this.byId.values()];
    const caseCount = cases.length;
    const withOutcome = cases.filter((c) => c.outcome.label !== 'PENDING').length;
    const withRegret = cases.filter((c) => c.regret != null).length;
    const missingEvidence = cases.filter((c) => c.evidence.length === 0).length;
    return {
      caseCount,
      withOutcome,
      withRegret,
      decisionCaseCaptureRate: caseCount === 0 ? 0 : withOutcome / caseCount,
      evidenceMissingRate: caseCount === 0 ? 0 : missingEvidence / caseCount,
      prismaPersisted: this.prismaPersisted,
    };
  }

  private async flushAllToPrisma(): Promise<void> {
    let ok = 0;
    for (const c of this.byId.values()) {
      if (await upsertKnowledgeDecisionCase(this.prisma, c)) ok += 1;
    }
    this.prismaPersisted = ok;
  }

  private seedDemoCases(): void {
    const open: DecisionEpisodeV1 = {
      schemaId: DECISION_EPISODE_SCHEMA,
      version: 1,
      episodeId: 'demo-ep-f208-open',
      context: {
        tripId: 'demo-ks-phase5',
        day: 3,
        weatherRisk: 'LOW',
        decisionType: 'ROUTE_SEGMENT',
        worldStateNote: 'F208 OPEN',
      },
      decision: {
        type: 'F_ROAD_CONTINUE',
        alternatives: ['CONTINUE_F208', 'DETOUR_RING'],
        recommended: 'CONTINUE_F208',
      },
      userAction: { type: 'ACCEPT', selected: 'CONTINUE_F208' },
      outcome: {
        status: 'OK',
        completed: true,
        fatigue: 'LOW',
        scheduleDelayMinutes: 0,
        safetyIncident: false,
      },
      reflection: { decisionRegret: 0.1 },
      sourceRefs: { cgusDecisionId: 'cgus_demo_f208_open' },
      mayPromoteToPreference: false,
    };

    const closed: DecisionEpisodeV1 = {
      schemaId: DECISION_EPISODE_SCHEMA,
      version: 1,
      episodeId: 'demo-ep-f208-closed',
      context: {
        tripId: 'demo-ks-phase5',
        day: 3,
        weatherRisk: 'HIGH',
        decisionType: 'ROUTE_SEGMENT',
        worldStateNote: 'F208 CLOSED',
      },
      decision: {
        type: 'F_ROAD_CONTINUE',
        alternatives: ['CONTINUE_F208', 'DETOUR_RING'],
        recommended: 'DETOUR_RING',
      },
      userAction: {
        type: 'OVERRIDE',
        selected: 'CONTINUE_F208',
        reason: 'wanted highland photos',
      },
      outcome: {
        status: 'FAIL',
        completed: false,
        fatigue: 'HIGH',
        scheduleDelayMinutes: 120,
        safetyIncident: false,
      },
      reflection: {
        decisionRegret: 0.8,
        rootCause: 'ignored_road_closure',
      },
      sourceRefs: { cgusDecisionId: 'cgus_demo_f208_closed' },
      mayPromoteToPreference: false,
    };

    const weather: DecisionEpisodeV1 = {
      schemaId: DECISION_EPISODE_SCHEMA,
      version: 1,
      episodeId: 'demo-ep-weather-defer',
      context: {
        tripId: 'demo-ks-phase5-b',
        day: 2,
        weatherRisk: 'HIGH',
        decisionType: 'ACTIVITY',
        worldStateNote: 'storm warning',
      },
      decision: {
        type: 'WEATHER_ACTIVITY',
        alternatives: ['GO_ANYWAY', 'DEFER_INDOOR'],
        recommended: 'DEFER_INDOOR',
      },
      userAction: { type: 'ACCEPT', selected: 'DEFER_INDOOR' },
      outcome: {
        status: 'OK',
        completed: true,
        fatigue: 'LOW',
        scheduleDelayMinutes: 0,
        safetyIncident: false,
      },
      reflection: { decisionRegret: 0.05 },
      mayPromoteToPreference: false,
    };

    this.ingestEpisode(open, {
      country: 'IS',
      situationSnapshotId: 'ws_demo_phase2_open',
      constraintIds: ['c_froad_vehicle'],
      userGoal: 'cross highlands',
    });
    this.ingestEpisode(closed, {
      country: 'IS',
      situationSnapshotId: 'ws_demo_phase2_closed',
      constraintIds: ['c_froad_vehicle', 'c_weather_gate'],
      userGoal: 'cross highlands',
    });
    this.ingestEpisode(weather, {
      country: 'IS',
      situationSnapshotId: null,
      userGoal: 'glacier hike',
    });
  }
}
