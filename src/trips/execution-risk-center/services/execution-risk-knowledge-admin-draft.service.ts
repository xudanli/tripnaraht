import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapSeverityRule } from '../knowledge/execution-risk-knowledge.mappers';

/** Prisma Json columns reject `unknown` — normalize via InputJsonValue. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export type DefinitionUpsertBody = {
  canonicalCode: string;
  knowledgeCode?: string;
  riskType: string;
  displayName: Record<string, string> | string;
  definition: string;
  isRootCause?: boolean;
  sourceAliases?: string[];
  status?: string;
  since?: string;
  generationMode?: string | null;
  capabilityStatus?: string | null;
};

export type SeverityRuleUpsertBody = {
  ruleId?: string;
  knowledgeCode: string;
  level: string;
  metric: string;
  operator: string;
  minValue?: number;
  maxValue?: number;
  matchValue?: string;
  unit: string;
  conditions?: unknown[];
  priority: number;
  description?: string;
  evidenceIds?: string[];
};

export type CausalChainUpsertBody = {
  chainId?: string;
  knowledgeCode: string;
  name?: string;
  nodes: Array<{
    nodeId: string;
    knowledgeCode: string;
    nodeType: string;
    description: string;
  }>;
  edges: Array<{ fromNodeId: string; toNodeId: string; edgeType: string }>;
  clusterHint?: Record<string, unknown>;
};

export type ActionUpsertBody = {
  actionCode?: string;
  actionCategory: string;
  name: Record<string, string> | string;
  description: string;
  typicalUseCase: string;
  safetyImpact: number;
  timeImpactMinRange: { min: number; max: number };
  fatigueImpact: number;
  experienceImpact: number;
  budgetImpactDescription?: string;
  bookingImpact: string;
  reversibility: 'YES' | 'PARTIAL' | 'NO';
  userConfirmRequired: boolean;
  aiAutoExecutable: boolean;
  capabilities: string[];
  executionMode: string;
  applicableRiskCodes: string[];
};

@Injectable()
export class ExecutionRiskKnowledgeAdminDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async assertDraftEditable(versionId: string) {
    const version = await this.prisma.executionRiskKnowledgeVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException(`Knowledge version ${versionId} not found`);
    if (version.status !== 'DRAFT') {
      throw new ConflictException(
        `VERSION_NOT_EDITABLE: version ${versionId} status is ${version.status}`,
      );
    }
    return version;
  }

  // ── Definitions ───────────────────────────────────────────

  async createDefinition(versionId: string, body: DefinitionUpsertBody) {
    await this.assertDraftEditable(versionId);
    const knowledgeCode = String(body.knowledgeCode ?? '').trim();
    if (!knowledgeCode) throw new BadRequestException('knowledgeCode is required');
    this.assertDefinitionBody(body);

    const existing = await this.prisma.executionRiskDefinition.findFirst({
      where: { knowledgeVersionId: versionId, knowledgeCode },
    });
    if (existing) {
      throw new ConflictException(`Definition ${knowledgeCode} already exists`);
    }

    const displayName =
      typeof body.displayName === 'string'
        ? { en: body.displayName }
        : body.displayName;

    await this.prisma.executionRiskDefinition.create({
      data: {
        id: `${versionId}:${knowledgeCode}`.slice(0, 64),
        knowledgeVersionId: versionId,
        canonicalCode: body.canonicalCode,
        knowledgeCode,
        riskType: body.riskType,
        displayName,
        definition: body.definition,
        isRootCause: body.isRootCause ?? true,
        sourceAliases: body.sourceAliases ?? [],
        status: body.status ?? 'DRAFT',
        since: body.since ?? null,
        generationMode: body.generationMode ?? null,
        capabilityStatus: body.capabilityStatus ?? null,
      },
    });
    return this.getDefinition(versionId, knowledgeCode);
  }

  async putDefinition(versionId: string, knowledgeCode: string, body: DefinitionUpsertBody) {
    await this.assertDraftEditable(versionId);
    this.assertDefinitionBody({ ...body, knowledgeCode });
    const row = await this.requireDefinition(versionId, knowledgeCode);
    const displayName =
      typeof body.displayName === 'string'
        ? { en: body.displayName }
        : body.displayName;

    await this.prisma.executionRiskDefinition.update({
      where: { id: row.id },
      data: {
        canonicalCode: body.canonicalCode,
        riskType: body.riskType,
        displayName,
        definition: body.definition,
        isRootCause: body.isRootCause ?? row.isRootCause,
        sourceAliases: body.sourceAliases ?? [],
        status: body.status ?? row.status,
        since: body.since ?? null,
        generationMode: body.generationMode ?? null,
        capabilityStatus: body.capabilityStatus ?? null,
      },
    });
    return this.getDefinition(versionId, knowledgeCode);
  }

  async patchDefinition(
    versionId: string,
    knowledgeCode: string,
    body: Partial<DefinitionUpsertBody>,
  ) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireDefinition(versionId, knowledgeCode);
    const displayName =
      body.displayName === undefined
        ? undefined
        : typeof body.displayName === 'string'
          ? { en: body.displayName }
          : body.displayName;

    await this.prisma.executionRiskDefinition.update({
      where: { id: row.id },
      data: {
        ...(body.canonicalCode !== undefined ? { canonicalCode: body.canonicalCode } : {}),
        ...(body.riskType !== undefined ? { riskType: body.riskType } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(body.definition !== undefined ? { definition: body.definition } : {}),
        ...(body.isRootCause !== undefined ? { isRootCause: body.isRootCause } : {}),
        ...(body.sourceAliases !== undefined ? { sourceAliases: body.sourceAliases } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.since !== undefined ? { since: body.since } : {}),
        ...(body.generationMode !== undefined ? { generationMode: body.generationMode } : {}),
        ...(body.capabilityStatus !== undefined
          ? { capabilityStatus: body.capabilityStatus }
          : {}),
      },
    });
    return this.getDefinition(versionId, knowledgeCode);
  }

  async deleteDefinition(versionId: string, knowledgeCode: string) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireDefinition(versionId, knowledgeCode);
    await this.prisma.executionRiskDefinition.delete({ where: { id: row.id } });
    return { deleted: true, knowledgeCode };
  }

  // ── Severity rules ────────────────────────────────────────

  async createSeverityRule(versionId: string, body: SeverityRuleUpsertBody) {
    await this.assertDraftEditable(versionId);
    const ruleId = String(body.ruleId ?? '').trim();
    if (!ruleId) throw new BadRequestException('ruleId is required');
    this.assertSeverityBody(body);
    await this.ensureNoRule(versionId, ruleId);

    const payload = { ...body, ruleId };
    await this.prisma.executionRiskSeverityRule.create({
      data: {
        id: `${versionId}:${ruleId}`.slice(0, 128),
        knowledgeVersionId: versionId,
        knowledgeCode: body.knowledgeCode,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async putSeverityRule(versionId: string, ruleId: string, body: SeverityRuleUpsertBody) {
    await this.assertDraftEditable(versionId);
    this.assertSeverityBody({ ...body, ruleId });
    const row = await this.requireSeverityRule(versionId, ruleId);
    const payload = { ...body, ruleId, knowledgeCode: body.knowledgeCode };
    await this.prisma.executionRiskSeverityRule.update({
      where: { id: row.id },
      data: {
        knowledgeCode: body.knowledgeCode,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async patchSeverityRule(
    versionId: string,
    ruleId: string,
    body: Partial<SeverityRuleUpsertBody>,
  ) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireSeverityRule(versionId, ruleId);
    const prev = row.payload as SeverityRuleUpsertBody;
    const payload = { ...prev, ...body, ruleId };
    this.assertSeverityBody(payload);
    await this.prisma.executionRiskSeverityRule.update({
      where: { id: row.id },
      data: {
        knowledgeCode: payload.knowledgeCode,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async deleteSeverityRule(versionId: string, ruleId: string) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireSeverityRule(versionId, ruleId);
    await this.prisma.executionRiskSeverityRule.delete({ where: { id: row.id } });
    return { deleted: true, ruleId };
  }

  // ── Causal chains ─────────────────────────────────────────

  async createCausalChain(versionId: string, body: CausalChainUpsertBody) {
    await this.assertDraftEditable(versionId);
    const chainId = String(body.chainId ?? '').trim();
    if (!chainId) throw new BadRequestException('chainId is required');
    this.assertChainBody(body);
    await this.ensureNoChain(versionId, chainId);
    const payload = { ...body, chainId };
    await this.prisma.executionRiskCausalChain.create({
      data: {
        id: `${versionId}:${chainId}`.slice(0, 64),
        knowledgeVersionId: versionId,
        knowledgeCode: body.knowledgeCode,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async putCausalChain(versionId: string, chainId: string, body: CausalChainUpsertBody) {
    await this.assertDraftEditable(versionId);
    this.assertChainBody({ ...body, chainId });
    const row = await this.requireCausalChain(versionId, chainId);
    const payload = { ...body, chainId };
    await this.prisma.executionRiskCausalChain.update({
      where: { id: row.id },
      data: { knowledgeCode: body.knowledgeCode, payload: asJson(payload) },
    });
    return payload;
  }

  async patchCausalChain(
    versionId: string,
    chainId: string,
    body: Partial<CausalChainUpsertBody>,
  ) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireCausalChain(versionId, chainId);
    const prev = row.payload as CausalChainUpsertBody;
    const payload = { ...prev, ...body, chainId };
    this.assertChainBody(payload);
    await this.prisma.executionRiskCausalChain.update({
      where: { id: row.id },
      data: { knowledgeCode: payload.knowledgeCode, payload: asJson(payload) },
    });
    return payload;
  }

  async deleteCausalChain(versionId: string, chainId: string) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireCausalChain(versionId, chainId);
    await this.prisma.executionRiskCausalChain.delete({ where: { id: row.id } });
    return { deleted: true, chainId };
  }

  // ── Actions ───────────────────────────────────────────────

  async createAction(versionId: string, body: ActionUpsertBody) {
    await this.assertDraftEditable(versionId);
    const actionCode = String(body.actionCode ?? '').trim();
    if (!actionCode) throw new BadRequestException('actionCode is required');
    this.assertActionBody(body);
    await this.ensureNoAction(versionId, actionCode);
    const payload = { ...body, actionCode };
    await this.prisma.executionRiskInterventionAction.create({
      data: {
        id: `${versionId}:${actionCode}`.slice(0, 128),
        knowledgeVersionId: versionId,
        actionCategory: body.actionCategory,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async putAction(versionId: string, actionCode: string, body: ActionUpsertBody) {
    await this.assertDraftEditable(versionId);
    this.assertActionBody({ ...body, actionCode });
    const row = await this.requireAction(versionId, actionCode);
    const payload = { ...body, actionCode };
    await this.prisma.executionRiskInterventionAction.update({
      where: { id: row.id },
      data: { actionCategory: body.actionCategory, payload: asJson(payload) },
    });
    return payload;
  }

  async patchAction(versionId: string, actionCode: string, body: Partial<ActionUpsertBody>) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireAction(versionId, actionCode);
    const prev = row.payload as ActionUpsertBody;
    const payload = { ...prev, ...body, actionCode };
    this.assertActionBody(payload);
    await this.prisma.executionRiskInterventionAction.update({
      where: { id: row.id },
      data: {
        actionCategory: payload.actionCategory,
        payload: asJson(payload),
      },
    });
    return payload;
  }

  async deleteAction(versionId: string, actionCode: string) {
    await this.assertDraftEditable(versionId);
    const row = await this.requireAction(versionId, actionCode);
    await this.prisma.executionRiskInterventionAction.delete({ where: { id: row.id } });
    return { deleted: true, actionCode };
  }

  // ── helpers ───────────────────────────────────────────────

  private async getDefinition(versionId: string, knowledgeCode: string) {
    const row = await this.requireDefinition(versionId, knowledgeCode);
    return {
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
    };
  }

  private async requireDefinition(versionId: string, knowledgeCode: string) {
    const row = await this.prisma.executionRiskDefinition.findFirst({
      where: { knowledgeVersionId: versionId, knowledgeCode },
    });
    if (!row) {
      throw new NotFoundException(`Definition ${knowledgeCode} not found in version ${versionId}`);
    }
    return row;
  }

  private async requireSeverityRule(versionId: string, ruleId: string) {
    const rows = await this.prisma.executionRiskSeverityRule.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { ruleId?: string };
      return payload.ruleId === ruleId || row.id.endsWith(`:${ruleId}`);
    });
    if (!match) {
      throw new NotFoundException(`Severity rule ${ruleId} not found in version ${versionId}`);
    }
    return match;
  }

  private async requireCausalChain(versionId: string, chainId: string) {
    const rows = await this.prisma.executionRiskCausalChain.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { chainId?: string };
      return payload.chainId === chainId || row.id.endsWith(`:${chainId}`);
    });
    if (!match) {
      throw new NotFoundException(`Causal chain ${chainId} not found in version ${versionId}`);
    }
    return match;
  }

  private async requireAction(versionId: string, actionCode: string) {
    const rows = await this.prisma.executionRiskInterventionAction.findMany({
      where: { knowledgeVersionId: versionId },
    });
    const match = rows.find((row) => {
      const payload = row.payload as { actionCode?: string };
      return payload.actionCode === actionCode || row.id.endsWith(`:${actionCode}`);
    });
    if (!match) {
      throw new NotFoundException(`Action ${actionCode} not found in version ${versionId}`);
    }
    return match;
  }

  private async ensureNoRule(versionId: string, ruleId: string) {
    try {
      await this.requireSeverityRule(versionId, ruleId);
      throw new ConflictException(`Severity rule ${ruleId} already exists`);
    } catch (e) {
      if (e instanceof NotFoundException) return;
      throw e;
    }
  }

  private async ensureNoChain(versionId: string, chainId: string) {
    try {
      await this.requireCausalChain(versionId, chainId);
      throw new ConflictException(`Causal chain ${chainId} already exists`);
    } catch (e) {
      if (e instanceof NotFoundException) return;
      throw e;
    }
  }

  private async ensureNoAction(versionId: string, actionCode: string) {
    try {
      await this.requireAction(versionId, actionCode);
      throw new ConflictException(`Action ${actionCode} already exists`);
    } catch (e) {
      if (e instanceof NotFoundException) return;
      throw e;
    }
  }

  private assertDefinitionBody(body: DefinitionUpsertBody) {
    if (!body.canonicalCode?.trim()) throw new BadRequestException('canonicalCode is required');
    if (!body.riskType?.trim()) throw new BadRequestException('riskType is required');
    if (!body.definition?.trim()) throw new BadRequestException('definition is required');
    if (body.displayName == null) throw new BadRequestException('displayName is required');
  }

  private assertSeverityBody(body: SeverityRuleUpsertBody) {
    if (!body.knowledgeCode?.trim()) throw new BadRequestException('knowledgeCode is required');
    if (!body.level?.trim()) throw new BadRequestException('level is required');
    if (!body.metric?.trim()) throw new BadRequestException('metric is required');
    if (!body.operator?.trim()) throw new BadRequestException('operator is required');
    if (!body.unit?.trim()) throw new BadRequestException('unit is required');
    if (body.priority == null || Number.isNaN(Number(body.priority))) {
      throw new BadRequestException('priority is required');
    }
    if (body.level.toUpperCase() !== 'RECOVERY' && mapSeverityRule(body as never) === null) {
      throw new BadRequestException(`Unmapped severity level: ${body.level}`);
    }
  }

  private assertChainBody(body: CausalChainUpsertBody) {
    if (!body.knowledgeCode?.trim()) throw new BadRequestException('knowledgeCode is required');
    if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
      throw new BadRequestException('nodes must be a non-empty array');
    }
    if (!Array.isArray(body.edges)) throw new BadRequestException('edges must be an array');
    const nodeIds = new Set(body.nodes.map((n) => n.nodeId));
    for (const edge of body.edges) {
      if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
        throw new BadRequestException('edges must reference existing nodeId values');
      }
    }
  }

  private assertActionBody(body: ActionUpsertBody) {
    if (!body.actionCategory?.trim()) throw new BadRequestException('actionCategory is required');
    if (body.name == null) throw new BadRequestException('name is required');
    if (!body.description?.trim()) throw new BadRequestException('description is required');
    if (!body.typicalUseCase?.trim()) throw new BadRequestException('typicalUseCase is required');
    if (!body.timeImpactMinRange) {
      throw new BadRequestException('timeImpactMinRange is required');
    }
    if (!Array.isArray(body.applicableRiskCodes)) {
      throw new BadRequestException('applicableRiskCodes must be an array');
    }
    if (!['YES', 'PARTIAL', 'NO'].includes(body.reversibility)) {
      throw new BadRequestException('reversibility must be YES|PARTIAL|NO');
    }
  }
}
