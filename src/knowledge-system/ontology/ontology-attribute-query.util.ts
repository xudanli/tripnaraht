/**
 * Ontology attributes 列表筛选 / 表单同源投影 / properties 校验。
 * 「填写属性」与「属性管理」必须走同一套 filter + enrich。
 */

import {
  ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH,
  ONTOLOGY_STATUS_DISPLAY_NAME_ZH,
  ONTOLOGY_VALUE_KIND_DISPLAY_NAME_ZH,
  zhTypeName,
} from '../../travel-ontology/catalog/ontology-i18n.zh-CN';
import type { KnowledgeDomain } from '../contracts/entity-identity.types';
import type {
  OntologyAttributeDef,
  OntologyEnumValue,
  OntologyTypeDef,
  OntologyValueKind,
} from './ontology-catalog';

export type ApiAttributeStatus = 'enabled' | 'draft' | 'deprecated';

/** Identity 信封字段：已在 POST/PATCH 顶层承载，不作为 properties 必填 */
export const IDENTITY_ENVELOPE_FIELD_KEYS = new Set([
  'canonicalEntityId',
  'displayName',
  'name',
  'aliases',
  'country',
  'domain',
  'status',
  'description',
  'sourceRefs',
  'createdAt',
  'updatedAt',
  'properties',
]);

/** properties 里允许的非本体扩展键 */
export const RESERVED_PROPERTY_KEYS = new Set([
  'linkedPoiId',
  'linkedEntityIds',
]);

const KNOWN_DOMAINS = new Set<string>([
  'TRAVELER',
  'GEOGRAPHY',
  'PLACE',
  'MOBILITY',
  'ACTIVITY',
  'TIME',
  'ENVIRONMENT',
  'TRIP',
]);

export function toApiAttributeStatus(status?: string): ApiAttributeStatus {
  const s = (status ?? 'ACTIVE').toUpperCase();
  if (s === 'DRAFT' || s === 'PENDING') return 'draft';
  if (s === 'DEPRECATED' || s === 'DISABLED') return 'deprecated';
  return 'enabled';
}

export function parseAttributeStatusFilter(
  raw?: string,
): 'enabled' | 'draft' | 'deprecated' | 'all' | ApiAttributeStatus[] {
  if (!raw?.trim()) return 'enabled';
  const v = raw.trim().toLowerCase();
  if (v === 'all' || v === '*') return 'all';
  if (v === 'enabled' || v === 'active') return 'enabled';
  if (v === 'draft' || v === 'pending') return 'draft';
  if (v === 'deprecated' || v === 'disabled') return 'deprecated';
  return 'enabled';
}

/** domain 大小写不敏感；亦可传类型码（如 Place）→ 解析为该类型所属领域 */
export function normalizeDomainFilter(
  domain: string | undefined,
  types: OntologyTypeDef[],
): KnowledgeDomain | undefined {
  if (!domain?.trim()) return undefined;
  const raw = domain.trim();
  const upper = raw.toUpperCase();
  if (KNOWN_DOMAINS.has(upper)) return upper as KnowledgeDomain;
  const byType = types.find(
    (t) =>
      t.typeId.toLowerCase() === raw.toLowerCase() ||
      t.nameEn?.toLowerCase() === raw.toLowerCase() ||
      t.displayName === raw,
  );
  if (byType) return byType.domain;
  return upper as KnowledgeDomain;
}

export function matchOwnerTypeId(
  attrOwnerTypeId: string,
  filterOwnerTypeId: string,
): boolean {
  return attrOwnerTypeId.toLowerCase() === filterOwnerTypeId.trim().toLowerCase();
}

export function valueSchemaNameForKind(kind: OntologyValueKind): string {
  switch (kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'enum';
    case 'datetime':
      return 'date-time';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return kind;
  }
}

export type EnrichedOntologyAttribute = Omit<
  OntologyAttributeDef,
  'status' | 'name' | 'enumValues'
> & {
  name: string;
  nameEn: string;
  fieldKey: string;
  label: string;
  displayName: string;
  ownerTypeDisplayName: string;
  domainDisplayName: string;
  valueKindDisplayName: string;
  /** API 状态：enabled/draft/deprecated（与属性管理列一致） */
  status: ApiAttributeStatus;
  statusDisplayName: string;
  /** 内部 ACTIVE 等，调试用 */
  statusRaw: string;
  enumCount: number;
  requiredLabel: string;
  applicableEntityTypes: string[];
  exampleValue?: string | number | boolean | null;
  valueSchemaName: string;
  valueSchema: { type: string; enum?: string[] };
  enumValues?: Array<OntologyEnumValue & { label: string; name: string }>;
};

