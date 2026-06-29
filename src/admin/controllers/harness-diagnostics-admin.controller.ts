/**
 * 内部诊断：Harness 影子指标 + Shadow Grader 聚合快照。
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { HarnessShadowMetricsCollector } from '../../decision/kernel/harness-shadow-metrics.collector';
import { HarnessShadowGraderService } from '../../agent/training/services/harness-shadow-grader.service';
import { ShadowDeploymentWorkflowService } from '../../agent/training/services/shadow-deployment-workflow.service';
import { AgenticTokenQuotaService } from '../../agent/services/agentic-token-quota.service';
import { HarnessCostDiagnosticsService } from '../../agent/services/harness-cost-diagnostics.service';
import { HarnessQualityLoopDiagnosticsService } from '../../agent/services/harness-quality-loop-diagnostics.service';
import { HarnessLlmRoutingDiagnosticsService } from '../../agent/services/harness-llm-routing-diagnostics.service';
import { buildHarnessShadowHarnessAdminSnapshot } from '../../harness/eval/quality/harness-shadow-harness-diagnostics.util';
import {
  buildHarnessAdminDiagnosticsSnapshot,
  type HarnessAdminDiagnosticsSnapshot,
} from '../utils/harness-admin-diagnostics.util';

class RegisterShadowGraderAdapterDto {
  task_id!: string;
  adapter_path!: string;
  vllm_adapter_name?: string;
  baseline_production_version?: string;
}

@ApiTags('Admin - Diagnostics')
@Controller('admin/diagnostics')
export class HarnessDiagnosticsAdminController {
  constructor(
    private readonly harnessShadowMetrics: HarnessShadowMetricsCollector,
    @Optional() private readonly harnessShadowGrader?: HarnessShadowGraderService,
    @Optional() private readonly shadowDeployment?: ShadowDeploymentWorkflowService,
    @Optional() private readonly agenticTokenQuota?: AgenticTokenQuotaService,
    @Optional() private readonly harnessCostDiagnostics?: HarnessCostDiagnosticsService,
    @Optional() private readonly harnessQualityLoop?: HarnessQualityLoopDiagnosticsService,
    @Optional() private readonly harnessLlmRouting?: HarnessLlmRoutingDiagnosticsService,
  ) {}

  @Public()
  @Get('harness')
  @ApiOperation({
    summary: 'Harness 诊断快照（shadow checks + shadow grader 聚合）',
    description:
      '需 `ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1` 与 `ADMIN_DIAGNOSTICS_TOKEN`；Header 见控制器文件头注释。',
  })
  async getHarnessSnapshot(
    @Req() req: Request,
    @Headers('x-tripnara-admin-diagnostics-token') headerToken?: string,
  ): Promise<HarnessAdminDiagnosticsSnapshot> {
    this.assertDiagnosticsAuthorized(req, headerToken);
    const costHistory = (await this.harnessCostDiagnostics?.buildCostHistorySnapshot(7)) ?? null;
    const llmRouting = (await this.harnessLlmRouting?.buildAdminSnapshot?.(7)) ?? null;
    return buildHarnessAdminDiagnosticsSnapshot({
      harness: this.harnessShadowMetrics.getSnapshot(),
      shadowGrader: this.harnessShadowGrader?.buildAdminDiagnosticsSnapshot?.() ?? null,
      costGovernance: this.agenticTokenQuota?.getAdminDiagnosticsSnapshot?.() ?? null,
      costHistory,
      qualityLoop: this.harnessQualityLoop?.buildSnapshot?.() ?? null,
      shadowHarness: buildHarnessShadowHarnessAdminSnapshot({
        metrics: this.harnessShadowMetrics.getSnapshot(),
      }),
      llmRouting,
    });
  }

  @Public()
  @Post('harness/shadow-grader/register')
  @ApiOperation({
    summary: 'Ops：注册 ACTIVE shadow adapter（供 Shadow Grader 在线评测）',
    description:
      '需 `ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1` 与 `ADMIN_DIAGNOSTICS_TOKEN`；与 flywheel 自动注册等价，可手工上线评测候选。',
  })
  async registerShadowGraderAdapter(
    @Req() req: Request,
    @Headers('x-tripnara-admin-diagnostics-token') headerToken: string | undefined,
    @Body() body: RegisterShadowGraderAdapterDto,
  ) {
    this.assertDiagnosticsAuthorized(req, headerToken);
    if (!this.shadowDeployment) {
      throw new NotFoundException('ShadowDeploymentWorkflowService not available');
    }
    const taskId = body.task_id?.trim();
    const adapterPath = body.adapter_path?.trim();
    if (!taskId || !adapterPath) {
      throw new BadRequestException('task_id and adapter_path are required');
    }
    const result = await this.shadowDeployment.registerShadowAdapter({
      taskId,
      adapterPath,
      routingStrategy: 'SHADOW_GRADER_ONLY',
      vllmAdapterName: body.vllm_adapter_name?.trim() || undefined,
      baselineProductionVersion: body.baseline_production_version?.trim() || undefined,
    });
    const snapshot = this.harnessShadowGrader?.buildAdminDiagnosticsSnapshot?.() ?? null;
    return {
      success: true,
      shadow_version: result.shadowVersion,
      lora_loaded: result.loraLoaded,
      ops_readiness: snapshot?.ops_readiness ?? null,
    };
  }

  private assertDiagnosticsAuthorized(req: Request, headerToken?: string): void {
    if (process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED !== '1') {
      throw new NotFoundException();
    }
    const expected = process.env.ADMIN_DIAGNOSTICS_TOKEN?.trim();
    if (!expected) {
      throw new ForbiddenException(
        'Harness diagnostics enabled but ADMIN_DIAGNOSTICS_TOKEN is not set; refusing to expose metrics without a secret.',
      );
    }
    const provided = this.extractDiagnosticsToken(req, headerToken);
    if (!provided || provided !== expected) {
      throw new ForbiddenException('Invalid or missing diagnostics token');
    }
  }

  private extractDiagnosticsToken(req: Request, headerToken?: string): string | undefined {
    const fromHeader = headerToken?.trim();
    if (fromHeader) return fromHeader;
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
    return undefined;
  }
}
