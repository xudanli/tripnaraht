/**
 * RFC-002 — 5-layer pack overlay: Operator > Activity > Region > Country > Global.
 */

import { Injectable } from '@nestjs/common';
import type {
  ActiveDestinationPackSet,
  DestinationPackLayer,
  DestinationPackManifest,
  DestinationPackResolveInput,
  EvidenceProviderBinding,
  ResolvedDestinationPack,
} from '../contracts/destination-pack.types';
import { DestinationPackLoaderService } from './destination-pack-loader.service';

const LAYER_ORDER: DestinationPackLayer[] = [
  'GLOBAL',
  'COUNTRY',
  'REGION',
  'ACTIVITY',
  'OPERATOR',
];

@Injectable()
export class DestinationPackOverlayResolverService {
  constructor(private readonly loader: DestinationPackLoaderService) {}

  resolve(input: DestinationPackResolveInput): ActiveDestinationPackSet {
    const now = new Date().toISOString();
    const country = input.country?.trim().toUpperCase();
    const region = input.region?.trim();
    const activityTypes = new Set(
      (input.activityTypes ?? []).map((a) => a.trim().toUpperCase()),
    );
    const operatorId = input.operatorId?.trim();

    const candidates = this.loader.listManifests().filter((m) => {
      if (!input.includeShadow && m.status !== 'ACTIVE') return false;
      if (input.includeShadow && m.status === 'DEPRECATED') return false;
      return this.matchesScope(m, { country, region, activityTypes, operatorId });
    });

    const byLayer = new Map<DestinationPackLayer, DestinationPackManifest>();
    for (const layer of LAYER_ORDER) {
      const match = candidates
        .filter((m) => m.layer === layer)
        .sort((a, b) => b.version.localeCompare(a.version))[0];
      if (match) byLayer.set(layer, match);
    }

    for (const manifest of [...byLayer.values()]) {
      for (const dep of manifest.dependencies ?? []) {
        const depManifest = this.loader.getManifest(dep.packId);
        if (depManifest && !byLayer.has(depManifest.layer)) {
          byLayer.set(depManifest.layer, depManifest);
        }
      }
    }

    const layers: ResolvedDestinationPack[] = LAYER_ORDER.filter((l) => byLayer.has(l)).map(
      (layer) => {
        const manifest = byLayer.get(layer)!;
        return { packId: manifest.packId, version: manifest.version, layer, manifest };
      },
    );

    const semanticSet = new Set<string>();
    const evidenceProviders: EvidenceProviderBinding[] = [];

    for (const layer of layers) {
      for (const key of layer.manifest.supportedSemanticKeys) {
        semanticSet.add(key);
      }
      for (const ep of layer.manifest.evidenceProviders ?? []) {
        if (!evidenceProviders.some((e) => e.domain === ep.domain)) {
          evidenceProviders.push(ep);
        }
      }
    }

    return {
      schemaId: 'tripnara.active_destination_packs@v1',
      resolvedAt: now,
      layers,
      supportedSemanticKeys: [...semanticSet],
      evidenceProviders,
    };
  }

  supportsSemanticKey(
    active: ActiveDestinationPackSet,
    semanticKey: string,
  ): boolean {
    return active.supportedSemanticKeys.includes(semanticKey);
  }

  private matchesScope(
    manifest: DestinationPackManifest,
    ctx: {
      country?: string;
      region?: string;
      activityTypes: Set<string>;
      operatorId?: string;
    },
  ): boolean {
    const { scope } = manifest;
    if (manifest.layer === 'GLOBAL') return true;

    if (scope.countries?.length) {
      const allowed = scope.countries.map((c) => c.toUpperCase());
      if (!ctx.country || !allowed.includes(ctx.country)) return false;
    }
    if (scope.regions?.length) {
      if (!ctx.region || !scope.regions.includes(ctx.region)) return false;
    }
    if (scope.activityTypes?.length) {
      const allowed = scope.activityTypes.map((a) => a.toUpperCase());
      if (![...ctx.activityTypes].some((a) => allowed.includes(a))) return false;
    }
    if (scope.operatorIds?.length) {
      if (!ctx.operatorId || !scope.operatorIds.includes(ctx.operatorId)) return false;
    }
    return true;
  }
}
