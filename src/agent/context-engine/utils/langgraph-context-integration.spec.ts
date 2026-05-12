import {
  extractPrdWriteBackTraceFromLangGraphState,
  writeBackFromNode,
} from './langgraph-context-integration';
import type { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';

describe('langgraph-context-integration PRD trace', () => {
  const baseState = (): LangGraphState => ({
    userQuery: 'test',
  });

  describe('extractPrdWriteBackTraceFromLangGraphState', () => {
    it('reads requestId / planVersion from metadata', () => {
      const s = baseState();
      s.metadata = { requestId: 'req-1', planVersion: 3 };
      expect(extractPrdWriteBackTraceFromLangGraphState(s)).toEqual({
        requestId: 'req-1',
        planVersion: 3,
      });
    });

    it('accepts snake_case aliases', () => {
      const s = baseState();
      s.metadata = { request_id: 'req-2', plan_version: 2 };
      expect(extractPrdWriteBackTraceFromLangGraphState(s)).toEqual({
        requestId: 'req-2',
        planVersion: 2,
      });
    });

    it('returns empty when no metadata', () => {
      expect(extractPrdWriteBackTraceFromLangGraphState(baseState())).toEqual({});
    });
  });

  describe('writeBackFromNode', () => {
    it('merges state metadata trace into contextEngineer.writeBack options', async () => {
      const writeBack = jest.fn().mockResolvedValue(undefined);
      const contextEngineer = { writeBack } as any;
      const state: LangGraphState = {
        ...baseState(),
        metadata: {
          tripRunId: 'run-1',
          request_id: 'trace-req',
          plan_version: 7,
        },
      };

      await writeBackFromNode(state, contextEngineer, {
        tripRunId: 'run-1',
        scratchpad: { planOutline: 'x' },
      });

      expect(writeBack).toHaveBeenCalledWith(
        'run-1',
        1,
        { planOutline: 'x' },
        undefined,
        undefined,
        {
          tripId: undefined,
          phase: undefined,
          requestId: 'trace-req',
          planVersion: 7,
        },
      );
    });

    it('data.requestId overrides state metadata', async () => {
      const writeBack = jest.fn().mockResolvedValue(undefined);
      const contextEngineer = { writeBack } as any;
      const state: LangGraphState = {
        ...baseState(),
        metadata: { request_id: 'from-state' },
      };

      await writeBackFromNode(state, contextEngineer, {
        tripRunId: 'run-1',
        scratchpad: {},
        requestId: 'from-data',
      });

      expect(writeBack.mock.calls[0][5].requestId).toBe('from-data');
    });
  });
});
