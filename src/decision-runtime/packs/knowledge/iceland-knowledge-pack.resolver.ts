/**
 * Runtime resolver for Iceland Self-Drive Knowledge Pack.
 *
 * Acceptance (WP1): given a ruleId, return source, version, consumers, production status.
 */

import { existsSync } from 'fs';
import { loadIcelandSelfDriveKnowledgePack, resolvePackFileAbsolutePath, resolveRepoFileAbsolutePath } from './iceland-knowledge-pack.loader';
import type {
  IcelandKnowledgeDomain,
  IcelandKnowledgeRule,
  IcelandSelfDriveKnowledgePackManifest,
  KnowledgeDomainManifestEntry,
  KnowledgeDomainSummary,
  ResolvedKnowledgeRule,
  SourceReference,
} from './iceland-knowledge.types';

export class IcelandKnowledgePackResolver {
  private readonly pack: IcelandSelfDriveKnowledgePackManifest;
  private readonly byRuleId = new Map<string, ResolvedKnowledgeRule>();

  constructor(pack?: IcelandSelfDriveKnowledgePackManifest, cwd: string = process.cwd()) {
    this.pack = pack ?? loadIcelandSelfDriveKnowledgePack(cwd);
    this.indexRules();
  }

  getPack(): IcelandSelfDriveKnowledgePackManifest {
    return this.pack;
  }

  listDomains(): KnowledgeDomainSummary[] {
    return Object.entries(this.pack.domains).map(([domainKey, domain]) => ({
      domainKey,
      domainId: domain.domainId,
      status: domain.status,
      reviewStatus: domain.reviewStatus,
      inProductionMainChain: domain.inProductionMainChain,
      version: domain.version,
      ruleCount: domain.rules.length,
      runtimeConsumers: domain.runtimeConsumers,
      sourceCount: domain.sources.length,
    }));
  }

  getDomain(domainId: IcelandKnowledgeDomain): KnowledgeDomainManifestEntry | undefined {
    return Object.values(this.pack.domains).find((d) => d.domainId === domainId);
  }

  getDomainByKey(domainKey: string): KnowledgeDomainManifestEntry | undefined {
    return this.pack.domains[domainKey];
  }

  /**
   * Primary WP1 API: resolve a knowledge rule by id.
   */
  resolveRule(ruleId: string): ResolvedKnowledgeRule | undefined {
    return this.byRuleId.get(ruleId);
  }

  listRules(domainId?: IcelandKnowledgeDomain): IcelandKnowledgeRule[] {
    if (!domainId) {
      return Object.values(this.pack.domains).flatMap((d) => d.rules);
    }
    return this.getDomain(domainId)?.rules ?? [];
  }

  listProductionReadyRules(): ResolvedKnowledgeRule[] {
    return [...this.byRuleId.values()].filter((r) => r.productionReady);
  }

  /** Traceability helper: absolute paths that exist on disk for evidence. */
  resolveEvidencePaths(
    evidence: SourceReference[],
    cwd: string = process.cwd(),
  ): Array<{ ref: SourceReference; absolutePath?: string; exists: boolean }> {
    return evidence.map((ref) => {
      if (ref.kind === 'PACK_FILE') {
        const absolutePath = resolvePackFileAbsolutePath(ref.path, cwd);
        return { ref, absolutePath, exists: existsSync(absolutePath) };
      }
      if (ref.kind === 'REPO_FILE') {
        const absolutePath = resolveRepoFileAbsolutePath(ref.path, cwd);
        return { ref, absolutePath, exists: existsSync(absolutePath) };
      }
      return { ref, exists: true };
    });
  }

  private indexRules(): void {
    this.byRuleId.clear();
    const packMeta = {
      packId: this.pack.packId,
      country: this.pack.country,
      version: this.pack.version,
      status: this.pack.status,
    };

    for (const domain of Object.values(this.pack.domains)) {
      for (const rule of domain.rules) {
        if (this.byRuleId.has(rule.ruleId)) {
          throw new Error(
            `Duplicate knowledge ruleId in pack ${this.pack.packId}: ${rule.ruleId}`,
          );
        }
        if (rule.domain !== domain.domainId) {
          throw new Error(
            `Rule ${rule.ruleId} domain ${rule.domain} does not match domain entry ${domain.domainId}`,
          );
        }
        this.byRuleId.set(rule.ruleId, {
          rule,
          domain,
          pack: packMeta,
          productionReady: isProductionReady(this.pack, domain, rule),
        });
      }
    }
  }
}

export function isProductionReady(
  pack: Pick<IcelandSelfDriveKnowledgePackManifest, 'status'>,
  domain: Pick<
    KnowledgeDomainManifestEntry,
    'status' | 'inProductionMainChain' | 'reviewStatus'
  >,
  rule: Pick<IcelandKnowledgeRule, 'reviewStatus' | 'projectionMode'>,
): boolean {
  if (pack.status !== 'ACTIVE') return false;
  if (domain.status !== 'ACTIVE') return false;
  if (!domain.inProductionMainChain) return false;
  if (domain.reviewStatus !== 'APPROVED') return false;
  if (rule.reviewStatus !== 'APPROVED') return false;
  if (rule.projectionMode === 'STUB') return false;
  return true;
}

/** Convenience factory used by Nest / tests. */
export function createIcelandKnowledgePackResolver(
  cwd: string = process.cwd(),
): IcelandKnowledgePackResolver {
  return new IcelandKnowledgePackResolver(undefined, cwd);
}
