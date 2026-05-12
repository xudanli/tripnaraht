import { DateTime } from 'luxon';
import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type { TripDraftState, TripDraftCalendarDay, TripDraftEngineMode } from './trip-draft-state.types';

function buildCalendarRows(dto: CreateTripDraftDto, timezone: string): TripDraftCalendarDay[] {
  const rows: TripDraftCalendarDay[] = [];
  let startDate: DateTime;
  if (dto.startDate) {
    startDate = DateTime.fromISO(dto.startDate, { zone: timezone });
  } else {
    startDate = DateTime.now().setZone(timezone).plus({ days: 1 }).startOf('day');
  }

  for (let i = 0; i < dto.days; i++) {
    const date = startDate.plus({ days: i });
    const dateStr = date.toFormat('yyyy-MM-dd');
    const dt = DateTime.fromISO(dateStr, { zone: timezone });
    rows.push({
      day: i + 1,
      date: dateStr,
      weekday: dt.setLocale('zh-Hans').toFormat('EEEE'),
    });
  }
  return rows;
}

export interface BuildTripDraftStateOptions {
  tripId: string;
  dto: CreateTripDraftDto;
  /** IANA 或 luxon 可解析时区，用于日历 weekday */
  timezone: string;
  mode: TripDraftEngineMode;
}

/**
 * 从创建草案 DTO 构造初始 TripDraftState（selections/约束日志为空，供后续 LLM 或算法填充）。
 */
export function buildTripDraftStateFromDto(opts: BuildTripDraftStateOptions): TripDraftState {
  const { tripId, dto, timezone, mode } = opts;
  const mustHavePoiKeywords = dto.mustHavePois?.length ? [...dto.mustHavePois] : undefined;
  const mustIncludeSlugs = dto.must_include_poi_ids?.length ? [...dto.must_include_poi_ids] : undefined;

  return {
    tripId,
    intent: {
      rawInput: dto.userInput?.trim() || '',
      destination: dto.destination.toUpperCase().trim(),
      cities: dto.cities?.length ? [...dto.cities] : [],
      mustHavePois: [],
      mustIncludeSlugs,
      mustHavePoiKeywords,
      style: dto.style,
      intensity: dto.intensity,
      transport: dto.transport,
    },
    calendar: buildCalendarRows(dto, timezone),
    selections: [],
    constraintLog: {
      mealUsed: {},
      placeRepeatCount: {},
    },
    topology: {
      zoneTransitions: [],
    },
    uncertainty: {
      items: [],
    },
    mode,
    version: 1,
  };
}

/**
 * 状态变异后递增版本（不可变拷贝）。
 */
export function bumpTripDraftStateVersion(state: TripDraftState): TripDraftState {
  return { ...state, version: state.version + 1 };
}
