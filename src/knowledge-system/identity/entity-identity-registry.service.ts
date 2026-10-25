import { forwardRef, Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ICELAND_CANONICAL_POI_CATALOG } from '../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { isCanonicalTravelPoiId } from '../../canonical-poi-resolution/utils/resolve-poi-id-sync.util';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CanonicalEntityId,
  CreateCanonicalEntityInput,
  CreateCanonicalEntityResult,
  EntityIdentity,
  EntityIdentityStatus,
  IdentityResolveResult,
  KnowledgeDomain,
  UnresolvedSubject,
  UpdateCanonicalEntityInput,
  UpdateCanonicalEntityResult,
} from '../contracts/entity-identity.types';
import { ONTOLOGY_ATTRIBUTES, ONTOLOGY_TYPES } from '../ontology/ontology-catalog';
import { validateEntityProperties } from '../ontology/ontology-attribute-query.util';
import { KnowledgeOntologyService } from '../ontology/knowledge-ontology.service';
import {
  loadKnowledgeEntityIdentities,
  upsertKnowledgeEntityIdentity,
} from './knowledge-entity-identity.store';
import {
  normalizePlaceId,
  normalizeRoadId,
  normalizeSegmentId,
  normalizeVehicleId,
  normalizeWeatherRegionId,
  parsePlaceDbId,
  placeIsAliasForCanonical,
  tryNormalizeAny,
} from './normalize-canonical-id.util';
import { buildPlaceDbToCpreLinks } from './seed-place-db-cpre.util';

/** Known legacy subjectIds observed in ontology harness / ingest (Phase 0 inventory). */
export const PHASE1_OBSERVED_SUBJECT_IDS: ReadonlyArray<{
  subjectId: string;
  subjectType?: string;
}> = [
  { subjectId: 'seg_f208', subjectType: 'RouteSegment' },
  { subjectId: 'seg_river_crossing', subjectType: 'RouteSegment' },
  { subjectId: 'veh_1', subjectType: 'RentalVehicle' },
  { subjectId: 'south_coast', subjectType: 'WeatherRegion' },
  { subjectId: 'wx_south_coast', subjectType: 'WeatherRegion' },
  { subjectId: 'wx_west', subjectType: 'WeatherRegion' },
  { subjectId: 'flight_kef_arrival', subjectType: 'Flight' },
  { subjectId: 'IS-R1-SOUTH', subjectType: 'RouteSegment' },
  { subjectId: 'F208', subjectType: 'RouteSegment' },
];

function domainForType(entityType: string): KnowledgeDomain {
  switch (entityType) {
    case 'Place':
      return 'PLACE';
    case 'RouteSegment':
    case 'Road':
    case 'RentalVehicle':
    case 'Vehicle':
    case 'Flight':
    case 'RentalContract':
    case 'InsurancePolicy':
      return 'MOBILITY';
    case 'WeatherRegion':
    case 'NaturalHazard':
    case 'RouteWeatherExposure':
      return 'ENVIRONMENT';
    case 'Traveler':
    case 'TravelerIdentity':
    case 'Driver':
    case 'EntryRule':
    case 'EntryEligibility':
      return 'TRAVELER';
    case 'Activity':
    case 'ActivityCapability':
      return 'ACTIVITY';
    case 'DaylightWindow':
      return 'TIME';
    default:
      return 'TRIP';
  }
}

const KNOWN_DOMAINS: ReadonlySet<string> = new Set([
  'TRAVELER',
  'GEOGRAPHY',
  'PLACE',
  'MOBILITY',
  'ACTIVITY',
  'TIME',
  'ENVIRONMENT',
  'TRIP',
]);

function parseDomainInput(raw: string | undefined, entityType: string): KnowledgeDomain {
  if (raw?.trim()) {
    const u = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (KNOWN_DOMAINS.has(u)) return u as KnowledgeDomain;
  }
  const fromOntology = ONTOLOGY_TYPES.find((t) => t.typeId === entityType || t.name === entityType);
  if (fromOntology) return fromOntology.domain;
  return domainForType(entityType);
}

function parseStatusInput(raw: string | undefined): EntityIdentityStatus {
  if (!raw?.trim()) return 'ACTIVE';
  const t = raw.trim().toLowerCase();
  if (t === 'enabled' || t === 'active') return 'ACTIVE';
  if (t === 'draft' || t === 'pending') return 'PENDING';
  if (t === 'deprecated') return 'DEPRECATED';
  return 'ACTIVE';
}

