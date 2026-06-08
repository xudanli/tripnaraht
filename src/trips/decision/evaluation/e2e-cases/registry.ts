/**
 * TD-05：E2E 回放 fixture 注册表（单一事实来源，供 Jest / CI matrix 引用）
 */
import type { E2ECase } from '../e2e-case.types';
import {
  icelandHighlandsCase,
  icelandHighlandsCompoundStressCase,
  icelandHighlandsDemMissingCase,
  icelandHighlandsPaceAdjustCase,
  icelandHighlandsSpatialRepairCase,
  icelandRingRoadCase,
  icelandRingRoadPaceAdjustCase,
  icelandRingRoadSpatialRepairCase,
} from './iceland-highlands.example';
import {
  icelandGoldenHighlandsRepairCapturedCase,
  icelandGoldenRingRoadCapturedCase,
} from './iceland-golden-corpus.example';
import { icelandStormIcecaveFailureCase } from './iceland-storm-icecave-failure.example';
import { icelandStormRecoveryExperienceFirstCase } from './iceland-storm-recovery-experience-first.example';
import { icelandDecisionClosureStormF208Case } from './iceland-decision-closure-storm-f208.example';
import { icelandDecisionClosureRingStableCase } from './iceland-decision-closure-ring-stable.example';
import { nzDecisionClosureMilfordRainCase } from './nz-decision-closure-milford-rain.example';
import { auDecisionClosureGreatOceanFireCase } from './au-decision-closure-great-ocean-fire.example';
import { jpDecisionClosureIzuTyphoonCase } from './jp-decision-closure-izu-typhoon.example';
import {
  PERSONA_CLOSURE_REPLAY_FIXTURES,
} from './persona-closure.examples';
import fs from 'fs';
import path from 'path';
import { loadE2eClosureGolden, resolveE2eClosureGoldenPath } from './load-e2e-closure-golden.util';

function loadStormDecisionClosureGoldenIfPresent(): E2ECase | undefined {
  try {
    const goldenPath = resolveE2eClosureGoldenPath(
      'iceland-storm-icecave-failure.decision-closure.golden.json',
    );
    if (!fs.existsSync(goldenPath)) return undefined;
    const golden = loadE2eClosureGolden('iceland-storm-icecave-failure.decision-closure.golden.json');
    return {
      ...icelandStormIcecaveFailureCase,
      expected: {
        ...icelandStormIcecaveFailureCase.expected,
        scientificExpected: {
          ...icelandStormIcecaveFailureCase.expected.scientificExpected,
          decisionClosure: {
            mustHaveDecisionVerdict: true,
            chosenPlanIdIncludes: ['plan-'],
            metaDecisionAuditIncludes: ['mcTotal'],
            narrationZhIncludes: ['推荐方案', 'CGUS'],
            monteCarloMinTotalSamples: 50,
            minRejectedPlans: 1,
            ...(function roadMaterializationFromGolden(g: Record<string, unknown>) {
              const hints = (g.optimizationHints ?? {}) as {
                worldConstraintMaterialization?: { appliedEvents?: number; roadIds?: string[] };
              };
              const applied = hints.worldConstraintMaterialization?.appliedEvents ?? 0;
              if (applied < 1) return {};
              return {
                worldMaterialization: {
                  minAppliedEvents: 1,
                  roadIdsIncludes: hints.worldConstraintMaterialization?.roadIds?.slice(0, 2),
                },
              };
            })(golden),
          },
        },
      },
      metadata: {
        ...icelandStormIcecaveFailureCase.metadata,
        decisionClosureGolden: golden,
        tags: [...(icelandStormIcecaveFailureCase.metadata?.tags ?? []), 'decision-closure-captured'],
      },
    };
  } catch {
    return undefined;
  }
}

const stormDecisionClosureCase = loadStormDecisionClosureGoldenIfPresent();

/** P0：Neptune REPLACE → Abu 有界重验 replay golden */
export const PERSONA_CLOSURE_FIXTURES: readonly E2ECase[] = [...PERSONA_CLOSURE_REPLAY_FIXTURES];

/** P0：决策闭环 golden（判决书 + 路政物化）；独立门禁 `test:decision-closure-p0` */
export const ICELAND_DECISION_CLOSURE_FIXTURES: readonly E2ECase[] = [
  icelandDecisionClosureStormF208Case,
  icelandDecisionClosureRingStableCase,
  ...(stormDecisionClosureCase ? [stormDecisionClosureCase] : []),
];

/** P0：新西兰 decision-closure golden（国家包扩展样板） */
export const NZ_DECISION_CLOSURE_FIXTURES: readonly E2ECase[] = [nzDecisionClosureMilfordRainCase];

/** P0：澳大利亚 decision-closure golden */
export const AU_DECISION_CLOSURE_FIXTURES: readonly E2ECase[] = [auDecisionClosureGreatOceanFireCase];

/** P0：日本 decision-closure golden */
export const JP_DECISION_CLOSURE_FIXTURES: readonly E2ECase[] = [jpDecisionClosureIzuTyphoonCase];

