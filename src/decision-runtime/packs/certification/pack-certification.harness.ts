/**
 * RFC-002 Phase 2 — pack rule certification harness (golden scenarios).
 */

import { loadCountryPackRules } from '../rules/pack-rule-bundle.loader';
import {
  listCountryDrivingModifierIds,
  loadCountryPackModifiers,
  resolveDrivingEnvironmentForCountry,
  resolveActivityLoadEnvironmentForCountry,
  resolveEffectiveDailyLoadThresholdForCountry,
} from '../modifiers/pack-modifier-bundle.loader';
import { executePackRuleConstraint } from '../rules/pack-rule-constraint.executor';
import type { PackConstraintEvaluation } from '../rules/pack-rule-constraint.types';

export interface PackCertificationScenario {
  scenarioId: string;
  country: string;
  semanticKey: string;
  facts: Record<string, unknown>;
  candidateUsesRoute: boolean;
  expect:
    | {
        matched: true;
        ruleId: string;
        verdict: PackConstraintEvaluation['verdict'];
      }
    | { matched: false };
}

export interface PackCertificationCaseResult {
  scenarioId: string;
  passed: boolean;
  expected: PackCertificationScenario['expect'];
  actual?: PackConstraintEvaluation;
  message?: string;
}

export interface PackCertificationReport {
  schemaId: 'tripnara.pack.certification@v1';
  country: string;
  total: number;
  passed: number;
  failed: number;
  results: PackCertificationCaseResult[];
}

export function runPackCertification(
  scenarios: PackCertificationScenario[],
  opts?: { forcePackRules?: boolean },
): PackCertificationReport {
  const prev = process.env.DECISION_PACK_RULES;
  if (opts?.forcePackRules) {
    process.env.DECISION_PACK_RULES = '1';
  }

  try {
    const country = scenarios[0]?.country ?? 'IS';
    const results: PackCertificationCaseResult[] = scenarios.map((scenario) => {
      const actual = executePackRuleConstraint({
        country: scenario.country,
        semanticKey: scenario.semanticKey,
        facts: scenario.facts,
        candidateUsesRoute: scenario.candidateUsesRoute,
      });

      if (!scenario.expect.matched) {
        const passed = !actual?.matched;
        return {
          scenarioId: scenario.scenarioId,
          passed,
          expected: scenario.expect,
          actual,
          message: passed ? undefined : `Expected no match, got ${actual?.ruleId}`,
        };
      }

      const passed =
        actual?.matched === true &&
        actual.ruleId === scenario.expect.ruleId &&
        actual.verdict === scenario.expect.verdict;

      return {
        scenarioId: scenario.scenarioId,
        passed,
        expected: scenario.expect,
        actual,
        message: passed
          ? undefined
          : `Expected ${scenario.expect.ruleId}/${scenario.expect.verdict}, got ${actual?.ruleId ?? 'none'}/${actual?.verdict ?? 'none'}`,
      };
    });

    const passed = results.filter((r) => r.passed).length;
    return {
      schemaId: 'tripnara.pack.certification@v1',
      country,
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  } finally {
    if (opts?.forcePackRules) {
      if (prev === undefined) delete process.env.DECISION_PACK_RULES;
      else process.env.DECISION_PACK_RULES = prev;
    }
  }
}

/** Validate all rule bundles for a country load without error. */
export function validateCountryPackRules(country: string): {
  country: string;
  ruleCount: number;
  ruleIds: string[];
} {
  const rules = loadCountryPackRules(country);
  return {
    country,
    ruleCount: rules.length,
    ruleIds: rules.map((r) => r.ruleId),
  };
}

/** Validate environment modifier bundles for a country. */
export function validateCountryPackModifiers(country: string): {
  country: string;
  modifierCount: number;
  modifierIds: string[];
  drivingModifierIds: string[];
  drivingEnvironment: ReturnType<typeof resolveDrivingEnvironmentForCountry>;
  activityLoad: ReturnType<typeof resolveActivityLoadEnvironmentForCountry>;
  effectiveDailyLoadThresholdHours: number;
} {
  const modifiers = loadCountryPackModifiers(country);
  const prev = process.env.DECISION_PACK_RUNTIME;
  process.env.DECISION_PACK_RUNTIME = '1';
  try {
    return {
      country,
      modifierCount: modifiers.length,
      modifierIds: modifiers.map((m) => m.modifierId),
      drivingModifierIds: listCountryDrivingModifierIds(country),
      drivingEnvironment: resolveDrivingEnvironmentForCountry(country),
      activityLoad: resolveActivityLoadEnvironmentForCountry(country),
      effectiveDailyLoadThresholdHours:
        resolveEffectiveDailyLoadThresholdForCountry(country),
    };
  } finally {
    if (prev === undefined) delete process.env.DECISION_PACK_RUNTIME;
    else process.env.DECISION_PACK_RUNTIME = prev;
  }
}
