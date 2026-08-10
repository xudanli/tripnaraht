/**
 * Nest-facing facade over IcelandKnowledgePackResolver.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { createIcelandKnowledgePackResolver, IcelandKnowledgePackResolver } from './iceland-knowledge-pack.resolver';
import type {
  IcelandKnowledgeDomain,
  IcelandKnowledgeRule,
  IcelandSelfDriveKnowledgePackManifest,
  KnowledgeDomainManifestEntry,
  KnowledgeDomainSummary,
  ResolvedKnowledgeRule,
} from './iceland-knowledge.types';

@Injectable()
export class IcelandKnowledgePackService implements OnModuleInit {
  private resolver!: IcelandKnowledgePackResolver;

  onModuleInit(): void {
    this.resolver = createIcelandKnowledgePackResolver();
  }

  /** Explicit reload (tests / hot refresh). */
  reload(cwd: string = process.cwd()): void {
    this.resolver = createIcelandKnowledgePackResolver(cwd);
  }

  private ensure(): IcelandKnowledgePackResolver {
    if (!this.resolver) {
      this.resolver = createIcelandKnowledgePackResolver();
    }
    return this.resolver;
  }

  getPack(): IcelandSelfDriveKnowledgePackManifest {
    return this.ensure().getPack();
  }

  listDomains(): KnowledgeDomainSummary[] {
    return this.ensure().listDomains();
  }

  getDomain(domainId: IcelandKnowledgeDomain): KnowledgeDomainManifestEntry | undefined {
    return this.ensure().getDomain(domainId);
  }

  resolveRule(ruleId: string): ResolvedKnowledgeRule | undefined {
    return this.ensure().resolveRule(ruleId);
  }

  listRules(domainId?: IcelandKnowledgeDomain): IcelandKnowledgeRule[] {
    return this.ensure().listRules(domainId);
  }

  listProductionReadyRules(): ResolvedKnowledgeRule[] {
    return this.ensure().listProductionReadyRules();
  }
}
