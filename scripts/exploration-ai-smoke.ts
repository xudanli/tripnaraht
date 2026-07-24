/**
 * Exploration AI route generation — 本地 smoke（无需 HTTP 服务）
 *
 * Usage:
 *   npx tsx scripts/exploration-ai-smoke.ts
 *   EXPLORATION_AI_ROUTE_GENERATION=1 EXPLORATION_ROUTE_GENERATION_MODE=PERSONALIZED npx tsx scripts/exploration-ai-smoke.ts
 *   EXPLORATION_LLM_ROUTE_NARRATIVE=1 npx tsx scripts/exploration-ai-smoke.ts
 */

import 'dotenv/config';
import { StaticArchetypeRouteProvider } from '../src/trips/exploration/providers/static-archetype-route.provider';
import { PersonalizedRouteProvider } from '../src/trips/exploration/providers/personalized-route.provider';
import { EngineGeometryRouteProvider } from '../src/trips/exploration/providers/engine-geometry-route.provider';
import { LlmRouteNarrativeProvider } from '../src/trips/exploration/providers/llm-route-narrative.provider';
import { ExplorationRouteGeometryCacheService } from '../src/trips/exploration/services/exploration-route-geometry-cache.service';
import { resolveRouteGenerationMode } from '../src/trips/exploration/config/exploration-route-generation.config';
import type { RouteGenerationContext } from '../src/trips/exploration/types/exploration-route-generation.types';

const ctx: RouteGenerationContext = {
  scenarioId: 'smoke-scn',
  tripId: 'smoke-trip',
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

async function main() {
  const mode = resolveRouteGenerationMode();
  console.log(`mode=${mode} AI=${process.env.EXPLORATION_AI_ROUTE_GENERATION ?? '0'} LLM=${process.env.EXPLORATION_LLM_ROUTE_NARRATIVE ?? '0'}`);

  const staticProvider = new StaticArchetypeRouteProvider();
  const personalizedProvider = new PersonalizedRouteProvider(staticProvider);
  const geometryCache = new ExplorationRouteGeometryCacheService();
  const engineProvider = new EngineGeometryRouteProvider(personalizedProvider, undefined, geometryCache);
  const llmProvider = new LlmRouteNarrativeProvider();

  let variants =
    mode === 'ENGINE'
      ? await engineProvider.generate(ctx)
      : mode === 'PERSONALIZED'
        ? personalizedProvider.generate(ctx)
        : staticProvider.generate(ctx);

  variants = await llmProvider.enrich(variants, ctx);

  console.log(`variants=${variants.length}`);
  for (const v of variants) {
    console.log(`- ${v.routeId} source=${v.generationSource} pts=${v.routeDetail?.map.mainLine.length ?? 0}`);
    console.log(`  narrative: ${v.narrative.slice(0, 100)}...`);
  }

  const sources = new Set(variants.map((v) => v.generationSource));
  if (variants.length !== 3) {
    console.error('FAIL: expected 3 variants');
    process.exit(1);
  }
  if (mode === 'PERSONALIZED' && !sources.has('PERSONALIZED') && !sources.has('LLM')) {
    console.error('FAIL: expected PERSONALIZED or LLM source');
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
