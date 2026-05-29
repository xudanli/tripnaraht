/**
 * Integration E2E — 冰岛带父母 + F208 三演进线全链路验收。
 *
 * Party Aggregation → CGUS Subgraph Preflight → Causal Narrative → NarrateExecutor
 */
import { Test, TestingModule } from '@nestjs/testing';
import { mergeOptimizationDecisionNarration } from '../../agent/execution/merge-optimization-decision-narration.util';
import { OptimizationEngineAdapterService } from '../../decision/kernel/optimization-engine-adapter.service';
import { CGUSSearchService } from '../../trips/decision/optimization/cgus-search.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { NarrateExecutorService } from '../../agent/execution/narrate-executor.service';
import { ClaudeNarratorAgentService } from '../../agent/services/sub-agents/narrator-agent.service';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type { GateResult } from '../../agent/interfaces/trip-plan.interface';
import {
  assertCgusPreflightArtifacts,
  assertCausalNarrativeArtifacts,
  assertPartyAggregationBarrel,
  buildEvolutionDecisionLogs,
  buildEvolutionDecisionState,
  buildEvolutionOptimizationHints,
  buildHeuristicDegradationHints,
  buildIcelandElderlyWorldContext,
  buildIcelandF208CgusCandidates,
  mockCgusSearchResult,
  runEvolutionCausalNarrativePhase,
  runEvolutionCgusPreflightPhase,
} from './iceland-elderly-cgus-evolution.harness';

