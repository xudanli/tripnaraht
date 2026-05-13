import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { GovernanceLedgerEvent } from './governance-ledger.types';
import { governanceLedgerEventToPrismaCreate, prismaRowToGovernanceLedgerEvent } from './governance-ledger-prisma.mapper';

@Injectable()
export class GovernanceLedgerPrismaPersistenceService {
  private readonly logger = new Logger(GovernanceLedgerPrismaPersistenceService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async append(event: GovernanceLedgerEvent): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.governanceLedgerEventRecord.create({
        data: governanceLedgerEventToPrismaCreate(event),
      });
    } catch (e: any) {
      this.logger.warn(`[GovernanceLedgerPrisma] append failed: ${e?.message ?? e}`);
    }
  }

  /** Timeline ascending (replay / UI). */
  async findTimelineAscByTripId(tripId: string): Promise<GovernanceLedgerEvent[]> {
    if (!this.prisma) return [];
    try {
      const rows = await this.prisma.governanceLedgerEventRecord.findMany({
        where: { tripId },
        orderBy: { timestampMs: 'asc' },
      });
      return rows.map(prismaRowToGovernanceLedgerEvent);
    } catch (e: any) {
      this.logger.warn(`[GovernanceLedgerPrisma] findTimelineAsc failed: ${e?.message ?? e}`);
      return [];
    }
  }
}
