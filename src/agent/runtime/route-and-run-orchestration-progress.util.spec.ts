import {
  orchestrationStepProgressMessageZh,
  orchestrationStepProgressPercent,
} from './route-and-run-orchestration-progress.util';

describe('route-and-run-orchestration-progress.util', () => {
  it('maps RESEARCH with destination hint', () => {
    expect(orchestrationStepProgressPercent('RESEARCH')).toBe(18);
    const msg = orchestrationStepProgressMessageZh('RESEARCH', '冰岛');
    expect(msg).toContain('冰岛');
    expect(msg).not.toContain('[L3-PROOF');
  });
});
