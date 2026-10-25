/**
 * System1 Runtime Console Admin API
 * Base: /api/agent/admin/system1
 * 文档: docs/system1-runtime-console-api.md
 */

import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { System1ConsoleService } from './system1-console.service';

@ApiTags('system1-console')
@Controller('agent/admin/system1')
export class System1ConsoleController {
  private readonly logger = new Logger(System1ConsoleController.name);

  constructor(private readonly console: System1ConsoleService) {}

  private async wrap<T>(fn: () => T | Promise<T>) {
    try {
      return successResponse(await fn());
    } catch (e: any) {
      const status = e?.status;
      if (status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, e.message);
      }
      this.logger.error(e?.message || e, e?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, e?.message || String(e));
    }
  }

  // —— 1 Dashboard ——
  @Public()
  @Get('dashboard/overview')
  @ApiOperation({ summary: 'System1 运行总览' })
  async overview() {
    return this.wrap(() => this.console.overview());
  }

  // —— 2 Run Trace ——
  @Public()
  @Get('runs')
  @ApiOperation({ summary: 'System1 Run 列表' })
  listRuns(@Query() query: Record<string, string>) {
    return this.wrap(() => this.console.listRuns(query));
  }

  @Public()
  @Get('runs/:runId')
  @ApiOperation({ summary: 'System1 Run 详情（时间线 X 光片）' })
  getRun(@Param('runId') runId: string) {
    return this.wrap(() => this.console.getRunDetail(runId));
  }

  @Public()
  @Post('runs/:runId/replay')
  @ApiOperation({ summary: 'Replay Sufficiency / Grounding' })
  replay(@Param('runId') runId: string) {
    return this.wrap(() => this.console.replay(runId));
  }

  // —— 3 TaskFrame ——
  @Public()
  @Get('task-frames')
  listTaskFrames(@Query() query: Record<string, string>) {
    return this.wrap(() => this.console.listTaskFrames(query));
  }

  @Public()
  @Get('task-frames/eval/summary')
  async taskFrameEval() {
    return this.wrap(() => this.console.taskFrameEvalSummary());
  }

  @Public()
  @Get('task-frames/:runId')
  getTaskFrame(@Param('runId') runId: string) {
    return this.wrap(async () => {
      const detail = await this.console.getRunDetail(runId);
      return {
        utterance: detail.utterance,
        unifiedIntent: detail.upstreamAlignment?.unifiedIntent,
        contract: detail.upstreamAlignment?.contract,
        taskFrame: detail.taskFrame,
        family: detail.projected?.family,
      };
    });
  }

  @Public()
  @Post('task-frames/:runId/labels')
  labelTaskFrame(
    @Param('runId') runId: string,
    @Body()
    body: { errors: string[]; noteZh?: string; expected?: object },
  ) {
    return this.wrap(() => this.console.labelTaskFrame(runId, body));
  }

  // —— 4 Evidence ——
  @Public()
  @Get('evidence')
  listEvidence(@Query() query: Record<string, string>) {
    return this.wrap(() => this.console.listEvidence(query));
  }

  @Public()
  @Get('evidence/:evidenceId')
  getEvidence(@Param('evidenceId') evidenceId: string) {
    return this.wrap(() => this.console.getEvidence(evidenceId));
  }

  // —— 5 Policies ——
  @Public()
  @Get('policies/required-evidence')
  async listPolicies() {
    return this.wrap(() => this.console.listPolicies());
  }

  @Public()
  @Get('policies/required-evidence/:scope/:scopeKey')
  getPolicy(
    @Param('scope') scope: string,
    @Param('scopeKey') scopeKey: string,
  ) {
    return this.wrap(() => this.console.getPolicy(scope, scopeKey));
  }

  @Public()
  @Post('policies/required-evidence/:scope/:scopeKey/simulate')
  simulatePolicy(
    @Body() body: { utterance?: string; claimPlan?: string[]; family?: string },
  ) {
    return this.wrap(() => this.console.simulatePolicy(body));
  }

  // —— 6 Claims ——
  @Public()
  @Get('claims')
  listClaims(@Query() query: Record<string, string>) {
    return this.wrap(() => this.console.listClaims(query));
  }

  @Public()
  @Get('claims/stats')
  async claimStats() {
    return this.wrap(() => this.console.claimStats());
  }

  // —— 7 Sufficiency ——
  @Public()
  @Get('sufficiency/cases')
  async sufficiencyCases() {
    return this.wrap(() => this.console.sufficiencyCases());
  }

  @Public()
  @Get('sufficiency/metrics')
  async sufficiencyMetrics() {
    return this.wrap(() => this.console.sufficiencyMetrics());
  }

  @Public()
  @Post('sufficiency/cases/:runId/labels')
  labelSufficiency(
    @Param('runId') runId: string,
    @Body()
    body: {
      label: 'FALSE_SUFFICIENT' | 'FALSE_INSUFFICIENT' | 'CORRECT';
      expectedSufficiency?: string;
      noteZh?: string;
    },
  ) {
    return this.wrap(() => this.console.labelSufficiency(runId, body));
  }

  // —— 8 Gaps ——
  @Public()
  @Get('gaps')
  async listGaps() {
    return this.wrap(() => this.console.listGaps());
  }

  @Public()
  @Patch('gaps/:gapId')
  patchGap(@Param('gapId') gapId: string, @Body() body: Record<string, unknown>) {
    return this.wrap(() => this.console.patchGap(gapId, body));
  }

  // —— 9 Eval ——
  @Public()
  @Get('eval/golden-cases')
  async goldenCases() {
    return this.wrap(() => this.console.goldenCases());
  }

  @Public()
  @Post('eval/golden-cases/run')
  async runGolden() {
    return this.wrap(() => this.console.runGoldenEval());
  }

  @Public()
  @Get('eval/metrics')
  async evalMetrics() {
    return this.wrap(() => this.console.evalMetrics());
  }

  // —— 10 Authority ——
  @Public()
  @Get('authority/policy')
  async authorityPolicy() {
    return this.wrap(() => this.console.authorityPolicy());
  }

  @Public()
  @Get('authority/violations')
  async violations() {
    return this.wrap(() => this.console.listViolations());
  }

  @Public()
  @Patch('authority/violations/:violationId')
  patchViolation(
    @Param('violationId') violationId: string,
    @Body() body: { status: 'OPEN' | 'FIXED' | 'IGNORED' },
  ) {
    return this.wrap(() => this.console.patchViolation(violationId, body));
  }

  // —— 11 Tools ——
  @Public()
  @Get('tools/evidence-matrix')
  async toolMatrix() {
    return this.wrap(() => this.console.toolMatrix());
  }

  @Public()
  @Put('tools/evidence-matrix/:toolId')
  upsertTool(
    @Param('toolId') toolId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.wrap(() => this.console.upsertTool(toolId, body));
  }

  @Public()
  @Post('tools/evidence-matrix/validate')
  validateTool(@Body() body: { toolId: string; claimType: string }) {
    return this.wrap(() => this.console.validateTool(body));
  }

  // —— 12 Feedback ——
  @Public()
  @Get('feedback')
  async listFeedback() {
    return this.wrap(() => this.console.listFeedback());
  }

  @Public()
  @Post('feedback')
  addFeedback(
    @Body()
    body: {
      runId: string;
      rating?: number;
      thumbs?: 'UP' | 'DOWN';
      category?: string;
      commentZh?: string;
    },
  ) {
    return this.wrap(() => this.console.addFeedback(body));
  }

  @Public()
  @Post('feedback/:feedbackId/diagnose')
  diagnose(
    @Param('feedbackId') feedbackId: string,
    @Body() body: { issueCode: string; details?: object },
  ) {
    return this.wrap(() => this.console.diagnoseFeedback(feedbackId, body));
  }

  @Public()
  @Post('feedback/:feedbackId/replay')
  replayFeedback(@Param('feedbackId') feedbackId: string) {
    return this.wrap(() => this.console.replayFeedback(feedbackId));
  }
}
