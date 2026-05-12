import {
  normalizeExecutionPlanCoalesceVerifyRepair,
  normalizeSkillsPlanCoalesceVerifyRepair,
} from './claude-orchestrator-smart-update-normalize.util';

describe('claude-orchestrator-smart-update-normalize.util', () => {
  it('normalizeSkillsPlan: verify+repair → single smart_update', () => {
    const plan = {
      selectedSkills: [
        { skillName: 'itinerary.generate', reason: 'g', priority: 1, input: {} },
        { skillName: 'itinerary.verify', reason: 'v', priority: 2, input: { a: 1 } },
        { skillName: 'repair.apply', reason: 'r', priority: 3, input: { b: 2 } },
      ],
      executionOrder: ['itinerary.generate', 'itinerary.verify', 'repair.apply'],
      dependencies: { 'itinerary.verify': ['itinerary.generate'], 'repair.apply': ['itinerary.verify'] },
    };
    normalizeSkillsPlanCoalesceVerifyRepair(plan as any);
    expect(plan.selectedSkills.map((s) => s.skillName)).toEqual([
      'itinerary.generate',
      'itinerary.smart_update',
    ]);
    expect(plan.executionOrder).toEqual(['itinerary.generate', 'itinerary.smart_update']);
    expect(plan.dependencies['itinerary.verify']).toBeUndefined();
    expect(plan.dependencies['repair.apply']).toBeUndefined();
  });

  it('normalizeSkillsPlan: existing smart_update strips verify/repair', () => {
    const plan = {
      selectedSkills: [
        { skillName: 'itinerary.smart_update', reason: 's', priority: 1, input: {} },
        { skillName: 'itinerary.verify', reason: 'v', priority: 2, input: {} },
      ],
      executionOrder: ['itinerary.smart_update', 'itinerary.verify'],
      dependencies: {},
    };
    normalizeSkillsPlanCoalesceVerifyRepair(plan as any);
    expect(plan.selectedSkills.map((s) => s.skillName)).toEqual(['itinerary.smart_update']);
  });

  it('normalizeSkillsPlan: verify-only → smart_update 并重写 dependencies 中的引用', () => {
    const plan = {
      selectedSkills: [
        { skillName: 'itinerary.generate', reason: 'g', priority: 1, input: {} },
        { skillName: 'itinerary.verify', reason: 'v', priority: 2, input: {} },
      ],
      executionOrder: ['itinerary.generate', 'itinerary.verify'],
      dependencies: {
        narrate: ['itinerary.verify'],
        'itinerary.verify': ['itinerary.generate'],
      },
    };
    normalizeSkillsPlanCoalesceVerifyRepair(plan as any);
    expect(plan.selectedSkills[1].skillName).toBe('itinerary.smart_update');
    expect(plan.dependencies.narrate).toContain('itinerary.smart_update');
    expect(plan.dependencies['itinerary.verify']).toBeUndefined();
  });

  it('normalizeExecutionPlan: merges two steps and remaps deps', () => {
    const exec = {
      steps: [
        { id: 's1', type: 'skill', skillName: 'itinerary.generate', dependencies: [], parallel: false },
        { id: 's2', type: 'skill', skillName: 'itinerary.verify', dependencies: ['s1'], parallel: false, input: { x: 1 } },
        { id: 's3', type: 'skill', skillName: 'repair.apply', dependencies: ['s2'], parallel: false, input: { y: 2 } },
        { id: 's4', type: 'skill' as const, skillName: 'narrate', dependencies: ['s3'], parallel: false },
      ],
      parallelGroups: [],
      fallbackStrategy: { onError: 'continue' as const, retryCount: 1 },
    };
    normalizeExecutionPlanCoalesceVerifyRepair(exec as any);
    expect(exec.steps.map((x) => x.skillName)).toEqual(['itinerary.generate', 'itinerary.smart_update', 'narrate']);
    const smart = exec.steps.find((x: any) => x.skillName === 'itinerary.smart_update');
    expect(smart?.id).toBe('s2');
    expect(smart?.input).toEqual({ x: 1, y: 2 });
    const narrate = exec.steps.find((x: any) => x.skillName === 'narrate');
    expect(narrate?.dependencies).toContain('s2');
    expect(narrate?.dependencies).not.toContain('s3');
  });
});
