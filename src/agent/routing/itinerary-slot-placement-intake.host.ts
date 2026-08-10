/**
 * INTAKE 槽位候选宿主：Prisma / PA ContextAnalyzer / Polisher 仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ContextAnalyzerService } from '../assistants/trip-planner/services/context-analyzer.service';
import type { ItinerarySlotPolisherService } from '../services/itinerary-slot-polisher.service';

export interface ItinerarySlotPlacementIntakeHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly contextAnalyzerService?: Pick<
    ContextAnalyzerService,
    'analyzeItinerarySlotPlacement'
  >;
  readonly itinerarySlotPolisher?: ItinerarySlotPolisherService;
}
