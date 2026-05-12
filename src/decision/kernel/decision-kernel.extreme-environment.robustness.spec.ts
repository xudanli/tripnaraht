/**
 * 极端环境夹具 + VERIFY→REPAIR 韧性：极夜日照、封路级 ETA、跨日 MIGRATION 协议
 */

import * as fs from 'fs';
import * as path from 'path';
import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState } from './decision-state.types';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';
import { VerifyExecutorService } from '../../agent/execution/verify-executor.service';
import { RepairExecutorService } from '../../agent/execution/repair-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';

describe('DecisionKernelService extreme environment robustness', () => {
  const fixturePath = (name: string) =>
    path.join(__dirname, '../../../tests/fixtures/extreme-environments', name);

  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    tripState: {
      ...(current.tripState ?? {}),
      ...(patch.tripState ?? {}),
    },
    systemState: {
      ...(current.systemState ?? {}),
      ...(patch.systemState ?? {}),
    },
    verification: patch.verification !== undefined ? patch.verification : current.verification,
    environmentState: {
      ...(current.environmentState ?? {}),
      ...(patch.environmentState ?? {}),
    },
    poiPlanning: patch.poiPlanning !== undefined ? patch.poiPlanning : current.poiPlanning,
  }));

  const makeKernel = (skills: SkillsRegistryService) => {
    const stateManager = {
      merge: mergeMock,
      commit: jest.fn(),
      appendHistoryDelta: jest.fn(),
      commitWithLock: jest.fn(),
    };
    const verifyExecutor = new VerifyExecutorService(undefined, undefined, undefined);
    const repairExecutor = new RepairExecutorService(skills, undefined);
    return new DecisionKernelService(
      stateManager as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      verifyExecutor as any,
      repairExecutor as any,
    );
  };

  const baseSystem = (requestId: string) => ({
    requestId,
    version: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    mergeMock.mockClear();
  });

  it('极夜夹具：VERIFY 产出 SUNSET_BREACH，REPAIR 收敛为 escalation 且 repairCount 不爆炸', async () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath('polar-night-svalbard.json'), 'utf8'));
    const skills = {
      getSkill: jest.fn((n: string) => {
        if (n === 'transport.search') {
          return {
            execute: jest.fn().mockResolvedValue({ best_option: { duration_minutes: 30 } }),
          };
        }
        return undefined;
      }),
    } as unknown as SkillsRegistryService;

    const kernel = makeKernel(skills);
    const dso: DecisionState = {
      requestId: raw.requestId,
      userIntent: {},
      environmentState: raw.environmentState,
      poiPlanning: raw.poiPlanning,
      tripState: { planDraft: raw.itinerary },
      confidence: 0.9,
      systemState: baseSystem(raw.requestId),
    } as DecisionState;

    const ctx = {
      requestId: raw.requestId,
      itinerary: raw.itinerary,
      tripPlanRequest: {
        destination: 'Longyearbyen',
        mode: 'drive',
        date_range: { start_date: raw.dayDate, end_date: '2026-12-16' },
      },
      gateResult: {
        gate_result: 'ADJUST_REQUIRED',
        violations: [],
        required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'extreme polar fixture' }],
        confidence: 0.7,
      },
      researchData: {},
    } as PhaseExecutorContext;

    let state = dso;
    const verifyResult = await kernel.executeVerify(state, ctx);
    state = verifyResult.newState;
    expect(verifyResult.issues.some((i) => i.code === 'SUNSET_BREACH')).toBe(true);
    expect(state.verification?.assertions_triggered?.some((f) => f.rule_id === 'solar_safety_v1' && f.is_violated)).toBe(true);

    const repairResult = await kernel.executeRepair(state, ctx);
    state = repairResult.newState;
    expect(state.systemState?.repairCount).toBe(1);
    expect(state.systemState?.repairCount).toBeLessThanOrEqual(3);

    const esc = state.verification?.escalationPlan;
    expect(esc?.type).toBe('PHYSICAL_LIMIT_REACHED');
    expect(['SUNSET_VISIBILITY', 'PHYSICAL_CONNECTIVITY']).toContain(esc?.constraint);

    const mig = state.systemState?.pendingMigrations ?? [];
    if (esc?.constraint === 'SUNSET_VISIBILITY') {
      expect(mig.length).toBeGreaterThanOrEqual(1);
      expect(mig[0]?.kind).toBe('MIGRATION_REQUEST');
      expect(mig[0]?.reason).toBe('SUNSET_ANCHOR_NOT_ASSIGNABLE_ON_DAY');
      expect(mig[0]?.toDayDate).toBe('2026-12-16');
    }

    expect(state.systemState?.repairCount ?? 0).toBeLessThanOrEqual(3);
  });

  it('封路夹具：极端 ETA 下 REPAIR 打上 FAILED_RECOVERABLE 并给出就地休息建议', async () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath('iceland-road-closure.json'), 'utf8'));
    const skills = {
      getSkill: jest.fn((n: string) => {
        if (n === 'transport.search') {
          return {
            execute: jest.fn().mockResolvedValue({ best_option: { duration_minutes: 600 } }),
          };
        }
        return undefined;
      }),
    } as unknown as SkillsRegistryService;

    const kernel = makeKernel(skills);
    const dso: DecisionState = {
      requestId: raw.requestId,
      userIntent: {},
      environmentState: raw.environmentState,
      tripState: { planDraft: raw.itinerary },
      confidence: 0.85,
      systemState: baseSystem(raw.requestId),
      verification: {
        issues: [
          {
            code: 'ROUTE_INFEASIBLE',
            class: 'CONFLICT',
            message: 'road closure stress',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
          },
        ],
        hasFatal: false,
        hasConflict: true,
        hasAdvisory: false,
        counts: { fatal: 0, conflict: 1, advisory: 0 },
        verifiedAt: new Date().toISOString(),
      },
    } as DecisionState;

    const ctx = {
      requestId: raw.requestId,
      itinerary: raw.itinerary,
      tripPlanRequest: { destination: 'Iceland', mode: 'drive', date_range: { start_date: '2026-01-10', end_date: '2026-01-10' } },
      gateResult: {
        gate_result: 'ADJUST_REQUIRED',
        violations: [],
        required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'road closure fixture' }],
        confidence: 0.7,
      },
      researchData: {},
    } as PhaseExecutorContext;

    const repairResult = await kernel.executeRepair(dso, ctx);
    const state = repairResult.newState;
    expect(state.systemState?.recoverySignal).toBe('FAILED_RECOVERABLE');
    const adv = state.verification?.issues?.filter((i) => i.class === 'ADVISORY') ?? [];
    expect(adv.some((i) => i.message.includes('住宿点'))).toBe(true);
  });
});
