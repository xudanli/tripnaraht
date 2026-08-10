/**
 * 团队结构化讨论 bypass 宿主。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';

export interface TeamStructuredDiscussionBypassHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly preferenceRoundOrchestrator?: {
    countTripMembers: (tripId: string) => Promise<number>;
    tryAutoStartForRequest: (input: {
      tripId: string;
      userId: string;
      message: string;
    }) => Promise<any>;
  };
}
