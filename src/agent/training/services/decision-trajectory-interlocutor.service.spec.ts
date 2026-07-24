import { DecisionTrajectoryInterlocutorService } from './decision-trajectory-interlocutor.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { PIIAnonymizerService } from './pii-anonymizer.service';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';

describe('DecisionTrajectoryInterlocutorService', () => {
  const prisma = {
    decisionTrajectory: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: DecisionTrajectoryInterlocutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DECISION_TRAJECTORY_ENABLED = '1';
    service = new DecisionTrajectoryInterlocutorService(
      prisma as any,
      new PIIAnonymizerService(),
      new RewardSignalExtractorService(),
    );
  });

  afterEach(() => {
    delete process.env.DECISION_TRAJECTORY_ENABLED;
  });

  it('upsertDraft creates PENDING row with schema v1', async () => {
    prisma.decisionTrajectory.upsert.mockResolvedValue({});

    await service.upsertDraft('req-1', { trip_id: 't1' }, { gate_result: 'ALLOW' });

    expect(prisma.decisionTrajectory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: 'req-1' },
        create: expect.objectContaining({
          requestId: 'req-1',
          status: 'PENDING',
          payload: expect.objectContaining({
            schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
            request_id: 'req-1',
          }),
        }),
      }),
    );
  });

  it('finalize merges artifacts and sets FINALIZED with reward', async () => {
    prisma.decisionTrajectory.findUnique.mockResolvedValue({
      requestId: 'req-2',
      payload: {
        schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
        request_id: 'req-2',
        input_context: {},
        axiom_gate: { gate_result: 'ALLOW' },
        orchestration_steps: [{ step: 'GATE_EVAL', status: 'COMPLETED', timestamp_ms: 1 }],
      },
    });
    prisma.decisionTrajectory.update.mockResolvedValue({});

    await service.finalize('req-2', {
      decisionLog: [
        {
          request_id: 'req-2',
          step: 'PLAN_GEN',
          actor: 'Planner',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        },
      ],
      finalOutput: { gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [] } },
    });

    expect(prisma.decisionTrajectory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: 'req-2' },
        data: expect.objectContaining({
          status: 'FINALIZED',
          orchestrationOutcome: 'GOLDEN',
          totalReward: 1.0,
        }),
      }),
    );
  });

  it('capturePlanGenDraft only keeps first snapshot per request', () => {
    const itinA = { days: [{ day_index: 1, items: [{ name: 'A' }] }] } as any;
    const itinB = { days: [{ day_index: 1, items: [{ name: 'B' }] }] } as any;
    service.capturePlanGenDraft('req-draft', itinA);
    service.capturePlanGenDraft('req-draft', itinB);
    const taken = (service as any).takePlanGenDraft('req-draft');
    expect(taken.days[0].items[0].name).toBe('A');
  });

  it('finalize persists plan_gen_draft_itinerary from buffer', async () => {
    prisma.decisionTrajectory.findUnique.mockResolvedValue({
      requestId: 'req-topo',
      payload: {
        schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
        request_id: 'req-topo',
        input_context: {},
        axiom_gate: { gate_result: 'ALLOW' },
        orchestration_steps: [],
      },
    });
    prisma.decisionTrajectory.update.mockResolvedValue({});
    service.capturePlanGenDraft('req-topo', {
      days: [{ day_index: 1, items: [{ name: 'DraftPlan' }] }],
    } as any);
    await service.finalize('req-topo', {
      finalOutput: {
        itinerary: { days: [{ day_index: 1, items: [{ name: 'Golden' }] }] } as any,
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [] },
      },
    });
    const payload = prisma.decisionTrajectory.update.mock.calls[0][0].data.payload;
    expect(payload.plan_gen_draft_itinerary.days[0].items[0].name).toBe('DraftPlan');
    expect(payload.final_output.itinerary.days[0].items[0].name).toBe('Golden');
  });

  it('finalize persists debate_history from buffer with redacted votes', async () => {
    prisma.decisionTrajectory.findUnique.mockResolvedValue({
      requestId: 'req-debate',
      payload: {
        schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
        request_id: 'req-debate',
        input_context: {},
        axiom_gate: { gate_result: 'ALLOW' },
        orchestration_steps: [],
      },
    });
    prisma.decisionTrajectory.update.mockResolvedValue({});

    service.appendDebateBuffer('req-debate', {
      source: 'llm_debate',
      gate: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        guardian_results: {
          source: 'llm_debate',
          abu: { verdict: 'ALLOW', evidence: ['ice road closed'] },
          drdre: { verdict: 'ADJUST', evidence: ['fatigue high'] },
          neptune: { verdict: 'ALLOW', evidence: [] },
        },
      },
      prompts: { system_prompt: 'sys', user_prompt: 'user' },
      raw_completion: '{"ok":true}',
    });

    await service.finalize('req-debate', {
      decisionLog: [
        {
          request_id: 'req-debate',
          step: 'PLAN_GEN',
          actor: 'Planner',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { duration_ms: 100 },
        },
      ],
      finalOutput: { gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [] } },
    });

    const updateArg = prisma.decisionTrajectory.update.mock.calls[0][0];
    const payload = updateArg.data.payload;
    expect(payload.debate_history.guardian_votes_redacted.abu.vote).toBe('PASS');
    expect(payload.debate_history.guardian_votes_redacted.dr_dre.vote).toBe('WARN');
    expect(payload.debate_history.prompts_redacted.system_prompt).toBe('sys');
    expect(payload.debate_history.raw_completion_redacted).toContain('ok');
  });

  it('is no-op when feature flag off', async () => {
    delete process.env.DECISION_TRAJECTORY_ENABLED;
    await service.upsertDraft('req-off', {}, { gate_result: 'BLOCK' });
    expect(prisma.decisionTrajectory.upsert).not.toHaveBeenCalled();
  });
});
