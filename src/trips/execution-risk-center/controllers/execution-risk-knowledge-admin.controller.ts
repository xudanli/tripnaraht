import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../../../admin/guards/admin-strict-auth.guard';
import { AdminActivityLogService } from '../../../admin/services/admin-activity-log.service';
import { successResponse, errorResponse, ErrorCode } from '../../../common/dto/standard-response.dto';
import {
  ExecutionRiskKnowledgeAdminService,
  type ActivateKnowledgeBody,
  type ImportKnowledgeBody,
  type ValidateKnowledgeBody,
} from '../services/execution-risk-knowledge-admin.service';
import {
  ExecutionRiskKnowledgeAdminDraftService,
  type ActionUpsertBody,
  type CausalChainUpsertBody,
  type DefinitionUpsertBody,
  type SeverityRuleUpsertBody,
} from '../services/execution-risk-knowledge-admin-draft.service';
import {
  ExecutionRiskConstraintBindingService,
  type ConstraintBindingBody,
} from '../services/execution-risk-constraint-binding.service';

@ApiTags('execution-risk-knowledge-admin')
@Controller('admin/execution-risk/knowledge')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class ExecutionRiskKnowledgeAdminController {
  private readonly logger = new Logger(ExecutionRiskKnowledgeAdminController.name);

  constructor(
    private readonly admin: ExecutionRiskKnowledgeAdminService,
    private readonly draft: ExecutionRiskKnowledgeAdminDraftService,
    private readonly bindings: ExecutionRiskConstraintBindingService,
    private readonly audit: AdminActivityLogService,
  ) {}

  // ── Versions ──────────────────────────────────────────────

  @Get('field-catalog')
  @ApiOperation({
    summary: '字段目录（与研究表对齐 + 中文含义，供后台表格表头/列说明）',
  })
  async getFieldCatalog() {
    try {
      return successResponse(await this.admin.getFieldCatalog());
    } catch (e) {
      return this.handleError(e, 'getFieldCatalog');
    }
  }

  // ── Risk ↔ Constraint bindings ────────────────────────────

  @Get('constraint-bindings')
  @ApiOperation({ summary: '风险↔约束映射列表（含中文列标签）' })
  async listConstraintBindings(
    @Query('knowledgeCode') knowledgeCode?: string,
    @Query('knowledgeVersionId') knowledgeVersionId?: string,
    @Query('includeGlobal') includeGlobal?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.bindings.list({
          knowledgeCode,
          knowledgeVersionId,
          includeGlobal: includeGlobal !== 'false' && includeGlobal !== '0',
          status,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listConstraintBindings');
    }
  }

  @Get('constraint-bindings/resolve')
  @ApiOperation({ summary: '按风险码+门禁级别解析应挂接的约束' })
  async resolveConstraintBinding(
    @Query('knowledgeCode') knowledgeCode: string,
    @Query('severityLevel') severityLevel?: string,
  ) {
    try {
      if (!knowledgeCode?.trim()) {
        throw new BadRequestException('knowledgeCode is required');
      }
      return successResponse(
        await this.bindings.resolve({ knowledgeCode, severityLevel }),
      );
    } catch (e) {
      return this.handleError(e, 'resolveConstraintBinding');
    }
  }

  @Get('constraint-bindings/templates')
  @ApiOperation({
    summary: '约束模板目录（下拉真源；与运行时/seed constraintTemplateId 一致）',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'ENABLED（默认）/ DISABLED / DEPRECATED / all',
  })
  @ApiQuery({ name: 'constraintCategory', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'includeUsageCount',
    required: false,
    description: '默认 true；传 0/false 跳过引用计数',
  })
  async listConstraintTemplates(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('constraintCategory') constraintCategory?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('includeUsageCount') includeUsageCount?: string,
  ) {
    try {
      return successResponse(
        await this.bindings.listTemplates({
          q,
          status,
          constraintCategory,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          includeUsageCount: includeUsageCount !== '0' && includeUsageCount !== 'false',
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listConstraintTemplates');
    }
  }

  @Get('constraint-bindings/templates/:templateId')
  @ApiOperation({ summary: '约束模板详情（含 usageCount）' })
  @ApiParam({ name: 'templateId', description: '如 c_official_is_wind_safety' })
  async getConstraintTemplate(@Param('templateId') templateId: string) {
    try {
      return successResponse(await this.bindings.getTemplate(templateId));
    } catch (e) {
      return this.handleError(e, 'getConstraintTemplate');
    }
  }

  @Post('constraint-bindings/seed-defaults')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '导入默认风险↔约束种子映射（已存在则跳过）' })
  async seedConstraintBindings(@Req() req: Request) {
    try {
      const data = await this.bindings.seedDefaults();
      await this.auditWrite(req, 'POST', 'constraint-bindings.seed', data);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'seedConstraintBindings');
    }
  }

  @Post('constraint-bindings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新建风险↔约束映射' })
  async createConstraintBinding(
    @Body() body: ConstraintBindingBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.bindings.create(body);
      await this.auditWrite(req, 'POST', 'constraint-bindings.create', { id: data.id });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'createConstraintBinding');
    }
  }

  @Get('constraint-bindings/:id')
  @ApiOperation({ summary: '风险↔约束映射详情' })
  async getConstraintBinding(@Param('id') id: string) {
    try {
      return successResponse(await this.bindings.get(id));
    } catch (e) {
      return this.handleError(e, 'getConstraintBinding');
    }
  }

  @Put('constraint-bindings/:id')
  @ApiOperation({ summary: '全量更新风险↔约束映射' })
  async putConstraintBinding(
    @Param('id') id: string,
    @Body() body: ConstraintBindingBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.bindings.put(id, body);
      await this.auditWrite(req, 'PUT', 'constraint-bindings.put', { id });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'putConstraintBinding');
    }
  }

  @Patch('constraint-bindings/:id')
  @ApiOperation({ summary: '部分更新风险↔约束映射' })
  async patchConstraintBinding(
    @Param('id') id: string,
    @Body() body: Partial<ConstraintBindingBody>,
    @Req() req: Request,
  ) {
    try {
      const data = await this.bindings.patch(id, body);
      await this.auditWrite(req, 'PATCH', 'constraint-bindings.patch', { id });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'patchConstraintBinding');
    }
  }

  @Delete('constraint-bindings/:id')
  @ApiOperation({ summary: '删除风险↔约束映射' })
  async deleteConstraintBinding(@Param('id') id: string, @Req() req: Request) {
    try {
      const data = await this.bindings.remove(id);
      await this.auditWrite(req, 'DELETE', 'constraint-bindings.delete', { id });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deleteConstraintBinding');
    }
  }

  @Get('versions')
  @ApiOperation({ summary: '知识版本列表' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listVersions(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.admin.listVersions({
          status,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listVersions');
    }
  }

  @Get('versions/active')
  @ApiOperation({ summary: '当前激活知识版本（无则 package 回退信息）' })
  async getActiveVersion() {
    try {
      return successResponse(await this.admin.getActiveVersion());
    } catch (e) {
      return this.handleError(e, 'getActiveVersion');
    }
  }

  @Get('versions/:versionId')
  @ApiOperation({ summary: '知识版本详情' })
  @ApiParam({ name: 'versionId' })
  async getVersion(@Param('versionId') versionId: string) {
    try {
      return successResponse(await this.admin.getVersion(versionId));
    } catch (e) {
      return this.handleError(e, 'getVersion');
    }
  }

  @Post('versions/import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从 Package 导入新知识版本（默认 DRAFT，不自动激活）' })
  async importVersion(@Body() body: ImportKnowledgeBody, @Req() req: Request) {
    try {
      const data = await this.admin.importFromPackage(body ?? {});
      await this.auditWrite(req, 'POST', 'import', { versionId: data.versionId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'importVersion');
    }
  }

  @Post('versions/:versionId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '结构校验；可选 smoke harness（runHarness=true）；通过则标记 VALIDATED',
  })
  async validateVersion(
    @Param('versionId') versionId: string,
    @Body() body: ValidateKnowledgeBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.admin.validateVersion(versionId, body ?? {});
      await this.auditWrite(req, 'POST', 'validate', {
        versionId,
        valid: data.valid,
        harnessRan: data.harnessSummary && 'ran' in data.harnessSummary
          ? (data.harnessSummary as { ran: boolean }).ran
          : false,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'validateVersion');
    }
  }

  @Post('versions/:versionId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '激活知识版本（默认跑 smoke harness；skipHarnessGate=true 可跳过，需审计）',
  })
  async activateVersion(
    @Param('versionId') versionId: string,
    @Body() body: ActivateKnowledgeBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.admin.activateVersion(versionId, body ?? {});
      await this.auditWrite(req, 'POST', 'activate', {
        versionId,
        skipHarnessGate: body?.skipHarnessGate === true,
        previousActiveVersionId: data.previousActiveVersionId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'activateVersion');
    }
  }

  @Post('versions/:versionId/deprecate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '废弃知识版本' })
  @ApiQuery({ name: 'force', required: false, description: '允许废弃当前 active' })
  async deprecateVersion(
    @Param('versionId') versionId: string,
    @Query('force') force?: string,
    @Req() req?: Request,
  ) {
    try {
      const data = await this.admin.deprecateVersion(
        versionId,
        force === 'true' || force === '1',
      );
      if (req) await this.auditWrite(req, 'POST', 'deprecate', { versionId, force: !!force });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deprecateVersion');
    }
  }

  // ── Definitions ───────────────────────────────────────────

  @Get('versions/:versionId/definitions')
  @ApiOperation({ summary: '风险定义列表' })
  async listDefinitions(
    @Param('versionId') versionId: string,
    @Query('riskType') riskType?: string,
    @Query('isRootCause') isRootCause?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.admin.listDefinitions(versionId, {
          riskType,
          isRootCause:
            isRootCause === undefined
              ? undefined
              : isRootCause === 'true' || isRootCause === '1',
          q,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listDefinitions');
    }
  }

  @Post('versions/:versionId/definitions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新增风险定义（仅 DRAFT）' })
  async createDefinition(
    @Param('versionId') versionId: string,
    @Body() body: DefinitionUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.createDefinition(versionId, body);
      await this.auditWrite(req, 'POST', 'definition.create', {
        versionId,
        knowledgeCode: data.knowledgeCode,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'createDefinition');
    }
  }

  @Get('versions/:versionId/definitions/:knowledgeCode')
  @ApiOperation({ summary: '风险定义详情' })
  async getDefinition(
    @Param('versionId') versionId: string,
    @Param('knowledgeCode') knowledgeCode: string,
  ) {
    try {
      return successResponse(await this.admin.getDefinition(versionId, knowledgeCode));
    } catch (e) {
      return this.handleError(e, 'getDefinition');
    }
  }

  @Put('versions/:versionId/definitions/:knowledgeCode')
  @ApiOperation({ summary: '全量替换风险定义（仅 DRAFT）' })
  async putDefinition(
    @Param('versionId') versionId: string,
    @Param('knowledgeCode') knowledgeCode: string,
    @Body() body: DefinitionUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.putDefinition(versionId, knowledgeCode, body);
      await this.auditWrite(req, 'PUT', 'definition.put', { versionId, knowledgeCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'putDefinition');
    }
  }

  @Patch('versions/:versionId/definitions/:knowledgeCode')
  @ApiOperation({ summary: '部分更新风险定义（仅 DRAFT）' })
  async patchDefinition(
    @Param('versionId') versionId: string,
    @Param('knowledgeCode') knowledgeCode: string,
    @Body() body: Partial<DefinitionUpsertBody>,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.patchDefinition(versionId, knowledgeCode, body);
      await this.auditWrite(req, 'PATCH', 'definition.patch', { versionId, knowledgeCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'patchDefinition');
    }
  }

  @Delete('versions/:versionId/definitions/:knowledgeCode')
  @ApiOperation({ summary: '删除风险定义（仅 DRAFT）' })
  async deleteDefinition(
    @Param('versionId') versionId: string,
    @Param('knowledgeCode') knowledgeCode: string,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.deleteDefinition(versionId, knowledgeCode);
      await this.auditWrite(req, 'DELETE', 'definition.delete', { versionId, knowledgeCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deleteDefinition');
    }
  }

  // ── Severity rules ────────────────────────────────────────

  @Get('versions/:versionId/severity-rules')
  @ApiOperation({ summary: '阈值规则列表' })
  async listSeverityRules(
    @Param('versionId') versionId: string,
    @Query('knowledgeCode') knowledgeCode?: string,
    @Query('level') level?: string,
    @Query('metric') metric?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.admin.listSeverityRules(versionId, {
          knowledgeCode,
          level,
          metric,
          q,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listSeverityRules');
    }
  }

  @Post('versions/:versionId/severity-rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新增阈值规则（仅 DRAFT）' })
  async createSeverityRule(
    @Param('versionId') versionId: string,
    @Body() body: SeverityRuleUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.createSeverityRule(versionId, body);
      await this.auditWrite(req, 'POST', 'severity.create', {
        versionId,
        ruleId: (data as { ruleId?: string }).ruleId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'createSeverityRule');
    }
  }

  @Get('versions/:versionId/severity-rules/:ruleId')
  @ApiOperation({ summary: '阈值规则详情' })
  async getSeverityRule(
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
  ) {
    try {
      return successResponse(await this.admin.getSeverityRule(versionId, ruleId));
    } catch (e) {
      return this.handleError(e, 'getSeverityRule');
    }
  }

  @Put('versions/:versionId/severity-rules/:ruleId')
  @ApiOperation({ summary: '全量替换阈值规则（仅 DRAFT）' })
  async putSeverityRule(
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: SeverityRuleUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.putSeverityRule(versionId, ruleId, body);
      await this.auditWrite(req, 'PUT', 'severity.put', { versionId, ruleId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'putSeverityRule');
    }
  }

  @Patch('versions/:versionId/severity-rules/:ruleId')
  @ApiOperation({ summary: '部分更新阈值规则（仅 DRAFT）' })
  async patchSeverityRule(
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: Partial<SeverityRuleUpsertBody>,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.patchSeverityRule(versionId, ruleId, body);
      await this.auditWrite(req, 'PATCH', 'severity.patch', { versionId, ruleId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'patchSeverityRule');
    }
  }

  @Delete('versions/:versionId/severity-rules/:ruleId')
  @ApiOperation({ summary: '删除阈值规则（仅 DRAFT）' })
  async deleteSeverityRule(
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.deleteSeverityRule(versionId, ruleId);
      await this.auditWrite(req, 'DELETE', 'severity.delete', { versionId, ruleId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deleteSeverityRule');
    }
  }

  // ── Causal chains ─────────────────────────────────────────

  @Get('versions/:versionId/causal-chains')
  @ApiOperation({ summary: '因果链列表' })
  async listCausalChains(
    @Param('versionId') versionId: string,
    @Query('knowledgeCode') knowledgeCode?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.admin.listCausalChains(versionId, {
          knowledgeCode,
          q,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listCausalChains');
    }
  }

  @Post('versions/:versionId/causal-chains')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新增因果链（仅 DRAFT）' })
  async createCausalChain(
    @Param('versionId') versionId: string,
    @Body() body: CausalChainUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.createCausalChain(versionId, body);
      await this.auditWrite(req, 'POST', 'chain.create', {
        versionId,
        chainId: (data as { chainId?: string }).chainId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'createCausalChain');
    }
  }

  @Get('versions/:versionId/causal-chains/:chainId')
  @ApiOperation({ summary: '因果链详情' })
  async getCausalChain(
    @Param('versionId') versionId: string,
    @Param('chainId') chainId: string,
  ) {
    try {
      return successResponse(await this.admin.getCausalChain(versionId, chainId));
    } catch (e) {
      return this.handleError(e, 'getCausalChain');
    }
  }

  @Put('versions/:versionId/causal-chains/:chainId')
  @ApiOperation({ summary: '全量替换因果链（仅 DRAFT）' })
  async putCausalChain(
    @Param('versionId') versionId: string,
    @Param('chainId') chainId: string,
    @Body() body: CausalChainUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.putCausalChain(versionId, chainId, body);
      await this.auditWrite(req, 'PUT', 'chain.put', { versionId, chainId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'putCausalChain');
    }
  }

  @Patch('versions/:versionId/causal-chains/:chainId')
  @ApiOperation({ summary: '部分更新因果链（仅 DRAFT）' })
  async patchCausalChain(
    @Param('versionId') versionId: string,
    @Param('chainId') chainId: string,
    @Body() body: Partial<CausalChainUpsertBody>,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.patchCausalChain(versionId, chainId, body);
      await this.auditWrite(req, 'PATCH', 'chain.patch', { versionId, chainId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'patchCausalChain');
    }
  }

  @Delete('versions/:versionId/causal-chains/:chainId')
  @ApiOperation({ summary: '删除因果链（仅 DRAFT）' })
  async deleteCausalChain(
    @Param('versionId') versionId: string,
    @Param('chainId') chainId: string,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.deleteCausalChain(versionId, chainId);
      await this.auditWrite(req, 'DELETE', 'chain.delete', { versionId, chainId });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deleteCausalChain');
    }
  }

  // ── Actions ───────────────────────────────────────────────

  @Get('versions/:versionId/actions')
  @ApiOperation({ summary: '干预动作列表' })
  async listActions(
    @Param('versionId') versionId: string,
    @Query('actionCategory') actionCategory?: string,
    @Query('applicableRiskCode') applicableRiskCode?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return successResponse(
        await this.admin.listActions(versionId, {
          actionCategory,
          applicableRiskCode,
          q,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e, 'listActions');
    }
  }

  @Post('versions/:versionId/actions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新增干预动作（仅 DRAFT）' })
  async createAction(
    @Param('versionId') versionId: string,
    @Body() body: ActionUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.createAction(versionId, body);
      await this.auditWrite(req, 'POST', 'action.create', {
        versionId,
        actionCode: (data as { actionCode?: string }).actionCode,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'createAction');
    }
  }

  @Get('versions/:versionId/actions/:actionCode')
  @ApiOperation({ summary: '干预动作详情' })
  async getAction(
    @Param('versionId') versionId: string,
    @Param('actionCode') actionCode: string,
  ) {
    try {
      return successResponse(await this.admin.getAction(versionId, actionCode));
    } catch (e) {
      return this.handleError(e, 'getAction');
    }
  }

  @Put('versions/:versionId/actions/:actionCode')
  @ApiOperation({ summary: '全量替换干预动作（仅 DRAFT）' })
  async putAction(
    @Param('versionId') versionId: string,
    @Param('actionCode') actionCode: string,
    @Body() body: ActionUpsertBody,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.putAction(versionId, actionCode, body);
      await this.auditWrite(req, 'PUT', 'action.put', { versionId, actionCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'putAction');
    }
  }

  @Patch('versions/:versionId/actions/:actionCode')
  @ApiOperation({ summary: '部分更新干预动作（仅 DRAFT）' })
  async patchAction(
    @Param('versionId') versionId: string,
    @Param('actionCode') actionCode: string,
    @Body() body: Partial<ActionUpsertBody>,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.patchAction(versionId, actionCode, body);
      await this.auditWrite(req, 'PATCH', 'action.patch', { versionId, actionCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'patchAction');
    }
  }

  @Delete('versions/:versionId/actions/:actionCode')
  @ApiOperation({ summary: '删除干预动作（仅 DRAFT）' })
  async deleteAction(
    @Param('versionId') versionId: string,
    @Param('actionCode') actionCode: string,
    @Req() req: Request,
  ) {
    try {
      const data = await this.draft.deleteAction(versionId, actionCode);
      await this.auditWrite(req, 'DELETE', 'action.delete', { versionId, actionCode });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e, 'deleteAction');
    }
  }

  private actor(req: Request): string {
    const u = (req as { user?: { userId?: string; email?: string } }).user;
    return String(u?.userId ?? u?.email ?? 'unknown');
  }

  private async auditWrite(
    req: Request,
    method: string,
    action: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actor: this.actor(req),
      path: `/api/admin/execution-risk/knowledge/${action}`,
      method,
      meta,
    });
  }

  private handleError(error: unknown, op: string): ReturnType<typeof errorResponse> {
    if (error instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message);
    }
    if (error instanceof ConflictException) {
      return errorResponse(ErrorCode.CONFLICT, error.message);
    }
    if (error instanceof BadRequestException) {
      const res = error.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res && 'message' in res
            ? String((res as { message: unknown }).message)
            : error.message;
      return errorResponse(ErrorCode.VALIDATION_ERROR, message);
    }
    if (error instanceof UnprocessableEntityException) {
      const msg = error.message;
      const code = msg.includes('HARNESS_GATE_FAILED')
        ? ErrorCode.BUSINESS_ERROR
        : ErrorCode.BUSINESS_ERROR;
      return errorResponse(code, msg);
    }
    const err = error as Error;
    this.logger.error(`[${op}] ${err.message}`, err.stack);
    return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
  }
}
