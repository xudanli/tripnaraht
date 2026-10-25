import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExecutionRiskKnowledgeRepositoryService } from '../knowledge/execution-risk-knowledge.repository';
import {
  EXECUTION_RISK_PACKAGE_ROOT,
  mapSeverityRule,
  type PackageCausalChainRow,
  type PackageInterventionActionRow,
  type PackageRiskDefinitionRow,
  type PackageSeverityRuleRow,
} from '../knowledge/execution-risk-knowledge.mappers';
import {
  loadPackageCausalChainRows,
  loadPackageDefinitionRows,
  loadPackageInterventionActionRows,
  loadPackageSeverityRuleRows,
} from '../knowledge/execution-risk-knowledge.loader';
import {
  buildKnowledgeVersionId,
  importExecutionRiskKnowledgeVersion,
} from '../knowledge/execution-risk-knowledge-import.util';
import { runKnowledgeHarnessGate } from '../knowledge/execution-risk-knowledge-harness-gate.util';
import {
  enrichActionPayload,
  enrichCausalChainPayload,
  enrichDefinitionRow,
  enrichSeverityPayload,
  getKnowledgeFieldCatalog,
} from '../knowledge/execution-risk-knowledge-field-catalog';

const VERSION_STATUSES = new Set(['DRAFT', 'VALIDATED', 'DEPRECATED']);

