/**
 * Lightweight 知识问答 helpers 宿主（行程摘要 / RAG / readiness 等）。
 */

import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';

export interface LightweightKnowledgeHelpersHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly configService?: ConfigService;
  readonly tripsService?: {
    getTripPromptSummaryForConsultation: (...args: any[]) => Promise<string | null | undefined>;
  };
  readonly readinessService?: any;
  readonly chunkRetrieval?: any;
  readonly coverageMapService?: any;
  readonly ragRealityPolicyGate?: any;
  readonly skillsRegistry?: any;

  extractCountryCodeFromMessage(message: string): string | undefined;
  extractSeason(dateStr: string): string;
}
