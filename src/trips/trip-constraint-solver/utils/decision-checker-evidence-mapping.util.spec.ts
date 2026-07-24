import { mapProofEvidenceKind } from './decision-checker-evidence-mapping.util';

describe('decision-checker-evidence-mapping.util', () => {
  it('maps poi_access_capacity to destination_knowledge', () => {
    expect(
      mapProofEvidenceKind({
        entity: 'is.reynisfjara',
        constraint: 'SAFETY',
        currentFact: 'x',
        evidenceSource: 'OFFICIAL',
        evidenceType: 'poi_access_capacity',
      }),
    ).toBe('destination_knowledge');
  });
});
