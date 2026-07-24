import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import {
  CreateExplorationScenarioDto,
  GenerateExplorationCandidatesDto,
  PutExplorationPrinciplesDto,
  RouteSelectionDto,
  RunExplorationCheckDto,
  SubmitExplorationDecisionDto,
} from './dto/exploration.dto';
import { SubmitPackageFeedbackDto } from './dto/exploration-continue.dto';
import { PatchExplorationConditionsDto } from './dto/exploration-conditions.dto';
import { ExplorationOrchestratorService } from './services/exploration-orchestrator.service';
import { ExplorationPackageService } from './services/exploration-package.service';
import { ExplorationScenarioService } from './services/exploration-scenario.service';
import { ExplorationConditionsService } from './services/exploration-conditions.service';
import { TravelDecisionContractPrincipleMappingService } from './services/travel-decision-contract-principle-mapping.service';
import { ExplorationPrincipleSummaryService } from './services/exploration-principle-summary.service';

@ApiTags('exploration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exploration')
export class ExplorationController {
  constructor(
    private readonly scenarios: ExplorationScenarioService,
    private readonly conditions: ExplorationConditionsService,
    private readonly orchestrator: ExplorationOrchestratorService,
    private readonly principleMapping: TravelDecisionContractPrincipleMappingService,
    private readonly principleSummary: ExplorationPrincipleSummaryService,
    private readonly packages: ExplorationPackageService,
  ) {}

  @Get('conditions/catalog')
  @ApiOperation({ summary: '旅行条件枚举 — 车辆 / 预算预设（按目的地）' })
  getConditionsCatalog(@Query('destinationCode') destinationCode?: string) {
    return successResponse(this.conditions.getCatalog(destinationCode));
  }

  @Post('scenarios')
  @ApiOperation({ summary: '创建探索 Scenario（Consumer 或 Research 模式）' })
  async createScenario(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateExplorationScenarioDto,
  ) {
    const { scenario, sessionId, lockedFields, conditions } = await this.scenarios.create(
      user.userId,
      body,
    );
    return successResponse({
      scenarioId: scenario.scenarioId,
      sessionId,
      tripId: scenario.tripId,
      materializationStatus: scenario.status,
      assignedVariant: scenario.assignedVariant,
      researchProtocolId: scenario.researchProtocolId,
      lockedFields,
      scenario: conditions,
    });
  }

  @Get('scenarios/:scenarioId')
  @ApiOperation({ summary: '获取 Scenario 详情（含 lockedFields / 旅行条件 / 候选状态）' })
  async getScenario(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const detail = await this.scenarios.getDetail(user.userId, scenarioId);
    const candidatesStatus = await this.orchestrator.getCandidatesStatus(scenarioId);
    return successResponse({ ...detail, candidatesStatus });
  }

