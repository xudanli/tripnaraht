/**
 * Anchor probation start after verify-runtime + smoke pass.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PRODUCTION_PROBATION_DAYS } from './production-cutover.catalog';
import { resolveProductionTransitionPhase } from './production-transition-phase.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');
const BASELINE_PATH = path.join(OUT_DIR, 'cutover-baseline.json');

export interface CutoverProbationBaseline {
  schemaId: 'tripnara.production_cutover_baseline@v1';
  probationStartedAt: string;
  probationDays: number;
  cutoverComplete: boolean;
  verifyRuntimePass: boolean;
  smokePass: boolean;
  phase: ReturnType<typeof resolveProductionTransitionPhase>;
  note: string;
}

export function anchorProbationBaseline(input: {
  verifyRuntimePass: boolean;
  smokePass: boolean;
  force?: boolean;
}): CutoverProbationBaseline | null {
  if (!input.verifyRuntimePass || !input.smokePass) {
    return null;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (fs.existsSync(BASELINE_PATH) && !input.force) {
    try {
      return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as CutoverProbationBaseline;
    } catch {
      /* rewrite */
    }
  }

  const baseline: CutoverProbationBaseline = {
    schemaId: 'tripnara.production_cutover_baseline@v1',
    probationStartedAt: new Date().toISOString(),
    probationDays: PRODUCTION_PROBATION_DAYS,
    cutoverComplete: true,
    verifyRuntimePass: true,
    smokePass: true,
    phase: resolveProductionTransitionPhase(),
    note: 'Probation anchor = verify-runtime PASS + smoke PASS (not restart time)',
  };

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  return baseline;
}

export function readProbationBaseline(): CutoverProbationBaseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as CutoverProbationBaseline;
  } catch {
    return null;
  }
}
