/**
 * Knowledge Ontology Admin catalog — built from travel-ontology contract projections.
 *
 * - 类型/字段/枚举：来自 `src/travel-ontology/catalog/`（引用 contracts const）
 * - 中文名：i18n overlay
 * - Identity 扩展：Place / Road / Flight / WeatherRegion（知识体系 Identity，非 core-entities）
 */

import {
  ONTOLOGY_DOMAIN_DESCRIPTION_ZH,
  ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH,
  zhEnumName,
  zhFieldName,
  zhTypeName,
} from '../../travel-ontology/catalog/ontology-i18n.zh-CN';
import {
  assertTravelOntologyProjectionIntegrity,
  projectTravelOntologyPredicates,
  TRAVEL_ONTOLOGY_TYPE_PROJECTIONS,
  type TravelOntologyDomain,
  type TravelOntologyTypeKind,
  type TravelOntologyTypeProjection,
  type TravelOntologyValueKind,
} from '../../travel-ontology/catalog/travel-ontology-type-projections';
import type { KnowledgeDomain } from '../contracts/entity-identity.types';
import { KNOWLEDGE_RELATION_TYPES_V1 } from '../contracts/knowledge-relation.types';

export const ONTOLOGY_CATALOG_VERSION = 'tripnara.travel_ontology_catalog@v2';

export type OntologyValueKind = TravelOntologyValueKind;
export type OntologyTypeKind = TravelOntologyTypeKind;

export type OntologyEnumValue = {
  value: string;
  displayName: string;
  /** 中文名（与 displayName 一致） */
  label?: string;
};

export type OntologyTypeDef = {
  typeId: string;
  /** 中文名（UI 主展示，与 displayName 一致） */
  name: string;
  /** 英文类型名（同 typeId，供调试/对接） */
  nameEn: string;
  /** 中文展示名 */
  displayName: string;
  kind: OntologyTypeKind;
  domain: KnowledgeDomain;
  description: string;
  schemaRef: string;
  attributeIds: string[];
  status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
  updatedAt: string;
  /** 数据来源：契约投影 / Identity 扩展 */
  source: 'travel-ontology-contract' | 'identity-extension';
};

export type OntologyAttributeDef = {
  attributeId: string;
  /** 英文字段名（契约字段码） */
  name: string;
  /** 中文展示名（Admin UI 必须展示此字段） */
  displayName: string;
  /** 中文名（与 displayName 一致，便于前端读 name） */
  label: string;
  ownerTypeId: string;
  domain: KnowledgeDomain;
  valueKind: OntologyValueKind;
  /** 枚举选项（含中文说明）；valueKind=enum 时必有 */
  enumValues?: OntologyEnumValue[];
  required: boolean;
  description: string;
  status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
  updatedAt: string;
};

export type OntologyPredicateDef = {
  predicateId: string;
  predicate: string;
  domain: KnowledgeDomain;
  description: string;
};

export type OntologyDomainCard = {
  domain: KnowledgeDomain;
  displayName: string;
  typeCount: number;
  attributeCount: number;
  predicateCount: number;
  entityInstanceCount: number;
  description: string;
};

const CATALOG_UPDATED_AT = '2026-08-14T00:00:00.000Z';