  @Patch('scenarios/:scenarioId/conditions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新旅行条件（DRAFT 或物化后未选路；变更后 invalidate 候选）' })
  async patchConditions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: PatchExplorationConditionsDto,
  ) {
    const result = await this.scenarios.patchConditions(user.userId, scenarioId, body);
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/materialize')
  @ApiOperation({ summary: '物化 Canonical Trip（幂等）' })
  async materialize(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.orchestrator.materialize(user.userId, scenarioId);
    return successResponse(result);
  }

  @Get('principles/catalog')
  @ApiOperation({ summary: 'Consumer Principle 卡片目录' })
  async listPrinciples() {
    return successResponse(this.principleMapping.listConsumerPrincipleCards());
  }

  @Put('scenarios/:scenarioId/principles')
  @ApiOperation({ summary: '保存旅行原则（lazy materialize + 写入 Contract）' })
  async savePrinciples(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: PutExplorationPrinciplesDto,
  ) {
    const result = await this.orchestrator.savePrinciples(user.userId, scenarioId, body);
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/principles/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览旅行原则智能总结（不落库；空原则返回 placeholder）' })
  async previewPrinciplesSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: PutExplorationPrinciplesDto,
  ) {
    const result = await this.principleSummary.previewSummary(
      user.userId,
      scenarioId,
      body.principles ?? [],
    );
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/candidates')
  @ApiOperation({ summary: '生成或装配路线候选（含 map 轻量 preview）' })
  async generateCandidates(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: GenerateExplorationCandidatesDto,
  ) {
    const result = await this.orchestrator.generateCandidates(user.userId, scenarioId, body);
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/candidates/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新生成路线候选（原则/条件变更后；已选路则拒绝）' })
  async regenerateCandidates(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.orchestrator.regenerateCandidates(user.userId, scenarioId);
    return successResponse(result);
  }

  @Get('scenarios/:scenarioId/candidates/compare')
  @ApiOperation({ summary: '获取路线比较视图' })
  async compareCandidates(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.orchestrator.generateCandidates(user.userId, scenarioId, {});
    return successResponse({
      candidates: result.candidates,
      generationVersion: result.generationVersion,
      generationMode: result.generationMode,
      dimensions: result.dimensions,
    });
  }

  @Post('scenarios/:scenarioId/selections')
  @ApiOperation({ summary: '选择路线并记录研究数据' })
  async selectRoute(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: RouteSelectionDto,
  ) {
    const result = await this.orchestrator.selectRoute(user.userId, scenarioId, body);
    return successResponse(result);
  }

  @Get('scenarios/:scenarioId/routes/:routeId')
  @ApiOperation({ summary: '路线详情 — 每日锚点 + 地图几何（mainLine / fRoadLine）' })
  async getRouteDetail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Param('routeId') routeId: string,
  ) {
    const result = await this.orchestrator.getRouteDetail(user.userId, scenarioId, routeId);
    return successResponse(result);
  }

  @Get('scenarios/:scenarioId/issues')
  @ApiOperation({ summary: '获取 C 端问题视图（Unified ReadModel 投影）' })
  async listIssues(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.orchestrator.listIssues(user.userId, scenarioId);
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/check')
  @ApiOperation({ summary: '运行 Canonical 可执行性检查' })
  async runCheck(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: RunExplorationCheckDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orchestrator.runCheck(
      user.userId,
      scenarioId,
      body.async === true,
    );
    if (result.mode === 'async') {
      res.status(HttpStatus.ACCEPTED);
      return successResponse(result);
    }
    return successResponse(result);
  }

  @Get('check-jobs/:jobId')
  @ApiOperation({ summary: '轮询可执行性检查任务' })
  async getCheckJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const payload = await this.orchestrator.getCheckJob(user.userId, jobId);
    return successResponse(payload);
  }

  @Get('scenarios/:scenarioId/issues/:issueId/options')
  @ApiOperation({ summary: '获取 C 端修复方案（代理 Decision Gateway options）' })
  async getRepairOptions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Param('issueId') issueId: string,
  ) {
    const result = await this.orchestrator.getRepairOptions(
      user.userId,
      scenarioId,
      issueId,
    );
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/decisions/:problemId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交决策方案（代理 Unified Decision Gateway）' })
  async submitDecision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Param('problemId') problemId: string,
    @Body() body: SubmitExplorationDecisionDto,
  ) {
    const result = await this.orchestrator.submitDecision(
      user.userId,
      scenarioId,
      problemId,
      body,
    );
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/decisions/:problemId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '应用决策方案并返回重新验证摘要' })
  async applyDecision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Param('problemId') problemId: string,
  ) {
    const result = await this.orchestrator.applyDecision(
      user.userId,
      scenarioId,
      problemId,
    );
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/revalidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新验证行程（Canonical validate + 问题列表）' })
  async revalidate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.orchestrator.revalidate(user.userId, scenarioId);
    return successResponse(result);
  }

  @Get('scenarios/:scenarioId/continue/packages')
  @ApiOperation({ summary: 'Sprint 4A — 商品包装卡（拉丁方/随机顺序）' })
  async getContinuePackages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    const result = await this.packages.getPackagePresentation(user.userId, scenarioId);
    return successResponse(result);
  }

  @Post('scenarios/:scenarioId/continue/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4A — 提交价值/信任评分、排序与可接受价格' })
  async submitPackageFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() body: SubmitPackageFeedbackDto,
  ) {
    const result = await this.packages.submitPackageFeedback(user.userId, scenarioId, body);
    return successResponse(result);
  }
}
