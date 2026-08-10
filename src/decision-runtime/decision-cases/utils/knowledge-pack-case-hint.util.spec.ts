import { buildKnowledgePackHintFromCaseFlags } from './knowledge-pack-case-hint.util';

describe('knowledge-pack-case-hint.util', () => {
  it('projects F-road + 2WD into non-ALLOW knowledge pack hint', () => {
    const hint = buildKnowledgePackHintFromCaseFlags({
      hasFRoad: true,
      hasGravel: false,
      highWind: true,
      vehicleType: '2WD',
      fRoadIdHint: 'F208',
    });
    expect(hint).toBeDefined();
    expect(hint!.roadBaseType).toBe('F_ROAD');
    expect(['NEED_CONFIRM', 'REPLAN_REQUIRED', 'BLOCK']).toContain(hint!.verdictGate);
    expect(hint!.vehicleRoadFitGate).toBe('REJECT');
  });

  it('projects paved clear route toward ALLOW or mild confirm', () => {
    const hint = buildKnowledgePackHintFromCaseFlags({
      hasFRoad: false,
      hasGravel: false,
      highWind: false,
      vehicleType: '2WD',
    });
    expect(hint).toBeDefined();
    expect(['ALLOW', 'NEED_CONFIRM']).toContain(hint!.verdictGate);
  });
});
