import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ICELAND_CANONICAL_POI_CATALOG } from '../fixtures/iceland-canonical-poi.catalog';
import type { CanonicalPOI } from '../types/canonical-poi.types';
import { normalizePoiQuery } from '../utils/normalize-poi-query.util';
import { PoiAliasSeedService } from './poi-alias-seed.service';

@Injectable()
export class PoiAliasRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PoiAliasRegistryService.name);
  private catalog: CanonicalPOI[] = [...ICELAND_CANONICAL_POI_CATALOG];
  private aliasToPoiIds = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly seedService: PoiAliasSeedService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedService.seedIcelandAliases();
    await this.loadDbAliases();
    this.rebuildAliasIndex();
    this.logger.log(
      `CPRE alias registry ready: ${this.catalog.length} POIs, ${this.aliasToPoiIds.size} alias keys`,
    );
  }

  getCatalog(countryCode?: string): CanonicalPOI[] {
    if (!countryCode) return [...this.catalog];
    const cc = countryCode.toUpperCase();
    return this.catalog.filter((p) => p.country.toUpperCase() === cc);
  }

  getByPoiId(poiId: string): CanonicalPOI | undefined {
    return this.catalog.find((p) => p.poiId === poiId);
  }

  /** Reload catalog entry aliases from DB (after user confirmation in Sprint 3) */
  async refreshFromDb(): Promise<void> {
    this.catalog = [...ICELAND_CANONICAL_POI_CATALOG];
    await this.loadDbAliases();
    this.rebuildAliasIndex();
  }

  private async loadDbAliases(): Promise<void> {
    try {
      const rows = await this.prisma.poiAlias.findMany({
        select: { poiId: true, alias: true, locale: true, source: true },
      });

      for (const row of rows) {
        const poi = this.catalog.find((p) => p.poiId === row.poiId);
        if (!poi) continue;
        const exists = poi.aliases.some(
          (a) => normalizePoiQuery(a) === normalizePoiQuery(row.alias),
        );
        if (!exists && normalizePoiQuery(row.alias) !== normalizePoiQuery(poi.canonicalName)) {
          poi.aliases.push(row.alias);
        }
      }
    } catch (err) {
      this.logger.warn(
        `CPRE: could not load poi_aliases from DB (migration pending?): ${String(err)}`,
      );
    }
  }

  private rebuildAliasIndex(): void {
    this.aliasToPoiIds.clear();
    for (const poi of this.catalog) {
      const keys = [poi.canonicalName, ...poi.aliases].map(normalizePoiQuery);
      for (const key of keys) {
        if (!key) continue;
        const set = this.aliasToPoiIds.get(key) ?? new Set<string>();
        set.add(poi.poiId);
        this.aliasToPoiIds.set(key, set);
      }
    }
  }
}
