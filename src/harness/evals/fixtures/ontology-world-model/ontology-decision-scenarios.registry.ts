export { buildVehicleRouteMismatchScenario } from './scenarios/vehicle-route-mismatch.fixture';
export { buildInsuranceGapScenario } from './scenarios/insurance-gap.fixture';
export { buildStrongWindCamperScenario } from './scenarios/strong-wind-camper.fixture';
export { buildVisaUnconfirmedScenario } from './scenarios/visa-unconfirmed.fixture';
export { buildFlightRentalCounterConflictScenario } from './scenarios/flight-rental-conflict.fixture';

import { buildVehicleRouteMismatchScenario } from './scenarios/vehicle-route-mismatch.fixture';
import { buildInsuranceGapScenario } from './scenarios/insurance-gap.fixture';
import { buildStrongWindCamperScenario } from './scenarios/strong-wind-camper.fixture';
import { buildVisaUnconfirmedScenario } from './scenarios/visa-unconfirmed.fixture';
import { buildFlightRentalCounterConflictScenario } from './scenarios/flight-rental-conflict.fixture';
import type { OntologyDecisionScenarioDefinition, OntologyDecisionScenarioFixture } from './ontology-decision-scenario.types';

/** §24 五个典型决策场景 — Harness 注册表 */
export const ONTOLOGY_DECISION_SCENARIO_REGISTRY: OntologyDecisionScenarioDefinition[] = [
  buildVehicleRouteMismatchScenario().definition,
  buildInsuranceGapScenario().definition,
  buildStrongWindCamperScenario().definition,
  buildVisaUnconfirmedScenario().definition,
  buildFlightRentalCounterConflictScenario().definition,
];

export function getOntologyDecisionScenario(caseId: string): OntologyDecisionScenarioFixture | undefined {
  const builders: Record<string, () => OntologyDecisionScenarioFixture> = {
    'ONT-SCENARIO-001-VEHICLE-ROUTE-MISMATCH': buildVehicleRouteMismatchScenario,
    'ONT-SCENARIO-002-INSURANCE-GAP': buildInsuranceGapScenario,
    'ONT-SCENARIO-003-STRONG-WIND-CAMPER': buildStrongWindCamperScenario,
    'ONT-SCENARIO-004-VISA-UNCONFIRMED': buildVisaUnconfirmedScenario,
    'ONT-SCENARIO-005-FLIGHT-RENTAL-CONFLICT': buildFlightRentalCounterConflictScenario,
  };
  const build = builders[caseId];
  return build ? build() : undefined;
}

export function buildAllOntologyDecisionScenarioFixtures(): OntologyDecisionScenarioFixture[] {
  return ONTOLOGY_DECISION_SCENARIO_REGISTRY.map(
    (d) => getOntologyDecisionScenario(d.caseId)!,
  );
}
