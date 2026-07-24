import type { ExplorationInput } from '../../trips/exploration/types/exploration.types';
import {
  ICELAND_2WD_DEFAULT_PROHIBITED_ROAD_CLASSES,
  ICELAND_DEFAULT_PICKUP_LOCATION,
  ICELAND_KEF_COUNTER_HOURS,
} from '../../trips/exploration/config/exploration-rental-contract.config';
import { TRAVEL_WORLD_PREDICATES } from '../contracts/travel-world-fact.types';

export interface ExplorationRentalContractFactDraft {
  keySuffix: string;
  subjectType: string;
  subjectId: string;
  predicate: string;
  payload: unknown;
  confidence: number;
  sourceType: string;
  sourceRef: string;
}

function normalizeVehicleType(raw?: string): '2WD' | '4WD' {
  const v = String(raw ?? '').toUpperCase();
  if (v.includes('4WD') || v.includes('AWD') || v.includes('4X4')) return '4WD';
  return '2WD';
}

function buildPickupArrivalIso(startDate: string, pickupTimeLocal: string): string {
  const [h, m] = pickupTimeLocal.split(':');
  const hour = h?.padStart(2, '0') ?? '10';
  const minute = m?.padStart(2, '0') ?? '00';
  return `${startDate}T${hour}:${minute}:00.000Z`;
}

/** 探索条件 → RentalContract / Flight 事实草稿（冰岛 P0） */
export function projectExplorationRentalContractFacts(
  input: ExplorationInput,
): ExplorationRentalContractFactDraft[] {
  const isIceland = input.destinationCodes.some((c) => c.toUpperCase() === 'IS');
  if (!isIceland) return [];

  const contractId = 'rental_contract_kef';
  const vehicleType = normalizeVehicleType(input.mobilityContext?.vehicleType);
  const pickupLocation =
    input.rentalContext?.pickupLocation?.trim().toUpperCase() ||
    ICELAND_DEFAULT_PICKUP_LOCATION;
  const pickupTimeLocal = input.rentalContext?.pickupTimeLocal ?? '10:00';
  const afterHoursConfirmed = input.rentalContext?.afterHoursPickupConfirmed ?? false;

  const drafts: ExplorationRentalContractFactDraft[] = [
    {
      keySuffix: 'rental_counter_hours',
      subjectType: 'RentalContract',
      subjectId: contractId,
      predicate: 'rental.counterHours',
      payload: { ...ICELAND_KEF_COUNTER_HOURS },
      confidence: 0.85,
      sourceType: 'supplier_contract',
      sourceRef: 'iceland_rental_default_template',
    },
    {
      keySuffix: 'rental_after_hours_pickup',
      subjectType: 'RentalContract',
      subjectId: contractId,
      predicate: 'rental.afterHoursPickupConfirmed',
      payload: afterHoursConfirmed,
      confidence: input.rentalContext?.afterHoursPickupConfirmed === undefined ? 0.6 : 0.9,
      sourceType: 'user_declaration',
      sourceRef: 'exploration_rental_context',
    },
    {
      keySuffix: 'flight_kef_arrival',
      subjectType: 'Flight',
      subjectId: 'flight_kef_arrival',
      predicate: 'transport.scheduledArrival',
      payload: buildPickupArrivalIso(input.dateRange.startDate, pickupTimeLocal),
      confidence: input.rentalContext?.pickupTimeLocal ? 0.75 : 0.5,
      sourceType: 'user_declaration',
      sourceRef: 'exploration_rental_pickup_time',
    },
  ];

  if (vehicleType === '2WD') {
    for (const roadClass of ICELAND_2WD_DEFAULT_PROHIBITED_ROAD_CLASSES) {
      drafts.push({
        keySuffix: `rental_prohibited_${String(roadClass).toLowerCase()}`,
        subjectType: 'RentalContract',
        subjectId: contractId,
        predicate: TRAVEL_WORLD_PREDICATES.PROHIBITED_ROAD_CLASS,
        payload: roadClass,
        confidence: 0.75,
        sourceType: 'supplier_contract',
        sourceRef: 'iceland_2wd_standard_contract',
      });
    }
  }

  if (pickupLocation !== ICELAND_DEFAULT_PICKUP_LOCATION) {
    drafts.push({
      keySuffix: 'rental_pickup_location',
      subjectType: 'RentalContract',
      subjectId: contractId,
      predicate: 'rental.pickupLocation',
      payload: pickupLocation,
      confidence: 0.9,
      sourceType: 'user_declaration',
      sourceRef: 'exploration_rental_context',
    });
  }

  return drafts;
}
