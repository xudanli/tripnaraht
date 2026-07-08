/**
 * RFC-002 — load DestinationPackManifest from data/destination-packs/.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';
import type {
  DestinationRoadOntologyBundle,
  DestinationRoadOntologyNode,
} from '../ontology/destination-road-ontology.types';
import { loadOntologyForManifest } from '../ontology/pack-ontology.loader';
import { destinationPackManifestSchema } from '../validation/pack-manifest.schema';

@Injectable()
export class DestinationPackLoaderService implements OnModuleInit {
  private readonly logger = new Logger(DestinationPackLoaderService.name);
  private readonly manifests = new Map<string, DestinationPackManifest>();
  private readonly ontologyByPackId = new Map<string, DestinationRoadOntologyBundle>();
  private readonly ontologyByCountry = new Map<string, DestinationRoadOntologyBundle>();
  private loaded = false;

  private resolvePacksRoot(): string {
    return join(process.cwd(), 'data/destination-packs');
  }

  onModuleInit(): void {
    this.loadAll();
  }

  loadAll(): DestinationPackManifest[] {
    this.manifests.clear();
    const root = this.resolvePacksRoot();
    if (!existsSync(root)) {
      this.logger.warn(`Destination packs root not found: ${root}`);
      this.loaded = true;
      return [];
    }

    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(root, entry.name, 'destination.pack.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
        const parsed = destinationPackManifestSchema.parse(raw);
        this.manifests.set(parsed.packId, parsed as DestinationPackManifest);
        this.loadOntologyForPack(entry.name, parsed as DestinationPackManifest);
      } catch (err) {
        this.logger.error(`Failed to load pack ${entry.name}: ${String(err)}`);
      }
    }

    this.loaded = true;
    this.logger.debug(
      `Loaded ${this.manifests.size} destination pack manifest(s), ${this.ontologyByPackId.size} ontology bundle(s)`,
    );
    return [...this.manifests.values()];
  }

  private loadOntologyForPack(countryDirName: string, manifest: DestinationPackManifest): void {
    if (!manifest.ontologyMappings?.length) return;
    const countryDir = join(this.resolvePacksRoot(), countryDirName);
    try {
      const bundle = loadOntologyForManifest(manifest, { countryDir });
      if (!bundle) return;
      this.ontologyByPackId.set(manifest.packId, bundle);
      this.ontologyByCountry.set(bundle.countryCode.toUpperCase(), bundle);
      this.logger.debug(
        `Loaded ontology ${bundle.schemaId} for ${manifest.packId} (${bundle.nodes.length} nodes)`,
      );
    } catch (err) {
      this.logger.error(`Failed to load ontology for pack ${manifest.packId}: ${String(err)}`);
    }
  }

  listManifests(): DestinationPackManifest[] {
    if (!this.loaded) this.loadAll();
    return [...this.manifests.values()];
  }

  getManifest(packId: string): DestinationPackManifest | undefined {
    if (!this.loaded) this.loadAll();
    return this.manifests.get(packId);
  }

  getOntologyForPack(packId: string): DestinationRoadOntologyBundle | undefined {
    if (!this.loaded) this.loadAll();
    return this.ontologyByPackId.get(packId);
  }

  getCountryRoadOntology(countryCode: string): DestinationRoadOntologyBundle | undefined {
    if (!this.loaded) this.loadAll();
    return this.ontologyByCountry.get(countryCode.trim().toUpperCase());
  }

  findOntologyNode(ontologyNodeId: string): DestinationRoadOntologyNode | undefined {
    if (!this.loaded) this.loadAll();
    for (const bundle of this.ontologyByPackId.values()) {
      const node = bundle.nodes.find((n) => n.ontologyNodeId === ontologyNodeId);
      if (node) return node;
    }
    return undefined;
  }
}
