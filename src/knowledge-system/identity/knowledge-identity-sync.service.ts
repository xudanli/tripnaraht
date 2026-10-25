/**
 * Sync Identity from CPRE catalog + Country Pack (CountryProfile) into DB + memory registry.
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ICELAND_CANONICAL_POI_CATALOG } from '../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ONTOLOGY_ATTRIBUTES,
  ONTOLOGY_CATALOG_VERSION,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPES,
  ontologyCatalogStats,
} from '../ontology/ontology-catalog';
import { upsertOntologyCatalogFromProjection } from '../ontology/knowledge-ontology-catalog.store';
import { KnowledgeOntologyService } from '../ontology/knowledge-ontology.service';
import type { EntityIdentity } from '../contracts/entity-identity.types';
import {
  listRecentIdentitySyncRuns,
  recordIdentitySyncRun,
  saveOntologyCatalogSnapshot,
  upsertSyncedIdentity,
} from './knowledge-entity-identity.store';
import { placeIsAliasForCanonical } from './normalize-place-id.util';
import { EntityIdentityRegistryService } from './entity-identity-registry.service';
import { buildPlaceDbToCpreLinks } from './seed-place-db-cpre.util';

export type IdentitySyncSource = 'cpre' | 'country_pack' | 'place_db' | 'ontology_snapshot';

@Injectable()
export class KnowledgeIdentitySyncService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeIdentitySyncService.name);
  private lastSync: {
    runId: string;
    status: string;
    sources: string[];
    stats: Record<string, unknown>;
    finishedAt?: string;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EntityIdentityRegistryService,
    @Optional() private readonly ontology?: KnowledgeOntologyService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Registry 已 seed/flush；启动时补同步 Country Pack + ontology 快照（不阻断 boot）
    if (!this.prisma.isDbConnected()) return;
    void this.sync(['country_pack', 'ontology_snapshot']).catch((e) => {
      this.logger.warn(
        `boot identity sync skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  getLastSync() {
    return this.lastSync;
  }

  async listRuns(limit = 10) {
    return listRecentIdentitySyncRuns(this.prisma, limit);
  }

  async sync(sources: IdentitySyncSource[] = ['cpre', 'country_pack', 'place_db', 'ontology_snapshot']) {
    const runId = `ks_sync_${randomUUID().slice(0, 12)}`;
    const startedAt = new Date();
    const stats: Record<string, unknown> = {
      dbConnected: this.prisma.isDbConnected(),
    };
    let status = 'SUCCESS';
    let errorMessage: string | undefined;

    try {
      if (sources.includes('cpre')) {
        stats.cpre = await this.syncCpre();
      }
      if (sources.includes('country_pack')) {
        stats.countryPack = await this.syncCountryPack();
      }
      if (sources.includes('place_db')) {
        stats.placeDb = await this.syncPlaceDbLinks();
      }
      if (sources.includes('ontology_snapshot')) {
        stats.ontologySnapshot = await this.persistOntologySnapshot('sync');
      }
    } catch (e) {
      status = 'FAILED';
      errorMessage = e instanceof Error ? e.message : String(e);
      this.logger.error(`Identity sync failed: ${errorMessage}`);
    }

    const finishedAt = new Date();
    await recordIdentitySyncRun(this.prisma, {
      id: runId,
      sources,
      status,
      stats,
      errorMessage,
      startedAt,
      finishedAt,
    });
    this.lastSync = {
      runId,
      status,
      sources,
      stats,
      finishedAt: finishedAt.toISOString(),
    };
    this.logger.log(
      `Identity sync ${runId} status=${status} sources=${sources.join(',')} stats=${JSON.stringify(stats)}`,
    );
    return this.lastSync;
  }

  private async syncCpre() {
    let created = 0;
    let updated = 0;
    let skippedAdmin = 0;
    let failed = 0;
    for (const poi of ICELAND_CANONICAL_POI_CATALOG) {
      const existing = this.registry.get(poi.poiId);
      if (existing?.origin === 'ADMIN') {
        skippedAdmin += 1;
        continue;
      }
      const placeIs = placeIsAliasForCanonical(poi.poiId);
      const entity: EntityIdentity = {
        canonicalEntityId: poi.poiId,
        entityType: 'Place',
        domain: 'PLACE',
        displayName: poi.canonicalName,
        aliases: [...poi.aliases, ...(placeIs ? [placeIs] : [])],
        country: poi.country?.toUpperCase() || 'IS',
        status: poi.status === 'DEPRECATED' ? 'DEPRECATED' : 'ACTIVE',
        sourceRefs: [{ system: 'cpre', sourceId: poi.poiId }],
        origin: 'CPRE_SYNC',
        properties: {
          category: poi.category,
          subCategory: poi.subCategory,
          ...(poi.lat != null && poi.lng != null ? { lat: poi.lat, lng: poi.lng } : {}),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.registry.register(entity);
      const r = await upsertSyncedIdentity(this.prisma, entity);
      if (r === 'created') created += 1;
      else if (r === 'updated') updated += 1;
      else if (r === 'skipped_admin') skippedAdmin += 1;
      else failed += 1;
    }
    return {
      catalogSize: ICELAND_CANONICAL_POI_CATALOG.length,
      created,
      updated,
      skippedAdmin,
      failed,
    };
  }

  private async syncCountryPack() {
    let created = 0;
    let updated = 0;
    let skippedAdmin = 0;
    let failed = 0;
    let profileCount = 0;
    if (!this.prisma.isDbConnected()) {
      return { profileCount: 0, created, updated, skippedAdmin, failed, note: 'db_unavailable' };
    }
    try {
      const profiles = await this.prisma.countryProfile.findMany({
        select: { isoCode: true, nameCN: true, nameEN: true, schemaVersion: true },
      });
      profileCount = profiles.length;
      for (const p of profiles) {
        const iso = p.isoCode.toUpperCase();
        const canonicalEntityId = `country:${iso.toLowerCase()}`;
        const existing = this.registry.get(canonicalEntityId);
        if (existing?.origin === 'ADMIN') {
          skippedAdmin += 1;
          continue;
        }
        const entity: EntityIdentity = {
          canonicalEntityId,
          entityType: 'Country',
          domain: 'GEOGRAPHY',
          displayName: p.nameCN || p.nameEN || iso,
          aliases: [iso, p.nameEN, p.nameCN].filter(Boolean) as string[],
          country: iso,
          status: 'ACTIVE',
          sourceRefs: [{ system: 'country_pack', sourceId: iso }],
          origin: 'COUNTRY_PACK',
          properties: {
            kind: 'CountryProfile',
            schemaVersion: p.schemaVersion,
            nameEN: p.nameEN,
            nameCN: p.nameCN,
          },
          description: `Country Pack 档案 ${iso}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.registry.register(entity);
        const r = await upsertSyncedIdentity(this.prisma, entity);
        if (r === 'created') created += 1;
        else if (r === 'updated') updated += 1;
        else if (r === 'skipped_admin') skippedAdmin += 1;
        else failed += 1;
      }
    } catch (e) {
      return {
        profileCount,
        created,
        updated,
        skippedAdmin,
        failed,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return { profileCount, created, updated, skippedAdmin, failed };
  }

  private async syncPlaceDbLinks() {
    const links = buildPlaceDbToCpreLinks();
    let linked = 0;
    let skipped = 0;
    for (const link of links) {
      const existing = this.registry.get(link.canonicalEntityId);
      if (!existing) {
        skipped += 1;
        continue;
      }
      const merged: EntityIdentity = {
        ...existing,
        aliases: [
          ...new Set([
            ...(existing.aliases ?? []),
            `place:db:${link.placeDbId}`,
            link.placeDbId,
            ...(link.label ? [link.label] : []),
          ]),
        ],
        sourceRefs: [
          ...(existing.sourceRefs ?? []),
          { system: 'place_db', sourceId: link.placeDbId },
          { system: 'place_db', sourceId: `place:db:${link.placeDbId}` },
        ],
        origin: existing.origin === 'ADMIN' ? 'ADMIN' : existing.origin ?? 'PLACE_DB',
        updatedAt: new Date().toISOString(),
      };
      this.registry.register(merged);
      await upsertSyncedIdentity(this.prisma, merged);
      linked += 1;
    }
    return { linkDefs: links.length, linked, skipped };
  }

  async persistOntologySnapshot(source = 'boot_projection', note?: string) {
    const stats = ontologyCatalogStats();
    const id = `ont_snap_${randomUUID().slice(0, 12)}`;
    const payload = {
      schemaId: 'tripnara.ontology_catalog_snapshot@v1',
      catalogVersion: ONTOLOGY_CATALOG_VERSION,
      exportedAt: new Date().toISOString(),
      types: ONTOLOGY_TYPES,
      attributes: ONTOLOGY_ATTRIBUTES,
      predicates: ONTOLOGY_PREDICATES,
      stats,
    };
    const ok = await saveOntologyCatalogSnapshot(this.prisma, {
      id,
      catalogVersion: ONTOLOGY_CATALOG_VERSION,
      source,
      note,
      typeCount: stats.typeCount,
      attributeCount: stats.attributeCount,
      predicateCount: stats.predicateCount,
      payload,
    });
    const rows = await upsertOntologyCatalogFromProjection(this.prisma);
    const refreshed = this.ontology
      ? await this.ontology.refreshFromDbOrProjection(`sync:${source}`)
      : null;
    return {
      id,
      saved: ok,
      catalogVersion: ONTOLOGY_CATALOG_VERSION,
      ...stats,
      rows,
      refreshed,
    };
  }
}
