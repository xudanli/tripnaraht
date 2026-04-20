/**
 * 内部诊断：DONE VERIFY 守卫进程内计数（与 `done-verify-metrics.ts` 同源）。
 *
 * 安全：与 Harness 诊断一致 — 默认 **404**；启用后依赖 `ADMIN_DIAGNOSTICS_TOKEN`。
 * - `ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED=1`
 * - Header `x-tripnara-admin-diagnostics-token` 或 `Authorization: Bearer <token>`
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
  getDoneVerifyDiagnostics,
  type DoneVerifyDiagnosticsPayload,
} from '../../agent/guards/done-verify-metrics';

@ApiTags('Admin - Diagnostics')
@Controller('admin/diagnostics')
export class DoneVerifyDiagnosticsAdminController {
  @Public()
  @Get('done-verify')
  @ApiOperation({
    summary: 'DONE VERIFY 守卫指标快照与比率（进程内）',
    description:
      '需 `ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED=1` 与 `ADMIN_DIAGNOSTICS_TOKEN`；鉴权方式同 `GET .../harness`。',
  })
  getDoneVerifySnapshot(
    @Req() req: Request,
    @Headers('x-tripnara-admin-diagnostics-token') headerToken?: string,
  ): DoneVerifyDiagnosticsPayload {
    if (process.env.ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED !== '1') {
      throw new NotFoundException();
    }
    const expected = process.env.ADMIN_DIAGNOSTICS_TOKEN?.trim();
    if (!expected) {
      throw new ForbiddenException(
        'Done-verify diagnostics enabled but ADMIN_DIAGNOSTICS_TOKEN is not set; refusing to expose metrics without a secret.',
      );
    }
    const provided = this.extractDiagnosticsToken(req, headerToken);
    if (!provided || provided !== expected) {
      throw new ForbiddenException('Invalid or missing diagnostics token');
    }
    return getDoneVerifyDiagnostics();
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
