/** TEP Iceland Limited Pilot — stable fixture IDs */

export const TEP_PILOT_USER_ID = 'a0a77777-7777-4777-8777-777777777701';
export const TEP_PILOT_USER_EMAIL = 'pilot-tep@tripnara.internal';

export const PILOT_IS_01_TRIP_ID = 'pilot_is_01';
export const PILOT_IS_01_PLAN_VERSION_ID = 'plan_pilot_is_01_v1';
export const PILOT_IS_01_DAY_ID = 'pilot_is_01_day1';
export const PILOT_IS_01_ITEM_START = 'pilot_is_01_start';
/** Matches IS-CERT-302 activity_stop_1 → item id for writeback */
export const PILOT_IS_01_ITEM_STOP = 'stop_1';

export const PILOT_IS_02_TRIP_ID = 'pilot_is_02';
export const PILOT_IS_02_PLAN_VERSION_ID = 'plan_pilot_is_02_v1';
export const PILOT_IS_02_DAY_ID = 'pilot_is_02_day3';
export const PILOT_IS_02_ITEM_START = 'pilot_is_02_start';
/** Matches IS-CERT-301 activity_glacier_hike */
export const PILOT_IS_02_ITEM_GLACIER = 'glacier_hike';
export const PILOT_IS_02_ROAD_REF = 'segment:cert_301:F208';

export const PILOT_IS_03_TRIP_ID = 'pilot_is_03';
export const PILOT_IS_03_PLAN_VERSION_ID = 'plan_pilot_is_03_v1';
export const PILOT_IS_03_DAY_ID = 'pilot_is_03_day2';
export const PILOT_IS_03_ITEM_START = 'pilot_is_03_start';
/** Matches IS-CERT-303 activity_coastal_walk */
export const PILOT_IS_03_ITEM_COASTAL = 'coastal_walk';
export const PILOT_IS_03_FALLBACK_POI = 'poi_indoor_museum';

export const PILOT_IS_04_TRIP_ID = 'pilot_is_04';
export const PILOT_IS_04_PLAN_VERSION_ID = 'plan_pilot_is_04_v1';
export const PILOT_IS_04_DAY_ID = 'pilot_is_04_day1';
export const PILOT_IS_04_ITEM_START = 'pilot_is_04_start';
/** Matches IS-CERT-405 activity_stop_405 */
export const PILOT_IS_04_ITEM_STOP = 'stop_405';

export const PILOT_IS_05_TRIP_ID = 'pilot_is_05';
export const PILOT_IS_05_PLAN_VERSION_ID = 'plan_pilot_is_05_v1';
export const PILOT_IS_05_DAY_ID = 'pilot_is_05_day1';
export const PILOT_IS_05_ITEM_START = 'pilot_is_05_start';
/** Matches IS-CERT-102 item_hotel */
export const PILOT_IS_05_ITEM_HOTEL = 'remote_hotel';

export const PILOT_IS_06_TRIP_ID = 'pilot_is_06';
export const PILOT_IS_06_PLAN_VERSION_ID = 'plan_pilot_is_06_v1';
export const PILOT_IS_06_DAY_ID = 'pilot_is_06_day1';
export const PILOT_IS_06_ITEM_START = 'pilot_is_06_start';
/** Matches IS-CERT-302 activity_stop_1 for concurrent REMOVE */
export const PILOT_IS_06_ITEM_STOP = 'stop_6';

export const PILOT_IS_07_TRIP_ID = 'pilot_is_07';
export const PILOT_IS_07_PLAN_VERSION_ID = 'plan_pilot_is_07_v1';
export const PILOT_IS_07_DAY_ID = 'pilot_is_07_day1';
export const PILOT_IS_07_ITEM_START = 'pilot_is_07_start';
export const PILOT_IS_07_ITEM_END = 'pilot_is_07_end';
export const PILOT_IS_07_ROAD_REF = 'segment:cert_001:F208';

export const PILOT_IS_08_TRIP_ID = 'pilot_is_08';
export const PILOT_IS_08_PLAN_VERSION_ID = 'plan_pilot_is_08_v1';
export const PILOT_IS_08_DAY_ID = 'pilot_is_08_day1';
export const PILOT_IS_08_ITEM_START = 'pilot_is_08_start';
export const PILOT_IS_08_ITEM_END = 'pilot_is_08_end';
export const PILOT_IS_08_ROAD_REF = 'segment:cert_004:F208';

export const PILOT_IS_09_TRIP_ID = 'pilot_is_09';
export const PILOT_IS_09_PLAN_VERSION_ID = 'plan_pilot_is_09_v1';
export const PILOT_IS_09_DAY_ID = 'pilot_is_09_day1';
export const PILOT_IS_09_ITEM_START = 'pilot_is_09_start';
/** IS-CERT-003 activity_item_b */
export const PILOT_IS_09_ITEM_APPOINTMENT = 'lagoon_booking';

