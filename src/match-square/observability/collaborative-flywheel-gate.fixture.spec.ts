import { runCollabFlywheelGate } from '../../../scripts/lib/collab-flywheel-gate';

describe('collab-flywheel gate fixture', () => {
  it('passes offline golden iceland_laugavegur_anxious_blind_box_v1', () => {
    const summary = runCollabFlywheelGate();
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBeGreaterThanOrEqual(1);
  });
});
