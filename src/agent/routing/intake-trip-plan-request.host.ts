/**
 * INTAKE TripPlanRequest 转换 / Trip 回填宿主。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';

export interface IntakeTripPlanRequestHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly tripsService?: any;
}

export type {};
