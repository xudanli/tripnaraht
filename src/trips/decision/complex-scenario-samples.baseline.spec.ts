/**
 * S-TD-01：复杂场景样例 JSON → 旅行本体约束评估（可本地复现）
 *
 * Fixture 目录：fixtures/complex-scenarios/*.dso.json
 * 命令：npm run test:td-complex-samples
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import {
  evaluateTravelOntologyConstraints,
  mergeOntologyViolationsIntoGateResult,
} from '../../decision/kernel/travel-ontology-constraints';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'complex-scenarios');

function loadDsoFixture(fileName: string): DecisionState {
  const full = path.join(FIXTURE_DIR, fileName);
  const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
  const { _comment, ...rest } = raw;
  void _comment;
  const systemState = (rest.systemState as DecisionState['systemState']) ?? {};
  const requestId = (rest.requestId as string) ?? (systemState.requestId as string) ?? 'fixture-unknown';
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

describe('S-TD-01 complex scenario fixtures (travel ontology constraints)', () => {
  it('scenario-01: hotel check-out not after check-in → travel_ontology_hotel_dates', () => {
    const dso = loadDsoFixture('scenario-01-hotel-day-boundary.dso.json');
    const v = evaluateTravelOntologyConstraints(dso);
    expect(v.some((x) => x.constraint === 'travel_ontology_hotel_dates')).toBe(true);
    const merged = mergeOntologyViolationsIntoGateResult(
      { feasible: true, violations: [] },
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 1 },
      v,
    );
    expect(merged.gateResult.gate_result).toBe('ADJUST_REQUIRED');
  });

  it('scenario-02: impossible flight connection → travel_ontology_flight_overlap', () => {
    const dso = loadDsoFixture('scenario-02-flight-transfer-impossible.dso.json');
    const v = evaluateTravelOntologyConstraints(dso);
    expect(v.some((x) => x.constraint === 'travel_ontology_flight_overlap')).toBe(true);
    const merged = mergeOntologyViolationsIntoGateResult(
      { feasible: true, violations: [] },
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 1 },
      v,
    );
    expect(merged.gateResult.gate_result).toBe('ADJUST_REQUIRED');
  });

  it('scenario-03: ontology spend over userIntent.budget → travel_ontology_budget', () => {
    const dso = loadDsoFixture('scenario-03-budget-hard-cap.dso.json');
    const v = evaluateTravelOntologyConstraints(dso);
    expect(v.some((x) => x.type === 'BUDGET' && x.constraint === 'travel_ontology_budget')).toBe(true);
    const merged = mergeOntologyViolationsIntoGateResult(
      { feasible: true, violations: [] },
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 1 },
      v,
    );
    expect(merged.gateResult.gate_result).toBe('ADJUST_REQUIRED');
  });
});
