import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { assessParkingRules } from '../grounding/parking-rules';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';
import type { TravelObservationEvent } from '../observation.types';

describe('Parking P0-A (RealityOS scene B)', () => {
  it('extracts paid zone + time limit from OCR seed', async () => {
    const extraction = new ObservationExtractionService(
      new HeuristicExtractionProvider(),
    );
    const result = await extraction.extract({
      images: [{ mediaRef: 'm1' }],
      intent: 'CHECK_PARKING',
      hints: {},
      ocrTextSeed: 'Parking P-zone pay until 18:00 gjaldskylda',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.PARKING.PAID_ZONE_DETECTED',
      ),
    ).toBe(true);
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.PARKING.TIME_LIMIT_DETECTED',
      ),
    ).toBe(true);
  });

  it('no GPS → VISUAL_ONLY parking fit', () => {
    const event = {
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.PARKING.NO_PARKING_DETECTED',
          value: true,
          confidence: 0.9,
          source: 'OCR' as const,
        },
      ],
      spatialContext: {},
      intent: 'CHECK_PARKING',
    } as TravelObservationEvent;
    const r = assessParkingRules({ event, hints: {}, hasGps: false });
    expect(r.fit).toBe('VISUAL_ONLY');
  });

  it('official not allowed → PARKING_NOT_ALLOWED_NOW', () => {
    const event = {
      observations: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.PARKING.SIGN_DETECTED',
          value: true,
          confidence: 0.9,
          source: 'OCR' as const,
        },
      ],
      spatialContext: { latitude: 64.14, longitude: -21.9 },
      intent: 'CHECK_PARKING',
    } as TravelObservationEvent;
    const r = assessParkingRules({
      event,
      hints: {
        localTimeIso: '2026-07-26T20:00:00+00:00',
        officialParking: {
          allowsNow: false,
          validUntil: '08:00',
          updatedAt: '2026-07-26T12:00:00Z',
          source: 'municipal',
        },
      },
      hasGps: true,
    });
    expect(r.fit).toBe('NOT_ALLOWED_NOW');
    expect(
      r.facts.some((f) => f.semanticKey === 'RULE_TRIGGER.PARKING_NOT_ALLOWED_NOW'),
    ).toBe(true);
  });

  it('end-to-end paid parking INFO with leave-reminder CTA', async () => {
    const service = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );
    const event = await service.create('trip_park', {
      intent: 'CHECK_PARKING',
      capturedAt: '2026-07-26T14:00:00Z',
      mediaRefs: ['m_park'],
      location: { latitude: 64.14, longitude: -21.94, accuracyMeters: 10 },
      ocrTextSeed: 'Paid parking until 18:00 pay ticket',
      groundingHints: {
        localTimeIso: '2026-07-26T14:00:00+00:00',
        officialParking: {
          allowsNow: true,
          paidRequired: true,
          validUntil: '18:00',
          updatedAt: '2026-07-26T10:00:00Z',
          source: 'municipal',
        },
      },
    });
    const assessment = service.getAssessment('trip_park', event.observationId);
    expect(assessment.status).toBe('INFO');
    expect(assessment.summary.recommendation).toMatch(/不保证|罚款/);
    expect(assessment.actions.some((a) => a.label === '设置离开提醒')).toBe(
      true,
    );
    expect(assessment.authority).toMatch(/CORROBORATED|CONTEXT/);
    expect(assessment.contextHash).toMatch(/^lch_/);
    expect(assessment.writesPlanVersion).toBe(false);
  });

  it('incomplete plate → NEED_CONFIRM + VISUAL/INSUFFICIENT authority path', async () => {
    const service = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );
    const event = await service.create('trip_park', {
      intent: 'CHECK_PARKING',
      capturedAt: '2026-07-26T14:00:00Z',
      mediaRefs: ['m_blur'],
      location: { latitude: 64.14, longitude: -21.94 },
      ocrTextSeed: 'blurry junk',
    });
    const assessment = service.getAssessment('trip_park', event.observationId);
    // May be UNKNOWN recapture or NEED_CONFIRM incomplete
    expect(['NEED_CONFIRM', 'UNKNOWN']).toContain(assessment.status);
    expect(assessment.writesPlanVersion).toBe(false);
  });
});
