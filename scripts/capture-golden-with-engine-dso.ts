import fs from 'fs';
import path from 'path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { TripWorldState, ActivityCandidate } from '../src/trips/decision/world-model';
import { TripDecisionEngineService } from '../src/trips/decision/trip-decision-engine.service';
import { SenseToolsAdapter } from '../src/trips/decision/adapters/sense-tools.adapter';
import type { E2ECase } from '../src/trips/decision/evaluation/e2e-case.types';
import {
  icelandGoldenHighlandsRepairCapturedCase,
  icelandGoldenRingRoadCapturedCase,
} from '../src/trips/decision/evaluation/e2e-cases/iceland-golden-corpus.example';

class StubSenseToolsAdapter {
  async getTravelLeg(from: any, to: any) {
    const dx = (from?.lat ?? 0) - (to?.lat ?? 0);
    const dy = (from?.lng ?? 0) - (to?.lng ?? 0);
    const distKm = Math.sqrt(dx * dx + dy * dy) * 111;
    const durationMin = Math.max(5, Math.round((distKm / 50) * 60));
    return {
      mode: 'drive',
      from,
      to,
      durationMin,
      distanceKm: distKm,
      reliability: 0.7,
      source: 'stub',
    };
  }
}

@Module({
  providers: [
    TripDecisionEngineService,
    { provide: SenseToolsAdapter, useClass: StubSenseToolsAdapter },
  ],
})
class GoldenEngineCaptureModule {}

function buildWorldStateFromCase(testCase: E2ECase): TripWorldState {
  const startDate = new Date(new Date().getFullYear(), (testCase.input.season ?? 7) - 1, 1).toISOString().slice(0, 10);
  const durationDays = Math.max(1, testCase.expected.finalState.planDays ?? 7);
  const mkDate = (i: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  };

  const candidatesByDate: Record<string, ActivityCandidate[]> = {};
  for (let i = 0; i < durationDays; i++) {
    const date = mkDate(i);
    candidatesByDate[date] = Array.from({ length: 6 }).map((_, idx) => ({
      id: `cand-${testCase.id}-${i}-${idx}`,
      name: { en: `Candidate ${i}-${idx}`, zh: `候选 ${i}-${idx}` },
      type: 'poi' as any,
      location: {
        point: { lat: 64.0 + i * 0.02 + idx * 0.001, lng: -21.0 - idx * 0.02 },
      } as any,
      durationMin: 60 + idx * 15,
      cost: { amount: 20 + idx * 5, currency: 'USD' } as any,
      intentTags: testCase.input.userProfile.preferredRouteTypes ?? [],
      qualityScore: 0.6 + idx * 0.05,
    })) as any;
  }

  return {
    context: {
      destination: testCase.input.countryCode,
      startDate,
      durationDays,
      preferences: {
        intents: Object.fromEntries(
          (testCase.input.userProfile.preferredRouteTypes ?? []).map((t) => [t, 0.8]),
        ),
        pace:
          testCase.input.userProfile.pacePreference === 'SLOW'
            ? 'relaxed'
            : testCase.input.userProfile.pacePreference === 'FAST'
              ? 'intense'
              : 'moderate',
        riskTolerance: (testCase.input.userProfile.riskTolerance ?? 'MEDIUM').toLowerCase(),
      },
    } as any,
    candidatesByDate,
    signals: { lastUpdatedAt: new Date().toISOString() } as any,
  } as any;
}

async function main() {
  const outDir = process.env.GOLDEN_ENGINE_DSO_OUT_DIR ?? 'src/trips/decision/evaluation/e2e-cases/generated';
  const absOutDir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);
  fs.mkdirSync(absOutDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const fixtures: readonly E2ECase[] = [
    icelandGoldenRingRoadCapturedCase,
    icelandGoldenHighlandsRepairCapturedCase,
  ];
  const app = await NestFactory.createApplicationContext(GoldenEngineCaptureModule, { logger: ['error', 'warn'] });
  try {
    const engine = app.get(TripDecisionEngineService);

    const outputs: Array<{ id: string; file: string }> = [];
    for (const testCase of fixtures) {
      const requestId = `golden-capture-${testCase.id}-${Date.now()}`;
      const worldState = buildWorldStateFromCase(testCase);
      const { log } = await engine.generatePlan(worldState as any, requestId);

      const withSnapshot: E2ECase = {
        ...testCase,
        metadata: {
          ...(testCase.metadata ?? {}),
          cgusDsoSnapshot: (log as any).cgusDsoSnapshot,
          cgusDsoSnapshotNote: (log as any).cgusDsoSnapshotNote ?? 'captured from decision engine run log',
          cgusDsoFixtureVersion: 'engine-dso-v1',
          cgusDsoGeneratedAt: generatedAt,
          cgusDsoSourceCaseId: testCase.id,
          source: (testCase.metadata as any)?.source ?? 'captured-engine-dso',
          fixtureKind: 'golden',
        },
      };

      const file = path.join(absOutDir, `${testCase.id}.engine-dso.json`);
      fs.writeFileSync(file, JSON.stringify(withSnapshot, null, 2) + '\n', 'utf-8');
      outputs.push({ id: testCase.id, file });
    }

    fs.writeFileSync(
      path.join(absOutDir, `index.json`),
      JSON.stringify({ fixtureVersion: 'engine-dso-v1', generatedAt, outputs }, null, 2) + '\n',
      'utf-8',
    );

    process.stdout.write(`Wrote ${outputs.length} golden fixtures with engine DSO to ${absOutDir}\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});

