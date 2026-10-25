/**
 * Knowledge System Phase 1 — Entity Identity contracts
 * SSOT: internal-docs/product/knowledge-system-phase0-inventory.md
 */

export type KnowledgeDomain =
  | 'TRAVELER'
  | 'GEOGRAPHY'
  | 'PLACE'
  | 'MOBILITY'
  | 'ACTIVITY'
  | 'TIME'
  | 'ENVIRONMENT'
  | 'TRIP';

export type EntityIdentityStatus = 'ACTIVE' | 'DEPRECATED' | 'PENDING';

export type CanonicalEntityId = string;

export interface EntitySourceRef {
  system: string;
  sourceId: string;
}

export interface EntityIdentity {
  canonicalEntityId: CanonicalEntityId;
  entityType: string;
  domain: KnowledgeDomain;
  displayName?: string;
  aliases?: string[];
  status?: EntityIdentityStatus;
  sourceRefs?: EntitySourceRef[];
  /** ISO country code (e.g. JP / IS) */
  country?: string;
  description?: string;
  /** Admin-authored extension bag */
  properties?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  /** 持久化来源 */
  origin?: 'SEED' | 'ADMIN' | 'CPRE_SYNC' | 'COUNTRY_PACK' | 'PLACE_DB';
}

/** Admin POST /entities body (frontend Identity 新建契约) */
export interface CreateCanonicalEntityInput {
  /** 展示名 */
  name: string;
  /** 本体类型码（与 ontology types.typeId 一致） */
  type: string;
  /** 规范 ID；不传则后端按类型规则生成 */
  canonicalEntityId?: string;
  /** 领域（Place / Mobility 或 PLACE / MOBILITY） */
  domain?: string;
  /** 国家码 */
  country?: string;
  /** 别名 */
  aliases?: string[];
  /** 描述 */
  description?: string;
  /** enabled / draft（或 ACTIVE / PENDING） */
  status?: string;
  /** 扩展属性 */
  properties?: Record<string, unknown>;
  /** 关联 CPRE POI（选 POI 后回填名称/别名/ID） */
  linkedPoiId?: string;
  /** 关联其它已有规范实体 ID */
  linkedEntityIds?: string[];
}

export type CreateCanonicalEntityResult =
  | { ok: true; entity: EntityIdentity }
  | {
      ok: false;
      code: 'VALIDATION_ERROR' | 'CONFLICT' | 'NOT_FOUND';
      message: string;
      details?: Record<string, unknown>;
    };

/** Admin PATCH /entities/:id — 部分更新（不改 canonicalEntityId） */
export interface UpdateCanonicalEntityInput {
  name?: string;
  /** 若传则须仍在 ontology types 投影中 */
  type?: string;
  domain?: string;
  country?: string;
  aliases?: string[];
  description?: string;
  status?: string;
  properties?: Record<string, unknown>;
  linkedPoiId?: string;
  linkedEntityIds?: string[];
}

export type UpdateCanonicalEntityResult = CreateCanonicalEntityResult;

export type IdentityMatchType =
  | 'CANONICAL'
  | 'SOURCE_REF'
  | 'ALIAS'
  | 'NORMALIZED'
  | 'NOT_FOUND';

export interface IdentityResolveResult {
  canonicalEntityId: CanonicalEntityId | null;
  matchType: IdentityMatchType;
  confidence: number;
  entity?: EntityIdentity;
  input?: { system?: string; sourceId?: string; alias?: string };
}

export interface UnresolvedSubject {
  subjectId: string;
  subjectType?: string;
  reason: 'NO_MAPPING' | 'AMBIGUOUS' | 'INVALID_FORMAT';
  suggestedCanonicalId?: string;
  hint?: string;
}
