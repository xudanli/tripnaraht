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
    it('应合并 patch 并递增 version', () => {
      const current = createInitialState();
      const patch = {
        userIntent: { destination: 'Iceland', days: 5 },
        tripState: { planVersion: 1 },
      };
      const merged = service.merge(current, patch);
      expect(merged.userIntent?.destination).toBe('Iceland');
      expect(merged.tripState?.planVersion).toBe(1);
      expect(merged.systemState?.version).toBe(1);
    });

    it('多次 merge 应持续递增 version', () => {
      let state = createInitialState();
      state = service.merge(state, { userIntent: { days: 3 } });
      expect(state.systemState?.version).toBe(1);
      state = service.merge(state, { environmentState: { countryCode: 'IS' } });
      expect(state.systemState?.version).toBe(2);
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
      expect(result.conflict).toBeFalsy();
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
