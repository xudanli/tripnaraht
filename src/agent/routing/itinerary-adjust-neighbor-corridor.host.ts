/**
 * ITINERARY_ADJUST 邻日锚点 / 走廊补检宿主。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';

export interface ItineraryAdjustNeighborCorridorHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma?: PrismaService;
  readonly skillsRegistry?: {
    getSkill: (name: string) => { execute: (input: any) => Promise<any> } | undefined;
  };
}
