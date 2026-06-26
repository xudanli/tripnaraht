/**
 * 从 NL 输入 + partialParams 构建旅行理解卡（PRD §9.2）
 */

import type { ExperienceAtomCode } from '../types/experience-atom.types';
import type { TravelUnderstandingCard } from '../types/experience-intent.types';
import type { TripContextSchema, TripPartyMember, VehicleAccessClass } from '../types/trip-context.types';
import { buildTravelUnderstandingCard } from './experience-intent.compiler';

export interface NlExperienceUnderstandingInput {
  /** 当前用户输入 */
  text: string;
  /** 历史用户消息（可选，用于累积体验意图） */
  historyTexts?: readonly string[];
  partialParams?: Record<string, unknown>;
  quickTags?: readonly string[];
}

function coerceTripDays(params: Record<string, unknown>): number | undefined {
  if (typeof params.tripDays === 'number' && params.tripDays > 0) {
    return params.tripDays;
  }
  const start = params.startDate;
  const end = params.endDate;
  if (typeof start === 'string' && typeof end === 'string') {
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      return Math.max(1, Math.ceil((e - s) / (24 * 60 * 60 * 1000)) + 1);
    }
  }
  if (typeof params.duration === 'number' && params.duration > 0) {
    return params.duration;
  }
  return undefined;
}

function mapVehicleAccess(params: Record<string, unknown>): VehicleAccessClass | undefined {
  const raw =
    params.vehicleType ??
    params.vehicle_type ??
    params.drivetrain ??
    (params.transport === 'self_drive' ? params.vehicleClass : undefined);
  const s = String(raw ?? '').toUpperCase();
  if (s.includes('4WD') || s.includes('FOUR') || s === 'SUV') return '4WD';
  if (s.includes('2WD') || s.includes('SEDAN') || s === 'SMALL') return '2WD';
  if (s.includes('AWD')) return 'AWD';
  return undefined;
}

function mapMaxDailyDriveMinutes(params: Record<string, unknown>): number | undefined {
  const hours =
    params.maxDailyDriveHours ??
    params.max_daily_drive_hours ??
    (params.pace === 'RELAXED' || params.pace === 'relaxed' ? 3 : undefined);
  if (typeof hours === 'number' && hours > 0) {
    return Math.round(hours * 60);
  }
  return undefined;
}

function interestAtomsFromParams(params: Record<string, unknown>): ExperienceAtomCode[] {
  const interests = params.preferences as Record<string, unknown> | undefined;
  const blob = [
    JSON.stringify(interests?.interests ?? interests?.style ?? ''),
    String(params.travelStyle ?? ''),
    String(params.pace ?? ''),
  ].join(' ').toLowerCase();

  const out: ExperienceAtomCode[] = [];
  if (blob.includes('photo') || blob.includes('摄影')) out.push('CINEMATIC_PHOTOGRAPHY');
  if (blob.includes('relax') || blob.includes('轻松')) out.push('SLOW_TRAVEL_RELAXATION');
  if (blob.includes('adventure') || blob.includes('冒险')) out.push('GLACIER_ADVENTURE');
  if (blob.includes('nature') || blob.includes('自然')) out.push('LOW_EFFORT_NATURE');
  return out;
}

export function buildTripContextFromNlParams(
  partialParams?: Record<string, unknown>,
  destinationRegion?: string,
): Partial<TripContextSchema> {
  const params = partialParams ?? {};
  const vehicleAccess = mapVehicleAccess(params);
  const members: TripPartyMember[] = [];
  if (params.hasElderly === true) {
    members.push({ id: 'elderly', role: 'parent', mobilityLimited: true });
  }
  if (params.hasChildren === true) {
    members.push({ id: 'child', role: 'child' });
  }

  return {
    revision: 'v1',
    destinationRegion: destinationRegion ?? String(params.destination ?? 'IS'),
    tripStart: typeof params.startDate === 'string' ? params.startDate : undefined,
    tripEnd: typeof params.endDate === 'string' ? params.endDate : undefined,
    tripDays: coerceTripDays(params),
    partySize: typeof params.partySize === 'number' ? params.partySize : undefined,
    members: members.length ? members : undefined,
    vehicle: vehicleAccess ? { accessClass: vehicleAccess } : undefined,
    budget:
      typeof params.totalBudget === 'number'
        ? {
            max: params.totalBudget,
            currency: typeof params.currency === 'string' ? params.currency : 'CNY',
          }
        : undefined,
    maxDailyDriveMinutes: mapMaxDailyDriveMinutes(params),
  };
}

export function buildExperienceUnderstandingFromNl(
  input: NlExperienceUnderstandingInput,
): TravelUnderstandingCard {
  const textParts = [...(input.historyTexts ?? []), input.text];
  const mustHave = input.partialParams?.mustHavePois;
  if (Array.isArray(mustHave)) {
    textParts.push(mustHave.join(' '));
  }
  const message = textParts.join('\n');

  const tripContext = buildTripContextFromNlParams(
    input.partialParams,
    typeof input.partialParams?.destination === 'string'
      ? input.partialParams.destination
      : undefined,
  );

  const card = buildTravelUnderstandingCard({
    message,
    quickTags: input.quickTags,
    tripContext,
  });

  const memberConditions = [...card.memberConditions];
  if (input.partialParams?.hasElderly === true && !memberConditions.some((c) => c.includes('父母') || c.includes('老人'))) {
    memberConditions.push('父母步行能力有限');
    memberConditions.push('需要低强度替代活动');
  }
  if (input.partialParams?.hasChildren === true && !memberConditions.some((c) => c.includes('儿童'))) {
    memberConditions.push('同行包含儿童，需兼顾亲子节奏');
  }

  const coreConstraints = [...card.coreConstraints];
  const days = tripContext.tripDays;
  if (days && !coreConstraints.some((c) => c.includes('天'))) {
    coreConstraints.unshift(`${days}天行程`);
  }

  const paramAtoms = interestAtomsFromParams(input.partialParams ?? {});
  if (paramAtoms.length) {
    const merged = new Map(card.experienceIntent.experienceIntents.map((i) => [i.atom, i]));
    for (const atom of paramAtoms) {
      if (!merged.has(atom)) {
        merged.set(atom, { atom, weight: 0.65, priority: 'NORMAL' });
      }
    }
    return {
      ...card,
      memberConditions,
      coreConstraints,
      experienceIntent: {
        ...card.experienceIntent,
        experienceIntents: Array.from(merged.values()),
      },
    };
  }

  return {
    ...card,
    memberConditions,
    coreConstraints,
  };
}
