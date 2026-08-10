/**
 * Lightweight 实时传感器宿主：MCP / Prisma / Amadeus / 酒店旁白等。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AmadeusDirectService } from '../../mcp/amadeus-direct.service';
import type { FlightMcpService } from '../../mcp/flight-mcp.service';
import type { HotelDecisionSupportNarratorService } from '../services/hotel-decision-support-narrator.service';
import type { IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';

export interface LightweightLiveSensorsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly mcpToolDispatcher?: {
    executeTool: (
      ns: string,
      name: string,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    /** 可选：Booking RapidAPI 是否可用 */
    isBookingComCarRentalAvailable?: () => boolean;
    /** 可选：租车检索是否可跑（Booking 或 Browserbase/目录 Direct） */
    isCarRentalSearchAvailable?: () => boolean;
  };
  readonly amadeusDirect?: Pick<AmadeusDirectService, 'isAvailable'> &
    Partial<AmadeusDirectService>;
  readonly flightMcp?: Pick<FlightMcpService, 'isAvailable'> &
    Partial<FlightMcpService>;
  readonly hotelDecisionNarrator?: HotelDecisionSupportNarratorService;
  readonly icelandRentalGuidanceSkill?: {
    execute: (
      input: Record<string, unknown>,
    ) => Promise<IcelandRentalGuidanceOutput>;
  };
}