export const PILOT_IS_10_TRIP_ID = 'pilot_is_10';
export const PILOT_IS_10_PLAN_VERSION_ID = 'plan_pilot_is_10_v1';
export const PILOT_IS_10_DAY_ID = 'pilot_is_10_day1';
export const PILOT_IS_10_ITEM_START = 'pilot_is_10_start';
export const PILOT_IS_10_ITEM_END = 'pilot_is_10_end';
export const PILOT_IS_10_ROAD_REF = 'segment:cert_103:F208';

export type TepPilotTemplateId =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | 'all'
  | '302'
  | 'planning-all';

export const TEP_PILOT_TEMPLATE_TO_CERT: Record<
  Exclude<TepPilotTemplateId, 'all' | 'planning-all'>,
  string
> = {
  '01': 'IS-CERT-302',
  '302': 'IS-CERT-302',
  '02': 'IS-CERT-301',
  '03': 'IS-CERT-303',
  '04': 'IS-CERT-405',
  '05': 'IS-CERT-102',
  '06': 'IS-CERT-302',
  '07': 'IS-CERT-001',
  '08': 'IS-CERT-004',
  '09': 'IS-CERT-003',
  '10': 'IS-CERT-103',
};

export const TEP_PILOT_TRIP_BY_TEMPLATE: Record<
  Exclude<TepPilotTemplateId, 'all' | 'planning-all'>,
  string
> = {
  '01': PILOT_IS_01_TRIP_ID,
  '302': PILOT_IS_01_TRIP_ID,
  '02': PILOT_IS_02_TRIP_ID,
  '03': PILOT_IS_03_TRIP_ID,
  '04': PILOT_IS_04_TRIP_ID,
  '05': PILOT_IS_05_TRIP_ID,
  '06': PILOT_IS_06_TRIP_ID,
  '07': PILOT_IS_07_TRIP_ID,
  '08': PILOT_IS_08_TRIP_ID,
  '09': PILOT_IS_09_TRIP_ID,
  '10': PILOT_IS_10_TRIP_ID,
};

export const ALL_PILOT_TRIP_IDS = [
  PILOT_IS_01_TRIP_ID,
  PILOT_IS_02_TRIP_ID,
  PILOT_IS_03_TRIP_ID,
  PILOT_IS_04_TRIP_ID,
  PILOT_IS_05_TRIP_ID,
  PILOT_IS_06_TRIP_ID,
  PILOT_IS_07_TRIP_ID,
  PILOT_IS_08_TRIP_ID,
  PILOT_IS_09_TRIP_ID,
  PILOT_IS_10_TRIP_ID,
] as const;

export const TEP_PILOT_PLANNING_TEMPLATES = ['05', '07', '08', '09', '10'] as const;

const PILOT_TEMPLATE_ALIASES: Record<string, TepPilotTemplateId> = {
  '1': '01',
  '2': '02',
  '3': '03',
  '4': '04',
  '5': '05',
  '6': '06',
  '7': '07',
  '8': '08',
  '9': '09',
};

export type TepPilotConcreteTemplateId = Exclude<TepPilotTemplateId, 'all' | 'planning-all'>;

export function parsePilotTemplateToken(raw: string): TepPilotTemplateId {
  const token = raw.trim();
  const normalized = PILOT_TEMPLATE_ALIASES[token] ?? token;
  if (
    normalized === '01' ||
    normalized === '02' ||
    normalized === '03' ||
    normalized === '04' ||
    normalized === '05' ||
    normalized === '06' ||
    normalized === '07' ||
    normalized === '08' ||
    normalized === '09' ||
    normalized === '10' ||
    normalized === 'all' ||
    normalized === 'planning-all' ||
    normalized === '302'
  ) {
    return normalized;
  }
  throw new Error(
    `Unknown template token "${raw}" (use 01-10|all|planning-all; comma-separated lists allowed)`,
  );
}

export function resolvePilotTemplates(
  template: TepPilotTemplateId,
): TepPilotConcreteTemplateId[] {
  if (template === 'all') return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  if (template === 'planning-all') return [...TEP_PILOT_PLANNING_TEMPLATES];
  return [template];
}

/** Parse `--template=07,08,09,10` or single `01` / `all` / `planning-all`. */
export function parsePilotTemplateArg(raw: string): TepPilotConcreteTemplateId[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Missing --template value (use 01-10|all|planning-all; comma-separated allowed)');
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw new Error('Empty --template list');
    }
    if (parts.some((part) => {
      const token = parsePilotTemplateToken(part);
      return token === 'all' || token === 'planning-all';
    })) {
      throw new Error('Cannot combine all/planning-all with other templates in --template');
    }

    const seenTripIds = new Set<string>();
    const templates: TepPilotConcreteTemplateId[] = [];
    for (const part of parts) {
      for (const template of resolvePilotTemplates(parsePilotTemplateToken(part))) {
        const tripId = TEP_PILOT_TRIP_BY_TEMPLATE[template];
        if (seenTripIds.has(tripId)) continue;
        seenTripIds.add(tripId);
        templates.push(template);
      }
    }
    return templates;
  }

  return resolvePilotTemplates(parsePilotTemplateToken(trimmed));
}
