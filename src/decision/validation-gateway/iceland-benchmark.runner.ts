import * as fs from 'fs';
import * as path from 'path';
import type { DecisionState } from '../kernel/decision-state.types';
import type { PhaseExecutorContext } from '../kernel/interfaces/phase-executor.interface';
import { evaluateTravelOntologyConstraints } from '../kernel/travel-ontology-constraints';
import { runIcelandSelfDriveCausalAnalysis } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { analyzeIcelandWithShift } from '../../trips/causal-runtime/domains/iceland-causal-bridge';

/** 行业参考基线（arXiv:2605.00276 多智能体旅行规划） */
export const INDUSTRY_TRIP_PLANNING_BASELINE_PCT = 77.4;

export type IcelandBenchmarkMode = 'ontology' | 'verify' | 'causal_intervention';

export interface IcelandBenchmarkExpectation {
  shouldDetectViolation: boolean;
  constraintCodes?: string[];
  minIssues?: number;
}

export interface IcelandBenchmarkCase {
  id: string;
  title: string;
  mode: IcelandBenchmarkMode;
  fixtureFile?: string;
  dso?: DecisionState;
  ctx?: PhaseExecutorContext;
  expect: IcelandBenchmarkExpectation;
}

export interface IcelandBenchmarkCaseResult {
  id: string;
  title: string;
  mode: IcelandBenchmarkMode;
  passed: boolean;
  detectedViolation: boolean;
  issueCount: number;
  constraintCodes: string[];
  expect: IcelandBenchmarkExpectation;
}

export interface IcelandBenchmarkReport {
  generatedAt: string;
  totalCases: number;
  passedCases: number;
  accuracyPct: number;
  industryBaselinePct: number;
  deltaVsIndustryPct: number;
  results: IcelandBenchmarkCaseResult[];
}

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'trips', 'decision', 'fixtures', 'complex-scenarios');

export function loadDsoFixture(fileName: string): DecisionState {
  const full = path.join(FIXTURE_DIR, fileName);
  const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
  const { _comment, ...rest } = raw;
  void _comment;
  const systemState: DecisionState['systemState'] =
    (rest.systemState as DecisionState['systemState']) ?? { requestId: 'fixture-unknown' };
  const requestId = (rest.requestId as string) ?? systemState.requestId ?? 'fixture-unknown';
  return {
    userIntent: (rest.userIntent as DecisionState['userIntent']) ?? {},
    tripState: (rest.tripState as DecisionState['tripState']) ?? {},
    environmentState: (rest.environmentState as DecisionState['environmentState']) ?? {},
    systemState: { ...systemState, requestId: systemState.requestId ?? requestId },
    requestId,
    ...(rest.travelOntologyState !== undefined && {
      travelOntologyState: rest.travelOntologyState as DecisionState['travelOntologyState'],
    }),
    ...(rest.constraints !== undefined && { constraints: rest.constraints as DecisionState['constraints'] }),
  } as DecisionState;
}

export const ICELAND_BENCHMARK_CASES: IcelandBenchmarkCase[] = [
  {
    id: 'is-01-hotel-dates',
    title: '酒店退房早于入住',
    mode: 'ontology',
    fixtureFile: 'scenario-01-hotel-day-boundary.dso.json',
    expect: { shouldDetectViolation: true, constraintCodes: ['travel_ontology_hotel_dates'] },
  },
  {
    id: 'is-02-flight-overlap',
    title: '航班转机不可行',
    mode: 'ontology',
    fixtureFile: 'scenario-02-flight-transfer-impossible.dso.json',
    expect: { shouldDetectViolation: true, constraintCodes: ['travel_ontology_flight_overlap'] },
  },
  {
    id: 'is-03-budget-cap',
    title: '本体预算硬顶超限',
    mode: 'ontology',
    fixtureFile: 'scenario-03-budget-hard-cap.dso.json',
    expect: { shouldDetectViolation: true, constraintCodes: ['travel_ontology_budget'] },
  },
  {
    id: 'is-04-compliant-ontology',
    title: '合规冰岛行程本体（无违规）',
    mode: 'ontology',
    dso: {
      requestId: 'is-04',
      userIntent: { budget: 500000, party: { count: 2 } },
      tripState: {},
      environmentState: { countryCode: 'IS' },
      systemState: { requestId: 'is-04' },
      travelOntologyState: {
        nouns: {
          hotels: [{ id: 'h1', checkIn: '2026-07-01T15:00:00Z', checkOut: '2026-07-03T11:00:00Z', nightlyPrice: 180 }],
          activities: [{ id: 'a1', price: 120 }],
        },
      },
    },
    expect: { shouldDetectViolation: false },
  },
  {
    id: 'is-05-verify-walk-overlimit',
    title: 'VERIFY：日徒步超限应检出',
    mode: 'verify',
    dso: {
      requestId: 'is-05',
      userIntent: { party: { count: 2, fitnessLevel: 'medium' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'is-05' },
    },
    ctx: {
      requestId: 'is-05',
      researchData: {},
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
      tripPlanRequest: {
        destination: 'IS',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
        days: 5,
        party: { count: 2 },
        party_profile: { fitness: 'medium' },
      },
      itinerary: {
        request_id: 'is-05',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'w1',
                type: 'WALK',
                location_ref: { name: 'Landmannalaugar trek' },
                start_window: '09:00',
                end_window: '18:00',
                evidence_refs: [],
                verified: false,
                metadata: { duration_minutes: 540, distance_meters: 20000 },
              },
            ],
          },
        ],
      },
    },
    expect: { shouldDetectViolation: true, minIssues: 1 },
  },
  {
    id: 'is-06-verify-compliant',
    title: 'VERIFY：合规短途行程应通过',
    mode: 'verify',
    dso: {
      requestId: 'is-06',
      userIntent: { budget: 20000, party: { count: 2, fitnessLevel: 'medium' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'is-06' },
    },
    ctx: {
      requestId: 'is-06',
      researchData: {},
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
      tripPlanRequest: {
        destination: 'IS',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
        days: 5,
        party: { count: 2 },
        party_profile: { fitness: 'medium' },
      },
      itinerary: {
        request_id: 'is-06',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'p1',
                type: 'POI',
                location_ref: { name: 'Seljalandsfoss' },
                start_window: '09:00',
                end_window: '12:00',
                evidence_refs: [],
                verified: false,
                metadata: { duration_minutes: 120, distance_meters: 2000 },
              },
            ],
          },
        ],
      },
    },
    expect: { shouldDetectViolation: false },
  },
  {
    id: 'is-08-causal-wind-shift',
    title: '因果：阵风抬升 P90，提前出发降低 miss',
    mode: 'causal_intervention',
    expect: { shouldDetectViolation: true, minIssues: 1 },
  },
  {
    id: 'is-09-causal-calm-route',
    title: '因果：低风条件下 miss 可控',
    mode: 'causal_intervention',
    expect: { shouldDetectViolation: false },
  },
];

