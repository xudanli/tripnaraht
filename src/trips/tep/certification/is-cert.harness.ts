/**
 * IS-CERT golden scenario harness — TEP planning-period validator.
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §8
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ExecutabilityStatus, RuleOutcome, SelfDriveProfile } from '../contracts/tep-self-drive.types';
import type { TepValidationInput } from '../validation/tep-validation.types';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';

export interface IsCertScenario {
  scenarioId: string;
  description?: string;
  input: {
    tripId: string;
    countryCode: string;
    profile: SelfDriveProfile;
    dailyDrivePlans: TepValidationInput['dailyDrivePlans'];
    roadConditions?: TepValidationInput['roadConditions'];
    activityArrivals?: TepValidationInput['activityArrivals'];
  };
  expect: {
    status: ExecutabilityStatus;
    ruleIds: string[];
    outcomes: RuleOutcome[];
  };
}

export interface IsCertCaseResult {
  scenarioId: string;
  passed: boolean;
  expected: IsCertScenario['expect'];
  actual: {
    status: ExecutabilityStatus;
    ruleIds: string[];
    outcomes: RuleOutcome[];
  };
  message?: string;
}

export interface IsCertReport {
  schemaId: 'tripnara.tep.is_cert@v1';
  total: number;
  passed: number;
  failed: number;
  results: IsCertCaseResult[];
}

export function loadIsCertScenariosFromFile(
  relativePath = 'data/destination-packs/is/certification/tep-is-cert.scenarios.json',
): IsCertScenario[] {
  const path = join(process.cwd(), relativePath);
  return JSON.parse(readFileSync(path, 'utf8')) as IsCertScenario[];
}

export function runIsCertHarness(
  scenarios: IsCertScenario[],
  opts?: { forcePackRules?: boolean },
): IsCertReport {
  const prevRules = process.env.DECISION_PACK_RULES;
  if (opts?.forcePackRules) {
    process.env.DECISION_PACK_RULES = '1';
  }

  try {
    const results: IsCertCaseResult[] = scenarios.map((scenario) => {
      const assessment = validateTepPlanningSnapshot({
        tripId: scenario.input.tripId,
        countryCode: scenario.input.countryCode,
        profile: scenario.input.profile,
        dailyDrivePlans: scenario.input.dailyDrivePlans,
        roadConditions: scenario.input.roadConditions,
        activityArrivals: scenario.input.activityArrivals,
      });

      const actual = {
        status: assessment.status,
        ruleIds: assessment.ruleResults.map((r) => r.ruleId),
        outcomes: assessment.ruleResults.map((r) => r.outcome),
      };

      const statusPass = actual.status === scenario.expect.status;
      const rulesPass = scenario.expect.ruleIds.every((id) => actual.ruleIds.includes(id));
      const outcomesPass = scenario.expect.outcomes.every((o) => actual.outcomes.includes(o));
      const passed = statusPass && rulesPass && outcomesPass;

      return {
        scenarioId: scenario.scenarioId,
        passed,
        expected: scenario.expect,
        actual,
        message: passed
          ? undefined
          : `Expected status=${scenario.expect.status} rules=${scenario.expect.ruleIds.join(',')} outcomes=${scenario.expect.outcomes.join(',')}; got status=${actual.status} rules=${actual.ruleIds.join(',')} outcomes=${actual.outcomes.join(',')}`,
      };
    });

    const passed = results.filter((r) => r.passed).length;
    return {
      schemaId: 'tripnara.tep.is_cert@v1',
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  } finally {
    if (opts?.forcePackRules) {
      if (prevRules === undefined) delete process.env.DECISION_PACK_RULES;
      else process.env.DECISION_PACK_RULES = prevRules;
    }
  }
}