export function enrichOntologyAttribute(
  a: OntologyAttributeDef,
  types: OntologyTypeDef[],
): EnrichedOntologyAttribute {
  const owner = types.find((t) => t.typeId === a.ownerTypeId);
  const label = a.displayName || a.label || a.name;
  const apiStatus = toApiAttributeStatus(a.status);
  const enumValues = a.enumValues?.map((e) => ({
    ...e,
    label: e.displayName || e.label || e.value,
    name: e.displayName || e.label || e.value,
  }));
  const valueSchemaName = valueSchemaNameForKind(a.valueKind);
  return {
    ...a,
    name: label,
    nameEn: a.name,
    fieldKey: a.name,
    label,
    displayName: label,
    ownerTypeDisplayName: owner?.displayName ?? zhTypeName(a.ownerTypeId),
    domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[a.domain] ?? a.domain,
    valueKindDisplayName: ONTOLOGY_VALUE_KIND_DISPLAY_NAME_ZH[a.valueKind] ?? a.valueKind,
    status: apiStatus,
    statusDisplayName:
      ONTOLOGY_STATUS_DISPLAY_NAME_ZH[a.status] ??
      (apiStatus === 'enabled' ? '启用' : apiStatus === 'draft' ? '草稿' : '废弃'),
    statusRaw: a.status,
    enumCount: a.enumValues?.length ?? 0,
    requiredLabel: a.required ? '必填' : '可选',
    applicableEntityTypes: [a.ownerTypeId],
    exampleValue:
      a.valueKind === 'enum'
        ? a.enumValues?.[0]?.value ?? null
        : a.valueKind === 'boolean'
          ? false
          : a.valueKind === 'number'
            ? 0
            : a.valueKind === 'datetime'
              ? '2026-01-01T00:00:00.000Z'
              : '',
    valueSchemaName,
    valueSchema: {
      type: valueSchemaName,
      ...(a.valueKind === 'enum' && a.enumValues?.length
        ? { enum: a.enumValues.map((e) => e.value) }
        : {}),
    },
    enumValues,
  };
}

export function filterOntologyAttributes(
  attributes: OntologyAttributeDef[],
  types: OntologyTypeDef[],
  filter?: {
    domain?: string;
    ownerTypeId?: string;
    valueKind?: string;
    q?: string;
    status?: string;
  },
): OntologyAttributeDef[] {
  let items = [...attributes];
  const domain = normalizeDomainFilter(filter?.domain, types);
  if (domain) {
    items = items.filter((a) => a.domain.toUpperCase() === domain.toUpperCase());
  }
  if (filter?.ownerTypeId?.trim()) {
    const ot = filter.ownerTypeId.trim();
    items = items.filter((a) => matchOwnerTypeId(a.ownerTypeId, ot));
  }
  if (filter?.valueKind?.trim()) {
    const vk = filter.valueKind.trim().toLowerCase();
    // date → datetime 别名
    const normalized = vk === 'date' || vk === 'json' ? (vk === 'date' ? 'datetime' : 'object') : vk;
    items = items.filter((a) => a.valueKind.toLowerCase() === normalized);
  }
  const statusFilter = parseAttributeStatusFilter(filter?.status);
  if (statusFilter !== 'all') {
    items = items.filter((a) => toApiAttributeStatus(a.status) === statusFilter);
  }
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    items = items.filter(
      (a) =>
        a.attributeId.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        (a.enumValues ?? []).some(
          (e) =>
            e.value.toLowerCase().includes(q) || e.displayName.toLowerCase().includes(q),
        ),
    );
  }
  items.sort((a, b) => a.attributeId.localeCompare(b.attributeId));
  return items;
}

