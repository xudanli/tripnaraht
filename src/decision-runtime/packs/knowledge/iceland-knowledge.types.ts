/**
 * Iceland Self-Drive Knowledge Pack — unified contracts (WP1 Foundation).
 *
 * Existing destination-pack rules / skills / cases remain authoritative.
 * This layer indexes them for runtime discovery and production status.
 */

export type IcelandKnowledgeDomain =
  | 'VEHICLE_ROAD_FIT'
  | 'WEATHER_DRIVING'
  | 'DAYLIGHT_SEASON'
  | 'FUEL'
  | 'RENTAL_INSURANCE'
  | 'REGULATION'
  | 'RUNBOOK';

export type KnowledgeDomainLifecycleStatus =
  | 'ACTIVE'
  | 'DRAFT'
  | 'SHADOW'
  | 'DEPRECATED';

export type KnowledgeReviewStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED';

export type KnowledgeGate =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'REJECT';

export type KnowledgeSeverity = 'INFO' | 'WARN' | 'HIGH' | 'STOP';

export type KnowledgeConsumerBinding =
  | 'CONSTRAINT_GATEWAY'
  | 'SOLVER'
  | 'EXECUTION_RISK'
  | 'DECISION_CASE'
  | 'COPILOT'
  | 'EXECUTION_MONITOR'
  | 'REPAIR_RUNTIME'
  | 'ROUTE_SOLVER';

export type SourceReferenceKind =
  | 'PACK_FILE'
  | 'REPO_FILE'
  | 'SKILL'
  | 'DECISION_CASE'
  | 'EXTERNAL';

/** Where a knowledge fact or rule comes from (traceability). */
export interface SourceReference {
  kind: SourceReferenceKind;
  /** Path relative to destination pack root, repo root, skill id, or URL. */
  path: string;
  version?: string;
  note?: string;
}

export type KnowledgeProjectionMode =
  /** Rule body stays in authority file; pack only indexes metadata. */
  | 'REFERENCE'
  /** Domain has a stub/draft knowledge file; not production-ready. */
  | 'STUB';

export interface KnowledgeRuleCondition {
  field: string;
  operator: 'EQ' | 'NEQ' | 'GTE' | 'LTE' | 'IN' | 'EXISTS';
  value?: string | number | boolean;
  values?: string[];
}

export interface KnowledgeEffect {
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Unified knowledge rule surface. WP1 mostly projects REFERENCE entries
 * onto existing pack rules without rewriting their bodies.
 */
export interface IcelandKnowledgeRule {
  ruleId: string;
  domain: IcelandKnowledgeDomain;
  conditions: KnowledgeRuleCondition[];
  outcome: {
    gate?: KnowledgeGate;
    severity?: KnowledgeSeverity;
    effects?: KnowledgeEffect[];
    actions?: string[];
  };
  consumerBindings: KnowledgeConsumerBinding[];
  evidence: SourceReference[];
  version: string;
  reviewStatus: KnowledgeReviewStatus;
  /** How this rule relates to the authority asset. */
  projectionMode: KnowledgeProjectionMode;
  /** Optional SDR / semantic linkage for TEP / gateway. */
  sdrRuleId?: string;
  semanticKey?: string;
  notes?: string;
}

export interface KnowledgeDomainManifestEntry {
  domainId: IcelandKnowledgeDomain;
  status: KnowledgeDomainLifecycleStatus;
  reviewStatus: KnowledgeReviewStatus;
  /** When true, domain may feed production Constraint Gateway / Solver main chain. */
  inProductionMainChain: boolean;
  version: string;
  sources: SourceReference[];
  runtimeConsumers: KnowledgeConsumerBinding[];
  /** Indexed rules for this domain (WP1: projection catalog). */
  rules: IcelandKnowledgeRule[];
}

export interface IcelandSelfDriveKnowledgePackManifest {
  schemaId: 'tripnara.iceland.self_drive_knowledge_pack@v1';
  packId: string;
  country: string;
  version: string;
  /** Links to destination.is without migrating it. */
  destinationPackId: string;
  status: KnowledgeDomainLifecycleStatus;
  owner?: string;
  validFrom: string;
  domains: Record<string, KnowledgeDomainManifestEntry>;
}

export interface ResolvedKnowledgeRule {
  rule: IcelandKnowledgeRule;
  domain: KnowledgeDomainManifestEntry;
  pack: Pick<
    IcelandSelfDriveKnowledgePackManifest,
    'packId' | 'country' | 'version' | 'status'
  >;
  /** True when pack + domain are ACTIVE and domain is on production main chain. */
  productionReady: boolean;
}

export interface KnowledgeDomainSummary {
  domainKey: string;
  domainId: IcelandKnowledgeDomain;
  status: KnowledgeDomainLifecycleStatus;
  reviewStatus: KnowledgeReviewStatus;
  inProductionMainChain: boolean;
  version: string;
  ruleCount: number;
  runtimeConsumers: KnowledgeConsumerBinding[];
  sourceCount: number;
}
