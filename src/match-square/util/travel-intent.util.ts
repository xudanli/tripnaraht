import { BadRequestException } from '@nestjs/common';
import type { OdysseyIntakeProfile } from '../../odyssey-intake/types/odyssey-intake.types';
import type { UpsertTravelIntentDto } from '../dto/match-square.dto';
import type { TravelIntentBudgetFlex } from '../types/match-square.types';

const TAG_MAP: Record<string, string> = {
  photo_hunter: 'photographer',
  budget_mode: 'budget_flexible',
  slow_pace: 'relaxed_pace',
  social_on: 'social',
  open_to_match: 'seeking_team',
};

const BUDGET_FLEX_VALUES = new Set<TravelIntentBudgetFlex>(['flexible', 'budget', 'comfort']);

export interface NormalizedTravelIntentInput {
  destinationScope: string;
  startDate: string;
  endDate: string;
  budgetFlex: TravelIntentBudgetFlex;
  openToCarpool: boolean;
  note: string | null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

/**
 * 归一化 POST travel-intent 请求体。
 * 兼容 camelCase / snake_case，以及前端常用的 destination 别名。
 */
export function normalizeUpsertTravelIntentInput(
  dto: UpsertTravelIntentDto,
): NormalizedTravelIntentInput {
  const destinationScope = pickString(
    dto.destinationScope,
    dto.destination_scope,
    dto.destination,
    dto.intentDestination,
    dto.intent_destination,
  );
  if (!destinationScope) {
    throw new BadRequestException(
      '需提供 destinationScope（或 destination_scope / destination）',
    );
  }

  const startDate = pickString(dto.startDate, dto.start_date);
  if (!startDate) {
    throw new BadRequestException('需提供 startDate（或 start_date），格式 YYYY-MM-DD');
  }

  const endDate = pickString(dto.endDate, dto.end_date);
  if (!endDate) {
    throw new BadRequestException('需提供 endDate（或 end_date），格式 YYYY-MM-DD');
  }

  const budgetRaw = pickString(dto.budgetFlex, dto.budget_flex) as TravelIntentBudgetFlex | undefined;
  const budgetFlex =
    budgetRaw && BUDGET_FLEX_VALUES.has(budgetRaw) ? budgetRaw : 'flexible';

  const openToCarpool = pickBoolean(dto.openToCarpool, dto.open_to_carpool) ?? true;
  const note = pickString(dto.note) ?? null;

  return {
    destinationScope,
    startDate,
    endDate,
    budgetFlex,
    openToCarpool,
    note,
  };
}

/** 从 Odyssey Profile 提取可被雷达匹配的 capability 标签 */
export function deriveCapabilityTags(profile: OdysseyIntakeProfile): string[] {
  const tags = new Set<string>();
  for (const raw of profile.tripIntentTags ?? []) {
    const mapped = TAG_MAP[raw];
    if (mapped) tags.add(mapped);
  }

  if (profile.rawScores.financial_flexibility >= 1) {
    tags.add('budget_flexible');
  }

  return [...tags];
}
