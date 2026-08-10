/**
 * RFC-002 Phase 2 — Destination Constraint Pack contracts.
 */

import type { DecisionSemanticKey } from '../../gateway/contracts/decision-gateway.types';

export type DestinationPackLayer =
  | 'GLOBAL'
  | 'COUNTRY'
  | 'REGION'
  | 'ACTIVITY'
  | 'OPERATOR';

export type DestinationPackStatus = 'DRAFT' | 'SHADOW' | 'ACTIVE' | 'DEPRECATED';

export interface DestinationPackScope {
  countries?: string[];
  regions?: string[];
  activityTypes?: string[];
  operatorIds?: string[];
}

export interface EvidenceProviderBinding {
  domain: string;
  primary: string;
  fallback?: string;
}

export interface RuleBundleRef {
  path: string;
  version?: string;
}

export interface ModifierBundleRef {
  path: string;
  version?: string;
}

export interface OntologyMappingRef {
  path: string;
  version?: string;
}

export interface RepairTemplateBundleRef {
  path: string;
  version?: string;
}

export interface RoadProfileBundleRef {
  path: string;
  version?: string;
}

/** ADR-SELF-DRIVE-KERNEL — Pack 自驾能力声明文件引用 */
export interface SelfDriveCapabilitiesRef {
  path: string;
  version?: string;
}

export interface PackDependency {
  packId: string;
  version?: string;
  optional?: boolean;
}

export interface DestinationPackManifest {
  packId: string;
  version: string;
  layer: DestinationPackLayer;
  status: DestinationPackStatus;
  scope: DestinationPackScope;
  supportedSemanticKeys: DecisionSemanticKey[];
  evidenceProviders?: EvidenceProviderBinding[];
  ruleBundles?: RuleBundleRef[];
  environmentModifiers?: ModifierBundleRef[];
  ontologyMappings?: OntologyMappingRef[];
  repairTemplateBundles?: RepairTemplateBundleRef[];
  roadProfileBundles?: RoadProfileBundleRef[];
  /** 自驾 capabilities（Kernel 读取；非国家专用决策 API） */
  selfDriveCapabilities?: SelfDriveCapabilitiesRef;
  dependencies?: PackDependency[];
  fallbackPackId?: string;
  validFrom: string;
  validUntil?: string;
  owner?: string;
}

export interface ResolvedDestinationPack {
  packId: string;
  version: string;
  layer: DestinationPackLayer;
  manifest: DestinationPackManifest;
}

export interface DestinationPackResolveInput {
  country?: string;
  region?: string;
  activityTypes?: string[];
  operatorId?: string;
  /** Only ACTIVE packs unless shadow mode */
  includeShadow?: boolean;
}

export interface ActiveDestinationPackSet {
  schemaId: 'tripnara.active_destination_packs@v1';
  resolvedAt: string;
  layers: ResolvedDestinationPack[];
  /** Merged semantic keys from all layers (deduped) */
  supportedSemanticKeys: DecisionSemanticKey[];
  evidenceProviders: EvidenceProviderBinding[];
}
