/**
 * 内部诊断：影子 Harness 进程内指标（Kernel 单点 Collector）。
 *
 * 安全（拍板）：
 * - 默认 **404**：须设置 `ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1` 才暴露。
 * - 启用后须配置 `ADMIN_DIAGNOSTICS_TOKEN`；请求须携带：
 *   - Header `x-tripnara-admin-diagnostics-token: <token>`，或
 *   - `Authorization: Bearer <token>`
 * - 路由使用 `@Public()` 绕过全局 JWT，**仅依赖上述共享密钥**（内网 / 运维 curl）；生产请配网关 IP 限制。
 *
 * 不改变基础设施级 `/health`。
 */

import {
  Controller,
  Get,
  Headers,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import {
  HarnessShadowMetricsCollector,
  type HarnessShadowCheckSnapshot,
} from '../../decision/kernel/harness-shadow-metrics.collector';

@ApiTags('Admin - Diagnostics')
@Controller('admin/diagnostics')
export class HarnessDiagnosticsAdminController {
  constructor(private readonly harnessShadowMetrics: HarnessShadowMetricsCollector) {}

  @Public()
  @Get('harness')
  @ApiOperation({
    summary: '影子 Harness 指标快照（tripnara_harness_* 进程内 Counter/Gauge）',
    description:
      '需 `ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1` 与 `ADMIN_DIAGNOSTICS_TOKEN`；Header 见控制器文件头注释。',
  })
  getHarnessSnapshot(
    @Req() req: Request,
    @Headers('x-tripnara-admin-diagnostics-token') headerToken?: string,
  ): HarnessShadowCheckSnapshot {
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
    return this.harnessShadowMetrics.getSnapshot();
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
