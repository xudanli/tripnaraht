import {
  extractRelatedRoadIdFromLookFacts,
  tryBuildLookRoadSuspectedClosedHint,
} from './extract-look-road-closed-hint.util';

describe('extract-look-road-closed-hint', () => {
  it('builds hint from CLOSED_SIGN + road id value', () => {
    const hint = tryBuildLookRoadSuspectedClosedHint({
      lookObservationId: 'obs',
      tripId: 'trip',
      facts: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
          value: 'F208',
          confidence: 0.9,
          source: 'OCR',
        },
      ],
    });
    expect(hint?.roadId).toBe('F208');
    expect(hint?.authoritative).toBe(false);
    expect(hint?.predicate).toBe('look.field_observation');
  });

  it('returns null without suspected-closed fact', () => {
    expect(
      tryBuildLookRoadSuspectedClosedHint({
        lookObservationId: 'obs',
        tripId: 'trip',
        facts: [
          {
            semanticType: 'OBSERVATION',
            semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
            value: 'F208',
            confidence: 0.9,
            source: 'OCR',
          },
        ],
      }),
    ).toBeNull();
  });

  it('extractRelatedRoadId prefers FROAD then CLOSED value', () => {
    expect(
      extractRelatedRoadIdFromLookFacts([
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
          value: 'f210',
          confidence: 1,
          source: 'OCR',
        },
      ]),
    ).toBe('F210');
  });
});
