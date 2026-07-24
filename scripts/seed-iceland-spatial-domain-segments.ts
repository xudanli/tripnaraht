/**
 * Seed Iceland spatial_domain_pois + spatial_domain_segments from destination pack ontology.
 *
 * Usage:
 *   npm run seed:iceland-spatial-domain-segments [-- --dry-run]
 *   SEED_ICELAND_SPATIAL_DOMAIN_WRITE=1 npm run seed:iceland-spatial-domain-segments
 */

import { PrismaClient } from '@prisma/client';
import { loadCountryRoadOntology } from '../src/decision-runtime/packs/ontology/pack-ontology.loader';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const writeEnabled = process.env.SEED_ICELAND_SPATIAL_DOMAIN_WRITE === '1';

  const bundle = loadCountryRoadOntology('IS');
  if (!bundle?.spatialSeed) {
    throw new Error('IS road ontology bundle or spatialSeed missing');
  }

  const { pois, segments } = bundle.spatialSeed;
  console.log(
    `冰岛 spatial domain 种子: ${pois.length} POI, ${segments.length} segment, dryRun=${dryRun}, write=${writeEnabled}`,
  );

  if (!writeEnabled && !dryRun) {
    console.log('跳过写入：设置 SEED_ICELAND_SPATIAL_DOMAIN_WRITE=1 以 upsert DB');
    return;
  }

  for (const poi of pois) {
    const data = {
      id: poi.id,
      name: poi.name,
      coordinates: poi.coordinates,
      closed: poi.closed ?? false,
    };
    if (dryRun) {
      console.log('[dry-run] upsert poi', data.id);
      continue;
    }
    await prisma.spatialDomainPoi.upsert({
      where: { id: poi.id },
      create: data,
      update: {
        name: data.name,
        coordinates: data.coordinates,
        closed: data.closed,
      },
    });
  }

  for (const seg of segments) {
    const data = {
      id: seg.id,
      fromPoiId: seg.from_poi_id,
      toPoiId: seg.to_poi_id,
      segmentType: seg.segment_type,
      rules: seg.rules ?? undefined,
      seasonalClosures: seg.seasonal_closures ?? undefined,
      roadCondition: seg.road_condition ?? undefined,
      evidence: seg.ontologyNodeId
        ? { ontology_node_id: seg.ontologyNodeId, source: 'destination.pack.ontology' }
        : undefined,
    };
    if (dryRun) {
      console.log('[dry-run] upsert segment', data.id, data.rules);
      continue;
    }
    await prisma.spatialDomainSegment.upsert({
      where: { id: seg.id },
      create: data,
      update: {
        fromPoiId: data.fromPoiId,
        toPoiId: data.toPoiId,
        segmentType: data.segmentType,
        rules: data.rules,
        seasonalClosures: data.seasonalClosures,
        roadCondition: data.roadCondition,
        evidence: data.evidence,
      },
    });
  }

  const poiCount = await prisma.spatialDomainPoi.count();
  const segCount = await prisma.spatialDomainSegment.count();
  console.log(`完成。spatial_domain_pois=${poiCount}, spatial_domain_segments=${segCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
