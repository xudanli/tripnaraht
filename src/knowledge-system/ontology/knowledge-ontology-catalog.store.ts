/**
 * Prisma persistence for Ontology catalog rows (types / attributes / predicates).
 * DB unavailable → soft-fail；Admin 列表优先读表。
 */

import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KnowledgeDomain } from '../contracts/entity-identity.types';
import {
  ONTOLOGY_ATTRIBUTES,
  ONTOLOGY_CATALOG_VERSION,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPES,
  type OntologyAttributeDef,
  type OntologyEnumValue,
  type OntologyPredicateDef,
  type OntologyTypeDef,
} from './ontology-catalog';

const logger = new Logger('KnowledgeOntologyCatalogStore');

export type OntologyCatalogDataSource = 'db' | 'projection';

export function typeToRow(t: OntologyTypeDef, catalogVersion = ONTOLOGY_CATALOG_VERSION) {
  return {
    typeId: t.typeId,
    nameEn: t.nameEn,
    displayName: t.displayName,
    kind: t.kind,
    domain: t.domain,
    description: t.description,
    schemaRef: t.schemaRef,
    attributeIds: t.attributeIds,
    status: t.status,
    source: t.source,
    origin: 'PROJECTION' as const,
    catalogVersion,
    payload: t as object,
  };
}

export function attributeToRow(
  a: OntologyAttributeDef,
  catalogVersion = ONTOLOGY_CATALOG_VERSION,
) {
  return {
    attributeId: a.attributeId,
    name: a.name,
    displayName: a.displayName,
    label: a.label || a.displayName,
    ownerTypeId: a.ownerTypeId,
    domain: a.domain,
    valueKind: a.valueKind,
    enumValues: (a.enumValues ?? []) as object,
    required: a.required,
    description: a.description,
    status: a.status,
    origin: 'PROJECTION' as const,
    catalogVersion,
    payload: a as object,
  };
}

export function predicateToRow(
  p: OntologyPredicateDef,
  catalogVersion = ONTOLOGY_CATALOG_VERSION,
) {
  return {
    predicateId: p.predicateId,
    predicate: p.predicate,
    domain: p.domain,
    description: p.description,
    origin: 'PROJECTION' as const,
    catalogVersion,
    payload: p as object,
  };
}

export function rowToType(row: {
  typeId: string;
  nameEn: string;
  displayName: string;
  kind: string;
  domain: string;
  description: string;
  schemaRef: string;
  attributeIds: string[];
  status: string;
  source: string;
  payload: unknown;
  updatedAt: Date;
}): OntologyTypeDef {
  const fromPayload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<OntologyTypeDef>)
      : {};
  return {
    ...fromPayload,
    typeId: row.typeId,
    name: row.displayName,
    nameEn: row.nameEn,
    displayName: row.displayName,
    kind: row.kind as OntologyTypeDef['kind'],
    domain: row.domain as KnowledgeDomain,
    description: row.description,
    schemaRef: row.schemaRef,
    attributeIds: row.attributeIds?.length ? row.attributeIds : fromPayload.attributeIds ?? [],
    status: (row.status as OntologyTypeDef['status']) ?? 'ACTIVE',
    updatedAt: row.updatedAt.toISOString(),
    source: (row.source as OntologyTypeDef['source']) ?? 'travel-ontology-contract',
  };
}

export function rowToAttribute(row: {
  attributeId: string;
  name: string;
  displayName: string;
  label: string;
  ownerTypeId: string;
  domain: string;
  valueKind: string;
  enumValues: unknown;
  required: boolean;
  description: string;
  status: string;
  payload: unknown;
  updatedAt: Date;
}): OntologyAttributeDef {
  const fromPayload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<OntologyAttributeDef>)
      : {};
  const enumValues = Array.isArray(row.enumValues)
    ? (row.enumValues as OntologyEnumValue[])
    : fromPayload.enumValues;
  return {
    ...fromPayload,
    attributeId: row.attributeId,
    name: row.name,
    displayName: row.displayName,
    label: row.label || row.displayName,
    ownerTypeId: row.ownerTypeId,
    domain: row.domain as KnowledgeDomain,
    valueKind: row.valueKind as OntologyAttributeDef['valueKind'],
    enumValues,
    required: row.required,
    description: row.description,
    status: (row.status as OntologyAttributeDef['status']) ?? 'ACTIVE',
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToPredicate(row: {
  predicateId: string;
  predicate: string;
  domain: string;
  description: string;
  payload: unknown;
}): OntologyPredicateDef {
  const fromPayload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<OntologyPredicateDef>)
      : {};
  return {
    ...fromPayload,
    predicateId: row.predicateId,
    predicate: row.predicate,
    domain: row.domain as KnowledgeDomain,
    description: row.description,
  };
}

