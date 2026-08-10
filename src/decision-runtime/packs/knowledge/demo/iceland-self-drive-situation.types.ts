/**
 * Unified Iceland self-drive evaluation input/output for Gateway / Solver / Execution Risk.
 */

import type { FuelAssessment } from '../fuel/iceland-fuel.types';
import type { IcelandDriveRunbookExecutionResult } from '../runbooks/iceland-drive-runbook.types';
import type {
  CrossDomainAggregateResult,
  DaylightDrivingLoadAssessment,
  DaylightDrivingLoadInput,
  DrivingWeatherImpact,
  DrivingWeatherImpactInput,
  VehicleRoadFitAssessment,
  VehicleRoadFitInput,
} from '../road-weather/iceland-road-weather.types';
import type { IcelandFuelAssessmentInput } from '../fuel/iceland-fuel.types';
import type {
  IcelandWinterKnowledgeAssessments,
  IcelandWinterKnowledgeInput,
} from '../winter/iceland-winter-knowledge.types';

export interface IcelandSelfDriveSituationInput {
  tripId?: string;
  scenarioId?: string;
  vehicleRoadFit?: VehicleRoadFitInput;
  weather?: DrivingWeatherImpactInput;
  fuel?: IcelandFuelAssessmentInput;
  /** Structured night / load / lodging daylight facts — never invent dusk times. */
  daylight?: DaylightDrivingLoadInput;
  /** Attraction / activity / plow / lodging winter slices — structured only. */
  winter?: IcelandWinterKnowledgeInput;
  /** When fuel is BLOCK, optionally execute fuel runbook. */
  executeFuelRunbookOnBlock?: boolean;
  userSafeStopped?: boolean;
  /** Optional explicit event to run a non-fuel runbook after aggregate. */
  runbookEventType?: string;
  runbookContextExtras?: Record<string, unknown>;
}

export interface IcelandSelfDriveSituationResult {
  schemaId: 'tripnara.iceland.self_drive_situation@v1';
  tripId?: string;
  scenarioId?: string;
  vehicleRoadFit?: VehicleRoadFitAssessment;
  weatherImpact?: DrivingWeatherImpact;
  fuelAssessment?: FuelAssessment;
  daylightLoad?: DaylightDrivingLoadAssessment;
  winter?: IcelandWinterKnowledgeAssessments;
  aggregate: CrossDomainAggregateResult;
  runbook?: IcelandDriveRunbookExecutionResult;
  /** Consistent product-facing verdict for cards / gateway. */
  verdict: {
    gate: 'ALLOW' | 'NEED_CONFIRM' | 'REPLAN_REQUIRED' | 'BLOCK';
    summary: string;
    primaryActions: string[];
  };
}