/** Admin API 对外 status：enabled / draft / deprecated */
export function toApiEntityStatus(status?: EntityIdentityStatus): string {
  if (status === 'PENDING') return 'draft';
  if (status === 'DEPRECATED') return 'deprecated';
  return 'enabled';
}

function slugifyName(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (ascii) return ascii;
  // CJK / other: stable short hash from code points
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `e_${h.toString(36)}`;
}

function countryCode(raw?: string, fallback = 'xx'): string {
  const c = (raw ?? fallback).trim().toLowerCase();
  if (/^[a-z]{2}$/.test(c)) return c;
  return fallback;
}

/** Generate a candidate canonical id from type + name (+ country). */
export function generateCanonicalEntityId(input: {
  type: string;
  name: string;
  country?: string;
}): string {
  const slug = slugifyName(input.name);
  const cc = countryCode(input.country);
  switch (input.type) {
    case 'Place':
      return `place:${slug}`;
    case 'RouteSegment':
      return `segment:${cc}:${slug}`;
    case 'Road':
      return `road:${cc}:${slug}`;
    case 'RentalVehicle':
    case 'Vehicle':
      return `vehicle:admin:${slug}`;
    case 'WeatherRegion':
      return `weather-region:${cc}:${slug}`;
    case 'Flight':
      return `flight:${slug}`;
    case 'NaturalHazard':
      return `hazard:${cc}:${slug}`;
    case 'ActivityCapability':
      return `activity:${slug}`;
    case 'Driver':
      return `driver:${slug}`;
    case 'TravelerIdentity':
      return `traveler:${slug}`;
    default:
      return `${slugifyName(input.type)}:${slug}`;
  }
}

