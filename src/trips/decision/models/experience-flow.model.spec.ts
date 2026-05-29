import {
  EXPERIENCE_FLOW_RESEARCH_KEY,
  EXPERIENCE_FLOW_SCHEMA_V1,
  applyBehaviorSignalsToExperienceFlow,
  projectExperienceFlowFromTraceSignals,
  readExperienceFlowFromResearchData,
} from './experience-flow.model';

describe('ExperienceFlowModel (Iceland Golden Path)', () => {
  it('storm: frustration circuit → EMPATHY_RECOVERY with low friction capacity', () => {
    const flow = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EMPATHY_RECOVERY',
      frustration_circuit_triggered: true,
      stability_mode_active: true,
    });
    expect(flow.schemaVersion).toBe(EXPERIENCE_FLOW_SCHEMA_V1);
    expect(flow.tempo).toBe('EMPATHY_RECOVERY');
    expect(flow.currentFrictionCapacity).toBeLessThanOrEqual(0.25);
    expect(flow.narrativeTone).toBe('empathetic_reassurance');
    expect(flow.surpriseBuffer).toBeLessThan(0.1);
  });

  it('recovery: EXPERIENCE_FIRST → ACCELERATED with higher exploration quota', () => {
    const flow = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EXPERIENCE_FIRST',
      frustration_circuit_triggered: false,
      stability_mode_active: false,
    });
    expect(flow.tempo).toBe('ACCELERATED');
    expect(flow.surpriseBuffer).toBeGreaterThan(0.3);
    expect(flow.currentFrictionCapacity).toBeGreaterThan(0.65);
    expect(flow.narrativeTone).toBe('curious_discovery');
  });

  it('stability without frustration → BALANCED tempo', () => {
    const flow = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EXPERIENCE_FIRST',
      frustration_circuit_triggered: false,
      stability_mode_active: true,
    });
    expect(flow.tempo).toBe('BALANCED');
    expect(flow.narrativeTone).toBe('balanced_warm');
  });

  it('fatigue behavior signal degrades friction capacity toward recovery', () => {
    const base = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EXPERIENCE_FIRST',
      frustration_circuit_triggered: false,
      stability_mode_active: false,
    });
    const adjusted = applyBehaviorSignalsToExperienceFlow(base, [
      { type: 'fatigue_rejection', confidence: 0.9, signal: 'too_intense' },
    ]);
    expect(adjusted.currentFrictionCapacity).toBeLessThan(base.currentFrictionCapacity);
    expect(adjusted.tempo).toBe('EMPATHY_RECOVERY');
  });

  it('readExperienceFlowFromResearchData round-trips __experience_flow', () => {
    const flow = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EMPATHY_RECOVERY',
      frustration_circuit_triggered: true,
      stability_mode_active: true,
    });
    const rd = { [EXPERIENCE_FLOW_RESEARCH_KEY]: flow };
    expect(readExperienceFlowFromResearchData(rd)).toEqual(flow);
  });
});
