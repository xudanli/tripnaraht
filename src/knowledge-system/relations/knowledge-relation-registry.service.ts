import { Injectable, Logger, NotFoundException, OnModuleInit, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import {
  KNOWLEDGE_RELATION_TYPES_V1,
  PROJECTED_RELATION_SOURCES,
  RELATION_ADAPTER_CONFIDENCE,
  RELATION_VOCABULARY_META,
  type KnowledgeRelation,
  type KnowledgeRelationType,
  type RelationProjectionRow,
  type RelationVocabularyRow,
} from '../contracts/knowledge-relation.types';
import { inferCountryFromEntityId } from './infer-country-from-entity-id.util';
import {
  deleteKnowledgeRelation,
  loadKnowledgeRelations,
  maxRelationUpdatedAt,
  persistProjectedKnowledgeRelations,
  upsertKnowledgeRelation,
} from './knowledge-relation.store';
import { projectCausalChainRelations } from './project-causal-chain-relations.util';
import { projectGoldenSetRelations } from './project-golden-set-relations.util';
import { projectPoiAlternativeRelations } from './project-poi-alternative-relations.util';
import {
  DEFAULT_SPATIAL_RELATION_LIMIT,
  projectSpatialConnectedRelations,
} from './project-spatial-relations.util';

@Injectable()
export class KnowledgeRelationRegistryService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeRelationRegistryService.name);
  private readonly byId = new Map<string, KnowledgeRelation>();
  private projections: RelationProjectionRow[] = [];
  private spatialProjected = false;
  private prismaPersisted = 0;
  private lastUpdated: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: EntityIdentityRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    const loaded = await loadKnowledgeRelations(this.prisma);
    for (const r of loaded) this.byId.set(r.relationId, r);
    this.prismaPersisted = loaded.length;
    const dbUpdated = await maxRelationUpdatedAt(this.prisma);
    this.lastUpdated = dbUpdated?.toISOString() ?? null;

    const persist = await this.reprojectAll();
    this.logger.log(
      `KnowledgeRelationRegistry ready relations=${this.byId.size} dbLoaded=${loaded.length} persisted=${persist.persisted.upserted} projections=${this.projections.length}`,
    );
  }

  /** Re-run adapters, keep `manual`, flush projected rows to DB. */
  async reprojectAll(opts?: { spatialLimit?: number }): Promise<{
    relationCount: number;
    spatialCount: number;
    persisted: { upserted: number; deleted: number };
    relationStandardizationRate: number;
    spatialProjected: boolean;
    bySource: Record<string, number>;
  }> {
    this.reprojectStatic();
    let spatialCount = 0;
    try {
      spatialCount = await this.reprojectSpatial(opts?.spatialLimit);
    } catch (e) {
      this.logger.warn(
        `Spatial relation projection skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const persisted = await persistProjectedKnowledgeRelations(
      this.prisma,
      [...this.byId.values()],
    );
    this.prismaPersisted = persisted.upserted;
    this.lastUpdated = new Date().toISOString();
    return {
      ...this.stats(),
      spatialCount,
      persisted,
    };
  }

  reprojectStatic(): void {
    const previous = new Map(this.byId);
    const preserved = [...this.byId.values()].filter(
      (r) => r.source === 'spatial' || r.source === 'manual',
    );
    this.byId.clear();
    this.projections = [];

    const gs = projectGoldenSetRelations();
    const poi = projectPoiAlternativeRelations();
    const causal = projectCausalChainRelations();

    for (const r of [...gs.relations, ...poi.relations, ...causal.relations, ...preserved]) {
      const remapped = this.remapEndpointsToCanonical(r);
      const prev = previous.get(remapped.relationId) ?? previous.get(r.relationId);
      this.byId.set(remapped.relationId, {
        ...remapped,
        createdAt: prev?.createdAt ?? remapped.createdAt,
        updatedAt: remapped.updatedAt ?? prev?.updatedAt,
      });
    }
    this.projections = [...gs.projections, ...poi.projections, ...causal.projections];
    const spatial = preserved.filter((r) => r.source === 'spatial');
    if (spatial.length) {
      this.projections.push({
        source: 'spatial',
        originalType: 'SpatialDomainSegment.fromPoiId→toPoiId',
        projectedType: 'CONNECTED_TO',
        note: `cached ${spatial.length} segments`,
      });
    }
  }

  async reprojectSpatial(limit = DEFAULT_SPATIAL_RELATION_LIMIT): Promise<number> {
    const { relations, projections } = await projectSpatialConnectedRelations(
      this.prisma,
      limit,
    );
    const prevSpatial = new Map(
      [...this.byId.values()]
        .filter((x) => x.source === 'spatial')
        .map((x) => [x.relationId, x] as const),
    );
    for (const r of prevSpatial.values()) this.byId.delete(r.relationId);
    for (const r of relations) {
      const remapped = this.remapEndpointsToCanonical(r);
      const prev = prevSpatial.get(remapped.relationId);
      this.byId.set(remapped.relationId, {
        ...remapped,
        createdAt: prev?.createdAt ?? remapped.createdAt,
      });
    }
    this.projections = this.projections.filter((p) => p.source !== 'spatial');
    this.projections.push(...projections);
    this.spatialProjected = true;
    return relations.length;
  }

  get(relationId: string): KnowledgeRelation {
    const r = this.byId.get(relationId);
    if (!r) throw new NotFoundException(`Relation not found: ${relationId}`);
    return r;
  }

  list(filter?: {
    from?: string;
    to?: string;
    type?: KnowledgeRelationType;
    source?: string;
    country?: string;
    domain?: string;
    page?: number;
    pageSize?: number;
  }): { items: KnowledgeRelation[]; total: number; page: number; pageSize: number } {
    let items = [...this.byId.values()];
    if (filter?.from) items = items.filter((r) => r.from === filter.from || r.from.includes(filter.from!));
    if (filter?.to) items = items.filter((r) => r.to === filter.to || r.to.includes(filter.to!));
    if (filter?.type) items = items.filter((r) => r.type === filter.type);
    if (filter?.source) items = items.filter((r) => r.source === filter.source);
    if (filter?.country) items = items.filter((r) => r.country === filter.country);
    items.sort((a, b) => a.relationId.localeCompare(b.relationId));
    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(5000, Math.max(1, filter?.pageSize ?? 50));
    const total = items.length;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
    };
  }

  /** All relations in memory (graph assembly; no page cap). */
  listAll(filter?: {
    type?: KnowledgeRelationType;
    country?: string;
  }): KnowledgeRelation[] {
    let items = [...this.byId.values()];
    if (filter?.type) items = items.filter((r) => r.type === filter.type);
    if (filter?.country) items = items.filter((r) => r.country === filter.country);
    return items;
  }

  listForEntity(entityId: string): KnowledgeRelation[] {
    return [...this.byId.values()].filter(
      (r) => r.from === entityId || r.to === entityId || r.from.includes(entityId) || r.to.includes(entityId),
    );
  }

  vocabulary(): RelationVocabularyRow[] {
    const counts = new Map<KnowledgeRelationType, { count: number; sources: Set<string> }>();
    for (const t of KNOWLEDGE_RELATION_TYPES_V1) {
      counts.set(t, { count: 0, sources: new Set() });
    }
    for (const r of this.byId.values()) {
      const row = counts.get(r.type);
      if (!row) continue;
      row.count += 1;
      row.sources.add(r.source);
    }
    return KNOWLEDGE_RELATION_TYPES_V1.map((type) => {
      const meta = RELATION_VOCABULARY_META[type];
      const row = counts.get(type)!;
      return {
        type,
        meaningZh: meta.meaningZh,
        meaningEn: meta.meaningEn,
        count: row.count,
        sources: [...row.sources] as RelationVocabularyRow['sources'],
      };
    });
  }

  listProjections(): RelationProjectionRow[] {
    return this.projections;
  }

  getLastUpdated(): string | null {
    return this.lastUpdated;
  }

  standardizationRate(): number {
    const total = this.byId.size;
    if (!total) return 0;
    const standardized = [...this.byId.values()].filter((r) =>
      (KNOWLEDGE_RELATION_TYPES_V1 as readonly string[]).includes(r.type),
    ).length;
    return standardized / total;
  }

  stats() {
    const bySource: Record<string, number> = { manual: 0 };
    for (const s of PROJECTED_RELATION_SOURCES) bySource[s] = 0;
    for (const r of this.byId.values()) {
      bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    }
    return {
      relationCount: this.byId.size,
      relationStandardizationRate: this.standardizationRate(),
      spatialProjected: this.spatialProjected,
      prismaPersisted: this.prismaPersisted,
      lastUpdated: this.lastUpdated,
      bySource,
    };
  }

  async createManual(input: {
    from: string;
    to: string;
    type: KnowledgeRelationType;
    confidence?: number;
    country?: string;
    metadata?: Record<string, unknown>;
    condition?: Record<string, unknown>;
  }): Promise<KnowledgeRelation> {
    const from = input.from?.trim();
    const to = input.to?.trim();
    if (!from || !to) throw new BadRequestException('from and to are required');
    if (!(KNOWLEDGE_RELATION_TYPES_V1 as readonly string[]).includes(input.type)) {
      throw new BadRequestException(`Unknown relation type: ${input.type}`);
    }
    const relationId = `manual:${input.type}:${from}:${to}`.slice(0, 255);
    if (this.byId.has(relationId)) {
      throw new ConflictException(`Relation already exists: ${relationId}`);
    }
    const now = new Date().toISOString();
    const remapped = this.remapEndpointsToCanonical({
      relationId,
      type: input.type,
      from,
      to,
      confidence: input.confidence ?? RELATION_ADAPTER_CONFIDENCE.manual_default,
      source: 'manual',
      sourceRef: 'admin',
      country: input.country,
      metadata: input.metadata,
      condition: input.condition,
      createdAt: now,
      updatedAt: now,
    });
    this.byId.set(remapped.relationId, remapped);
    this.lastUpdated = now;
    await upsertKnowledgeRelation(this.prisma, remapped);
    return remapped;
  }

  async updateManual(
    relationId: string,
    patch: {
      type?: KnowledgeRelationType;
      confidence?: number;
      country?: string;
      metadata?: Record<string, unknown>;
      condition?: Record<string, unknown>;
    },
  ): Promise<KnowledgeRelation> {
    const existing = this.get(relationId);
    if (existing.source !== 'manual') {
      throw new BadRequestException('Only source=manual relations can be patched');
    }
    if (patch.type && !(KNOWLEDGE_RELATION_TYPES_V1 as readonly string[]).includes(patch.type)) {
      throw new BadRequestException(`Unknown relation type: ${patch.type}`);
    }
    const now = new Date().toISOString();
    const next: KnowledgeRelation = {
      ...existing,
      type: patch.type ?? existing.type,
      confidence: patch.confidence ?? existing.confidence,
      country: patch.country ?? existing.country,
      metadata: patch.metadata ?? existing.metadata,
      condition: patch.condition ?? existing.condition,
      updatedAt: now,
    };
    this.byId.set(relationId, next);
    this.lastUpdated = now;
    await upsertKnowledgeRelation(this.prisma, next);
    return next;
  }

  async remove(relationId: string): Promise<{ relationId: string; deleted: true }> {
    this.get(relationId);
    this.byId.delete(relationId);
    this.lastUpdated = new Date().toISOString();
    await deleteKnowledgeRelation(this.prisma, relationId);
    return { relationId, deleted: true };
  }

  /** Remap place:db:* endpoints to CPRE is.* when Identity has a link */
  private remapEndpointsToCanonical(r: KnowledgeRelation): KnowledgeRelation {
    const from = this.resolveEndpoint(r.from);
    const to = this.resolveEndpoint(r.to);
    const country =
      r.country ??
      this.identity.get(from)?.country ??
      this.identity.get(to)?.country ??
      inferCountryFromEntityId(from) ??
      inferCountryFromEntityId(to);
    if (from === r.from && to === r.to && country === r.country) return r;
    return {
      ...r,
      from,
      to,
      country,
      metadata: {
        ...(r.metadata ?? {}),
        ...(from !== r.from || to !== r.to
          ? { originalFrom: r.from, originalTo: r.to, identityRemapped: true }
          : {}),
      },
    };
  }

  private resolveEndpoint(id: string): string {
    const r = this.identity.resolve({
      system: id.startsWith('place:db:') || /^\d+$/.test(id) ? 'place_db' : undefined,
      sourceId: id,
      alias: id,
    });
    return r.canonicalEntityId ?? id;
  }
}
