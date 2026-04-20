import { DecisionKnobRegistry } from './decision-knob.registry';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';

describe('DecisionKnobRegistry', () => {
  it('applies registered mapping and appends audit', () => {
    const reg = new DecisionKnobRegistry();
    reg.register<'SLOW'>('pacePreference', ({ params, strength01, audit }) => {
      params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin ?? 0) + 60 * strength01;
      audit.push({ key: 'pacePreference', reason: 'PACE_SLOW', strength01 });
    });

    const params = createDefaultDecisionParams();
    const audit: any[] = [];
    reg.apply('pacePreference', {
      params,
      atom: { scope: 'SESSION', value: 'SLOW', confidence: 0.8, updatedAt: new Date().toISOString() } as any,
      strength01: 0.5,
      audit,
    });

    expect(params.constraints.bufferTimeMin).toBe(30);
    expect(audit[0].reason).toBe('PACE_SLOW');
  });
});

