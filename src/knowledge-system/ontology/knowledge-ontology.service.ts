/**
 * Knowledge Ontology Admin service — catalog over travel-ontology contracts,
 * 持久化到 knowledge_ontology_* 表；Admin 列表 DB 优先。
 */

import { Injectable, Logger, NotFoundException, OnModuleInit, Optional, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH,
  ONTOLOGY_KIND_DISPLAY_NAME_ZH,
  ONTOLOGY_SOURCE_DISPLAY_NAME_ZH,
  ONTOLOGY_STATUS_DISPLAY_NAME_ZH,
} from '../../travel-ontology/catalog/ontology-i18n.zh-CN';
import { PrismaService } from '../../prisma/prisma.service';
import type { KnowledgeDomain } from '../contracts/entity-identity.types';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import {
  loadOntologyCatalogFromDb,
  upsertOntologyCatalogFromProjection,
  type OntologyCatalogDataSource,
} from './knowledge-ontology-catalog.store';
import {
  enrichOntologyAttribute,
  filterOntologyAttributes,
  normalizeDomainFilter,
  type EnrichedOntologyAttribute,
} from './ontology-attribute-query.util';
import {
  ONTOLOGY_ATTRIBUTES,
  ONTOLOGY_CATALOG_VERSION,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPES,
  ontologyCatalogStats,
  ontologyDomainCards,
  type OntologyAttributeDef,
  type OntologyPredicateDef,
  type OntologyTypeDef,
} from './ontology-catalog';

export type OntologyExportRecord = {
  exportId: string;
  createdAt: string;
  format: 'json';
  scope: 'full' | 'types' | 'attributes';
  note?: string;
  byteSize: number;
  catalogVersion: string;
  payloadSummary: {
    typeCount: number;
    attributeCount: number;
    predicateCount: number;
  };
};