/** Identity 目录可注册、但非 travel-ontology core-entities 的扩展类型 */
const IDENTITY_EXTENSION_PROJECTIONS: TravelOntologyTypeProjection[] = [
  {
    typeId: 'Place',
    name: 'Place',
    kind: 'ENTITY',
    domain: 'PLACE',
    description: 'Canonical Place（CPRE / Identity）',
    schemaRef: 'knowledge-system/entity-identity#Place',
    fields: [
      { name: 'canonicalEntityId', valueKind: 'string', required: true },
      { name: 'displayName', valueKind: 'string', required: true },
      { name: 'aliases', valueKind: 'array' },
      { name: 'country', valueKind: 'string', description: 'ISO country' },
      { name: 'domain', valueKind: 'string' },
      { name: 'status', valueKind: 'string' },
      { name: 'description', valueKind: 'string' },
      { name: 'properties', valueKind: 'object' },
      { name: 'sourceRefs', valueKind: 'array' },
      { name: 'createdAt', valueKind: 'datetime' },
      { name: 'updatedAt', valueKind: 'datetime' },
    ],
  },
  {
    typeId: 'Road',
    name: 'Road',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '道路（Identity / World State）',
    schemaRef: 'knowledge-system/entity-identity#Road',
    fields: [
      { name: 'roadId', valueKind: 'string', required: true },
      { name: 'canonicalEntityId', valueKind: 'string' },
      { name: 'displayName', valueKind: 'string' },
      { name: 'roadClass', valueKind: 'string' },
      { name: 'country', valueKind: 'string' },
      { name: 'aliases', valueKind: 'array' },
      { name: 'status', valueKind: 'string' },
      { name: 'description', valueKind: 'string' },
    ],
  },
  {
    typeId: 'Flight',
    name: 'Flight',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '航班（Identity 观测）',
    schemaRef: 'knowledge-system/entity-identity#Flight',
    fields: [
      { name: 'flightId', valueKind: 'string', required: true },
      { name: 'canonicalEntityId', valueKind: 'string' },
      { name: 'displayName', valueKind: 'string' },
      { name: 'country', valueKind: 'string' },
      { name: 'aliases', valueKind: 'array' },
      { name: 'status', valueKind: 'string' },
      { name: 'description', valueKind: 'string' },
    ],
  },
  {
    typeId: 'WeatherRegion',
    name: 'WeatherRegion',
    kind: 'ENTITY',
    domain: 'ENVIRONMENT',
    description: '天气区域（Identity）',
    schemaRef: 'knowledge-system/entity-identity#WeatherRegion',
    fields: [
      { name: 'regionId', valueKind: 'string', required: true },
      { name: 'canonicalEntityId', valueKind: 'string' },
      { name: 'displayName', valueKind: 'string' },
      { name: 'country', valueKind: 'string' },
      { name: 'aliases', valueKind: 'array' },
      { name: 'status', valueKind: 'string' },
      { name: 'description', valueKind: 'string' },
    ],
  },
  {
    typeId: 'Country',
    name: 'Country',
    kind: 'ENTITY',
    domain: 'GEOGRAPHY',
    description: '国家（Country Pack / CountryProfile）',
    schemaRef: 'knowledge-system/entity-identity#Country',
    fields: [
      { name: 'canonicalEntityId', valueKind: 'string', required: true },
      { name: 'displayName', valueKind: 'string', required: true },
      { name: 'country', valueKind: 'string', required: true },
      { name: 'aliases', valueKind: 'array' },
      { name: 'schemaVersion', valueKind: 'number' },
      { name: 'status', valueKind: 'string' },
      { name: 'description', valueKind: 'string' },
    ],
  },
];

function buildFromProjection(
  t: TravelOntologyTypeProjection,
  source: OntologyTypeDef['source'],
): { type: OntologyTypeDef; attributes: OntologyAttributeDef[] } {
  const attributeIds: string[] = [];
  const attributes: OntologyAttributeDef[] = [];
  for (const f of t.fields) {
    const attributeId = `${t.typeId}.${f.name}`;
    attributeIds.push(attributeId);
    attributes.push({
      attributeId,
      name: f.name,
      displayName: zhFieldName(t.typeId, f.name),
      label: zhFieldName(t.typeId, f.name),
      ownerTypeId: t.typeId,
      domain: t.domain as KnowledgeDomain,
      valueKind: f.valueKind,
      enumValues: f.enumRef
        ? f.enumRef.map((value) => ({
            value,
            displayName: zhEnumName(t.typeId, f.name, value),
            label: zhEnumName(t.typeId, f.name, value),
          }))
        : undefined,
      required: f.required ?? false,
      description: f.description ?? `${zhTypeName(t.typeId)}.${zhFieldName(t.typeId, f.name)}`,
      status: 'ACTIVE',
      updatedAt: CATALOG_UPDATED_AT,
    });
  }
  const displayName = zhTypeName(t.typeId);
  return {
    type: {
      typeId: t.typeId,
      name: displayName,
      nameEn: t.name,
      displayName,
      kind: t.kind,
      domain: t.domain as KnowledgeDomain,
      description: t.description,
      schemaRef: t.schemaRef,
      attributeIds,
      status: 'ACTIVE',
      updatedAt: CATALOG_UPDATED_AT,
      source,
    },
    attributes,
  };
}

