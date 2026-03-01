import { DSOSnapshotAuditService } from './dso-snapshot-audit.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

describe('DSOSnapshotAuditService', () => {
  let service: DSOSnapshotAuditService;

  beforeEach(() => {
    service = new DSOSnapshotAuditService();
  });

  const createMockDSO = (overrides: Partial<DecisionState> = {}): DecisionState => ({
    userIntent: { days: 5, mode: 'drive' },
    constraints: { feasible: true, violations: [] },
    systemState: {
      currentPhase: 'PLAN_GEN',
      confidence: 0.8,
      version: 1,
    },
    tripState: {},
    environmentState: {},
    ...overrides,
  } as DecisionState);

  describe('recordSnapshot', () => {
    it('should record a snapshot with incrementing version', async () => {
      const dso1 = createMockDSO();
      const dso2 = createMockDSO({ systemState: { currentPhase: 'OPTIMIZE', confidence: 0.9 } } as Partial<DecisionState>);

      const snap1 = await service.recordSnapshot('req-1', dso1);
      const snap2 = await service.recordSnapshot('req-1', dso2);

      expect(snap1.version).toBe(1);
      expect(snap2.version).toBe(2);
      expect(snap1.requestId).toBe('req-1');
      expect(snap2.requestId).toBe('req-1');
    });

    it('should compute Lyapunov value', async () => {
      const dso = createMockDSO({
        constraints: { feasible: true, violations: ['v1', 'v2'] },
        systemState: { currentPhase: 'PLAN_GEN', confidence: 0.6 },
      } as Partial<DecisionState>);

      const snap = await service.recordSnapshot('req-2', dso);

      expect(snap.lyapunovValue).toBeDefined();
      expect(snap.lyapunovValue).toBeGreaterThan(0);
    });

    it('should store DSO data', async () => {
      const dso = createMockDSO();
      const snap = await service.recordSnapshot('req-3', dso);

      expect(snap.dsoData).toBeDefined();
      expect((snap.dsoData as any).userIntent).toBeDefined();
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the latest snapshot', async () => {
      const dso1 = createMockDSO({ systemState: { currentPhase: 'INTAKE', confidence: 0.5 } } as Partial<DecisionState>);
      const dso2 = createMockDSO({ systemState: { currentPhase: 'DONE', confidence: 1.0 } } as Partial<DecisionState>);

      await service.recordSnapshot('req-4', dso1);
      await service.recordSnapshot('req-4', dso2);

      const latest = await service.getLatestSnapshot('req-4');

      expect(latest).not.toBeNull();
      expect(latest?.version).toBe(2);
      expect(latest?.phase).toBe('DONE');
    });

    it('should return null for non-existent request', async () => {
      const latest = await service.getLatestSnapshot('non-existent');
      expect(latest).toBeNull();
    });
  });

  describe('getSnapshotByVersion', () => {
    it('should return specific version', async () => {
      const dso1 = createMockDSO({ systemState: { currentPhase: 'INTAKE', confidence: 0.3 } } as Partial<DecisionState>);
      const dso2 = createMockDSO({ systemState: { currentPhase: 'PLAN_GEN', confidence: 0.6 } } as Partial<DecisionState>);
      const dso3 = createMockDSO({ systemState: { currentPhase: 'DONE', confidence: 0.9 } } as Partial<DecisionState>);

      await service.recordSnapshot('req-5', dso1);
      await service.recordSnapshot('req-5', dso2);
      await service.recordSnapshot('req-5', dso3);

      const snap = await service.getSnapshotByVersion('req-5', 2);

      expect(snap).not.toBeNull();
      expect(snap?.version).toBe(2);
      expect(snap?.phase).toBe('PLAN_GEN');
    });

    it('should return null for non-existent version', async () => {
      await service.recordSnapshot('req-6', createMockDSO());
      
      const snap = await service.getSnapshotByVersion('req-6', 999);
      expect(snap).toBeNull();
    });
  });

  describe('getStateHistory', () => {
    it('should return all snapshots in order', async () => {
      const phases = ['INTAKE', 'RESEARCH', 'PLAN_GEN', 'OPTIMIZE', 'DONE'];
      
      for (const phase of phases) {
        await service.recordSnapshot('req-7', createMockDSO({
          systemState: { currentPhase: phase, confidence: 0.5 },
        } as Partial<DecisionState>));
      }

      const history = await service.getStateHistory('req-7');

      expect(history.length).toBe(5);
      expect(history[0].version).toBe(1);
      expect(history[4].version).toBe(5);
      expect(history[0].phase).toBe('INTAKE');
      expect(history[4].phase).toBe('DONE');
    });
  });

  describe('computeDiff', () => {
    it('should detect changes between versions', async () => {
      const dso1 = createMockDSO({
        userIntent: { days: 5, mode: 'drive', budget: 1000 },
        systemState: { currentPhase: 'INTAKE', confidence: 0.5 },
      } as Partial<DecisionState>);

      const dso2 = createMockDSO({
        userIntent: { days: 7, mode: 'transit', budget: 1500 },
        systemState: { currentPhase: 'PLAN_GEN', confidence: 0.8 },
      } as Partial<DecisionState>);

      await service.recordSnapshot('req-8', dso1);
      await service.recordSnapshot('req-8', dso2);

      const diffs = await service.computeDiff('req-8', 1, 2);

      expect(diffs.length).toBeGreaterThan(0);
      
      const daysDiff = diffs.find(d => d.field.includes('days'));
      expect(daysDiff).toBeDefined();
      expect(daysDiff?.changeType).toBe('MODIFIED');
    });

    it('should return empty array for same version', async () => {
      await service.recordSnapshot('req-9', createMockDSO());
      
      const diffs = await service.computeDiff('req-9', 1, 1);
      expect(diffs.length).toBe(0);
    });
  });

  describe('getLyapunovTrace', () => {
    it('should track Lyapunov values', async () => {
      const phases = ['INTAKE', 'RESEARCH', 'PLAN_GEN', 'OPTIMIZE', 'VERIFY', 'DONE'];
      let confidence = 0.3;

      for (const phase of phases) {
        await service.recordSnapshot('req-10', createMockDSO({
          constraints: { feasible: true, violations: [] },
          systemState: { currentPhase: phase, confidence },
        } as Partial<DecisionState>));
        confidence += 0.1;
      }

      const trace = await service.getLyapunovTrace('req-10');

      expect(trace.requestId).toBe('req-10');
      expect(trace.values.length).toBe(6);
    });

    it('should detect decreasing Lyapunov values', async () => {
      const configs = [
        { phase: 'INTAKE', confidence: 0.3, violations: 3 },
        { phase: 'PLAN_GEN', confidence: 0.5, violations: 2 },
        { phase: 'OPTIMIZE', confidence: 0.7, violations: 1 },
        { phase: 'DONE', confidence: 0.95, violations: 0 },
      ];

      for (const cfg of configs) {
        await service.recordSnapshot('req-11', createMockDSO({
          constraints: { feasible: true, violations: Array(cfg.violations).fill('v') },
          systemState: { currentPhase: cfg.phase, confidence: cfg.confidence },
        } as Partial<DecisionState>));
      }

      const trace = await service.getLyapunovTrace('req-11');

      expect(trace.isDecreasing).toBe(true);
    });
  });

  describe('rollback', () => {
    it('should rollback to specified version', async () => {
      const dso1 = createMockDSO({ systemState: { currentPhase: 'INTAKE', confidence: 0.3 } } as Partial<DecisionState>);
      const dso2 = createMockDSO({ systemState: { currentPhase: 'PLAN_GEN', confidence: 0.6 } } as Partial<DecisionState>);
      const dso3 = createMockDSO({ systemState: { currentPhase: 'DONE', confidence: 0.9 } } as Partial<DecisionState>);

      await service.recordSnapshot('req-12', dso1);
      await service.recordSnapshot('req-12', dso2);
      await service.recordSnapshot('req-12', dso3);

      const rolledBack = await service.rollback('req-12', 1);

      expect(rolledBack).not.toBeNull();
      expect((rolledBack as any).systemState?.currentPhase).toBe('INTAKE');

      const latest = await service.getLatestSnapshot('req-12');
      expect(latest?.version).toBe(4);
    });

    it('should return null for non-existent version', async () => {
      await service.recordSnapshot('req-13', createMockDSO());
      
      const result = await service.rollback('req-13', 999);
      expect(result).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove old snapshots', async () => {
      for (let i = 0; i < 10; i++) {
        await service.recordSnapshot('req-14', createMockDSO({
          systemState: { currentPhase: 'PLAN_GEN', confidence: i * 0.1 },
        } as Partial<DecisionState>));
      }

      const removed = await service.cleanup('req-14', 5);

      expect(removed).toBe(5);

      const history = await service.getStateHistory('req-14');
      expect(history.length).toBe(5);
      expect(history[0].version).toBe(6);
    });

    it('should not remove if under threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await service.recordSnapshot('req-15', createMockDSO());
      }

      const removed = await service.cleanup('req-15', 5);

      expect(removed).toBe(0);

      const history = await service.getStateHistory('req-15');
      expect(history.length).toBe(3);
    });
  });

  describe('querySnapshots', () => {
    it('should support pagination', async () => {
      for (let i = 0; i < 25; i++) {
        await service.recordSnapshot('req-16', createMockDSO({
          systemState: { currentPhase: 'PLAN_GEN', confidence: i * 0.04 },
        } as Partial<DecisionState>));
      }

      const result = await service.querySnapshots({ requestId: 'req-16' }, 1, 10);

      expect(result.total).toBe(25);
      expect(result.snapshots.length).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should filter by phase', async () => {
      await service.recordSnapshot('req-17', createMockDSO({ systemState: { currentPhase: 'INTAKE' } } as Partial<DecisionState>));
      await service.recordSnapshot('req-17', createMockDSO({ systemState: { currentPhase: 'PLAN_GEN' } } as Partial<DecisionState>));
      await service.recordSnapshot('req-17', createMockDSO({ systemState: { currentPhase: 'DONE' } } as Partial<DecisionState>));

      const result = await service.querySnapshots({ requestId: 'req-17', phase: 'PLAN_GEN' });

      expect(result.snapshots.length).toBe(1);
      expect(result.snapshots[0].phase).toBe('PLAN_GEN');
    });
  });
});