export interface KnowledgeVersionListQuery {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ImportKnowledgeBody {
  sourcePath?: string;
  mappingPath?: string;
  packageVersion?: string;
  status?: string;
  note?: string;
}

export interface ActivateKnowledgeBody {
  requireValidated?: boolean;
  skipHarnessGate?: boolean;
}

export interface ValidateKnowledgeBody {
  runHarness?: boolean;
  scenarioIds?: string[];
}

export interface KnowledgeResourceListQuery {
  page?: number;
  limit?: number;
  q?: string;
  riskType?: string;
  isRootCause?: boolean;
  knowledgeCode?: string;
  level?: string;
  metric?: string;
  actionCategory?: string;
  applicableRiskCode?: string;
}

@Injectable()
export class ExecutionRiskKnowledgeAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeRepo: ExecutionRiskKnowledgeRepositoryService,
  ) {}

  async getFieldCatalog() {
    return getKnowledgeFieldCatalog();
  }

  async listVersions(query: KnowledgeVersionListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.ExecutionRiskKnowledgeVersionWhereInput = {};
    if (query.status) {
      if (!VERSION_STATUSES.has(query.status) && query.status !== 'ACTIVE') {
        throw new BadRequestException(`Invalid status filter: ${query.status}`);
      }
      if (query.status === 'ACTIVE') {
        where.isActive = true;
      } else {
        where.status = query.status;
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.executionRiskKnowledgeVersion.count({ where }),
      this.prisma.executionRiskKnowledgeVersion.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map(mapVersionRow),
    };
  }

  async getVersion(versionId: string) {
    const row = await this.prisma.executionRiskKnowledgeVersion.findUnique({
      where: { id: versionId },
    });
    if (!row) throw new NotFoundException(`Knowledge version ${versionId} not found`);
    return mapVersionRow(row);
  }

  async getActiveVersion() {
    const row = await this.prisma.executionRiskKnowledgeVersion.findFirst({
      where: { isActive: true },
      orderBy: { importedAt: 'desc' },
    });
    if (!row) {
      return {
        version: null,
        runtimeFallback: {
          source: 'package-files' as const,
          packageRoot: this.knowledgeRepo.getPackageRoot(),
          defaultVersionId: this.knowledgeRepo.getDefaultVersionId(),
        },
      };
    }
    return {
      version: mapVersionRow(row),
      runtimeFallback: null,
      cacheSource: this.knowledgeRepo.getCacheSource(),
    };
  }

  async importFromPackage(body: ImportKnowledgeBody) {
    const packageVersion = body.packageVersion?.trim() || '1.0.0';
    const status = body.status?.trim() || 'DRAFT';
    if (status !== 'DRAFT' && status !== 'VALIDATED') {
      throw new BadRequestException('Import status must be DRAFT or VALIDATED');
    }
    const sourcePath = body.sourcePath?.trim() || EXECUTION_RISK_PACKAGE_ROOT;
    const versionId = buildKnowledgeVersionId(packageVersion);

    try {
      const result = await this.prisma.$transaction((tx) =>
        importExecutionRiskKnowledgeVersion(tx, {
          versionId,
          packageVersion,
          status,
          sourcePath,
          activate: false,
        }),
      );
      return {
        ...result,
        note: body.note ?? null,
        mappingPath: body.mappingPath ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Knowledge import failed: ${message}`);
    }
  }

  async validateVersion(versionId: string, body: ValidateKnowledgeBody = {}) {
    const version = await this.requireVersion(versionId);
    const { failures, warnings } = await this.collectStructuralFailures(versionId);

    if (failures.length > 0) {
      return {
        versionId,
        valid: false,
        status: version.status,
        failures,
        warnings,
        harnessSummary: null,
      };
    }

    const runHarness = body.runHarness === true;
    let harnessSummary: Awaited<ReturnType<typeof runKnowledgeHarnessGate>> | null = null;
    if (runHarness) {
      harnessSummary = await this.runHarnessForVersion(versionId, body.scenarioIds);
      if (!harnessSummary.passed) {
        return {
          versionId,
          valid: false,
          status: version.status,
          failures: harnessSummary.failures,
          warnings,
          harnessSummary,
        };
      }
    }

    const updated = await this.prisma.executionRiskKnowledgeVersion.update({
      where: { id: versionId },
      data: { status: 'VALIDATED' },
    });

    return {
      versionId,
      valid: true,
      status: updated.status,
      failures: [],
      warnings,
      harnessSummary: harnessSummary ?? {
        ran: false,
        passed: true,
        scenarioIds: [],
        failures: [],
        note: 'Structural validation only (pass runHarness=true for smoke harness)',
      },
    };
  }

  async activateVersion(versionId: string, body: ActivateKnowledgeBody = {}) {
    const requireValidated = body.requireValidated !== false;
    const skipHarnessGate = body.skipHarnessGate === true;
    const version = await this.requireVersion(versionId);

    if (requireValidated && version.status !== 'VALIDATED' && !version.isActive) {
      throw new UnprocessableEntityException(
        `Version ${versionId} status is ${version.status}; VALIDATED required (set requireValidated=false to override)`,
      );
    }

    let harnessSummary: Awaited<ReturnType<typeof runKnowledgeHarnessGate>> | null = null;
    if (!skipHarnessGate) {
      const structural = await this.collectStructuralFailures(versionId);
      if (structural.failures.length > 0) {
        throw new UnprocessableEntityException(
          `HARNESS_GATE_FAILED: structural issues — ${structural.failures.slice(0, 3).join('; ')}`,
        );
      }
      harnessSummary = await this.runHarnessForVersion(versionId);
      if (!harnessSummary.passed) {
        throw new UnprocessableEntityException(
          `HARNESS_GATE_FAILED: ${harnessSummary.failures.slice(0, 5).join('; ')}`,
        );
      }
    }

    const previous = await this.prisma.executionRiskKnowledgeVersion.findFirst({
      where: { isActive: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.executionRiskKnowledgeVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false, status: 'DEPRECATED' },
      });
      await tx.executionRiskKnowledgeVersion.update({
        where: { id: versionId },
        data: {
          isActive: true,
          status: 'VALIDATED',
          activatedAt: new Date(),
        },
      });
    });

    await this.knowledgeRepo.refreshCache();

    return {
      previousActiveVersionId: previous?.id ?? null,
      activeVersionId: versionId,
      activatedAt: new Date().toISOString(),
      runtimeCacheRefreshed: true,
      cacheSource: this.knowledgeRepo.getCacheSource(),
      harnessSummary,
      skippedHarnessGate: skipHarnessGate,
    };
  }

  async deprecateVersion(versionId: string, force = false) {
    const version = await this.requireVersion(versionId);
    if (version.isActive && !force) {
      throw new BadRequestException(
        'Cannot deprecate the active version without force=true',
      );
    }
    const updated = await this.prisma.executionRiskKnowledgeVersion.update({
      where: { id: versionId },
      data: {
        status: 'DEPRECATED',
        isActive: false,
      },
    });
    if (version.isActive) {
      await this.knowledgeRepo.refreshCache();
    }
    return mapVersionRow(updated);
  }

  async listDefinitions(versionId: string, query: KnowledgeResourceListQuery) {
    await this.requireVersion(versionId);
    const { page, limit, skip } = pageParams(query);
    const where: Prisma.ExecutionRiskDefinitionWhereInput = {
      knowledgeVersionId: versionId,
    };
    if (query.riskType) where.riskType = query.riskType;
    if (query.isRootCause !== undefined) where.isRootCause = query.isRootCause;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { knowledgeCode: { contains: q, mode: 'insensitive' } },
        { canonicalCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.executionRiskDefinition.count({ where }),
      this.prisma.executionRiskDefinition.findMany({
        where,
        orderBy: { knowledgeCode: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map((row) =>
        enrichDefinitionRow({
          canonicalCode: row.canonicalCode,
          knowledgeCode: row.knowledgeCode,
          riskType: row.riskType,
          displayName: row.displayName,
          definition: row.definition,
          isRootCause: row.isRootCause,
          sourceAliases: row.sourceAliases,
          status: row.status,
          since: row.since,
          generationMode: row.generationMode,
          capabilityStatus: row.capabilityStatus,
        }),
      ),
    };
  }

  async getDefinition(versionId: string, knowledgeCode: string) {
    await this.requireVersion(versionId);
    const row = await this.prisma.executionRiskDefinition.findFirst({
      where: { knowledgeVersionId: versionId, knowledgeCode },
    });
    if (!row) {
      throw new NotFoundException(
        `Definition ${knowledgeCode} not found in version ${versionId}`,
      );
    }
    return enrichDefinitionRow({
      canonicalCode: row.canonicalCode,
      knowledgeCode: row.knowledgeCode,
      riskType: row.riskType,
      displayName: row.displayName,
      definition: row.definition,
      isRootCause: row.isRootCause,
      sourceAliases: row.sourceAliases,
      status: row.status,
      since: row.since,
      generationMode: row.generationMode,
      capabilityStatus: row.capabilityStatus,
    });
  }

  async listSeverityRules(versionId: string, query: KnowledgeResourceListQuery) {
    await this.requireVersion(versionId);
    const { page, limit, skip } = pageParams(query);
    const where: Prisma.ExecutionRiskSeverityRuleWhereInput = {
      knowledgeVersionId: versionId,
    };
    if (query.knowledgeCode) where.knowledgeCode = query.knowledgeCode;

    const rows = await this.prisma.executionRiskSeverityRule.findMany({
      where,
      orderBy: { knowledgeCode: 'asc' },
    });

    let payloads: Array<Record<string, unknown> & { dbId: string }> = rows.map((row) => ({
      dbId: row.id,
      ...(row.payload as Record<string, unknown>),
    }));

    if (query.level) {
      const want = normalizeLevel(query.level);
      payloads = payloads.filter((p) => normalizeLevel(String(p.level ?? '')) === want);
    }
    if (query.metric) {
      payloads = payloads.filter((p) => String(p.metric ?? '') === query.metric);
    }
    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      payloads = payloads.filter(
        (p) =>
          String(p.ruleId ?? '').toLowerCase().includes(q) ||
          String(p.knowledgeCode ?? '').toLowerCase().includes(q),
      );
    }

    const total = payloads.length;
    const pageItems = payloads.slice(skip, skip + limit);
    const nameByCode = await this.loadDefinitionNameMap(
      versionId,
      pageItems.map((p) => String(p.knowledgeCode ?? '')),
    );
    const items = pageItems.map(({ dbId, ...payload }) => ({
      ...enrichSeverityPayload(payload, nameByCode.get(String(payload.knowledgeCode ?? ''))),
      _dbId: dbId,
    }));

    return { page, limit, total, items };
  }

  async getSeverityRule(versionId: string, ruleId: string) {
    await this.requireVersion(versionId);
    const rows = await this.prisma.executionRiskSeverityRule.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { ruleId?: string };
      return payload.ruleId === ruleId || row.id === ruleId || row.id.endsWith(`:${ruleId}`);
    });
    if (!match) {
      throw new NotFoundException(`Severity rule ${ruleId} not found in version ${versionId}`);
    }
    const payload = match.payload as Record<string, unknown>;
    const nameByCode = await this.loadDefinitionNameMap(versionId, [
      String(payload.knowledgeCode ?? ''),
    ]);
    return enrichSeverityPayload(
      payload,
      nameByCode.get(String(payload.knowledgeCode ?? '')),
    );
  }

  async listCausalChains(versionId: string, query: KnowledgeResourceListQuery) {
    await this.requireVersion(versionId);
    const { page, limit, skip } = pageParams(query);
    const where: Prisma.ExecutionRiskCausalChainWhereInput = {
      knowledgeVersionId: versionId,
    };
    if (query.knowledgeCode) where.knowledgeCode = query.knowledgeCode;
    if (query.q?.trim()) {
      where.OR = [
        { knowledgeCode: { contains: query.q.trim(), mode: 'insensitive' } },
        { id: { contains: query.q.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.executionRiskCausalChain.count({ where }),
      this.prisma.executionRiskCausalChain.findMany({
        where,
        orderBy: { knowledgeCode: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map((row) => enrichCausalChainPayload(row.payload as Record<string, unknown>)),
    };
  }

  async getCausalChain(versionId: string, chainId: string) {
    await this.requireVersion(versionId);
    const rows = await this.prisma.executionRiskCausalChain.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { chainId?: string };
      return payload.chainId === chainId || row.id === chainId || row.id.endsWith(`:${chainId}`);
    });
    if (!match) {
      throw new NotFoundException(`Causal chain ${chainId} not found in version ${versionId}`);
    }
    return enrichCausalChainPayload(match.payload as Record<string, unknown>);
  }

  async listActions(versionId: string, query: KnowledgeResourceListQuery) {
    await this.requireVersion(versionId);
    const { page, limit, skip } = pageParams(query);
    const where: Prisma.ExecutionRiskInterventionActionWhereInput = {
      knowledgeVersionId: versionId,
    };
    if (query.actionCategory) where.actionCategory = query.actionCategory;

    const rows = await this.prisma.executionRiskInterventionAction.findMany({
      where,
      orderBy: { actionCategory: 'asc' },
    });

    let payloads = rows.map((row) => row.payload as Record<string, unknown>);
    if (query.applicableRiskCode) {
      payloads = payloads.filter((p) =>
        Array.isArray(p.applicableRiskCodes)
          ? (p.applicableRiskCodes as string[]).includes(query.applicableRiskCode!)
          : false,
      );
    }
    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      payloads = payloads.filter((p) => {
        const code = String(p.actionCode ?? '').toLowerCase();
        const name =
          typeof p.name === 'string'
            ? p.name.toLowerCase()
            : JSON.stringify(p.name ?? {}).toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }

    const total = payloads.length;
    return {
      page,
      limit,
      total,
      items: payloads.slice(skip, skip + limit).map((p) => enrichActionPayload(p)),
    };
  }

  async getAction(versionId: string, actionCode: string) {
    await this.requireVersion(versionId);
    const rows = await this.prisma.executionRiskInterventionAction.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { actionCode?: string };
      return (
        payload.actionCode === actionCode ||
        row.id === actionCode ||
        row.id.endsWith(`:${actionCode}`)
      );
    });
    if (!match) {
      throw new NotFoundException(`Action ${actionCode} not found in version ${versionId}`);
    }
    return enrichActionPayload(match.payload as Record<string, unknown>);
  }

  /** Package-level structural check (no DB) — used by validate when rows empty? Prefer DB rows. */
  validatePackageStructure(): { valid: boolean; failures: string[] } {
    const failures = validatePackageRows();
    return { valid: failures.length === 0, failures };
  }

  private async loadDefinitionNameMap(
    versionId: string,
    knowledgeCodes: string[],
  ): Promise<Map<string, string>> {
    const codes = [...new Set(knowledgeCodes.filter(Boolean))];
    if (codes.length === 0) return new Map();
    const rows = await this.prisma.executionRiskDefinition.findMany({
      where: { knowledgeVersionId: versionId, knowledgeCode: { in: codes } },
      select: { knowledgeCode: true, displayName: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const dn = row.displayName as Record<string, string> | string;
      const name =
        typeof dn === 'string' ? dn : dn?.zh ?? dn?.en ?? row.knowledgeCode;
      map.set(row.knowledgeCode, name);
    }
    return map;
  }

  private async runHarnessForVersion(versionId: string, scenarioIds?: string[]) {
    const [definitions, severityRules, causalChains, actions] = await Promise.all([
      this.prisma.executionRiskDefinition.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskSeverityRule.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskCausalChain.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskInterventionAction.findMany({
        where: { knowledgeVersionId: versionId },
      }),
    ]);

    return runKnowledgeHarnessGate(
      {
        versionId,
        definitions: definitions.map(
          (row): PackageRiskDefinitionRow => ({
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
        ),
        severityRules: severityRules.map(
          (row) => row.payload as unknown as PackageSeverityRuleRow,
        ),
        causalChains: causalChains.map(
          (row) => row.payload as unknown as PackageCausalChainRow,
        ),
        actions: actions.map(
          (row) => row.payload as unknown as PackageInterventionActionRow,
        ),
      },
      scenarioIds,
    );
  }

  private async requireVersion(versionId: string) {
    const row = await this.prisma.executionRiskKnowledgeVersion.findUnique({
      where: { id: versionId },
    });
    if (!row) throw new NotFoundException(`Knowledge version ${versionId} not found`);
    return row;
  }

  private async collectStructuralFailures(
    versionId: string,
  ): Promise<{ failures: string[]; warnings: string[] }> {
    const failures: string[] = [];
    const warnings: string[] = [];
    const [definitions, rules, chains, actions] = await Promise.all([
      this.prisma.executionRiskDefinition.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskSeverityRule.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskCausalChain.findMany({ where: { knowledgeVersionId: versionId } }),
      this.prisma.executionRiskInterventionAction.findMany({
        where: { knowledgeVersionId: versionId },
      }),
    ]);

    if (definitions.length === 0) failures.push('No definitions in version');
    if (rules.length === 0) failures.push('No severity rules in version');
    if (chains.length === 0) failures.push('No causal chains in version');
    if (actions.length === 0) failures.push('No intervention actions in version');

    const defCodes = new Set(definitions.map((d) => d.knowledgeCode));

    for (const rule of rules) {
      const payload = rule.payload as {
        ruleId?: string;
        knowledgeCode?: string;
        level?: string;
      };
      if (!payload.ruleId) failures.push(`Severity rule row ${rule.id} missing ruleId`);
      if (payload.knowledgeCode && !defCodes.has(payload.knowledgeCode)) {
        failures.push(
          `Severity rule ${payload.ruleId} references unknown knowledgeCode ${payload.knowledgeCode}`,
        );
      }
      if (mapSeverityRule(rule.payload as never) === null) {
        if (String(payload.level).toUpperCase() === 'RECOVERY') {
          warnings.push(
            `Severity rule ${payload.ruleId ?? rule.id} uses RECOVERY level (not a gate rule)`,
          );
        } else {
          failures.push(
            `Severity rule ${payload.ruleId ?? rule.id} has unmapped level ${payload.level}`,
          );
        }
      }
    }

    for (const chain of chains) {
      const payload = chain.payload as {
        chainId?: string;
        knowledgeCode?: string;
        nodes?: Array<{ nodeId: string }>;
        edges?: Array<{ fromNodeId: string; toNodeId: string }>;
      };
      const nodeIds = new Set((payload.nodes ?? []).map((n) => n.nodeId));
      for (const edge of payload.edges ?? []) {
        if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
          failures.push(
            `Causal chain ${payload.chainId ?? chain.id} edge references missing node`,
          );
        }
      }
      if (payload.knowledgeCode && !defCodes.has(payload.knowledgeCode)) {
        failures.push(
          `Causal chain ${payload.chainId} references unknown knowledgeCode ${payload.knowledgeCode}`,
        );
      }
    }

    for (const action of actions) {
      const payload = action.payload as {
        actionCode?: string;
        userConfirmRequired?: boolean;
        aiAutoExecutable?: boolean;
      };
      if (!payload.actionCode) failures.push(`Action row ${action.id} missing actionCode`);
      if (payload.aiAutoExecutable === true && payload.userConfirmRequired === false) {
        warnings.push(
          `Action ${payload.actionCode} is auto-executable without user confirm`,
        );
      }
    }

    return { failures, warnings };
  }
}

function mapVersionRow(row: {
  id: string;
  packageVersion: string;
  status: string;
  isActive: boolean;
  sourcePath: string;
  rowCounts: unknown;
  importedAt: Date;
  activatedAt: Date | null;
}) {
  return {
    id: row.id,
    packageVersion: row.packageVersion,
    status: row.status,
    isActive: row.isActive,
    sourcePath: row.sourcePath,
    rowCounts: row.rowCounts,
    importedAt: row.importedAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
  };
}

function pageParams(query: KnowledgeResourceListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeLevel(level: string): string {
  if (level === 'REPLAN') return 'REPLAN_REQUIRED';
  return level;
}

function validatePackageRows(): string[] {
  const failures: string[] = [];
  const defs = loadPackageDefinitionRows();
  const rules = loadPackageSeverityRuleRows();
  const chains = loadPackageCausalChainRows();
  const actions = loadPackageInterventionActionRows();
  const codes = new Set(defs.map((d) => d.knowledgeCode));
  if (defs.length === 0) failures.push('Package has no definitions');
  for (const rule of rules) {
    if (!codes.has(rule.knowledgeCode)) {
      failures.push(`Package rule ${rule.ruleId} unknown code ${rule.knowledgeCode}`);
    }
  }
  for (const chain of chains) {
    if (!codes.has(chain.knowledgeCode)) {
      failures.push(`Package chain ${chain.chainId} unknown code ${chain.knowledgeCode}`);
    }
  }
  void actions;
  return failures;
}
