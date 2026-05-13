// src/skills/itinerary/itinerary-generate.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ItineraryGenerateSkill } from './itinerary-generate.skill';
import { PlanningWorkbenchAgentService } from '../../agent/services/planning-workbench-agent.service';
import { TripPlanRequest, GateResult } from '../../agent/interfaces/trip-plan.interface';
import { freezeExecutionPolicyHook } from '../../world/operational/execution-governance.contract';
import { GovernanceModule } from '../../governance/governance.module';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';

describe('ItineraryGenerateSkill', () => {
  let skill: ItineraryGenerateSkill;
  let testModule: TestingModule;

  beforeEach(async () => {
    const mockPlanningWorkbench = {};

    testModule = await Test.createTestingModule({
      imports: [GovernanceModule],
      providers: [
        ItineraryGenerateSkill,
        {
          provide: PlanningWorkbenchAgentService,
          useValue: mockPlanningWorkbench,
        },
      ],
    }).compile();

    skill = testModule.get<ItineraryGenerateSkill>(ItineraryGenerateSkill);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('itinerary.generate');
    expect(skill.metadata.description).toBe('生成结构化行程草案');
  });

  describe('execute', () => {
    const baseRequest: TripPlanRequest = {
      request_id: 'test-request-1',
      user_id: 'user-1',
      message: '测试行程',
    };

    it('应该根据 days 参数生成行程', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 3,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [
            {
              poi_id: 'poi1',
              name: '地点1',
              coordinates: { lat: 64.1, lng: -21.9 },
            },
            {
              poi_id: 'poi2',
              name: '地点2',
              coordinates: { lat: 64.2, lng: -21.8 },
            },
            {
              poi_id: 'poi3',
              name: '地点3',
              coordinates: { lat: 64.3, lng: -21.7 },
            },
          ],
        },
      });

      expect(result.request_id).toBe('test-request-1');
      expect(result.days).toHaveLength(3);
      expect(result.metadata?.total_days).toBe(3);
      expect(result.resultType).toBe('itinerary');
      expect(result.partialExecutionState).toBe('none');
      expect(result.executionDecision.status).toBe('allow');
      expect(result.days[0].items.length).toBeGreaterThan(0);
    });

    it('应该根据 date_range 计算天数', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          date_range: {
            start_date: '2024-07-01',
            end_date: '2024-07-05',
          },
        },
        research_data: {
          poi_evidence: [],
        },
      });

      expect(result.days).toHaveLength(5); // 5天（包含开始和结束日期）
      expect(result.metadata?.total_days).toBe(5);
    });

    it('应该在缺少日期信息时使用默认值（5天，明天开始）', async () => {
      const result = await skill.execute({
        request: baseRequest,
        research_data: {
          poi_evidence: [],
        },
      });

      expect(result.days).toHaveLength(5);
      expect(result.metadata?.total_days).toBe(5);
      // 检查日期是明天
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expectedDate = tomorrow.toISOString().split('T')[0];
      expect(result.days[0].date).toBe(expectedDate);
    });

    it('应该正确分配 POI 到各天', async () => {
      const pois = Array.from({ length: 10 }, (_, i) => ({
        poi_id: `poi${i + 1}`,
        name: `地点${i + 1}`,
        coordinates: { lat: 64.1 + i * 0.1, lng: -21.9 - i * 0.1 },
      }));

      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 3,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: pois,
        },
      });

      // 10个POI分配到3天，每天应该有3-4个
      const totalItems = result.days.reduce(
        (sum, day) => sum + day.items.length,
        0,
      );
      expect(totalItems).toBe(10);
      expect(result.days[0].items.length).toBeGreaterThanOrEqual(3);
    });

    it('应该在没有任何 POI 时生成占位项', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 2,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [],
        },
      });

      expect(result.days[0].items).toHaveLength(1);
      expect(result.days[0].items[0].type).toBe('REST');
      expect(result.days[0].items[0].location_ref?.name).toBe('待安排');
      expect(result.days[0].items[0].verification_status).toBe('ASSUMPTION');
    });

    it('应该计算总成本估算（如果有预算信息）', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 3,
          start_date: '2024-07-01',
          constraints: {
            budget: {
              total: 20000,
            },
          },
        },
        research_data: {
          poi_evidence: [],
        },
      });

      expect(result.metadata?.total_cost_estimate).toBe(20000);
    });

    it('应该根据 Gate 结果计算鲁棒性评分', async () => {
      const resultWithAllow = await skill.execute({
        request: {
          ...baseRequest,
          days: 3,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [{ poi_id: 'poi1', name: '地点1' }],
          transport_evidence: { evidence_id: 'transport1' },
        },
        gate_result: {
          gate_result: 'ALLOW',
        } as GateResult,
      });

      expect(resultWithAllow.metadata?.robustness_score).toBeGreaterThan(0.5);

      const resultWithBlock = await skill.execute({
        request: {
          ...baseRequest,
          days: 3,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [],
        },
        gate_result: {
          gate_result: 'BLOCK',
        } as GateResult,
      });

      expect(resultWithBlock.metadata?.robustness_score).toBeLessThan(0.5);
    });

    it('executionPolicyHook blocked 时返回 execution_block 与空 days', async () => {
      const hook = freezeExecutionPolicyHook({
        policySource: 'test',
        policyGeneratedAt: 0,
        causedByPolicies: ['safetravel.gate.block'],
        policyStrengthDominant: 'hard',
        executionStatus: 'blocked',
        denyLongDistanceAutorouting: true,
        maxSingleLegDriveHours: 2.5,
        forcedMinimumVehicleClass: null,
        haltAutomatedExecution: true,
        arbitrationConfidence: 0.5,
        rawSeverity: 'BLOCKED',
        blockingSummary: ['gate'],
        recoverySuggestions: [{ type: 'reroute', rationale: ['x'] }],
      });
      const result = await skill.execute({
        request: {
          ...baseRequest,
          trip_id: 'trip-ledger-1',
          days: 2,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [{ poi_id: 'p1', name: '地点1' }],
        },
        executionPolicyHook: hook,
      });
      expect(result.days).toHaveLength(0);
      expect(result.resultType).toBe('execution_block');
      expect(result.executionDecision.status).toBe('halt');
      expect(result.executionGovernanceMemory?.blockedReason).toEqual(['gate']);
      const ledger = testModule.get(GovernanceLedgerStoreService);
      const blocks = ledger.findRecentExecutionBlocks('trip-ledger-1');
      expect(blocks.length).toBe(1);
      expect(blocks[0].eventType).toBe('execution_block');
    });

    it('应该处理 research_data 中的不同 POI 格式', async () => {
      // 测试数组格式
      const result1 = await skill.execute({
        request: {
          ...baseRequest,
          days: 1,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [
            {
              poi_id: 'poi1',
              name: '地点1',
            },
          ],
        },
      });

      expect(result1.days[0].items.length).toBeGreaterThan(0);

      // 测试对象格式（poi_evidence.pois）
      const result2 = await skill.execute({
        request: {
          ...baseRequest,
          days: 1,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: {
            pois: [
              {
                poi_id: 'poi2',
                name: '地点2',
              },
            ],
          },
        },
      });

      expect(result2.days[0].items.length).toBeGreaterThan(0);
    });

    it('应该为每个行程项生成正确的时间窗', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 1,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [
            {
              poi_id: 'poi1',
              name: '地点1',
            },
            {
              poi_id: 'poi2',
              name: '地点2',
            },
          ],
        },
      });

      const items = result.days[0].items;
      expect(items[0].start_window).toBe('09:00');
      expect(items[0].end_window).toBe('11:00');
      expect(items[1].start_window).toBe('11:00');
      expect(items[1].end_window).toBe('13:00');
    });

    it('应该为每个行程项生成唯一的 ID', async () => {
      const result = await skill.execute({
        request: {
          ...baseRequest,
          days: 2,
          start_date: '2024-07-01',
        },
        research_data: {
          poi_evidence: [
            {
              poi_id: 'poi1',
              name: '地点1',
            },
            {
              poi_id: 'poi2',
              name: '地点2',
            },
          ],
        },
      });

      const allIds = result.days.flatMap((day) =>
        day.items.map((item) => item.id),
      );
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });
});
