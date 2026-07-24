import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildIcelandPoiAliasSeedRows } from '../fixtures/iceland-canonical-poi.catalog';

@Injectable()
export class PoiAliasSeedService {
  private readonly logger = new Logger(PoiAliasSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent upsert of Iceland SYSTEM aliases */
  async seedIcelandAliases(): Promise<{ upserted: number }> {
    const rows = buildIcelandPoiAliasSeedRows();
    let upserted = 0;

    try {
      for (const row of rows) {
        await this.prisma.poiAlias.upsert({
          where: {
            poiId_alias: { poiId: row.poiId, alias: row.alias },
          },
          create: {
            poiId: row.poiId,
            alias: row.alias,
            locale: row.locale,
            source: row.source,
            confidence: 1.0,
          },
          update: {
            locale: row.locale,
            source: row.source,
          },
        });
        upserted += 1;
      }
      this.logger.log(`CPRE Iceland alias seed complete (${upserted} rows)`);
    } catch (err) {
      this.logger.warn(`CPRE alias seed skipped: ${String(err)}`);
    }

    return { upserted };
  }
}
