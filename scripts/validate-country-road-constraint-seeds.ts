#!/usr/bin/env npx ts-node
/**
 * Validate P0 country road-constraint RAG seeds (AU / JP / NZ + optional IS).
 *
 *   npm run validate:country-road-constraint-seeds
 */
import path from 'path';
import { validateRoadConstraintSeedFile } from './lib/validate-road-constraint-seed.util';

const SEEDS: Array<{
  label: string;
  file: string;
  options: Parameters<typeof validateRoadConstraintSeedFile>[1];
}> = [
  {
    label: 'AU B100 bushfire',
    file: '../data/rag/au-road-constraint-chunks.p0.json',
    options: {
      requiredRoadIds: ['B100'],
      tripDates: ['2026-01-18'],
      minClosedRoadChunks: 1,
    },
  },
  {
    label: 'JP Route 134 typhoon',
    file: '../data/rag/jp-road-constraint-chunks.p0.json',
    options: {
      requiredRoadIds: ['ROUTE134'],
      tripDates: ['2026-09-15'],
      minClosedRoadChunks: 1,
    },
  },
  {
    label: 'NZ SH94 heavy rain',
    file: '../data/rag/nz-road-constraint-chunks.p0.json',
    options: {
      requiredRoadIds: ['SH94'],
      tripDates: ['2026-03-12'],
      minClosedRoadChunks: 1,
    },
  },
];

function main(): void {
  let failed = 0;
  for (const seed of SEEDS) {
    const seedPath = path.join(__dirname, seed.file);
    const result = validateRoadConstraintSeedFile(seedPath, seed.options);
    if (!result.ok) {
      failed++;
      console.error(`[FAIL] ${seed.label}`);
      for (const e of result.errors) console.error(`  - ${e}`);
      continue;
    }
    console.log(
      `[OK] ${seed.label}: ${result.chunkCount} chunks, ${result.eventCount} world events (${result.roadIds.join(', ')})`,
    );
  }
  if (failed > 0) process.exit(1);
}

main();
