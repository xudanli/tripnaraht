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
import fs from 'fs';
import path from 'path';

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

export function findTdReplayFixtureById(id: string): E2ECase | undefined {
  return TD_REPLAY_FIXTURES.find((fixture) => fixture.id === id);
}
