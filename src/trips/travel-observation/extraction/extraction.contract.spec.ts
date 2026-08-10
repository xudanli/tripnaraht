import { HeuristicExtractionProvider } from './heuristic-extraction.provider';
import { validateRawVisualObservation } from './extraction-schema';
import {
  containsForbiddenDecisionLanguage,
  stripCommandLikeFacts,
} from './forbidden-output.guard';
import { mapRawVisualToObservationFacts } from './observation-ontology.mapper';
import { ObservationExtractionService } from './observation-extraction.service';
import type { RawVisualObservation } from './raw-visual.types';

describe('NARA Look S2 extraction', () => {
  const provider = new HeuristicExtractionProvider();
  const extraction = new ObservationExtractionService(provider);

  it('validates RawVisualObservation schema', () => {
    const ok = validateRawVisualObservation({
      sceneType: 'ROAD_SIGN',
      detectedObjects: [],
      recognizedText: [{ text: 'F208', confidence: 0.9 }],
      extractedFacts: [{ key: 'road.id', value: 'F208', confidence: 0.9 }],
      uncertainties: [],
      requiredAdditionalViews: [],
    });
    expect(ok.ok).toBe(true);

    const bad = validateRawVisualObservation({
      sceneType: 'NOT_A_SCENE',
      detectedObjects: [],
      recognizedText: [],
      extractedFacts: [],
      uncertainties: [],
      requiredAdditionalViews: [],
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects forbidden decision language', () => {
    expect(containsForbiddenDecisionLanguage('这条道路安全')).toBe(true);
    expect(containsForbiddenDecisionLanguage('F208 ahead')).toBe(false);
    const stripped = stripCommandLikeFacts([
      { key: 'apply.command', value: true, confidence: 1 },
      { key: 'road.id', value: 'F208', confidence: 0.9 },
    ]);
    expect(stripped).toHaveLength(1);
  });

  it('extracts F208 + maps to FROAD semantic key', async () => {
    const result = await extraction.extract({
      images: [{ mediaRef: 'media_f208' }],
      intent: 'CHECK_ROAD',
      hints: {},
      ocrTextSeed: 'F208 Highland Road',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw.sceneType).toBe('ROAD_SIGN');
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
      ),
    ).toBe(true);
  });

  it('requests recapture when road id unreadable', async () => {
    const result = await extraction.extract({
      images: [{ mediaRef: 'blurry' }],
      intent: 'CHECK_ROAD',
      hints: {},
      ocrTextSeed: 'something unclear',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw.requiredAdditionalViews.length).toBeGreaterThan(0);
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'DATA_UNCERTAINTY.ROAD_ID_UNKNOWN',
      ),
    ).toBe(true);
  });

  it('does not infer 4WD from SUV appearance alone', async () => {
    const result = await extraction.extract({
      images: [{ mediaRef: 'suv_side' }],
      intent: 'CHECK_VEHICLE',
      hints: {},
      ocrTextSeed: 'tall SUV body no badge',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.facts.some(
        (f) => f.semanticKey === 'OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED',
      ),
    ).toBe(false);
    expect(
      result.facts.some(
        (f) =>
          f.semanticKey === 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN',
      ),
    ).toBe(true);
    expect(result.raw.requiredAdditionalViews.join('')).toMatch(/2WD\/4WD|尾标/);
  });

  it('detects Yaris + explicit 2WD', async () => {
    const result = await extraction.extract({
      images: [{ mediaRef: 'rear' }],
      intent: 'CHECK_VEHICLE',
      hints: {},
      ocrTextSeed: 'Toyota Yaris 2WD',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.facts.some(
        (f) =>
          f.semanticKey === 'OBSERVATION.VEHICLE.MODEL_DETECTED' &&
          f.value === 'Toyota Yaris',
      ),
    ).toBe(true);
    expect(
      result.facts.some(
        (f) =>
          f.semanticKey === 'OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED' &&
          f.value === '2WD',
      ),
    ).toBe(true);
  });

  it('schema-invalid provider output → SCHEMA_INVALID', async () => {
    const badProvider = {
      providerId: 'bad',
      extract: async () => ({ sceneType: 'NOPE' }),
    };
    const svc = new ObservationExtractionService(
      provider,
      badProvider as never,
    );
    const result = await svc.extract({
      images: [{ mediaRef: 'x' }],
      intent: 'CHECK_ROAD',
      hints: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('SCHEMA_INVALID');
  });

  it('maps ontology without leaking unfrozen keys', () => {
    const raw: RawVisualObservation = {
      sceneType: 'ACTIVITY_ENTRY',
      detectedObjects: [],
      recognizedText: [{ text: 'Booking Center', confidence: 0.9 }],
      extractedFacts: [
        {
          key: 'activity.operator_name',
          value: 'Booking Center',
          confidence: 0.9,
        },
        { key: 'unknown.foo', value: 1, confidence: 0.9 },
      ],
      uncertainties: [],
      requiredAdditionalViews: [],
    };
    const facts = mapRawVisualToObservationFacts(raw);
    expect(
      facts.every((f) => f.semanticKey.startsWith('OBSERVATION.') || f.semanticKey.startsWith('DATA_')),
    ).toBe(true);
    expect(facts.some((f) => f.semanticKey.includes('unknown'))).toBe(false);
  });
});