@Injectable()
export class KnowledgeOntologyService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeOntologyService.name);
  private readonly exportRecords: OntologyExportRecord[] = [];
  private readonly exportPayloads = new Map<string, unknown>();

  private types: OntologyTypeDef[] = [...ONTOLOGY_TYPES];
  private attributes: OntologyAttributeDef[] = [...ONTOLOGY_ATTRIBUTES];
  private predicates: OntologyPredicateDef[] = [...ONTOLOGY_PREDICATES];
  private dataSource: OntologyCatalogDataSource = 'projection';
  private catalogVersion = ONTOLOGY_CATALOG_VERSION;

  constructor(
    @Inject(forwardRef(() => EntityIdentityRegistryService))
    private readonly identity: EntityIdentityRegistryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshFromDbOrProjection('boot');
  }

  /** 投影 → 表 → 内存；供 sync / boot 调用 */
  async refreshFromDbOrProjection(reason = 'manual'): Promise<{
    dataSource: OntologyCatalogDataSource;
    catalogVersion: string;
    typeCount: number;
    attributeCount: number;
    predicateCount: number;
    upsert?: Awaited<ReturnType<typeof upsertOntologyCatalogFromProjection>>;
  }> {
    let upsert:
      | Awaited<ReturnType<typeof upsertOntologyCatalogFromProjection>>
      | undefined;

    if (this.prisma?.isDbConnected()) {
      upsert = await upsertOntologyCatalogFromProjection(this.prisma);
      const loaded = await loadOntologyCatalogFromDb(this.prisma);
      if (loaded?.loaded && loaded.attributes.length > 0) {
        this.types = loaded.types;
        this.attributes = loaded.attributes;
        this.predicates = loaded.predicates.length
          ? loaded.predicates
          : [...ONTOLOGY_PREDICATES];
        this.dataSource = 'db';
        this.catalogVersion = ONTOLOGY_CATALOG_VERSION;
        this.logger.log(
          `Ontology catalog from DB (${reason}): types=${this.types.length} attrs=${this.attributes.length} preds=${this.predicates.length} upsertOk=${upsert?.ok}`,
        );
        return {
          dataSource: this.dataSource,
          catalogVersion: this.catalogVersion,
          typeCount: this.types.length,
          attributeCount: this.attributes.length,
          predicateCount: this.predicates.length,
          upsert,
        };
      }
    }

    this.types = [...ONTOLOGY_TYPES];
    this.attributes = [...ONTOLOGY_ATTRIBUTES];
    this.predicates = [...ONTOLOGY_PREDICATES];
    this.dataSource = 'projection';
    this.catalogVersion = ONTOLOGY_CATALOG_VERSION;
    this.logger.log(
      `Ontology catalog from projection (${reason}): types=${this.types.length} attrs=${this.attributes.length}`,
    );
    return {
      dataSource: this.dataSource,
      catalogVersion: this.catalogVersion,
      typeCount: this.types.length,
      attributeCount: this.attributes.length,
      predicateCount: this.predicates.length,
      upsert,
    };
  }

  getDataSource() {
    return {
      dataSource: this.dataSource,
      catalogVersion: this.catalogVersion,
      typeCount: this.types.length,
      attributeCount: this.attributes.length,
      predicateCount: this.predicates.length,
    };
  }

  private instanceCountForType(typeId: string): number {
    return this.identity.list({ entityType: typeId, page: 1, pageSize: 1 }).total;
  }

  private enrichAttribute(a: OntologyAttributeDef): EnrichedOntologyAttribute {
    return enrichOntologyAttribute(a, this.types);
  }

  private enrichType(
    t: OntologyTypeDef,
    opts?: { includeAttributes?: boolean; instanceCount?: number },
  ) {
    // 与 GET /attributes?ownerTypeId= 同源（默认 enabled）
    const attributes = filterOntologyAttributes(this.attributes, this.types, {
      ownerTypeId: t.typeId,
      status: 'enabled',
    }).map((a) => this.enrichAttribute(a));
    const predicates = this.predicates
      .filter((p) => p.domain === t.domain)
      .map((p) => ({
        ...p,
        name: p.predicate,
        displayName: p.description,
        domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[p.domain] ?? p.domain,
      }));
    const displayName = t.displayName || t.name;
    return {
      ...t,
      name: displayName,
      nameEn: t.nameEn || t.typeId,
      displayName,
      label: displayName,
      kindDisplayName: ONTOLOGY_KIND_DISPLAY_NAME_ZH[t.kind] ?? t.kind,
      domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[t.domain] ?? t.domain,
      statusDisplayName: ONTOLOGY_STATUS_DISPLAY_NAME_ZH[t.status] ?? t.status,
      sourceDisplayName: ONTOLOGY_SOURCE_DISPLAY_NAME_ZH[t.source] ?? t.source,
      attributeCount: attributes.length,
      requiredAttributeCount: attributes.filter((a) => a.required).length,
      enumAttributeCount: attributes.filter((a) => a.valueKind === 'enum').length,
      predicateCount: predicates.length,
      instanceCount: opts?.instanceCount,
      ...(opts?.includeAttributes !== false
        ? { attributes, relatedPredicates: predicates }
        : {}),
    };
  }

  overview() {
    const instanceCounts: Partial<Record<KnowledgeDomain, number>> = {};
    const domainsList = [
      'TRAVELER',
      'GEOGRAPHY',
      'PLACE',
      'MOBILITY',
      'ACTIVITY',
      'TIME',
      'ENVIRONMENT',
      'TRIP',
    ] as const;
    let registeredEntityCount = 0;
    for (const domain of domainsList) {
      const total = this.identity.list({ domain, page: 1, pageSize: 1 }).total;
      instanceCounts[domain] = total;
      registeredEntityCount += total;
    }

    const stats = {
      ...ontologyCatalogStats(),
      typeCount: this.types.length,
      attributeCount: this.attributes.length,
      predicateCount: this.predicates.length,
    };
    const domains = ontologyDomainCards(instanceCounts).map((d) => {
      const typesInDomain = this.types
        .filter((t) => t.domain === d.domain)
        .map((t) => ({
          typeId: t.typeId,
          name: t.displayName,
          nameEn: t.nameEn,
          displayName: t.displayName,
          label: t.displayName,
          kind: t.kind,
          kindDisplayName: ONTOLOGY_KIND_DISPLAY_NAME_ZH[t.kind] ?? t.kind,
          source: t.source,
          sourceDisplayName: ONTOLOGY_SOURCE_DISPLAY_NAME_ZH[t.source] ?? t.source,
          attributeCount: t.attributeIds.length,
          description: t.description,
          instanceCount: this.instanceCountForType(t.typeId),
        }));
      return {
        ...d,
        typeCount: typesInDomain.length,
        attributeCount: this.attributes.filter((a) => a.domain === d.domain).length,
        types: typesInDomain,
      };
    });

    const recentUpdates = [
      ...this.types.map((t) => ({
        kind: 'TYPE' as const,
        kindDisplayName: '类型',
        id: t.typeId,
        name: t.displayName,
        domain: t.domain,
        domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[t.domain] ?? t.domain,
        updatedAt: t.updatedAt,
      })),
      ...this.attributes
        .filter((a) => a.enumValues?.length)
        .slice(0, 8)
        .map((a) => ({
          kind: 'ATTRIBUTE' as const,
          kindDisplayName: '属性',
          id: a.attributeId,
          name: a.displayName,
          domain: a.domain,
          domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[a.domain] ?? a.domain,
          updatedAt: a.updatedAt,
        })),
    ]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12);

    return {
      catalogVersion: this.catalogVersion,
      dataSource: this.dataSource,
      domains,
      types: this.types.map((t) =>
        this.enrichType(t, {
          includeAttributes: false,
          instanceCount: this.instanceCountForType(t.typeId),
        }),
      ),
      stats: {
        ...stats,
        registeredEntityCount,
      },
      recentUpdates,
      note:
        this.dataSource === 'db'
          ? 'Catalog loaded from knowledge_ontology_* tables (seeded from travel-ontology projection)'
          : 'Catalog projected from travel-ontology/catalog; DB unavailable — memory fallback',
    };
  }

  listTypes(filter?: {
    domain?: string;
    kind?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    includeAttributes?: boolean;
  }) {
    let items = [...this.types];
    const normalizedDomain = normalizeDomainFilter(filter?.domain, this.types);
    if (normalizedDomain) {
      items = items.filter((t) => t.domain === normalizedDomain);
    }
    if (filter?.kind) {
      items = items.filter((t) => t.kind === filter.kind);
    }
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      items = items.filter(
        (t) =>
          t.typeId.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.displayName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    items.sort((a, b) => a.typeId.localeCompare(b.typeId));
    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter?.pageSize ?? 50));
    const total = items.length;
    const includeAttributes = filter?.includeAttributes !== false;
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize).map((t) =>
      this.enrichType(t, {
        includeAttributes,
        instanceCount: this.instanceCountForType(t.typeId),
      }),
    );
    return {
      items: pageItems,
      total,
      page,
      pageSize,
      catalogVersion: this.catalogVersion,
      dataSource: this.dataSource,
      includeAttributes,
    };
  }

  getType(typeId: string) {
    const t = this.types.find((x) => x.typeId === typeId || x.name === typeId);
    if (!t) throw new NotFoundException(`Ontology type not found: ${typeId}`);
    return {
      ...this.enrichType(t, {
        includeAttributes: true,
        instanceCount: this.instanceCountForType(t.typeId),
      }),
      dataSource: this.dataSource,
    };
  }

  listAttributes(filter?: {
    domain?: string;
    ownerTypeId?: string;
    valueKind?: string;
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    /** 与 pageSize 同义（表单侧常用 limit=200） */
    limit?: number;
  }) {
    const filtered = filterOntologyAttributes(this.attributes, this.types, {
      domain: filter?.domain,
      ownerTypeId: filter?.ownerTypeId,
      valueKind: filter?.valueKind,
      q: filter?.q,
      status: filter?.status,
    });
    const page = Math.max(1, filter?.page ?? 1);
    // 有 ownerTypeId 时默认 200，保证「填写属性」一次拉全
    const defaultSize = filter?.ownerTypeId?.trim() ? 200 : 50;
    const rawSize = filter?.limit ?? filter?.pageSize ?? defaultSize;
    const pageSize = Math.min(500, Math.max(1, rawSize));
    return {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((a) => this.enrichAttribute(a)),
      total: filtered.length,
      page,
      pageSize,
      catalogVersion: this.catalogVersion,
      dataSource: this.dataSource,
      /** 与属性管理默认一致：未传 status 时仅 enabled */
      statusFilter: filter?.status?.trim() ? filter.status : 'enabled',
      note: 'Identity「填写属性」须用本接口（ownerTypeId=实体 type），勿用 types/:id.attributes 作另一数据源；二者投影已对齐',
    };
  }

  /** 供 Identity create/update 校验：同 listAttributes 目录 */
  attributesForOwnerType(ownerTypeId: string): OntologyAttributeDef[] {
    return filterOntologyAttributes(this.attributes, this.types, {
      ownerTypeId,
      status: 'all',
    });
  }

  getAttribute(attributeId: string) {
    const a = this.attributes.find(
      (x) => x.attributeId === attributeId || x.attributeId.endsWith(`.${attributeId}`),
    );
    if (!a) throw new NotFoundException(`Ontology attribute not found: ${attributeId}`);
    const owner = this.types.find((t) => t.typeId === a.ownerTypeId) ?? null;
    return {
      ...this.enrichAttribute(a),
      dataSource: this.dataSource,
      ownerType: owner
        ? this.enrichType(owner, {
            includeAttributes: false,
            instanceCount: this.instanceCountForType(owner.typeId),
          })
        : null,
    };
  }

  exportCatalog(input?: {
    scope?: 'full' | 'types' | 'attributes';
    note?: string;
  }): OntologyExportRecord & { payload: unknown } {
    const scope = input?.scope ?? 'full';
    let types: OntologyTypeDef[] = this.types;
    let attributes: OntologyAttributeDef[] = this.attributes;
    if (scope === 'types') attributes = [];
    if (scope === 'attributes') types = [];

    const payload = {
      schemaId: 'tripnara.ontology_export@v1',
      catalogVersion: this.catalogVersion,
      dataSource: this.dataSource,
      exportedAt: new Date().toISOString(),
      scope,
      types: types.map((t) =>
        this.enrichType(t, { includeAttributes: scope !== 'attributes', instanceCount: 0 }),
      ),
      attributes: attributes.map((a) => this.enrichAttribute(a)),
      predicates: scope === 'full' ? this.predicates : [],
      stats: {
        ...ontologyCatalogStats(),
        typeCount: this.types.length,
        attributeCount: this.attributes.length,
        predicateCount: this.predicates.length,
      },
    };
    const json = JSON.stringify(payload);
    const record: OntologyExportRecord = {
      exportId: `ont_exp_${randomUUID().slice(0, 12)}`,
      createdAt: payload.exportedAt,
      format: 'json',
      scope,
      note: input?.note,
      byteSize: Buffer.byteLength(json, 'utf8'),
      catalogVersion: this.catalogVersion,
      payloadSummary: {
        typeCount: types.length,
        attributeCount: attributes.length,
        predicateCount: scope === 'full' ? this.predicates.length : 0,
      },
    };
    this.exportRecords.unshift(record);
    if (this.exportRecords.length > 50) this.exportRecords.pop();
    this.exportPayloads.set(record.exportId, payload);
    this.logger.log(`Ontology export ${record.exportId} scope=${scope} bytes=${record.byteSize}`);
    return { ...record, payload };
  }

  exportHistory(limit = 20) {
    return {
      items: this.exportRecords.slice(0, Math.min(50, Math.max(1, limit))),
      total: this.exportRecords.length,
    };
  }

  getExport(exportId: string) {
    const meta = this.exportRecords.find((e) => e.exportId === exportId);
    if (!meta) throw new NotFoundException(`Export not found: ${exportId}`);
    return {
      ...meta,
      payload: this.exportPayloads.get(exportId) ?? null,
    };
  }

  validate() {
    const issues: Array<{
      code: string;
      severity: 'INFO' | 'WARNING' | 'ERROR';
      message: string;
      ref?: string;
    }> = [];

    const typeIds = new Set(this.types.map((t) => t.typeId));
    for (const a of this.attributes) {
      if (!typeIds.has(a.ownerTypeId)) {
        issues.push({
          code: 'ORPHAN_ATTRIBUTE',
          severity: 'ERROR',
          message: `Attribute ${a.attributeId} owner missing`,
          ref: a.attributeId,
        });
      }
      if (a.valueKind === 'enum' && (!a.enumValues || a.enumValues.length === 0)) {
        issues.push({
          code: 'EMPTY_ENUM',
          severity: 'WARNING',
          message: `Enum attribute ${a.attributeId} has no values`,
          ref: a.attributeId,
        });
      }
      if (a.valueKind === 'enum' && a.enumValues?.some((v) => !v.displayName?.trim())) {
        issues.push({
          code: 'ENUM_MISSING_DISPLAY_NAME',
          severity: 'WARNING',
          message: `Enum attribute ${a.attributeId} has option(s) without Chinese displayName`,
          ref: a.attributeId,
        });
      }
    }

    for (const t of this.types) {
      if (t.attributeIds.length === 0) {
        issues.push({
          code: 'TYPE_NO_ATTRS',
          severity: 'WARNING',
          message: `Type ${t.typeId} has no attributes`,
          ref: t.typeId,
        });
      }
      for (const aid of t.attributeIds) {
        if (!this.attributes.some((a) => a.attributeId === aid)) {
          issues.push({
            code: 'MISSING_ATTR_REF',
            severity: 'ERROR',
            message: `Type ${t.typeId} references missing attribute ${aid}`,
            ref: t.typeId,
          });
        }
      }
    }

    const identityTypes = new Set<string>();
    let page = 1;
    for (;;) {
      const batch = this.identity.list({ page, pageSize: 100 });
      for (const e of batch.items) identityTypes.add(e.entityType);
      if (batch.items.length === 0 || page * 100 >= batch.total) break;
      page += 1;
      if (page > 50) break;
    }
    for (const et of identityTypes) {
      if (!typeIds.has(et)) {
        issues.push({
          code: 'IDENTITY_TYPE_NOT_IN_CATALOG',
          severity: 'INFO',
          message: `Identity registry has entityType ${et} not in ontology catalog`,
          ref: et,
        });
      }
    }

    const errors = issues.filter((i) => i.severity === 'ERROR').length;
    const warnings = issues.filter((i) => i.severity === 'WARNING').length;

    return {
      catalogVersion: this.catalogVersion,
      dataSource: this.dataSource,
      status: errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS',
      summary: {
        checkedTypes: this.types.length,
        checkedAttributes: this.attributes.length,
        checkedPredicates: this.predicates.length,
        errorCount: errors,
        warningCount: warnings,
        infoCount: issues.filter((i) => i.severity === 'INFO').length,
      },
      issues: issues.slice(0, 100),
    };
  }
}
