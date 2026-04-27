import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminActivityLogService {
  private readonly logger = new Logger(AdminActivityLogService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async record(input: {
    actor?: string | null;
    path: string;
    method: string;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    if (!this.prisma?.isDbConnected()) return;
    try {
      await this.prisma.adminActivityLog.create({
        data: {
          actor: input.actor ?? null,
          path: input.path.slice(0, 512),
          method: input.method.slice(0, 16),
          meta: input.meta === undefined ? undefined : (input.meta as object),
        },
      });
    } catch (e: any) {
      this.logger.warn(`admin activity log skipped: ${e?.message ?? e}`);
    }
  }
}
