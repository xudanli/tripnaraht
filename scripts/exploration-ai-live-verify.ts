/**
 * Exploration AI — Mapbox + LLM 实网验证
 *
 * Usage:
 *   npx tsx scripts/exploration-ai-live-verify.ts
 *
 * 依赖 .env：VITE_MAPBOX_ACCESS_TOKEN / MAPBOX_ACCESS_TOKEN、DEEPSEEK_API_KEY
 */

import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../src/llm/dto/llm-request.dto';
import { LlmService } from '../src/llm/services/llm.service';
import { MapboxDirectionsService } from '../src/transport/services/mapbox-directions.service';
import { StaticArchetypeRouteProvider } from '../src/trips/exploration/providers/static-archetype-route.provider';
import { PersonalizedRouteProvider } from '../src/trips/exploration/providers/personalized-route.provider';
import { EngineGeometryRouteProvider } from '../src/trips/exploration/providers/engine-geometry-route.provider';
import { LlmRouteNarrativeProvider } from '../src/trips/exploration/providers/llm-route-narrative.provider';
import { ExplorationRouteGeometryCacheService } from '../src/trips/exploration/services/exploration-route-geometry-cache.service';
import { decodePolyline } from '../src/trips/exploration/utils/decode-polyline.util';
import type { RouteGenerationContext } from '../src/trips/exploration/types/exploration-route-generation.types';

const ctx: RouteGenerationContext = {
  scenarioId: 'live-verify',
  tripId: 'live-trip',
  destinationCode: 'IS',
  protocolId: null,
  generationVersion: 1,
  rankedPrinciples: ['REMOTE_EXPLORATION', 'LOW_DRIVING'],
  initialInput: {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
    mobilityContext: { vehicleType: '4WD_SUV' },
    source: 'USER_CREATED',
  },
};

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function verifyMapboxSegment(mapbox: MapboxDirectionsService) {
  if (!mapbox.isConfigured()) {
    record('mapbox-config', false, 'token missing (MAPBOX_ACCESS_TOKEN / VITE_MAPBOX_ACCESS_TOKEN)');
    return null;
  }
  record('mapbox-config', true, 'token configured');

  // Reykjavik → Vík
  const seg = await mapbox.computeRouteGeometry(64.1466, -21.9426, 63.4186, -19.0083, 'DRIVING');
  if (!seg?.polyline) {
    record('mapbox-segment', false, 'Directions API returned no geometry');
    return null;
  }

  const points = decodePolyline(seg.polyline);
  const km = (seg.distanceMeters / 1000).toFixed(1);
  record(
    'mapbox-segment',
    points.length > 10 && seg.distanceMeters > 50_000,
    `${km} km, ${seg.durationMinutes} min, ${points.length} polyline points`,
  );
  return seg;
}

async function verifyEngine(mapbox: MapboxDirectionsService) {
  const staticProvider = new StaticArchetypeRouteProvider();
  const personalized = new PersonalizedRouteProvider(staticProvider);
  const cache = new ExplorationRouteGeometryCacheService();
  const engine = new EngineGeometryRouteProvider(personalized, mapbox, cache);

  const variants = await engine.generate(ctx);
  const engineVariants = variants.filter((v) => v.generationSource === 'ENGINE_MAPBOX');

  if (!mapbox.isConfigured()) {
    record('engine-mode', false, 'skipped — no Mapbox token');
    return;
  }

  record('engine-mode', engineVariants.length === 3, `${engineVariants.length}/3 ENGINE_MAPBOX`);

  for (const v of engineVariants) {
    const anchors = v.routeDetail?.map.mainLine.length ?? 0;
    const staticBase = staticProvider.generate(ctx).find((s) => s.routeId === v.routeId);
    const anchorOnly = staticBase?.routeDetail?.map.mainLine.length ?? 0;
    const stitched = v.routeDetail?.map.mainLine.length ?? 0;
    const enriched = stitched > anchorOnly;
    record(
      `engine-geometry:${v.strategyId}`,
      enriched,
      `anchors=${anchorOnly} stitched=${stitched} pts`,
    );
  }
}

async function verifyLlm() {
  const hasKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const mockOff = process.env.LLM_USE_MOCK !== 'true';
  record('llm-config', hasKey && mockOff, `DEEPSEEK_API_KEY=${hasKey ? 'set' : 'missing'} LLM_USE_MOCK=${process.env.LLM_USE_MOCK ?? 'off'}`);

  if (!hasKey || !mockOff) {
    record('llm-live', false, 'skipped — configure DEEPSEEK_API_KEY and LLM_USE_MOCK!=true');
    return;
  }

  process.env.EXPLORATION_LLM_ROUTE_NARRATIVE = '1';
  process.env.EXPLORATION_LLM_ROUTE_NARRATIVE_LIVE = '1';

  const config = new ConfigService(process.env as Record<string, unknown>);
  const llm = new LlmService(config);
  const staticProvider = new StaticArchetypeRouteProvider();
  const personalized = new PersonalizedRouteProvider(staticProvider);
  const base = personalized.generate(ctx);
  const narrative = new LlmRouteNarrativeProvider(llm);

  const start = Date.now();
  const enriched = await narrative.enrich(base, ctx);
  const ms = Date.now() - start;

  const llmVariants = enriched.filter((v) => v.generationSource === 'LLM');
  const templateLike = enriched.filter((v) => v.narrative.includes('AI 建议：先对比 gains/sacrifices'));
  const liveLike = llmVariants.length - templateLike.length;

  record(
    'llm-live',
    llmVariants.length === 3 && liveLike >= 2,
    `${llmVariants.length} LLM narratives in ${ms}ms (${liveLike} non-template)`,
  );

  for (const v of enriched.slice(0, 1)) {
    console.log(`  sample (${v.routeId}): ${v.narrative.slice(0, 120)}…`);
  }
}

async function main() {
  console.log('=== Exploration AI Live Verify ===\n');

  const mapbox = new MapboxDirectionsService(new ConfigService(process.env as Record<string, unknown>));

  await verifyMapboxSegment(mapbox);
  console.log('');
  await verifyEngine(mapbox);
  console.log('');
  await verifyLlm();
  console.log('');

  const failed = checks.filter((c) => !c.pass);
  console.log(`=== Summary: ${checks.length - failed.length}/${checks.length} passed ===`);
  if (failed.length > 0) {
    console.log('Failed:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
