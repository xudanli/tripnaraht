import { NotFoundException } from '@nestjs/common';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { RENTAL_P0_REQUIRED_VIEWS } from '../rental/rental-evidence.types';
import { RentalEvidencePackageStore } from '../rental/rental-evidence.store';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';

const COMPLETE_MEDIA = [
  'media_front_left',
  'media_front_right',
  'media_rear_left',
  'media_rear_right',
  'media_left_side',
  'media_right_side',
  'media_front_only',
  'media_rear_only',
  'media_dash',
];

function makeService() {
  return new ObservationService(
    new ObservationRepository(),
    new ObservationExtractionService(new HeuristicExtractionProvider()),
    new ObservationGroundingService(),
    new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    undefined,
    new RentalEvidencePackageStore(),
  );
}

describe('Rental EvidencePackage P0-B (CHECK_RENTAL_HANDOVER)', () => {
  it('extracts mileage / fuel / damage cues from OCR seed', async () => {
    const extraction = new ObservationExtractionService(
      new HeuristicExtractionProvider(),
    );
    const result = await extraction.extract({
      images: COMPLETE_MEDIA.map((mediaRef) => ({ mediaRef })),
      intent: 'CHECK_RENTAL_HANDOVER',
      hints: {},
      ocrTextSeed: 'pickup odometer mileage 45210 km fuel 3/4 scratch on door',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.RENTAL.MILEAGE_DETECTED',
      ),
    ).toBe(true);
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.RENTAL.FUEL_LEVEL_DETECTED',
      ),
    ).toBe(true);
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.RENTAL.DAMAGE_SUSPECTED',
      ),
    ).toBe(true);
  });

  it('incomplete angles → NEED_CONFIRM + no complete package', async () => {
    const service = makeService();
    const event = await service.create('trip_rental', {
      intent: 'CHECK_RENTAL_HANDOVER',
      capturedAt: '2026-07-26T10:00:00Z',
      mediaRefs: ['media_one'],
      ocrTextSeed: 'pickup rental handover',
    });
    const assessment = service.getAssessment(
      'trip_rental',
      event.observationId,
    );
    expect(assessment.status).toBe('NEED_CONFIRM');
    expect(assessment.decisionProblem?.semanticKey).toBe(
      'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE',
    );
    expect(assessment.writesPlanVersion).toBe(false);

    const pkg = service.getEvidencePackage('trip_rental', event.observationId);
    expect(pkg.complete).toBe(false);
    expect(pkg.missingViews.length).toBeGreaterThan(0);
    expect(pkg.liabilityAssigned).toBe(false);
    expect(pkg.autoSentToLessor).toBe(false);
    expect(pkg.exportStatus).toBe('NOT_REQUESTED');
    expect(pkg.writesPlanVersion).toBe(false);
  });

  it('complete views → INFO package + safety invariants', async () => {
    const service = makeService();
    const event = await service.create('trip_rental', {
      intent: 'CHECK_RENTAL_HANDOVER',
      capturedAt: '2026-07-26T10:00:00Z',
      mediaRefs: COMPLETE_MEDIA,
      ocrTextSeed: 'pickup odometer mileage 12000 km fuel full IS-AB 123',
      groundingHints: {
        rentalHandover: {
          handoverType: 'PICKUP',
          bookingId: 'bk_rental_1',
          capturedViews: [...RENTAL_P0_REQUIRED_VIEWS],
        },
      },
    });
    const assessment = service.getAssessment(
      'trip_rental',
      event.observationId,
    );
    expect(assessment.status).toBe('INFO');
    expect(assessment.summary.impact).toMatch(/不会自动发送|不.*责任/);
    expect(assessment.writesPlanVersion).toBe(false);

    const pkg = service.getEvidencePackage('trip_rental', event.observationId);
    expect(pkg.complete).toBe(true);
    expect(pkg.type).toBe('RENTAL_PICKUP');
    expect(pkg.handoverType).toBe('PICKUP');
    expect(pkg.bookingId).toBe('bk_rental_1');
    expect(pkg.mediaHashes).toHaveLength(COMPLETE_MEDIA.length);
    expect(pkg.liabilityAssigned).toBe(false);
    expect(pkg.autoSentToLessor).toBe(false);
    expect(pkg.exportStatus).toBe('NOT_REQUESTED');
    expect(pkg.writesPlanVersion).toBe(false);
  });

  it('non-rental observation → 404 EvidencePackage', async () => {
    const service = makeService();
    const event = await service.create('trip_rental', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T10:00:00Z',
      mediaRefs: ['m1'],
      ocrTextSeed: 'F208',
    });
    expect(() =>
      service.getEvidencePackage('trip_rental', event.observationId),
    ).toThrow(NotFoundException);
  });
});