export function resolveAttributeDef(
  attributes: OntologyAttributeDef[],
  ownerTypeId: string,
  key: string,
): OntologyAttributeDef | undefined {
  const k = key.trim();
  return attributes.find((a) => {
    if (!matchOwnerTypeId(a.ownerTypeId, ownerTypeId)) return false;
    return (
      a.attributeId === k ||
      a.name === k ||
      a.attributeId.endsWith(`.${k}`) ||
      a.attributeId.toLowerCase() === k.toLowerCase()
    );
  });
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function coerceAndCheckValue(
  attr: OntologyAttributeDef,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (isBlank(value)) {
    if (attr.required) {
      return { ok: false, message: `属性 ${attr.attributeId} 为必填` };
    }
    return { ok: true, value: value ?? null };
  }

  switch (attr.valueKind) {
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
      return { ok: false, message: `${attr.attributeId} 须为 boolean` };
    }
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return { ok: true, value: Number(value) };
      }
      return { ok: false, message: `${attr.attributeId} 须为 number` };
    }
    case 'enum': {
      const allowed = new Set((attr.enumValues ?? []).map((e) => e.value));
      const v = String(value);
      if (!allowed.has(v)) {
        return {
          ok: false,
          message: `${attr.attributeId} 枚举值非法: ${v}`,
        };
      }
      return { ok: true, value: v };
    }
    case 'datetime': {
      const s = String(value);
      if (Number.isNaN(Date.parse(s))) {
        return { ok: false, message: `${attr.attributeId} 须为合法 datetime` };
      }
      return { ok: true, value: s };
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return { ok: false, message: `${attr.attributeId} 须为 array` };
      }
      return { ok: true, value };
    }
    case 'object': {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ok: true, value: parsed };
          }
        } catch {
          return { ok: false, message: `${attr.attributeId} 须为 JSON object` };
        }
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ok: true, value };
      }
      return { ok: false, message: `${attr.attributeId} 须为 object` };
    }
    case 'string':
    default:
      return { ok: true, value: String(value) };
  }
}

export type ValidatePropertiesResult =
  | { ok: true; properties: Record<string, unknown> }
  | {
      ok: false;
      code: 'VALIDATION_ERROR';
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * 校验并规范化 properties（key = attributeId 或 fieldKey）。
 * mode=create 时检查非信封必填；mode=patch 仅校验出现的键。
 */
export function validateEntityProperties(input: {
  ownerTypeId: string;
  properties: Record<string, unknown> | undefined | null;
  attributes: OntologyAttributeDef[];
  mode: 'create' | 'patch';
  /** 顶层已提供的信封字段，用于抵消必填 */
  envelope?: Record<string, unknown>;
}): ValidatePropertiesResult {
  const raw =
    input.properties && typeof input.properties === 'object' && !Array.isArray(input.properties)
      ? { ...input.properties }
      : {};
  const typeAttrs = input.attributes.filter((a) =>
    matchOwnerTypeId(a.ownerTypeId, input.ownerTypeId),
  );
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (RESERVED_PROPERTY_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    const attr = resolveAttributeDef(typeAttrs, input.ownerTypeId, key);
    if (!attr) {
      errors.push(`未知属性 key: ${key}`);
      continue;
    }
    const checked = coerceAndCheckValue(attr, value);
    if (checked.ok === false) {
      errors.push(checked.message);
      continue;
    }
    // 规范化为 fieldKey 存储（稳定、与表单 fieldKey 一致）；同时保留可读性
    out[attr.name] = checked.value;
  }

  if (input.mode === 'create') {
    const envelope = input.envelope ?? {};
    for (const attr of typeAttrs) {
      if (!attr.required) continue;
      if (IDENTITY_ENVELOPE_FIELD_KEYS.has(attr.name)) {
        // 顶层 name/canonicalEntityId 等已承载
        const top =
          envelope[attr.name] ??
          envelope[attr.attributeId] ??
          (attr.name === 'displayName' ? envelope.name : undefined);
        if (!isBlank(top)) continue;
        if (!isBlank(out[attr.name]) || !isBlank(out[attr.attributeId])) continue;
        // 信封缺省由 createCanonical 其它校验负责，这里不重复拦
        continue;
      }
      if (isBlank(out[attr.name]) && isBlank(raw[attr.attributeId]) && isBlank(raw[attr.name])) {
        errors.push(`缺少必填属性: ${attr.attributeId}（${attr.displayName}）`);
      }
    }
  }

  if (errors.length) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: errors[0]!,
      details: { errors, ownerTypeId: input.ownerTypeId },
    };
  }
  return { ok: true, properties: out };
}
