/**
 * Build iOS client projection from Decision Case structured flags.
 */

import type { InsuranceCoverageTier } from '../rental-insurance';
import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';
import {
  projectIcelandSelfDriveSituationClient,
  type IcelandSelfDriveSituationClientV1,
} from './iceland-self-drive-situation.client';
import { resolveFactsFromCaseFlags } from './resolve-iceland-self-drive-facts';
import type { DaylightDrivingLoadInput } from '../road-weather/iceland-road-weather.types';
import type { IcelandWinterKnowledgeInput } from '../winter/iceland-winter-knowledge.types';

export function buildIcelandSelfDriveSituationClientFromCaseFlags(input: {
  tripId?: string;
  hasFRoad: boolean;
  hasGravel: boolean;
  highWind: boolean;
  vehicleType?: string;
  /** driving-settings 展示名，优先写入 vehicleRoadFit.vehicleLabel */
  vehicleClassLabel?: string | null;
  /** driving-settings.rentalRestrictions，含 no_f_road 时强制禁止 F 路 */
  rentalRestrictions?: string[];
  fRoadIdHint?: string;
  fRoadAllowed?: unknown;
  windGustMs?: number;
  segmentLengthKm?: number;
  isNight?: boolean;
  driverExperience?: 'NONE' | 'BASIC' | 'EXPERIENCED';
  daylight?: DaylightDrivingLoadInput;
  winter?: IcelandWinterKnowledgeInput;
  gravelParking?: boolean;
  unpavedSpur?: boolean;
  fordCrossing?: boolean;
  coverageTier?: InsuranceCoverageTier;
}): IcelandSelfDriveSituationClientV1 | undefined {
  const noFRoad =
    (input.rentalRestrictions ?? []).includes('no_f_road') ||
    (input.rentalRestrictions ?? []).includes('no_highland');
  const fRoadAllowed = noFRoad ? false : input.fRoadAllowed;

  const facts = resolveFactsFromCaseFlags({
    hasFRoad: input.hasFRoad,
    hasGravel: input.hasGravel,
    highWind: input.highWind,
    vehicleType: input.vehicleType,
    fRoadIdHint: input.fRoadIdHint,
    fRoadAllowed,
    windGustMs: input.windGustMs,
  });

  let weather = facts.weather;
  if (weather) {
    weather = {
      ...weather,
      segmentLengthKm: input.segmentLengthKm ?? weather.segmentLengthKm,
      isNight:
        input.isNight ??
        weather.isNight ??
        (input.daylight != null && input.daylight.nightExposureMinutes > 0),
      driverExperience:
        input.driverExperience ??
        weather.driverExperience ??
        facts.vehicleRoadFit.driverExperience,
    };
  }

  const vehicleRoadFit = {
    ...facts.vehicleRoadFit,
    driverExperience:
      input.driverExperience ?? facts.vehicleRoadFit.driverExperience,
  };

  const situation = evaluateIcelandSelfDriveSituation({
    tripId: input.tripId,
    scenarioId: 'CLIENT_BFF',
    vehicleRoadFit,
    weather,
    daylight: input.daylight ?? facts.daylight,
    winter: input.winter ?? facts.winter,
    executeFuelRunbookOnBlock: false,
  });

  return projectIcelandSelfDriveSituationClient(situation, {
    tripId: input.tripId,
    vehicleClassLabel: input.vehicleClassLabel,
    insurance: {
      exposure: {
        gravelRoad: input.hasGravel,
        gravelParking: input.gravelParking ?? input.hasGravel,
        windExposed: input.highWind,
        unpavedSpur: input.unpavedSpur ?? input.hasGravel,
        fRoadOrHighland: input.hasFRoad,
        fordCrossing:
          input.fordCrossing === true ||
          input.hasFRoad ||
          (input.rentalRestrictions ?? []).includes('no_wading'),
      },
      coverageTier: input.coverageTier,
    },
  });
}
