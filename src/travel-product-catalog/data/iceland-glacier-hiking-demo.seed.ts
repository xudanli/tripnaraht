/**
 * 冰岛冰川徒步 Demo：Operator → Offering → Session → Rate → PlaceLink
 * Stable IDs for idempotent seed / tests.
 */

export const ICELAND_GLACIER_DEMO_IDS = {
  operatorId: 'op_demo_arctic_adventures',
  offeringId: 'offer_demo_solheim_glacier_discovery',
  sessionId: 'sess_demo_solheim_20260718_0900',
  rateAdultId: 'rate_demo_solheim_adult_std',
  rateChildId: 'rate_demo_solheim_child_std',
  experienceCode: 'EXP_GLACIER_HIKING',
  /** Place: Sólheimasandur Glacier — DB id resolved at seed time by nameEN */
  operatingAreaPlaceNameEN: 'Sólheimasandur Glacier',
} as const;

export const ICELAND_GLACIER_DEMO_OPERATOR = {
  id: ICELAND_GLACIER_DEMO_IDS.operatorId,
  brandName: 'Arctic Adventures',
  legalName: 'Arctic Adventures ehf. (demo)',
  countryCode: 'IS',
  operatingRegions: ['South Iceland', 'Reykjavik'],
  website: 'https://www.adventures.is/',
  languages: ['en', 'zh'],
  trustLevel: 'VERIFIED' as const,
  distributionChannels: ['demo_seed'],
  dataSources: ['tripnara_demo'],
};

export const ICELAND_GLACIER_DEMO_OFFERING = {
  id: ICELAND_GLACIER_DEMO_IDS.offeringId,
  nameEN: 'Sólheimajökull Glacier Discovery',
  nameCN: '索尔黑马冰川探索徒步',
  description:
    'Guided glacier hike on Sólheimajökull. Demo offering for Place↔Product catalog wiring.',
  defaultDurationMin: 180,
  included: ['guide', 'crampons', 'helmet', 'harness'],
  excluded: ['hotel_pickup', 'meals'],
  minAge: 8,
  maxWeightKg: 120,
  fitnessRequirement: 'MODERATE',
  equipmentRequired: ['waterproof_boots', 'warm_layers'],
  languages: ['en'],
  cancellationPolicy: 'Free cancel 24h before meet time; weather cancellations fully refundable',
  safetyRules: ['stay_on_roped_path', 'follow_guide'],
  bookingChannels: ['demo'],
  externalProductId: 'demo-solheim-glacier-discovery',
  status: 'PUBLISHED' as const,
  countryCode: 'IS',
  categoryCode: 'OUTDOOR_ADVENTURE',
  subtypeCode: 'GLACIER_HIKING',
  productType: 'ACTIVITY_EXPERIENCE' as const,
};

export const ICELAND_GLACIER_DEMO_SESSION = {
  id: ICELAND_GLACIER_DEMO_IDS.sessionId,
  /** local calendar date */
  localDate: '2026-07-18',
  startTimeLocal: '09:00',
  endTimeLocal: '12:00',
  meetTimeLocal: '08:30',
  latestCheckInLocal: '08:45',
  timezone: 'Atlantic/Reykjavik',
  capacityTotal: 12,
  capacityRemaining: 12,
  status: 'SCHEDULED' as const,
  minParticipants: 2,
  isGuaranteedDeparture: false,
  weatherStatus: 'CLEAR',
  externalSessionId: 'demo-2026-07-18-0900',
};

export const ICELAND_GLACIER_DEMO_RATES = [
  {
    id: ICELAND_GLACIER_DEMO_IDS.rateAdultId,
    code: 'ADULT_STD',
    nameEN: 'Adult',
    nameCN: '成人价',
    currency: 'ISK',
    amount: 14990,
    travelerType: 'ADULT',
    refundable: true,
    includesTransfer: false,
  },
  {
    id: ICELAND_GLACIER_DEMO_IDS.rateChildId,
    code: 'CHILD_STD',
    nameEN: 'Child (8–15)',
    nameCN: '儿童价',
    currency: 'ISK',
    amount: 9990,
    travelerType: 'CHILD',
    refundable: true,
    includesTransfer: false,
  },
] as const;