describe('Integration E2E: Iceland elderly + F208 — Decision OS evolution (3 lines)', () => {
  const prevSubgraphPreflight = process.env.KERNEL_GLOBAL_SUBGRAPH_PREFLIGHT;
  const prevCausalPolish = process.env.CAUSAL_NARRATIVE_LLM_POLISH;
  const prevCgusContrast = process.env.CGUS_INJECT_CONTRAST_CANDIDATES;

  beforeAll(() => {
    process.env.KERNEL_GLOBAL_SUBGRAPH_PREFLIGHT = '1';
    process.env.CAUSAL_NARRATIVE_LLM_POLISH = '0';
    process.env.CGUS_INJECT_CONTRAST_CANDIDATES = '0';
  });

  afterAll(() => {
    if (prevSubgraphPreflight === undefined) delete process.env.KERNEL_GLOBAL_SUBGRAPH_PREFLIGHT;
    else process.env.KERNEL_GLOBAL_SUBGRAPH_PREFLIGHT = prevSubgraphPreflight;
    if (prevCausalPolish === undefined) delete process.env.CAUSAL_NARRATIVE_LLM_POLISH;
    else process.env.CAUSAL_NARRATIVE_LLM_POLISH = prevCausalPolish;
    if (prevCgusContrast === undefined) delete process.env.CGUS_INJECT_CONTRAST_CANDIDATES;
    else process.env.CGUS_INJECT_CONTRAST_CANDIDATES = prevCgusContrast;
  });

  describe('Anchor A — Party Aggregation (演进线 2)', () => {
    it('projects elderly barrel into WorldModelContext before CGUS', () => {
      const world = buildIcelandElderlyWorldContext();
      assertPartyAggregationBarrel(world);
      expect(world.partyAggregation?.hardGateTriggeredBy?.some((g) => g.includes('elderly'))).toBe(true);
    });
  });

  describe('Anchor B — CGUS Subgraph Preflight (演进线 1)', () => {
    it('prunes F208 and injects cascade delay soft constraints for 2WD October', () => {
      const world = buildIcelandElderlyWorldContext();
      const preflight = runEvolutionCgusPreflightPhase(world);
      assertCgusPreflightArtifacts(preflight);
      expect(preflight.worldContext.human.maxDailyAscentM).toBeLessThanOrEqual(250);
    });

    it('OptimizationEngineAdapter passes subgraph-enriched world to CGUS search', async () => {
      const world = buildIcelandElderlyWorldContext();
      const candidates = buildIcelandF208CgusCandidates();
      const searchSpy = jest.fn(async (cands: typeof candidates, ctx: typeof world) =>
        mockCgusSearchResult(cands),
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OptimizationEngineAdapterService,
          RagRealityPolicyGateService,
          { provide: CGUSSearchService, useValue: { search: searchSpy } },
        ],
      }).compile();

      const adapter = module.get(OptimizationEngineAdapterService);
      const dso = buildEvolutionDecisionState(world);
      const hints = await adapter.getHintsAsync(dso);

      expect(hints?.method).toBe('CGUS');
      expect(searchSpy).toHaveBeenCalled();
      const [, effectiveWorld] = searchSpy.mock.calls[0];
      expect(effectiveWorld.subgraphExtraction?.stats.nodeCount).toBeGreaterThan(0);
      expect(hints?.worldConstraintMaterialization?.globalSubgraphNodeCount).toBeGreaterThan(0);
      expect(hints?.decisionVerdict?.chosen_plan_id).toBeDefined();
      expect(hints?.decisionVerdictNarrationZh).toMatch(/推荐方案/);
    });
  });

  describe('Anchor C — Causal Narrative + NarrateExecutor (演进线 3)', () => {
    it('compiles causal chain from kernel trace + CGUS verdict', () => {
      const world = buildIcelandElderlyWorldContext();
      const preflight = runEvolutionCgusPreflightPhase(world);
      const hints = buildEvolutionOptimizationHints(preflight);
      const compiled = runEvolutionCausalNarrativePhase(hints);
      assertCausalNarrativeArtifacts(compiled);
    });

    it('NarrateExecutor merges causal protection + decision verdict into narration', async () => {
      const world = buildIcelandElderlyWorldContext();
      const preflight = runEvolutionCgusPreflightPhase(world);
      const hints = buildEvolutionOptimizationHints(preflight);

      const mockNarrator: Pick<ClaudeNarratorAgentService, 'narrate'> = {
        narrate: jest.fn(async () => ({
          user_friendly_summary: '为您规划了 5 天冰岛行程，行程已通过安全检查。',
          day_by_day_narrative: [{ day: 1, date: '2026-10-13', narrative: '第 1 天：雷克雅未克出发。' }],
          highlights: ['黄金圈'],
          tips: ['出行前请确认路况'],
        })),
      };

      const executor = new NarrateExecutorService(mockNarrator as ClaudeNarratorAgentService);
      const gateResult: GateResult = {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.9,
      };
      const orchestratorState: OrchestratorState = {
        request_id: 'iceland-elderly-e2e',
        current_step: 'NARRATE',
        trip_plan_request: {
          request_id: 'iceland-elderly-e2e',
          party: { count: 2, has_elderly: true },
        },
        decision_log: buildEvolutionDecisionLogs() as any,
        itinerary: {
          request_id: 'iceland-elderly-e2e',
          days: [{ date: '2026-10-13', items: [] }],
          action_plan: [],
        },
        gate_result: gateResult,
        errors: [],
        evidence_registry: new Map(),
        metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
      } as OrchestratorState;

      const dso = buildEvolutionDecisionState(world, hints);
      const { narration } = await executor.execute(dso, { orchestratorState });

      expect(narration.causal_protection_summary_zh).toBeDefined();
      expect(narration.causal_chain?.monteCarloSampleCount).toBe(500);
      expect(narration.optimization_decision_narration_zh).toMatch(/推荐方案/);
      expect(narration.user_friendly_summary).toMatch(/F208|路况|规避|保护|500/);
      expect(narration.tips?.some((t) => t.includes('[决策保护]') || t.includes('[决策审计]'))).toBe(true);
    });
  });

  describe('Anchor D — Degradation transparency (PR-1)', () => {
    it('adapter surfaces HEURISTIC method + fallback_chain when CGUS fails', async () => {
      const world = buildIcelandElderlyWorldContext();
      const searchSpy = jest.fn(async () => {
        throw new Error('simulated CGUS failure');
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OptimizationEngineAdapterService,
          RagRealityPolicyGateService,
          { provide: CGUSSearchService, useValue: { search: searchSpy } },
        ],
      }).compile();

      const adapter = module.get(OptimizationEngineAdapterService);
      const hints = await adapter.getHintsAsync(buildEvolutionDecisionState(world));

      expect(hints?.method).toBe('HEURISTIC');
      expect(hints?.decisionVerdict?.fallback_chain?.length).toBeGreaterThan(0);
      expect(hints?.decisionVerdict?.fallback_chain?.some((f) => f.step === 'cgus_search')).toBe(true);
      expect(hints?.decisionVerdict?.fallback_chain?.some((f) => f.step === 'monte_carlo_gate')).toBe(true);
    });

    it('causal narrative + narrate merge expose degradation copy to user', () => {
      const hints = buildHeuristicDegradationHints();
      const compiled = runEvolutionCausalNarrativePhase(hints);
      expect(compiled.chain.nodes.some((n) => n.kind === 'SYSTEM_DEGRADATION')).toBe(true);
      expect(compiled.deterministicSummaryZh).toMatch(/降级|启发式/);

      const merged = mergeOptimizationDecisionNarration(
        { user_friendly_summary: '为您规划了冰岛行程。', tips: [] },
        hints,
      );
      expect(merged.tips?.some((t) => t.includes('[系统降级说明]'))).toBe(true);
      expect(merged.user_friendly_summary).toMatch(/降级|启发式/);
    });
  });

  describe('Full pipeline — no regression flags', () => {
    it('completes party → preflight → hints → causal → narrate without throwing', async () => {
      const world = buildIcelandElderlyWorldContext();
      const preflight = runEvolutionCgusPreflightPhase(world);
      const hints = buildEvolutionOptimizationHints(preflight);
      const compiled = runEvolutionCausalNarrativePhase(hints);

      expect(world.partyAggregation?.effectiveExperienceFlow.tempo).toBe('EMPATHY_RECOVERY');
      expect(preflight.prunedNodeIds.length).toBeGreaterThan(0);
      expect(hints.decisionVerdict?.monte_carlo_summary?.total_samples).toBe(500);
      expect(compiled.chain.chosenPlanId).toBe('plan-ring-only');
    });
  });
});
