import { ObservationGroundingService } from './observation-grounding.service';
import { reconcileObservationState } from './state-reconciliation';
import type { TravelObservationEvent } from '../observation.types';
import { isLikelyCapitalArea, isLikelyHighlandArea } from './geo-grounding';

function baseEvent(
  overrides: Partial<TravelObservationEvent> = {},
): TravelObservationEvent {
  return {
    observationId: 'obs_g',
    tripId: 'trip_1',
    dayIndex: 4,
    channel: 'LOOK_FIELD',
    source: 'IPHONE_CAMERA',
    intent: 'CHECK_ROAD',
    capturedAt: '2026-07-25T15:00:00Z',
    submittedAt: '2026-07-25T15:00:01Z',
    mediaRefs: ['m1'],
    captureRevision: 1,
    captureRevisions: [],
    spatialContext: {},
    tripContext: {},
    observations: [],
    verificationStatus: 'UNVERIFIED',
    privacy: {
      containsFace: false,
      containsPlate: false,
      containsDocument: false,
      redactionApplied: false,
      retentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1',
    },
    status: 'GROUNDING',
    ...overrides,
  };
}

describe('NARA Look S3 grounding', () => {
  const grounding = new ObservationGroundingService();

  it('classifies capital vs highland GPS bands', () => {
    expect(isLikelyCapitalArea(64.14, -21.9)).toBe(true);
    expect(isLikelyHighlandArea(64.01, -19.1)).toBe(true);
  });

  it('F208 + highland GPS + 2WD plan → MISMATCH + VERIFIED', () => {
    const event = baseEvent({
      spatialContext: {
        latitude: 64.01,
        longitude: -19.1,
        accuracyMeters: 8,
      },
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
          value: 'F208',
          confidence: 0.9,
          source: 'OCR',
        },
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED',
          value: '2WD',
          confidence: 0.9,
          source: 'OCR',
        },
      ],
    });

    const result = grounding.ground(event, {
      nearbyRoadIds: ['F208'],
      plannedRoadIds: ['F208'],
      plannedRequiresFroad: true,
      drivetrain: '2WD',
      vehicleClass: 'SEDAN',
      roadStatuses: {
        F208: {
          isOpen: true,
          updatedAt: '2026-07-25T12:00:00Z',
          source: 'road.is',
        },
      },
    });

    expect(result.roadMatch).toBe('MATCHED');
    expect(result.vehicleRoadFit).toBe('MISMATCH');
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      ),
    ).toBe(true);
    expect(result.officialRoadOpen).toBe(true);
  });

  it('F208 OCR + Reykjavik GPS → CONFLICT / IMAGE_LOCATION_MISMATCH', () => {
    const event = baseEvent({
      spatialContext: {
        latitude: 64.14,
        longitude: -21.9,
        accuracyMeters: 10,
      },
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
          value: 'F208',
          confidence: 0.9,
          source: 'OCR',
        },
      ],
    });
    const result = reconcileObservationState(event, {});
    expect(result.roadMatch).toBe('CONFLICT');
    expect(result.verificationStatus).toBe('CONFLICTING');
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH',
      ),
    ).toBe(true);
  });

  it('closed field sign vs official OPEN → ROAD_STATUS_CONFLICT', () => {
    const event = baseEvent({
      spatialContext: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
          value: 'F208',
          confidence: 0.9,
          source: 'OCR',
        },
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
          value: true,
          confidence: 0.85,
          source: 'OCR',
        },
      ],
    });
    const result = grounding.ground(event, {
      nearbyRoadIds: ['F208'],
      roadStatuses: {
        F208: { isOpen: true, updatedAt: '2026-07-25T10:00:00Z' },
      },
    });
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'DATA_CONFLICT.ROAD_STATUS_CONFLICT',
      ),
    ).toBe(true);
    expect(result.verificationStatus).toBe('CONFLICTING');
  });

  it('activity operator mismatch → WRONG_MEETING_POINT', () => {
    const event = baseEvent({
      intent: 'CHECK_ACTIVITY_ENTRY',
      spatialContext: { latitude: 64.14, longitude: -21.9, accuracyMeters: 8 },
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED',
          value: 'Visitor Centre',
          confidence: 0.85,
          source: 'OCR',
        },
      ],
    });
    const result = grounding.ground(event, {
      bookingOperatorName: 'Booking Center',
      bookingMeetingPointName: 'Booking Center',
    });
    expect(result.meetingPoint).toBe('MISMATCH');
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'EXECUTION_DEVIATION.WRONG_MEETING_POINT',
      ),
    ).toBe(true);
  });
});