/** P0：全国家 decision-closure 门禁合集 */
export const COUNTRY_DECISION_CLOSURE_FIXTURES: readonly E2ECase[] = [
  ...ICELAND_DECISION_CLOSURE_FIXTURES,
  ...NZ_DECISION_CLOSURE_FIXTURES,
  ...AU_DECISION_CLOSURE_FIXTURES,
  ...JP_DECISION_CLOSURE_FIXTURES,
];

/** 当前纳入 TD 回放门禁的全部真实 fixture（可随 EVAL 评审追加） */
export const TD_SYNTHETIC_REPLAY_FIXTURES: readonly E2ECase[] = [
  ...(function resolveSyntheticFixtures(): E2ECase[] {
    try {
      const dir = path.join(__dirname, 'generated', 'synthetic');
      const mustExist = [
        'iceland-highlands-001.engine-dso.json',
        'iceland-highlands-dem-missing-001.engine-dso.json',
        'iceland-highlands-pace-adjust-001.engine-dso.json',
        'iceland-highlands-spatial-repair-001.engine-dso.json',
        'iceland-highlands-compound-stress-001.engine-dso.json',
        'iceland-ring-road-001.engine-dso.json',
        'iceland-ring-road-pace-adjust-001.engine-dso.json',
        'iceland-ring-road-spatial-repair-001.engine-dso.json',
      ].map((f) => path.join(dir, f));
      if (mustExist.every((p) => fs.existsSync(p))) {
        return mustExist.map((p) => JSON.parse(fs.readFileSync(p, 'utf8')) as E2ECase);
      }
    } catch {
      // ignore and fallback
    }
    return [
      icelandHighlandsCase,
      icelandHighlandsDemMissingCase,
      icelandHighlandsPaceAdjustCase,
      icelandHighlandsSpatialRepairCase,
      icelandHighlandsCompoundStressCase,
      icelandRingRoadCase,
      icelandRingRoadPaceAdjustCase,
      icelandRingRoadSpatialRepairCase,
    ];
  })(),
];

export const TD_GOLDEN_REPLAY_FIXTURES: readonly E2ECase[] = [
  ...(function resolveGoldenFixtures(): E2ECase[] {
    try {
      const dir = path.join(__dirname, 'generated');
      const ring = path.join(dir, 'golden-iceland-ring-road-2026q3-001.engine-dso.json');
      const highlands = path.join(dir, 'golden-iceland-highlands-2026q3-002.engine-dso.json');
      if (fs.existsSync(ring) && fs.existsSync(highlands)) {
        // Lazy require so the repo still loads before capture is run.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const m = require('./generated/golden-engine-dso.cases') as typeof import('./generated/golden-engine-dso.cases');
        return [m.icelandGoldenRingRoadEngineDsoCase, m.icelandGoldenHighlandsRepairEngineDsoCase];
      }
    } catch {
      // ignore and fallback
    }
    return [icelandGoldenRingRoadCapturedCase, icelandGoldenHighlandsRepairCapturedCase];
  })(),
];

export const TD_REPLAY_FIXTURES: readonly E2ECase[] = [
  ...TD_SYNTHETIC_REPLAY_FIXTURES,
  icelandStormIcecaveFailureCase,
  icelandStormRecoveryExperienceFirstCase,
  ...TD_GOLDEN_REPLAY_FIXTURES,
];

export const TD_REPLAY_FIXTURE_IDS: readonly string[] = TD_REPLAY_FIXTURES.map((c) => c.id);

/**
 * CI matrix：设置 `TD_REPLAY_MATRIX_ID=<fixture id>` 时仅跑该条，便于并行分片。
 */
export function getTdReplayFixturesForRun(): E2ECase[] {
  const id = process.env.TD_REPLAY_MATRIX_ID?.trim();
  if (!id) return [...TD_REPLAY_FIXTURES];
  const found = TD_REPLAY_FIXTURES.filter((c) => c.id === id);
  if (found.length === 0) {
    throw new Error(
      `TD_REPLAY_MATRIX_ID=${id} not in TD_REPLAY_FIXTURES (${TD_REPLAY_FIXTURE_IDS.join(', ')})`,
    );
  }
  return [...found];
}

export function getTdGoldenReplayFixturesForRun(): E2ECase[] {
  const id = process.env.TD_REPLAY_MATRIX_ID?.trim();
  if (!id) return [...TD_GOLDEN_REPLAY_FIXTURES];
  const found = TD_GOLDEN_REPLAY_FIXTURES.filter((c) => c.id === id);
  if (found.length === 0) {
    return [];
  }
  return [...found];
}

export function getPersonaClosureFixturesForRun(): E2ECase[] {
  const id = process.env.TD_REPLAY_MATRIX_ID?.trim();
  if (!id) return [...PERSONA_CLOSURE_FIXTURES];
  const found = PERSONA_CLOSURE_FIXTURES.filter((c) => c.id === id);
  if (found.length === 0) {
    throw new Error(
      `TD_REPLAY_MATRIX_ID=${id} not in PERSONA_CLOSURE_FIXTURES (${PERSONA_CLOSURE_FIXTURES.map((c) => c.id).join(', ')})`,
    );
  }
  return [...found];
}

export function findTdReplayFixtureById(id: string): E2ECase | undefined {
  return TD_REPLAY_FIXTURES.find((fixture) => fixture.id === id);
}
