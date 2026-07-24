import { MetaSkillEngineService } from './meta-skill-engine.service';
import type {
  EvolvableSkill,
  ExplorationStrategy,
  SkillEvolverTask,
  SkillTrajectory,
} from '../interfaces/skill-evolver.types';

function makeSkill(overrides: Partial<EvolvableSkill> = {}): EvolvableSkill {
  return {
    skillId: 'country_pack.IS',
    name: 'IS',
    version: 1,
    content: '',
    body: 'countryCode=IS\n高地 F-road',
    frontmatter: { skill_id: 'country_pack.IS', name: 'IS', version: 1 },
    tags: [],
    applicableScenarios: [],
    filePath: '/tmp/is.md',
    artifactType: 'country_pack',
    ...overrides,
  };
}

function makeTraj(score: number, extra = ''): SkillTrajectory {
  return {
    trajectoryId: `traj-${score}`,
    skillId: 'country_pack.IS',
    skillVersion: 1,
    taskIds: ['t1'],
    steps: [
      {
        stepIndex: 0,
        observation: 'obs',
        thought: 'think',
        action: `ALLOW 高地 ${extra}`,
        result: 'done',
        timestamp: new Date().toISOString(),
      },
    ],
    taskCompleted: true,
    score,
    createdAt: new Date().toISOString(),
  };
}

describe('MetaSkillEngineService', () => {
  const tasks: SkillEvolverTask[] = [
    {
      id: 't1',
      description: 'highlands',
      initialObservation: '7月冰岛高地',
    },
  ];
  const assertions = [
    { type: 'task_completed' as const, value: 'true', weight: 2 },
    { type: 'trajectory_contains' as const, value: 'allow', weight: 1 },
  ];

  it('force edits when exploration ties below forceEditBelowScore', async () => {
    const skill = makeSkill();
    const baselineTraj = makeTraj(79);
    const exploreTraj = makeTraj(79, 'same');

    const registry = {
      load: jest.fn(() => skill),
      save: jest.fn(),
      resolveTasksAndAssertions: jest.fn(() => ({ tasks, assertions })),
    };
    const store = { save: jest.fn() };
    const strategy: ExplorationStrategy = {
      strategyId: 'S1',
      philosophy: 'p',
      approach: 'a',
      emphasis: 'e',
    };
    const explorer = {
      generate: jest.fn(async () => [strategy]),
    };
    const executor = {
      run: jest.fn(async () => exploreTraj),
    };
    const evaluator = {
      evaluateSkillOnBatch: jest.fn(async () => ({
        avgScore: 79,
        trajectories: [baselineTraj],
      })),
      score: jest.fn(async (t: SkillTrajectory) => t.score ?? 79),
      describeFailedAssertions: jest.fn(() => ['trajectory_contains="allow"']),
    };
    const analyzer = {
      analyze: jest.fn(async () => ({
        successFactors: [],
        rootCauses: ['missing allow'],
        skillAdditions: ['明确输出 ALLOW'],
        skillModifications: [],
        skillDeletions: [],
        emphasisItems: [],
        executionLapses: [],
      })),
    };
    const proposed = makeSkill({ version: 2, body: 'updated body with ALLOW 高地' });
    const editor = {
      edit: jest.fn(async () => proposed),
      fixAuditIssues: jest.fn(async (s: EvolvableSkill) => s),
    };
    const auditor = {
      audit: jest.fn(async () => ({ passed: true, issues: [] })),
    };
    const llm = { isAvailable: () => true };
    const regressionGate = {
      check: jest.fn(() => ({ passed: true, reasons: [] })),
    };
    const batchComparator = {
      compareBatches: jest.fn(() => ({
        baselineAvgScore: 79,
        candidateAvgScore: 90,
        scoreDelta: 11,
        baselineSuccessRate: 1,
        candidateSuccessRate: 1,
        improved: true,
        perTask: [],
        tauPlus: null,
        tauMinus: null,
      })),
      scoresFromTrajectories: jest.fn(() => [{ taskId: 't1', score: 79, taskCompleted: true, trajectoryId: 'x' }]),
      passesGate: jest.fn(() => ({ passed: true, reasons: [] })),
    };

    let evalCall = 0;
    evaluator.evaluateSkillOnBatch = jest.fn(async () => {
      evalCall += 1;
      if (evalCall === 1) return { avgScore: 79, trajectories: [baselineTraj] };
      return { avgScore: 90, trajectories: [makeTraj(90)] };
    });

    registry.load = jest.fn(() => (evalCall > 1 ? proposed : skill));

    const engine = new MetaSkillEngineService(
      registry as any,
      store as any,
      explorer as any,
      executor as any,
      evaluator as any,
      analyzer as any,
      editor as any,
      auditor as any,
      llm as any,
      regressionGate as any,
      batchComparator as any,
    );

    const result = await engine.evolve('country_pack.IS', {
      replayCaseId: 'iceland-highlands-001',
      evalMode: 'fixture',
      maxRounds: 1,
      dryRun: true,
    });

    expect(analyzer.analyze).toHaveBeenCalled();
    expect(editor.edit).toHaveBeenCalled();
    expect(result.rounds[0]?.forcedEdit).toBe(true);
    expect(result.finalScore).toBeGreaterThan(result.initialScore);
  });
});
