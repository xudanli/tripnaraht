/**
 * StateManagerService 单元测试
 *
 * 专利相关：merge 版本递增、commit 原子提交、resolveConflict 冲突解决
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StateManagerService } from './state-manager.service';
import {
  DecisionState,
  StateUpdateTransaction,
  StateCommitConflictError,
  StateCommitPhaseViolationError,
  STAGE_PRIORITY,
} from './decision-state.types';

describe('StateManagerService', () => {
  let service: StateManagerService;

  function createInitialState(requestId = 'req-001'): DecisionState {
    return {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
      requestId,
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StateManagerService],
    }).compile();
    service = module.get<StateManagerService>(StateManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('merge', () => {
    it('应合并 patch 且不递增 version（version 仅在 commit 时推进）', () => {
      const current = createInitialState();
      const patch = {
        userIntent: { destination: 'Iceland', days: 5 },
        tripState: { planVersion: 1 },
      };
      const merged = service.merge(current, patch);
      expect(merged.userIntent?.destination).toBe('Iceland');
      expect(merged.tripState?.planVersion).toBe(1);
      expect(merged.systemState?.version).toBe(0);
    });

    it('应合并 poiPlanning（STATE_UPDATE 锚点切片）', () => {
      const current = createInitialState();
      const slice = {
        routeIntent: { regionId: 'golden_circle' },
        poiPlan: {
          requiredAnchorPoiIds: ['thingvellir'],
          optionalCandidatePoiIds: [],
          excludedPoiIds: [],
          selectedOptionalPoiIds: [],
        },
      } as DecisionState['poiPlanning'];
      const merged = service.merge(current, { poiPlanning: slice });
      expect(merged.poiPlanning?.routeIntent?.regionId).toBe('golden_circle');
      expect(merged.poiPlanning?.poiPlan?.requiredAnchorPoiIds).toEqual(['thingvellir']);
    });

    it('多次 merge 不应推进 version', () => {
      let state = createInitialState();
      state = service.merge(state, { userIntent: { days: 3 } });
      expect(state.systemState?.version).toBe(0);
      state = service.merge(state, { environmentState: { countryCode: 'IS' } });
      expect(state.systemState?.version).toBe(0);
    });

    it('应合并 travelOntologyState 且保留已提交动词列表', () => {
      let state = createInitialState();
      state = service.merge(state, {
        travelOntologyState: {
          tripId: 'T1',
          nouns: { destination: { id: 'd1', name: 'Paris' } },
          verbs: { pending: [], committed: ['c0'], rolledBack: [] },
        },
      });
      expect(state.travelOntologyState?.tripId).toBe('T1');
      state = service.merge(state, {
        travelOntologyState: {
          verbs: {
            pending: [
              {
                actionId: 'a1',
                verb: 'BOOK',
                targetType: 'FLIGHT',
                requiresConfirmation: false,
                riskLevel: 'LOW',
              },
            ],
          },
        },
      });
      expect(state.travelOntologyState?.verbs?.committed).toEqual(['c0']);
      expect(state.travelOntologyState?.verbs?.pending).toHaveLength(1);
    });
  });

  describe('commit', () => {
    it('应成功提交并返回新状态', () => {
      const current = createInitialState();
      const transaction: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        patch: { userIntent: { destination: 'Tokyo' } },
        stageOutput: 'RESEARCH',
      };
      const result = service.commit(transaction, current);
      expect(result.newState.userIntent?.destination).toBe('Tokyo');
      expect(result.newVersion).toBe(1);
      expect(result.newState.systemState?.lastStep).toBe('RESEARCH');
      expect(result.conflict).toBeFalsy();
    });

    it('applyPhaseResult 与带 stageOutput 的 commit 等价并写入 lastStep', () => {
      const current = createInitialState();
      const result = service.applyPhaseResult(current, { userIntent: { destination: 'Nara' } }, 'INTAKE');
      expect(result.newVersion).toBe(1);
      expect(result.newState.systemState?.lastStep).toBe('INTAKE');
      expect(result.newState.userIntent?.destination).toBe('Nara');
    });

    it('严格稳定性模式：不稳定提交应回滚且不推进 version', async () => {
      const prev = process.env.DECISION_OS_STABILITY_STRICT;
      process.env.DECISION_OS_STABILITY_STRICT = '1';

      const { DSOStabilityMonitorService } = await import(
        '../../trips/decision/optimization/theory/dso-stability.service'
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [StateManagerService, DSOStabilityMonitorService],
      }).compile();
      const strictService = module.get<StateManagerService>(StateManagerService);

      const current = createInitialState();
      current.constraints = { feasible: true, violations: [] };

      const transaction: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        patch: {
          constraints: {
            feasible: false,
            violations: [{ type: 'X', severity: 'HARD', detail: 'fail', degree: 1 }],
          },
        },
        stageOutput: 'GATE_EVAL',
      };

      const result = strictService.commit(transaction, current);
      expect(result.rolledBack).toBe(true);
      expect(result.rollbackReason).toBe('LYAPUNOV_INCREASE');
      expect(result.newVersion).toBe(0);
      expect(result.newState.systemState?.version).toBe(0);
      expect(result.newState.constraints?.feasible).toBe(true);

      if (prev === undefined) {
        delete process.env.DECISION_OS_STABILITY_STRICT;
      } else {
        process.env.DECISION_OS_STABILITY_STRICT = prev;
      }
    });

    it('版本冲突应抛出 StateCommitConflictError', () => {
      const current = createInitialState();
      current.systemState = { ...current.systemState!, version: 2 };
      const transaction: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        patch: { userIntent: { destination: 'Tokyo' } },
      };
      expect(() => service.commit(transaction, current)).toThrow(StateCommitConflictError);
      try {
        service.commit(transaction, current);
      } catch (e) {
        expect(e).toBeInstanceOf(StateCommitConflictError);
        expect((e as StateCommitConflictError).expectedVersion).toBe(0);
        expect((e as StateCommitConflictError).actualVersion).toBe(2);
      }
    });

    it('严格阶段写入模式：非法字段写入应抛出 StateCommitPhaseViolationError', async () => {
      const prev = process.env.DECISION_OS_PHASE_STRICT;
      process.env.DECISION_OS_PHASE_STRICT = '1';

      const module: TestingModule = await Test.createTestingModule({
        providers: [StateManagerService],
      }).compile();
      const strictService = module.get<StateManagerService>(StateManagerService);

      const current = createInitialState();
      current.systemState = { ...current.systemState!, currentPhase: 'VERIFY' };

      const tx: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        stageOutput: 'VERIFY',
        patch: { userIntent: { destination: 'Tokyo' } }, // VERIFY 不应写 userIntent
      };

      expect(() => strictService.commit(tx, current)).toThrow(StateCommitPhaseViolationError);

      if (prev === undefined) {
        delete process.env.DECISION_OS_PHASE_STRICT;
      } else {
        process.env.DECISION_OS_PHASE_STRICT = prev;
      }
    });
  });

  describe('commitBatch', () => {
    it('无字段冲突：应合并两个增量并只推进一次版本', () => {
      const current = createInitialState();
      const tx1: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        stageOutput: 'RESEARCH',
        patch: { environmentState: { countryCode: 'IS' } },
      };
      const tx2: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        stageOutput: 'PLAN_GEN',
        patch: { tripState: { planVersion: 1 } },
      };

      const result = (service as any).commitBatch([tx1, tx2], current);
      expect(result.newVersion).toBe(1);
      expect(result.newState.systemState?.version).toBe(1);
      expect(result.newState.environmentState?.countryCode).toBe('IS');
      expect(result.newState.tripState?.planVersion).toBe(1);
    });

    it('字段冲突：应拒绝合并（前缀重叠视为冲突）', () => {
      const current = createInitialState();
      const tx1: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        stageOutput: 'PLAN_GEN',
        patch: { tripState: { planDraft: { a: 1 } as any } },
      };
      const tx2: StateUpdateTransaction = {
        requestId: 'req-001',
        expectedVersion: 0,
        stageOutput: 'PLAN_GEN',
        patch: { tripState: { planDraft: { b: 2 } as any } }, // 同一路径 tripState.planDraft
      };
      expect(() => (service as any).commitBatch([tx1, tx2], current)).toThrow();
    });
  });

  describe('resolveConflict', () => {
    it('STAGE_PRIORITY: 高优先级阶段应覆盖', () => {
      const current = {
        systemState: { currentPhase: 'RESEARCH', lastUpdatedAt: '2026-01-01T00:00:00Z' },
      };
      const incoming = {
        systemState: { currentPhase: 'PLAN_GEN', lastUpdatedAt: '2026-01-01T00:00:01Z' },
      };
      const result = service.resolveConflict(current, incoming, 'STAGE_PRIORITY');
      expect(result).toEqual(incoming);
      expect(STAGE_PRIORITY['PLAN_GEN']).toBeGreaterThan(STAGE_PRIORITY['RESEARCH']);
    });

    it('TIMESTAMP_WINS: 较新时间戳应覆盖', () => {
      const current = {
        systemState: { lastUpdatedAt: '2026-01-01T12:00:00Z' },
      };
      const incoming = {
        systemState: { lastUpdatedAt: '2026-01-01T12:00:01Z' },
      };
      const result = service.resolveConflict(current, incoming, 'TIMESTAMP_WINS');
      expect(result).toEqual(incoming);
    });
  });

  describe('appendHistoryDelta', () => {
    it('应追加 history 条目', () => {
      const current = createInitialState();
      const withHistory = service.appendHistoryDelta(current, {
        type: 'userIntent',
        summary: '用户修改',
        at: new Date().toISOString(),
      });
      expect(withHistory.history?.length).toBe(1);
      expect(withHistory.history?.[0].type).toBe('userIntent');
    });
  });
});
