/**
 * Weather production pilot runner — offline/harness friendly.
 */

import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import type {
  WeatherPlanView,
  WeatherWarningObservation,
  WeatherLoopResult,
} from './weather-deterioration.types';
import { runWeatherDeteriorationDetection } from './weather-loop.orchestrator';

export interface WeatherPilotPoll {
  at: string;
  observations: WeatherWarningObservation[];
}

export interface WeatherPilotStep {
  pollIndex: number;
  at: string;
  detection: WeatherLoopResult;
}

export interface WeatherPilotReport {
  tripId: string;
  steps: WeatherPilotStep[];
  finalFacts: TravelWorldFact[];
}

export function runWeatherDeteriorationProductionPilot(input: {
  tripId: string;
  plan: WeatherPlanView;
  polls: WeatherPilotPoll[];
  existingFacts?: TravelWorldFact[];
}): WeatherPilotReport {
  let facts = input.existingFacts ?? [];
  const steps: WeatherPilotStep[] = [];
  for (let i = 0; i < input.polls.length; i++) {
    const poll = input.polls[i]!;
    const detection = runWeatherDeteriorationDetection({
      tripId: input.tripId,
      plan: input.plan,
      existingFacts: facts,
      observations: poll.observations,
      nowMs: Date.parse(poll.at),
    });
    facts = detection.facts;
    steps.push({ pollIndex: i, at: poll.at, detection });
  }
  return { tripId: input.tripId, steps, finalFacts: facts };
}
