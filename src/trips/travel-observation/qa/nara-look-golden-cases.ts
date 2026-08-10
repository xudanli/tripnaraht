/**
 * NARA Look P0 · Golden Set cases (S6-QA-01)
 * Table-driven Pilot scenarios — keep in sync with OPEN_QUESTIONS Q1–Q8.
 */

export type LookGoldenExpectation = {
  status?:
    | 'INFO'
    | 'NOTICE'
    | 'NEED_CONFIRM'
    | 'SUGGEST_REPLACE'
    | 'EXECUTION_BLOCK'
    | 'UNKNOWN';
  statusNot?: 'EXECUTION_BLOCK';
  verificationStatus?: string;
  semanticKey?: string;
  hasPreviewAction?: boolean;
  previewRefPrefix?: string;
  linkedDecisionProblem?: boolean;
  constraintBridgeKey?: string;
  writesPlanVersion: false;
  channel: 'LOOK_FIELD';
};

export type LookGoldenCase = {
  id: string;
  title: string;
  intent:
    | 'CHECK_ROAD'
    | 'CHECK_VEHICLE'
    | 'CHECK_ACTIVITY_ENTRY'
    | 'CHECK_PARKING'
    | 'CHECK_RENTAL_HANDOVER';
  ocrTextSeed?: string;
  mediaRefs?: string[];
  location?: { latitude: number; longitude: number; accuracyMeters?: number };
  groundingHints?: Record<string, unknown>;
  expect: LookGoldenExpectation;
};

/** Highland F208 approx */
const HIGHLAND = {
  latitude: 64.01,
  longitude: -19.1,
  accuracyMeters: 8,
};

/** Reykjavik approx */
const CAPITAL = {
  latitude: 64.14,
  longitude: -21.94,
  accuracyMeters: 12,
};

const F208_2WD_HINTS = {
  nearbyRoadIds: ['F208'],
  plannedRoadIds: ['F208'],
  plannedRequiresFroad: true,
  drivetrain: '2WD' as const,
  vehicleClass: 'SEDAN',
  roadStatuses: {
    F208: {
      isOpen: true,
      updatedAt: '2026-07-25T12:00:00Z',
      source: 'road.is',
    },
  },
};

export const NARA_LOOK_GOLDEN_CASES: LookGoldenCase[] = [
  {
    id: 'LOOK-G-01',
    title: 'No GPS + F208 → INFO, never road EXECUTION_BLOCK (Q5)',
    intent: 'CHECK_ROAD',
    ocrTextSeed: 'F208',
    expect: {
      status: 'INFO',
      statusNot: 'EXECUTION_BLOCK',
      semanticKey: 'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
      hasPreviewAction: false,
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-02',
    title: 'F208 + highland GPS + 2WD plan → EXECUTION_BLOCK + Decision Preview',
    intent: 'CHECK_ROAD',
    ocrTextSeed: 'F208',
    location: HIGHLAND,
    groundingHints: F208_2WD_HINTS,
    expect: {
      status: 'EXECUTION_BLOCK',
      verificationStatus: 'VERIFIED',
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      hasPreviewAction: true,
      previewRefPrefix: 'decision:look_dp_',
      linkedDecisionProblem: true,
      constraintBridgeKey: 'OFFICIAL_IS_FROAD_2WD',
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-03',
    title: 'F208 OCR + Reykjavik GPS → CONFLICTING, no EXECUTION_BLOCK',
    intent: 'CHECK_ROAD',
    ocrTextSeed: 'F208',
    location: CAPITAL,
    expect: {
      statusNot: 'EXECUTION_BLOCK',
      verificationStatus: 'CONFLICTING',
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-04',
    title: 'Closed sign without GPS → NOTICE only',
    intent: 'CHECK_ROAD',
    ocrTextSeed: 'ROAD CLOSED LOKAÐ',
    expect: {
      status: 'NOTICE',
      statusNot: 'EXECUTION_BLOCK',
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-05',
    title: 'Vehicle 2WD badge with highland F-road plan → BLOCK when grounded',
    intent: 'CHECK_VEHICLE',
    ocrTextSeed: 'Toyota Yaris 2WD',
    location: HIGHLAND,
    groundingHints: F208_2WD_HINTS,
    expect: {
      // May be BLOCK if FROAD mismatch facts present, else not Apply
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-06',
    title: 'Activity entry meeting-point mismatch → NEED_CONFIRM / Preview',
    intent: 'CHECK_ACTIVITY_ENTRY',
    ocrTextSeed: 'Ice Cave Tours Meeting Point B',
    location: { latitude: 64.05, longitude: -16.2, accuracyMeters: 15 },
    groundingHints: {
      bookingMeetingPointName: 'Meeting Point A',
      bookingOperatorName: 'Ice Cave Tours',
    },
    expect: {
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-07',
    title: 'Parking paid zone + official allows → INFO (no absolute fine claim)',
    intent: 'CHECK_PARKING',
    ocrTextSeed: 'Paid parking until 18:00',
    location: { latitude: 64.14, longitude: -21.94, accuracyMeters: 10 },
    groundingHints: {
      officialParking: {
        allowsNow: true,
        paidRequired: true,
        validUntil: '18:00',
        updatedAt: '2026-07-26T10:00:00Z',
        source: 'municipal',
      },
    },
    expect: {
      status: 'INFO',
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
  {
    id: 'LOOK-G-08',
    title:
      'Rental handover incomplete angles → NEED_CONFIRM (no liability / no auto-send)',
    intent: 'CHECK_RENTAL_HANDOVER',
    ocrTextSeed: 'pickup rental handover',
    mediaRefs: ['media_rental_partial'],
    expect: {
      status: 'NEED_CONFIRM',
      semanticKey: 'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE',
      writesPlanVersion: false,
      channel: 'LOOK_FIELD',
    },
  },
];

/** Pilot Go/No-Go checklist — engineering evidence only; Legal/CS sign-off separate */
export const NARA_LOOK_PILOT_GATES = [
  {
    id: 'PG-01',
    gate: 'No Look Apply / PlanVersion write on assessment path',
    required: true,
  },
  {
    id: 'PG-02',
    gate: 'ObservationChannel = LOOK_FIELD (not Assessment Lane)',
    required: true,
  },
  {
    id: 'PG-03',
    gate: 'No GPS never yields road EXECUTION_BLOCK',
    required: true,
  },
  {
    id: 'PG-04',
    gate: 'F208+2WD yields EXECUTION_BLOCK + Decision Preview only',
    required: true,
  },
  {
    id: 'PG-05',
    gate: 'Assessment GET 409 until COMPLETED',
    required: true,
  },
  {
    id: 'PG-06',
    gate: 'Recapture keeps observationId + captureRevision++',
    required: true,
  },
  {
    id: 'PG-07',
    gate: 'Member/Advisor cannot Confirm Apply; Advisor no Capture',
    required: true,
  },
  {
    id: 'PG-08',
    gate: 'Media TTL eng default LOOK_MEDIA_SHORT_TERM_V1',
    required: true,
  },
  {
    id: 'PG-09',
    gate: 'Legal CONFIRM media TTL for production Pilot',
    required: true,
    owner: 'Legal',
  },
  {
    id: 'PG-10',
    gate: 'SIGNATURES.md joint sign-off',
    required: true,
    owner: 'Joint',
  },
] as const;