function buildCatalog(): {
  types: OntologyTypeDef[];
  attributes: OntologyAttributeDef[];
  predicates: OntologyPredicateDef[];
} {
  const integrity = assertTravelOntologyProjectionIntegrity();
  if (integrity.length > 0) {
    throw new Error(`Travel ontology projection integrity failed: ${integrity.join('; ')}`);
  }

  const types: OntologyTypeDef[] = [];
  const attributes: OntologyAttributeDef[] = [];

  for (const t of TRAVEL_ONTOLOGY_TYPE_PROJECTIONS) {
    const built = buildFromProjection(t, 'travel-ontology-contract');
    types.push(built.type);
    attributes.push(...built.attributes);
  }
  for (const t of IDENTITY_EXTENSION_PROJECTIONS) {
    const built = buildFromProjection(t, 'identity-extension');
    types.push(built.type);
    attributes.push(...built.attributes);
  }

  const predicates: OntologyPredicateDef[] = projectTravelOntologyPredicates().map((p) => ({
    predicateId: p.predicateId,
    predicate: p.predicate,
    domain: p.domain as KnowledgeDomain,
    description: p.description,
  }));

  return { types, attributes, predicates };
}

const BUILT = buildCatalog();

export const ONTOLOGY_TYPES = BUILT.types;
export const ONTOLOGY_ATTRIBUTES = BUILT.attributes;
export const ONTOLOGY_PREDICATES = BUILT.predicates;

export function ontologyDomainCards(
  instanceCounts?: Partial<Record<KnowledgeDomain, number>>,
): OntologyDomainCard[] {
  const domains = Object.keys(ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH) as KnowledgeDomain[];
  return domains.map((domain) => {
    const typeCount = ONTOLOGY_TYPES.filter((t) => t.domain === domain).length;
    const attributeCount = ONTOLOGY_ATTRIBUTES.filter((a) => a.domain === domain).length;
    const predicateCount = ONTOLOGY_PREDICATES.filter((p) => p.domain === domain).length;
    return {
      domain,
      displayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[domain] ?? domain,
      typeCount,
      attributeCount,
      predicateCount,
      entityInstanceCount: instanceCounts?.[domain] ?? 0,
      description: ONTOLOGY_DOMAIN_DESCRIPTION_ZH[domain] ?? '',
    };
  });
}

export function ontologyCatalogStats() {
  return {
    catalogVersion: ONTOLOGY_CATALOG_VERSION,
    typeCount: ONTOLOGY_TYPES.length,
    attributeCount: ONTOLOGY_ATTRIBUTES.length,
    predicateCount: ONTOLOGY_PREDICATES.length,
    relationVocabCount: KNOWLEDGE_RELATION_TYPES_V1.length,
    domainCount: Object.keys(ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH).length,
    contractTypeCount: ONTOLOGY_TYPES.filter((t) => t.source === 'travel-ontology-contract').length,
    identityExtensionTypeCount: ONTOLOGY_TYPES.filter((t) => t.source === 'identity-extension')
      .length,
    updatedAt: CATALOG_UPDATED_AT,
    projectionSource: 'travel-ontology/catalog + identity-extension',
  };
}

export type { TravelOntologyDomain };
