import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CanonicalRiskDefinition,
  ExecutionRiskKnowledgeRepository,
  InterventionAction,
  KnowledgeStatus,
  RiskCausalChain,
  SeverityRule,
} from '../../../generated/execution-risk-contracts';
import {
  EXECUTION_RISK_KNOWLEDGE_VERSION_ID,
  EXECUTION_RISK_PACKAGE_ROOT,
  ExecutionRiskKnowledgeSnapshot,
  mapCausalChain,
  mapInterventionAction,
  mapRiskDefinition,
  mapSeverityRule,
} from './execution-risk-knowledge.mappers';
import { loadExecutionRiskKnowledgeFromPackage } from './execution-risk-knowledge.loader';

@Injectable()
export class ExecutionRiskKnowledgeRepositoryService
  implements ExecutionRiskKnowledgeRepository, OnModuleInit
{
  private readonly logger = new Logger(ExecutionRiskKnowledgeRepositoryService.name);
  private snapshot: ExecutionRiskKnowledgeSnapshot | null = null;
  private source: 'database' | 'package-files' = 'package-files';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    const active = await this.prisma.executionRiskKnowledgeVersion.findFirst({
      where: { isActive: true },
      orderBy: { importedAt: 'desc' },
    });

    if (!active) {
      this.snapshot = loadExecutionRiskKnowledgeFromPackage();
      this.source = 'package-files';
      this.logger.warn(
        'No active execution risk knowledge version in DB — using package file fallback',
      );
      return;
    }

    const [definitions, severityRules, causalChains, actions] = await Promise.all([
      this.prisma.executionRiskDefinition.findMany({
        where: { knowledgeVersionId: active.id },
      }),
      this.prisma.executionRiskSeverityRule.findMany({
        where: { knowledgeVersionId: active.id },
      }),
      this.prisma.executionRiskCausalChain.findMany({
        where: { knowledgeVersionId: active.id },
      }),
      this.prisma.executionRiskInterventionAction.findMany({
        where: { knowledgeVersionId: active.id },
      }),
    ]);

    const mappedDefinitions = definitions.map((row) =>
      mapRiskDefinition({
        canonicalCode: row.canonicalCode,
        knowledgeCode: row.knowledgeCode,
        riskType: row.riskType,
        displayName: row.displayName as Record<string, string>,
        definition: row.definition,
        isRootCause: row.isRootCause,
        sourceAliases: row.sourceAliases as string[],
        status: row.status,
        since: row.since ?? undefined,
      }),
    );

    const mappedRules = severityRules
      .map((row) => mapSeverityRule(row.payload as never))
      .filter((rule): rule is SeverityRule => rule !== null);

    const mappedChains = causalChains.map((row) => mapCausalChain(row.payload as never));
    const mappedActions = actions.map((row) => mapInterventionAction(row.payload as never));

    const severityRulesByCode = new Map<string, SeverityRule[]>();
    for (const rule of mappedRules) {
      const list = severityRulesByCode.get(rule.knowledgeCode) ?? [];
      list.push(rule);
      severityRulesByCode.set(rule.knowledgeCode, list);
    }
    for (const [, list] of severityRulesByCode) {
      list.sort((a, b) => a.priority - b.priority);
    }

    const causalChainsByCode = new Map<string, RiskCausalChain[]>();
    for (const chain of mappedChains) {
      const codes = new Set<string>([chain.knowledgeCode]);
      for (const node of chain.nodes) codes.add(node.knowledgeCode);
      for (const code of codes) {
        const list = causalChainsByCode.get(code) ?? [];
        list.push(chain);
        causalChainsByCode.set(code, list);
      }
    }

    this.snapshot = {
      version: active.id,
      status: active.status as KnowledgeStatus,
      definitions: mappedDefinitions,
      severityRulesByCode,
      causalChainsByCode,
      actionsByCode: new Map(mappedActions.map((action) => [action.actionCode, action])),
    };
    this.source = 'database';
    this.logger.log(
      `Loaded execution risk knowledge v${active.id} from database (${mappedDefinitions.length} definitions)`,
    );
  }

  getCacheSource(): 'database' | 'package-files' {
    return this.source;
  }

  private requireSnapshot(): ExecutionRiskKnowledgeSnapshot {
    if (!this.snapshot) {
      this.snapshot = loadExecutionRiskKnowledgeFromPackage();
    }
    return this.snapshot;
  }

  async findRiskDefinition(knowledgeCode: string): Promise<CanonicalRiskDefinition | null> {
    const snapshot = this.requireSnapshot();
    return snapshot.definitions.find((d) => d.knowledgeCode === knowledgeCode) ?? null;
  }

  async findSeverityRules(knowledgeCode: string): Promise<SeverityRule[]> {
    const snapshot = this.requireSnapshot();
    return snapshot.severityRulesByCode.get(knowledgeCode) ?? [];
  }

  async findCausalChains(knowledgeCode: string): Promise<RiskCausalChain[]> {
    const snapshot = this.requireSnapshot();
    return snapshot.causalChainsByCode.get(knowledgeCode) ?? [];
  }

  async findInterventionActions(actionCode: string): Promise<InterventionAction | null> {
    const snapshot = this.requireSnapshot();
    return snapshot.actionsByCode.get(actionCode) ?? null;
  }

  async getActiveKnowledgeVersion(): Promise<{ version: string; status: KnowledgeStatus }> {
    const snapshot = this.requireSnapshot();
    return { version: snapshot.version, status: snapshot.status };
  }

  getDefaultVersionId(): string {
    return EXECUTION_RISK_KNOWLEDGE_VERSION_ID;
  }

  getPackageRoot(): string {
    return EXECUTION_RISK_PACKAGE_ROOT;
  }
}