/** 将契约投影写入表；不覆盖 origin=ADMIN 行 */
export async function upsertOntologyCatalogFromProjection(
  prisma: PrismaService,
  opts?: {
    types?: OntologyTypeDef[];
    attributes?: OntologyAttributeDef[];
    predicates?: OntologyPredicateDef[];
    catalogVersion?: string;
  },
): Promise<{
  ok: boolean;
  typesUpserted: number;
  attributesUpserted: number;
  predicatesUpserted: number;
  skippedAdmin: number;
}> {
  const empty = {
    ok: false,
    typesUpserted: 0,
    attributesUpserted: 0,
    predicatesUpserted: 0,
    skippedAdmin: 0,
  };
  if (!prisma.isDbConnected()) return empty;

  const catalogVersion = opts?.catalogVersion ?? ONTOLOGY_CATALOG_VERSION;
  const types = opts?.types ?? ONTOLOGY_TYPES;
  const attributes = opts?.attributes ?? ONTOLOGY_ATTRIBUTES;
  const predicates = opts?.predicates ?? ONTOLOGY_PREDICATES;
  let typesUpserted = 0;
  let attributesUpserted = 0;
  let predicatesUpserted = 0;
  let skippedAdmin = 0;

  try {
    for (const t of types) {
      const existing = await prisma.knowledgeOntologyType.findUnique({
        where: { typeId: t.typeId },
        select: { origin: true },
      });
      if (existing?.origin === 'ADMIN') {
        skippedAdmin += 1;
        continue;
      }
      const data = typeToRow(t, catalogVersion);
      await prisma.knowledgeOntologyType.upsert({
        where: { typeId: t.typeId },
        create: data,
        update: {
          nameEn: data.nameEn,
          displayName: data.displayName,
          kind: data.kind,
          domain: data.domain,
          description: data.description,
          schemaRef: data.schemaRef,
          attributeIds: data.attributeIds,
          status: data.status,
          source: data.source,
          origin: data.origin,
          catalogVersion: data.catalogVersion,
          payload: data.payload,
        },
      });
      typesUpserted += 1;
    }

    for (const a of attributes) {
      const existing = await prisma.knowledgeOntologyAttribute.findUnique({
        where: { attributeId: a.attributeId },
        select: { origin: true },
      });
      if (existing?.origin === 'ADMIN') {
        skippedAdmin += 1;
        continue;
      }
      const data = attributeToRow(a, catalogVersion);
      await prisma.knowledgeOntologyAttribute.upsert({
        where: { attributeId: a.attributeId },
        create: data,
        update: {
          name: data.name,
          displayName: data.displayName,
          label: data.label,
          ownerTypeId: data.ownerTypeId,
          domain: data.domain,
          valueKind: data.valueKind,
          enumValues: data.enumValues,
          required: data.required,
          description: data.description,
          status: data.status,
          origin: data.origin,
          catalogVersion: data.catalogVersion,
          payload: data.payload,
        },
      });
      attributesUpserted += 1;
    }

    for (const p of predicates) {
      const existing = await prisma.knowledgeOntologyPredicate.findUnique({
        where: { predicateId: p.predicateId },
        select: { origin: true },
      });
      if (existing?.origin === 'ADMIN') {
        skippedAdmin += 1;
        continue;
      }
      const data = predicateToRow(p, catalogVersion);
      await prisma.knowledgeOntologyPredicate.upsert({
        where: { predicateId: p.predicateId },
        create: data,
        update: {
          predicate: data.predicate,
          domain: data.domain,
          description: data.description,
          origin: data.origin,
          catalogVersion: data.catalogVersion,
          payload: data.payload,
        },
      });
      predicatesUpserted += 1;
    }

    return {
      ok: true,
      typesUpserted,
      attributesUpserted,
      predicatesUpserted,
      skippedAdmin,
    };
  } catch (err) {
    logger.warn(
      `ontology catalog upsert failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return empty;
  }
}

export async function loadOntologyCatalogFromDb(prisma: PrismaService): Promise<{
  types: OntologyTypeDef[];
  attributes: OntologyAttributeDef[];
  predicates: OntologyPredicateDef[];
  loaded: boolean;
} | null> {
  if (!prisma.isDbConnected()) return null;
  try {
    const [typeRows, attrRows, predRows] = await Promise.all([
      prisma.knowledgeOntologyType.findMany({ orderBy: { typeId: 'asc' }, take: 5000 }),
      prisma.knowledgeOntologyAttribute.findMany({
        orderBy: { attributeId: 'asc' },
        take: 20000,
      }),
      prisma.knowledgeOntologyPredicate.findMany({
        orderBy: { predicateId: 'asc' },
        take: 5000,
      }),
    ]);
    if (typeRows.length === 0 && attrRows.length === 0) {
      return { types: [], attributes: [], predicates: [], loaded: false };
    }
    return {
      types: typeRows.map(rowToType),
      attributes: attrRows.map(rowToAttribute),
      predicates: predRows.map(rowToPredicate),
      loaded: true,
    };
  } catch (err) {
    logger.warn(
      `load ontology catalog failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