@Injectable()
export class EntityIdentityRegistryService implements OnModuleInit {
  private readonly logger = new Logger(EntityIdentityRegistryService.name);
  private readonly byCanonical = new Map<string, EntityIdentity>();
  /** `${system}::${sourceId}` → canonical */
  private readonly bySource = new Map<string, string>();
  private readonly byAlias = new Map<string, string>();
  private prismaPersisted = 0;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    @Inject(forwardRef(() => KnowledgeOntologyService))
    private readonly ontology?: KnowledgeOntologyService,
  ) {}

  private attributesForType(ownerTypeId: string) {
    return (
      this.ontology?.attributesForOwnerType(ownerTypeId) ??
      ONTOLOGY_ATTRIBUTES.filter(
        (a) => a.ownerTypeId.toLowerCase() === ownerTypeId.toLowerCase(),
      )
    );
  }

  async onModuleInit(): Promise<void> {
    this.seedFromCpre();
    this.seedPlaceDbLinks();
    this.seedNormalizedMobilityExamples();

    if (this.prisma) {
      const loaded = await loadKnowledgeEntityIdentities(this.prisma);
      for (const e of loaded) {
        // ADMIN / DB rows overlay seeds（同 ID 以 DB 为准）
        this.register(e, { persist: false });
      }
      this.prismaPersisted = loaded.length;
      // 将内存种子补写到 DB（不覆盖 ADMIN）
      let flushed = 0;
      for (const e of this.byCanonical.values()) {
        if (e.origin === 'ADMIN') continue;
        const ok = await upsertKnowledgeEntityIdentity(this.prisma, {
          ...e,
          origin: e.origin ?? 'SEED',
        });
        if (ok) flushed += 1;
      }
      this.logger.log(
        `EntityIdentityRegistry durable load=${loaded.length} seedFlush=${flushed} db=${this.prisma.isDbConnected()}`,
      );
    }

    this.logger.log(
      `EntityIdentityRegistry seeded: entities=${this.byCanonical.size} sourceRefs=${this.bySource.size} aliases=${this.byAlias.size} prismaPersisted=${this.prismaPersisted}`,
    );
  }

  private persistAsync(entity: EntityIdentity): void {
    if (!this.prisma) return;
    void upsertKnowledgeEntityIdentity(this.prisma, entity).then((ok) => {
      if (ok) this.prismaPersisted = Math.max(this.prismaPersisted, 1);
    });
  }

  private sourceKey(system: string, sourceId: string): string {
    return `${system.trim().toLowerCase()}::${sourceId.trim()}`;
  }

  private aliasKey(alias: string): string {
    return alias.trim().toLowerCase();
  }

  register(entity: EntityIdentity, opts?: { persist?: boolean }): void {
    const id = entity.canonicalEntityId.trim();
    const prev = this.byCanonical.get(id);
    const merged: EntityIdentity = {
      ...prev,
      ...entity,
      canonicalEntityId: id,
      aliases: [...new Set([...(prev?.aliases ?? []), ...(entity.aliases ?? [])])],
      sourceRefs: [...(prev?.sourceRefs ?? []), ...(entity.sourceRefs ?? [])].filter(
        (r, i, arr) =>
          arr.findIndex((x) => x.system === r.system && x.sourceId === r.sourceId) === i,
      ),
      status: entity.status ?? prev?.status ?? 'ACTIVE',
      properties: entity.properties ?? prev?.properties,
      country: entity.country ?? prev?.country,
      description: entity.description ?? prev?.description,
      origin: entity.origin ?? prev?.origin ?? 'SEED',
      createdAt: prev?.createdAt ?? entity.createdAt,
      updatedAt: entity.updatedAt ?? new Date().toISOString(),
    };
    this.byCanonical.set(id, merged);
    this.bySource.set(this.sourceKey('canonical', id), id);
    for (const ref of merged.sourceRefs ?? []) {
      this.bySource.set(this.sourceKey(ref.system, ref.sourceId), id);
    }
    for (const a of merged.aliases ?? []) {
      this.byAlias.set(this.aliasKey(a), id);
    }
    if (merged.displayName) {
      this.byAlias.set(this.aliasKey(merged.displayName), id);
    }
    if (opts?.persist !== false && (merged.origin === 'ADMIN' || opts?.persist === true)) {
      this.persistAsync(merged);
    }
  }

  /**
   * Admin 显式新建 Identity 规范实体（≠ resolve）。
   * type 必须存在于 ontology types 投影；显式 ID 冲突 → CONFLICT。
   */
  createCanonical(input: CreateCanonicalEntityInput): CreateCanonicalEntityResult {
    let name = input?.name?.trim();
    const type = input?.type?.trim();
    if (!type) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'type 为必填（本体类型码）',
        details: { field: 'type' },
      };
    }

    const typeDef = ONTOLOGY_TYPES.find(
      (t) => t.typeId === type || t.nameEn === type || t.name === type,
    );
    if (!typeDef) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `type "${type}" 不在 ontology types 投影中，请先使用 GET /ontology/types`,
        details: {
          field: 'type',
          knownTypeSample: ONTOLOGY_TYPES.slice(0, 8).map((t) => t.typeId),
        },
      };
    }

    const linkedPoiId = input.linkedPoiId?.trim();
    const linkedPoi = linkedPoiId
      ? ICELAND_CANONICAL_POI_CATALOG.find((p) => p.poiId === linkedPoiId)
      : undefined;
    if (linkedPoiId && !linkedPoi) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `linkedPoiId 不在 POI 目录: ${linkedPoiId}`,
        details: { field: 'linkedPoiId' },
      };
    }

    if (linkedPoi && this.byCanonical.has(linkedPoi.poiId)) {
      return {
        ok: false,
        code: 'CONFLICT',
        message: `该 POI 已在 Identity 中: ${linkedPoi.poiId}`,
        details: {
          canonicalEntityId: linkedPoi.poiId,
          existing: this.byCanonical.get(linkedPoi.poiId),
        },
      };
    }

    // 选了 POI：可回填 name / aliases / canonicalEntityId / country
    if (linkedPoi && !name) name = linkedPoi.canonicalName;

    if (!name) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'name 为必填（展示名）；或选择 linkedPoiId 自动回填',
        details: { field: 'name' },
      };
    }

    const entityType = typeDef.typeId;
    const domain = parseDomainInput(input.domain, entityType);
    const status = parseStatusInput(input.status);
    const aliases = [
      ...new Set([
        ...(Array.isArray(input.aliases)
          ? input.aliases.map((a) => String(a).trim()).filter(Boolean)
          : []),
        ...(linkedPoi?.aliases ?? []),
      ]),
    ];
    const country =
      input.country?.trim().toUpperCase() || linkedPoi?.country?.toUpperCase() || undefined;
    const now = new Date().toISOString();
    const preferredId = input.canonicalEntityId?.trim() || linkedPoi?.poiId;

    let canonicalEntityId: string;
    if (preferredId) {
      canonicalEntityId = preferredId;
      if (this.byCanonical.has(canonicalEntityId)) {
        return {
          ok: false,
          code: 'CONFLICT',
          message: `canonicalEntityId 已存在: ${canonicalEntityId}`,
          details: { canonicalEntityId },
        };
      }
    } else {
      let candidate = generateCanonicalEntityId({
        type: entityType,
        name,
        country: country ?? 'xx',
      });
      let n = 2;
      while (this.byCanonical.has(candidate)) {
        candidate = `${generateCanonicalEntityId({
          type: entityType,
          name,
          country: country ?? 'xx',
        })}_${n}`;
        n += 1;
        if (n > 1000) {
          return {
            ok: false,
            code: 'VALIDATION_ERROR',
            message: '无法生成唯一 canonicalEntityId',
          };
        }
      }
      canonicalEntityId = candidate;
    }

    const sourceRefs: EntityIdentity['sourceRefs'] = [
      { system: 'admin', sourceId: canonicalEntityId },
    ];
    if (linkedPoi) {
      sourceRefs.push({ system: 'cpre', sourceId: linkedPoi.poiId });
    }
    for (const lid of input.linkedEntityIds ?? []) {
      const id = String(lid).trim();
      if (id) sourceRefs.push({ system: 'identity_link', sourceId: id });
    }

    const propsIn =
      input.properties && typeof input.properties === 'object' ? input.properties : {};
    const propsValidated = validateEntityProperties({
      ownerTypeId: entityType,
      properties: propsIn,
      attributes: this.attributesForType(entityType),
      mode: 'create',
      envelope: {
        name,
        displayName: name,
        canonicalEntityId,
        aliases,
        country,
        domain,
        status,
        description: input.description?.trim(),
      },
    });
    if (propsValidated.ok === false) {
      return {
        ok: false,
        code: propsValidated.code,
        message: propsValidated.message,
        details: propsValidated.details,
      };
    }

    const entity: EntityIdentity = {
      canonicalEntityId,
      entityType,
      domain,
      displayName: name,
      aliases,
      status,
      country,
      description: input.description?.trim() || undefined,
      properties: {
        ...propsValidated.properties,
        ...(linkedPoi ? { linkedPoiId: linkedPoi.poiId } : {}),
        ...(input.linkedEntityIds?.length
          ? { linkedEntityIds: input.linkedEntityIds }
          : {}),
      },
      sourceRefs,
      origin: 'ADMIN',
      createdAt: now,
      updatedAt: now,
    };
    this.register(entity, { persist: true });
    this.logger.log(
      `createCanonical id=${canonicalEntityId} type=${entityType} poi=${linkedPoi?.poiId ?? '-'}`,
    );
    return { ok: true, entity: this.byCanonical.get(canonicalEntityId)! };
  }

  /**
   * Admin 部分更新 Identity（不可改 canonicalEntityId）。
   */
  updateCanonical(
    canonicalEntityId: string,
    input: UpdateCanonicalEntityInput,
  ): UpdateCanonicalEntityResult {
    const id = decodeURIComponent(canonicalEntityId).trim();
    const existing = this.byCanonical.get(id);
    if (!existing) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: `实体不存在: ${id}`,
        details: { canonicalEntityId: id },
      };
    }

    const patchKeys = Object.keys(input ?? {}).filter(
      (k) => (input as Record<string, unknown>)[k] !== undefined,
    );
    if (patchKeys.length === 0) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: '至少提供一个可更新字段',
        details: {
          allowed: [
            'name',
            'type',
            'domain',
            'country',
            'aliases',
            'description',
            'status',
            'properties',
            'linkedPoiId',
            'linkedEntityIds',
          ],
        },
      };
    }

    let entityType = existing.entityType;
    if (input.type !== undefined) {
      const type = input.type.trim();
      if (!type) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'type 不能为空',
          details: { field: 'type' },
        };
      }
      const typeDef = ONTOLOGY_TYPES.find(
        (t) => t.typeId === type || t.nameEn === type || t.name === type,
      );
      if (!typeDef) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `type "${type}" 不在 ontology types 投影中`,
          details: { field: 'type' },
        };
      }
      entityType = typeDef.typeId;
    }

    const linkedPoiId = input.linkedPoiId?.trim();
    const linkedPoi = linkedPoiId
      ? ICELAND_CANONICAL_POI_CATALOG.find((p) => p.poiId === linkedPoiId)
      : undefined;
    if (linkedPoiId && !linkedPoi) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `linkedPoiId 不在 POI 目录: ${linkedPoiId}`,
        details: { field: 'linkedPoiId' },
      };
    }
    if (linkedPoi && linkedPoi.poiId !== id && this.byCanonical.has(linkedPoi.poiId)) {
      return {
        ok: false,
        code: 'CONFLICT',
        message: `关联 POI 已被其它实体占用: ${linkedPoi.poiId}`,
        details: { linkedPoiId: linkedPoi.poiId },
      };
    }

    const now = new Date().toISOString();
    const nextAliases =
      input.aliases !== undefined
        ? [
            ...new Set([
              ...input.aliases.map((a) => String(a).trim()).filter(Boolean),
              ...(linkedPoi?.aliases ?? []),
            ]),
          ]
        : [
            ...new Set([
              ...(existing.aliases ?? []),
              ...(linkedPoi?.aliases ?? []),
            ]),
          ];

    const nextProperties: Record<string, unknown> = {
      ...(existing.properties ?? {}),
    };
    if (input.properties !== undefined) {
      if (!input.properties || typeof input.properties !== 'object') {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'properties 须为对象',
          details: { field: 'properties' },
        };
      }
      const propsValidated = validateEntityProperties({
        ownerTypeId: entityType,
        properties: input.properties,
        attributes: this.attributesForType(entityType),
        mode: 'patch',
      });
      if (propsValidated.ok === false) {
        return {
          ok: false,
          code: propsValidated.code,
          message: propsValidated.message,
          details: propsValidated.details,
        };
      }
      Object.assign(nextProperties, propsValidated.properties);
    }
    if (linkedPoi) nextProperties.linkedPoiId = linkedPoi.poiId;
    if (input.linkedEntityIds !== undefined) {
      nextProperties.linkedEntityIds = input.linkedEntityIds;
    }

    const sourceRefs = [...(existing.sourceRefs ?? [])];
    if (linkedPoi) {
      sourceRefs.push({ system: 'cpre', sourceId: linkedPoi.poiId });
    }
    if (input.linkedEntityIds !== undefined) {
      // 替换 identity_link 引用
      const kept = sourceRefs.filter((r) => r.system !== 'identity_link');
      for (const lid of input.linkedEntityIds) {
        const sid = String(lid).trim();
        if (sid) kept.push({ system: 'identity_link', sourceId: sid });
      }
      sourceRefs.length = 0;
      sourceRefs.push(...kept);
    }

    const domain =
      input.domain !== undefined
        ? parseDomainInput(input.domain, entityType)
        : existing.domain;

    this.register({
      ...existing,
      canonicalEntityId: id,
      entityType,
      domain,
      displayName:
        input.name !== undefined
          ? input.name.trim() || existing.displayName
          : linkedPoi && !input.name
            ? linkedPoi.canonicalName
            : existing.displayName,
      aliases: nextAliases,
      status: input.status !== undefined ? parseStatusInput(input.status) : existing.status,
      country:
        input.country !== undefined
          ? input.country.trim().toUpperCase() || undefined
          : linkedPoi?.country?.toUpperCase() ?? existing.country,
      description:
        input.description !== undefined
          ? input.description.trim() || undefined
          : existing.description,
      properties: nextProperties,
      sourceRefs,
      origin: 'ADMIN',
      createdAt: existing.createdAt,
      updatedAt: now,
    }, { persist: true });

    this.logger.log(`updateCanonical id=${id} type=${entityType} fields=${patchKeys.join(',')}`);
    return { ok: true, entity: this.byCanonical.get(id)! };
  }

  private seedFromCpre(): void {
    for (const poi of ICELAND_CANONICAL_POI_CATALOG) {
      const placeIs = placeIsAliasForCanonical(poi.poiId);
      this.register({
        canonicalEntityId: poi.poiId,
        entityType: 'Place',
        domain: 'PLACE',
        displayName: poi.canonicalName,
        aliases: [...poi.aliases, ...(placeIs ? [placeIs] : [])],
        status: poi.status === 'DEPRECATED' ? 'DEPRECATED' : 'ACTIVE',
        country: poi.country?.toUpperCase() || 'IS',
        sourceRefs: [{ system: 'cpre', sourceId: poi.poiId }],
        origin: 'CPRE_SYNC',
      });
    }
  }

  /** place:db:{Place.id} → CPRE is.* (Golden Set + curated) */
  private seedPlaceDbLinks(): void {
    const links = buildPlaceDbToCpreLinks();
    let linked = 0;
    for (const link of links) {
      const existing = this.byCanonical.get(link.canonicalEntityId);
      if (!existing) continue;
      this.register({
        ...existing,
        aliases: [
          ...(existing.aliases ?? []),
          `place:db:${link.placeDbId}`,
          link.placeDbId,
          ...(link.label ? [link.label] : []),
        ],
        sourceRefs: [
          ...(existing.sourceRefs ?? []),
          { system: 'place_db', sourceId: link.placeDbId },
          { system: 'place_db', sourceId: `place:db:${link.placeDbId}` },
        ],
      });
      linked += 1;
    }
    this.logger.log(`Place DB→CPRE links applied: ${linked}/${links.length}`);
  }

  private seedNormalizedMobilityExamples(): void {
    const samples: Array<{
      raw: string;
      canonical: string;
      entityType: string;
      displayName: string;
    }> = [
      {
        raw: 'seg_f208',
        canonical: 'segment:is:f208',
        entityType: 'RouteSegment',
        displayName: 'F208',
      },
      {
        raw: 'F208',
        canonical: 'segment:is:f208',
        entityType: 'RouteSegment',
        displayName: 'F208',
      },
      {
        raw: 'IS-R1-SOUTH',
        canonical: 'road:is:r1-south',
        entityType: 'Road',
        displayName: 'Route 1 South',
      },
      {
        raw: 'south_coast',
        canonical: 'weather-region:is:south_coast',
        entityType: 'WeatherRegion',
        displayName: 'South Coast',
      },
      {
        raw: 'wx_south_coast',
        canonical: 'weather-region:is:south_coast',
        entityType: 'WeatherRegion',
        displayName: 'South Coast',
      },
      {
        raw: 'wx_west',
        canonical: 'weather-region:is:west',
        entityType: 'WeatherRegion',
        displayName: 'West',
      },
      {
        raw: 'seg_river_crossing',
        canonical: 'segment:is:river_crossing',
        entityType: 'RouteSegment',
        displayName: 'River crossing segment',
      },
      {
        raw: 'veh_1',
        canonical: 'vehicle:legacy:veh_1',
        entityType: 'RentalVehicle',
        displayName: 'Legacy vehicle veh_1',
      },
      {
        raw: 'trip_demo_vehicle',
        canonical: 'vehicle:trip:demo',
        entityType: 'RentalVehicle',
        displayName: 'Trip-scoped demo vehicle',
      },
      {
        raw: 'road:is:f208',
        canonical: 'road:is:f208',
        entityType: 'Road',
        displayName: 'F208',
      },
    ];

    for (const s of samples) {
      this.register({
        canonicalEntityId: s.canonical,
        entityType: s.entityType,
        domain: domainForType(s.entityType),
        displayName: s.displayName,
        sourceRefs: [{ system: 'legacy', sourceId: s.raw }],
        status: 'ACTIVE',
        origin: 'SEED',
      });
    }
  }

  get(canonicalEntityId: string): EntityIdentity | undefined {
    return this.byCanonical.get(canonicalEntityId.trim());
  }

  list(filter?: {
    q?: string;
    domain?: KnowledgeDomain;
    entityType?: string;
    status?: string;
    sourceSystem?: string;
    page?: number;
    pageSize?: number;
  }): { items: EntityIdentity[]; total: number; page: number; pageSize: number } {
    let items = [...this.byCanonical.values()];
    if (filter?.domain) items = items.filter((e) => e.domain === filter.domain);
    if (filter?.entityType) items = items.filter((e) => e.entityType === filter.entityType);
    if (filter?.status) items = items.filter((e) => (e.status ?? 'ACTIVE') === filter.status);
    if (filter?.sourceSystem) {
      const sys = filter.sourceSystem.toLowerCase();
      items = items.filter((e) =>
        (e.sourceRefs ?? []).some((r) => r.system.toLowerCase() === sys),
      );
    }
    if (filter?.q?.trim()) {
      const q = filter.q.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.canonicalEntityId.toLowerCase().includes(q) ||
          e.displayName?.toLowerCase().includes(q) ||
          (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
          (e.sourceRefs ?? []).some((r) => r.sourceId.toLowerCase().includes(q)),
      );
    }
    items.sort((a, b) => a.canonicalEntityId.localeCompare(b.canonicalEntityId));
    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter?.pageSize ?? 20));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }

  resolve(input: {
    system?: string;
    sourceId?: string;
    alias?: string;
  }): IdentityResolveResult {
    const base = { input: { system: input.system, sourceId: input.sourceId, alias: input.alias } };

    if (input.alias?.trim()) {
      const hit = this.byAlias.get(this.aliasKey(input.alias));
      if (hit) {
        return {
          ...base,
          canonicalEntityId: hit,
          matchType: 'ALIAS',
          confidence: 0.95,
          entity: this.byCanonical.get(hit),
        };
      }
      // try CPRE-shaped alias as place id
      const asPlace = normalizePlaceId(input.alias);
      if (asPlace && this.byCanonical.has(asPlace)) {
        return {
          ...base,
          canonicalEntityId: asPlace,
          matchType: 'CANONICAL',
          confidence: 1,
          entity: this.byCanonical.get(asPlace),
        };
      }
    }

    if (input.system && input.sourceId) {
      const sys = input.system.toLowerCase();
      const sk = this.sourceKey(input.system, input.sourceId);
      const viaSource = this.bySource.get(sk);
      if (viaSource) {
        return {
          ...base,
          canonicalEntityId: viaSource,
          matchType: sys === 'canonical' ? 'CANONICAL' : 'SOURCE_REF',
          confidence: 1,
          entity: this.byCanonical.get(viaSource),
        };
      }

      // place:db:123 or bare numeric under system=place_db|poi|db
      const placeDbId = parsePlaceDbId(input.sourceId);
      if (placeDbId && ['place_db', 'poi', 'db', 'place'].includes(sys)) {
        const viaDb =
          this.bySource.get(this.sourceKey('place_db', placeDbId)) ??
          this.bySource.get(this.sourceKey('place_db', `place:db:${placeDbId}`)) ??
          this.byAlias.get(this.aliasKey(`place:db:${placeDbId}`));
        if (viaDb) {
          return {
            ...base,
            canonicalEntityId: viaDb,
            matchType: 'SOURCE_REF',
            confidence: 0.95,
            entity: this.byCanonical.get(viaDb),
          };
        }
      }

      // system=cpre|place with place id / place:is:
      if (['cpre', 'place', 'canonical'].includes(sys)) {
        const p = normalizePlaceId(input.sourceId);
        if (p && this.byCanonical.has(p)) {
          return {
            ...base,
            canonicalEntityId: p,
            matchType: 'CANONICAL',
            confidence: 1,
            entity: this.byCanonical.get(p),
          };
        }
        if (p && isCanonicalTravelPoiId(p)) {
          return { ...base, canonicalEntityId: null, matchType: 'NOT_FOUND', confidence: 0 };
        }
      }

      // system=legacy|runtime — normalize
      const norm = this.normalizeAndEnsure(input.sourceId);
      if (norm) {
        return {
          ...base,
          canonicalEntityId: norm.canonicalEntityId,
          matchType: 'NORMALIZED',
          confidence: 0.9,
          entity: this.byCanonical.get(norm.canonicalEntityId),
        };
      }
    }

    if (input.sourceId && !input.system) {
      const placeDbId = parsePlaceDbId(input.sourceId);
      if (placeDbId) {
        const viaDb =
          this.bySource.get(this.sourceKey('place_db', placeDbId)) ??
          this.byAlias.get(this.aliasKey(`place:db:${placeDbId}`));
        if (viaDb) {
          return {
            ...base,
            canonicalEntityId: viaDb,
            matchType: 'SOURCE_REF',
            confidence: 0.95,
            entity: this.byCanonical.get(viaDb),
          };
        }
      }
      if (this.byCanonical.has(input.sourceId.trim())) {
        const id = input.sourceId.trim();
        return {
          ...base,
          canonicalEntityId: id,
          matchType: 'CANONICAL',
          confidence: 1,
          entity: this.byCanonical.get(id),
        };
      }
      const norm = this.normalizeAndEnsure(input.sourceId);
      if (norm) {
        return {
          ...base,
          canonicalEntityId: norm.canonicalEntityId,
          matchType: 'NORMALIZED',
          confidence: 0.85,
          entity: this.byCanonical.get(norm.canonicalEntityId),
        };
      }
    }

    return { ...base, canonicalEntityId: null, matchType: 'NOT_FOUND', confidence: 0 };
  }

  /**
   * Ensure normalized id is registered (lazy) so resolve stays stable.
   */
  normalizeAndEnsure(raw: string): { canonicalEntityId: CanonicalEntityId; kind: string } | null {
    const hit = tryNormalizeAny(raw);
    if (!hit) return null;

    if (!this.byCanonical.has(hit.canonicalEntityId)) {
      const entityType =
        hit.kind === 'place'
          ? 'Place'
          : hit.kind === 'segment'
            ? 'RouteSegment'
            : hit.kind === 'road'
              ? 'Road'
              : hit.kind === 'vehicle'
                ? 'RentalVehicle'
                : hit.kind === 'weather_region'
                  ? 'WeatherRegion'
                  : 'Unknown';
      this.register({
        canonicalEntityId: hit.canonicalEntityId,
        entityType,
        domain: domainForType(entityType),
        sourceRefs: [{ system: 'legacy', sourceId: raw.trim() }],
        status: hit.kind === 'vehicle' && hit.canonicalEntityId.includes('legacy') ? 'PENDING' : 'ACTIVE',
      });
    } else {
      this.register({
        canonicalEntityId: hit.canonicalEntityId,
        entityType: this.byCanonical.get(hit.canonicalEntityId)!.entityType,
        domain: this.byCanonical.get(hit.canonicalEntityId)!.domain,
        sourceRefs: [{ system: 'legacy', sourceId: raw.trim() }],
      });
    }
    return { canonicalEntityId: hit.canonicalEntityId, kind: hit.kind };
  }

  listUnresolved(
    observed: ReadonlyArray<{ subjectId: string; subjectType?: string }> = PHASE1_OBSERVED_SUBJECT_IDS,
  ): UnresolvedSubject[] {
    const out: UnresolvedSubject[] = [];
    for (const row of observed) {
      const r = this.resolve({ system: 'legacy', sourceId: row.subjectId });
      if (r.matchType === 'NOT_FOUND' || !r.canonicalEntityId) {
        out.push({
          subjectId: row.subjectId,
          subjectType: row.subjectType,
          reason: 'NO_MAPPING',
          hint:
            row.subjectType === 'Flight'
              ? 'Flight namespace deferred after Place/Segment/Vehicle/WeatherRegion'
              : 'No Identity Adapter mapping',
        });
        continue;
      }
      // Still flag vehicle:legacy:* as needs migration attention
      if (r.canonicalEntityId.startsWith('vehicle:legacy:')) {
        out.push({
          subjectId: row.subjectId,
          subjectType: row.subjectType,
          reason: 'INVALID_FORMAT',
          suggestedCanonicalId: r.canonicalEntityId,
          hint: 'veh_* requires trip scope → prefer vehicle:trip:{tripId}',
        });
      }
    }
    // Deduplicate by subjectId
    const seen = new Set<string>();
    return out.filter((u) => {
      if (seen.has(u.subjectId)) return false;
      seen.add(u.subjectId);
      return true;
    });
  }

  checkSubjects(
    subjects: Array<{ subjectId: string; subjectType?: string }>,
  ): { resolved: IdentityResolveResult[]; unresolved: UnresolvedSubject[] } {
    const resolved: IdentityResolveResult[] = [];
    const unresolved: UnresolvedSubject[] = [];
    for (const s of subjects) {
      const r = this.resolve({ system: 'legacy', sourceId: s.subjectId });
      if (!r.canonicalEntityId) {
        unresolved.push({
          subjectId: s.subjectId,
          subjectType: s.subjectType,
          reason: 'NO_MAPPING',
        });
      } else {
        resolved.push(r);
        if (r.canonicalEntityId.startsWith('vehicle:legacy:')) {
          unresolved.push({
            subjectId: s.subjectId,
            subjectType: s.subjectType,
            reason: 'INVALID_FORMAT',
            suggestedCanonicalId: r.canonicalEntityId,
            hint: 'Prefer vehicle:trip:{tripId}',
          });
        }
      }
    }
    return { resolved, unresolved };
  }
}

/** Soft gate for WorldFact writers — Place subjects must resolve when country=IS. */
export function softValidateWorldFactSubjectId(
  registry: EntityIdentityRegistryService,
  subjectType: string,
  subjectId: string,
): { ok: boolean; warning?: string; canonicalEntityId?: string } {
  if (subjectType === 'Place' || isCanonicalTravelPoiId(subjectId)) {
    const r = registry.resolve({ system: 'cpre', sourceId: subjectId });
    if (!r.canonicalEntityId) {
      return {
        ok: false,
        warning: `Place subjectId "${subjectId}" is not in EntityIdentityRegistry / CPRE`,
      };
    }
    return { ok: true, canonicalEntityId: r.canonicalEntityId };
  }
  const r = registry.resolve({ system: 'legacy', sourceId: subjectId });
  if (r.canonicalEntityId) {
    return { ok: true, canonicalEntityId: r.canonicalEntityId };
  }
  return {
    ok: true,
    warning: `subjectId "${subjectId}" has no canonical mapping yet (soft-allow)`,
  };
}

// re-export normalizers for tests
export {
  normalizePlaceId,
  normalizeRoadId,
  normalizeSegmentId,
  normalizeVehicleId,
  normalizeWeatherRegionId,
};