export function runCausalInterventionBenchmarkCase(
  testCase: IcelandBenchmarkCase,
): IcelandBenchmarkCaseResult {
  const baseInput = {
    routeLabel: 'Vík → 冰川徒步集合点',
    distanceKm: 190,
    baseDurationMinutes: 130,
    windMps: 16,
    windExposure: 'high' as const,
    appointmentSlackMinutes: 20,
    region: 'vik',
  };

  let detectedViolation = false;
  let issueCount = 0;
  const constraintCodes: string[] = [];

  if (testCase.id === 'is-08-causal-wind-shift') {
    const base = runIcelandSelfDriveCausalAnalysis(baseInput);
    const shifted = analyzeIcelandWithShift(baseInput, 50);
    if (base.missProbability > 0.3) {
      issueCount++;
      constraintCodes.push('iceland_elevated_miss_probability');
    }
    if ((shifted.missProbabilityAfterShift ?? 1) >= base.missProbability) {
      issueCount++;
      constraintCodes.push('iceland_shift_ineffective');
    }
    detectedViolation = issueCount > 0;
  } else if (testCase.id === 'is-09-causal-calm-route') {
    const calm = runIcelandSelfDriveCausalAnalysis({
      ...baseInput,
      baseDurationMinutes: 90,
      windMps: 5,
      windExposure: 'low',
      appointmentSlackMinutes: 90,
    });
    if (calm.missProbability > 0.25) {
      issueCount++;
      constraintCodes.push('iceland_false_alarm_calm');
      detectedViolation = true;
    }
  }

  const passed = evaluateCasePass(testCase.expect, detectedViolation, issueCount, constraintCodes);
  return {
    id: testCase.id,
    title: testCase.title,
    mode: 'causal_intervention',
    passed,
    detectedViolation,
    issueCount,
    constraintCodes,
    expect: testCase.expect,
  };
}

export function runOntologyBenchmarkCase(
  testCase: IcelandBenchmarkCase,
): IcelandBenchmarkCaseResult {
  const dso = testCase.dso ?? (testCase.fixtureFile ? loadDsoFixture(testCase.fixtureFile) : null);
  if (!dso) {
    throw new Error(`Case ${testCase.id} missing dso/fixture`);
  }
  const violations = evaluateTravelOntologyConstraints(dso);
  const constraintCodes = violations.map((v) => v.constraint ?? v.type).filter(Boolean) as string[];
  const detectedViolation = violations.length > 0;
  const passed = evaluateCasePass(testCase.expect, detectedViolation, violations.length, constraintCodes);
  return {
    id: testCase.id,
    title: testCase.title,
    mode: 'ontology',
    passed,
    detectedViolation,
    issueCount: violations.length,
    constraintCodes,
    expect: testCase.expect,
  };
}

export function evaluateCasePass(
  expect: IcelandBenchmarkExpectation,
  detectedViolation: boolean,
  issueCount: number,
  constraintCodes: string[],
): boolean {
  if (detectedViolation !== expect.shouldDetectViolation) return false;
  if (expect.minIssues != null && issueCount < expect.minIssues) return false;
  if (expect.constraintCodes?.length) {
    const missing = expect.constraintCodes.some((c) => !constraintCodes.includes(c));
    if (missing) return false;
  }
  return true;
}

export function buildBenchmarkReport(results: IcelandBenchmarkCaseResult[]): IcelandBenchmarkReport {
  const passedCases = results.filter((r) => r.passed).length;
  const accuracyPct = results.length === 0 ? 0 : Math.round((passedCases / results.length) * 10000) / 100;
  return {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases,
    accuracyPct,
    industryBaselinePct: INDUSTRY_TRIP_PLANNING_BASELINE_PCT,
    deltaVsIndustryPct: Math.round((accuracyPct - INDUSTRY_TRIP_PLANNING_BASELINE_PCT) * 100) / 100,
    results,
  };
}
