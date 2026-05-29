import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchMemberRegistry } from './research-member.registry';
import { ResearchTeamLeaderService } from './research-team-leader.service';

/** 与 `ResearchMemberRegistry.buildTopologyPlan` 对齐的轻量复刻（单测用）。 */
function mockTopologyFromScopes(scopes: readonly string[]) {
  const parallel: { id: string; kind: 'destination' | 'hotel' | 'flight' }[] = [];
  if (scopes.includes('destination') || scopes.includes('compliance')) {
    parallel.push({ id: 'DestinationResearchMember', kind: 'destination' });
  }
  if (scopes.includes('hotel')) parallel.push({ id: 'HotelResearchMember', kind: 'hotel' });
  if (scopes.includes('flight')) parallel.push({ id: 'FlightResearchMember', kind: 'flight' });
  const sequential: { id: string; kind: 'transport' | 'compliance' }[] = [];
  if (scopes.includes('transport')) {
    sequential.push({ id: 'TransportResearchMember', kind: 'transport' });
  }
  if (scopes.includes('compliance')) {
    sequential.push({ id: 'ComplianceResearchMember', kind: 'compliance' });
  }
  return { parallel, sequential };
}

describe('ResearchTeamLeaderService', () => {
  const dso = { requestId: 'd1' } as DecisionState;

  let sharedRegistry: Record<string, unknown>;

  function makeLeader(
    registryOverrides?: Partial<ResearchMemberRegistry>,
    executorOverrides?: {
      prepareLeaderResearchWorkspace?: jest.Mock;
      runTopologyPlanOnWorkspace?: jest.Mock;
      finalizeLeaderResearchWorkspace?: jest.Mock;
    },
  ) {
    sharedRegistry = {
      memberIdsForScopes: jest.fn().mockReturnValue([]),
      buildTopologyPlan: jest.fn().mockReturnValue({ parallel: [], sequential: [] }),
      buildTopologyPlanForResearchExecution: jest.fn((args: { effectiveMode: string; scopesForTopology: string[]; hasTrip: boolean }) => {
        if (!args.hasTrip) return { parallel: [], sequential: [] };
        if (args.effectiveMode === 'transport_only') {
          return { parallel: [], sequential: [{ id: 'TransportResearchMember', kind: 'transport' }] };
        }
        if (args.effectiveMode === 'full') {
          return {
            preParallelSequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
            parallel: [{ id: 'DestinationResearchMember', kind: 'destination' }],
            sequential: [{ id: 'ComplianceResearchMember', kind: 'compliance' }],
          };
        }
        return mockTopologyFromScopes(args.scopesForTopology);
      }),
      destination: {
        runDestinationBundle: jest.fn().mockResolvedValue(undefined),
        memberId: 'DestinationResearchMember',
      },
      hotel: { runScopedCommerce: jest.fn().mockResolvedValue(undefined), memberId: 'HotelResearchMember' },
      flight: { runScopedCommerce: jest.fn().mockResolvedValue(undefined), memberId: 'FlightResearchMember' },
      transport: { runTransportSearch: jest.fn().mockResolvedValue(undefined), memberId: 'TransportResearchMember' },
      compliance: {
        runComplianceResearch: jest.fn().mockResolvedValue(undefined),
        memberId: 'ComplianceResearchMember',
      },
      ...registryOverrides,
    };

    const defaultRunTopology = jest.fn(async (_dso: unknown, ctx: PhaseExecutorContext, ws: any, plan: any) => {
      const trip = ws.effectiveTrip;
      if (!trip) return;
      const r = sharedRegistry as any;
      for (const s of plan.preParallelSequential ?? []) {
        if (s.kind === 'transport') {
          await r.transport.runTransportSearch({
            requestId: ctx.requestId,
            tripPlanRequest: trip,
            researchData: ws.researchData,
            evidenceRefs: ws.evidenceRefs,
          });
        }
      }
      await Promise.all(
        plan.parallel.map(async (slot: { kind: string }) => {
          if (slot.kind === 'destination') {
            return r.destination.runDestinationBundle({
              requestId: ctx.requestId,
              routeDirectionId: ctx.routeDirectionId,
              userId: ctx.userId,
              dso,
              tripPlanRequest: trip,
              researchData: ws.researchData,
              evidenceRefs: ws.evidenceRefs,
              itinerary: ctx.itinerary,
              recentMessages: ctx.recent_messages,
            });
          }
          if (slot.kind === 'hotel') {
            return r.hotel.runScopedCommerce({
              requestId: ctx.requestId,
              tripPlanRequest: trip,
              researchData: ws.researchData,
              evidenceRefs: ws.evidenceRefs,
              researchAtomicRollbackSnapshot: ctx.researchAtomicRollbackSnapshot,
            });
          }
          if (slot.kind === 'flight') {
            return r.flight.runScopedCommerce({
              requestId: ctx.requestId,
              tripPlanRequest: trip,
              researchData: ws.researchData,
              evidenceRefs: ws.evidenceRefs,
            });
          }
        }),
      );
      for (const s of plan.sequential ?? []) {
        if (s.kind === 'transport') {
          await r.transport.runTransportSearch({
            requestId: ctx.requestId,
            tripPlanRequest: trip,
            researchData: ws.researchData,
            evidenceRefs: ws.evidenceRefs,
          });
        }
        if (s.kind === 'compliance') {
          await r.compliance.runComplianceResearch({
            requestId: ctx.requestId,
            tripPlanRequest: trip,
            researchData: ws.researchData,
            evidenceRefs: ws.evidenceRefs,
          });
        }
      }
    });

    const executor = {
      prepareLeaderResearchWorkspace: jest.fn().mockResolvedValue({
        researchData: {},
        evidenceRefs: [],
        effectiveTrip: { destination: 'IS' },
        effectiveMode: 'full' as const,
        scopesForTopology: [] as string[],
      }),
      runTopologyPlanOnWorkspace: defaultRunTopology,
      finalizeLeaderResearchWorkspace: jest.fn().mockResolvedValue({
        researchData: { poi_evidence: [] },
        environmentPatch: { countryCode: 'IS' },
      }),
      ...executorOverrides,
    };
    return new ResearchTeamLeaderService(executor as any, sharedRegistry as any);
  }

  it('runs prepare → topology → finalize (no execute)', async () => {
    const leader = makeLeader();
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'IS' },
    };
    const out = await leader.run(dso, ctx);
    const exec = (leader as any).researchPipeline;
    expect(exec.prepareLeaderResearchWorkspace).toHaveBeenCalledWith(dso, ctx);
    expect(exec.runTopologyPlanOnWorkspace).toHaveBeenCalled();
    expect(exec.finalizeLeaderResearchWorkspace).toHaveBeenCalled();
    expect(out.researchData).toMatchObject({ poi_evidence: [] });
    expect(out.environmentPatch).toEqual({ countryCode: 'IS' });
    expect(out.teamAuditLog.map((e) => e.action)).toEqual(['plan_members', 'run_member_topology', 'finalize_workspace']);
    const planAudit = out.teamAuditLog.find((e) => e.action === 'plan_members');
    expect(planAudit?.detail?.research_execution_kind).toBe('FULL');
    expect(planAudit?.detail?.topology_plan).toMatchObject({
      preParallelSequential: [{ kind: 'transport' }],
      parallel: [{ kind: 'destination' }],
      sequential: [{ kind: 'compliance' }],
    });
    expect(planAudit?.detail?.team_merge_summary).toMatchObject({
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 0,
      scope_mutations: {},
      fallback_suture_count: 0,
    });
    expect(planAudit?.detail?.conflict_negotiation).toMatchObject({
      version: 1,
      has_conflicts: false,
      primary_narrative_stance: 'BALANCED',
    });
    expect(planAudit?.detail?.memory_replay).toBeNull();
    expect(out.researchData.__research_conflict_negotiation).toEqual(planAudit?.detail?.conflict_negotiation);
    const trace = out.researchData.__research_trace_signals as Record<string, unknown>;
    expect(trace?.schemaVersion).toBe('research-trace-signals/v1');
    expect(trace?.narrative_track).toBe('EXPERIENCE_FIRST');
    expect(trace?.frustration_circuit_triggered).toBe(false);
    const r = sharedRegistry as any;
    expect(r.transport.runTransportSearch).toHaveBeenCalled();
    expect(r.destination.runDestinationBundle).toHaveBeenCalled();
    expect(r.compliance.runComplianceResearch).toHaveBeenCalled();
  });

  it('scoped_partial + scopes passes normalized scopes into topology builder', async () => {
    const memberIds = jest.fn().mockReturnValue(['HotelResearchMember', 'FlightResearchMember']);
    const buildTopo = jest.fn((args: { scopesForTopology: string[] }) => mockTopologyFromScopes(args.scopesForTopology));
    const leader = makeLeader({
      memberIdsForScopes: memberIds,
      buildTopologyPlanForResearchExecution: buildTopo,
    });
    const exec = (leader as any).researchPipeline;
    exec.prepareLeaderResearchWorkspace.mockResolvedValue({
      researchData: {},
      evidenceRefs: [],
      effectiveTrip: { destination: 'X' },
      effectiveMode: 'scoped_partial',
      scopesForTopology: ['hotel', 'flight'],
    });
    const ctx: PhaseExecutorContext = {
      requestId: 'r-scoped',
      researchMode: 'scoped_partial',
      priorResearchData: { hotel_search_meta: { x: 1 } },
      researchScopesToRecompute: ['hotel', 'flight'],
      tripPlanRequest: { destination: 'X' },
    };
    const out = await leader.run(dso, ctx);
    expect(memberIds).toHaveBeenCalledWith(['hotel', 'flight']);
    expect(buildTopo).toHaveBeenCalledWith({
      effectiveMode: 'scoped_partial',
      scopesForTopology: ['hotel', 'flight'],
      hasTrip: true,
    });
    const planAudit = out.teamAuditLog.find((e) => e.action === 'plan_members');
    expect(planAudit?.detail?.research_execution_kind).toBe('SCOPED_PARTIAL');
    expect(planAudit?.detail?.registry_member_ids).toEqual(['HotelResearchMember', 'FlightResearchMember']);
    const r = sharedRegistry as any;
    expect(r.hotel.runScopedCommerce).toHaveBeenCalled();
    expect(r.flight.runScopedCommerce).toHaveBeenCalled();
  });

  it('transport_only plans transport member only', async () => {
    const leader = makeLeader();
    const exec = (leader as any).researchPipeline;
    exec.prepareLeaderResearchWorkspace.mockResolvedValue({
      researchData: { transport_evidence: {} },
      evidenceRefs: [],
      effectiveTrip: { origin: 'A', destination: 'B' },
      effectiveMode: 'transport_only',
      scopesForTopology: [],
    });
    const ctx: PhaseExecutorContext = {
      requestId: 'r-tr',
      researchMode: 'transport_only',
      priorResearchData: { transport_evidence: {} },
      tripPlanRequest: { origin: 'A', destination: 'B' },
    };
    const out = await leader.run(dso, ctx);
    const planAudit = out.teamAuditLog.find((e) => e.action === 'plan_members');
    expect(planAudit?.detail?.members_planned).toEqual(['TransportResearchMember']);
    expect(planAudit?.detail?.research_execution_kind).toBe('TRANSPORT_ONLY');
    const r = sharedRegistry as any;
    expect(r.transport.runTransportSearch).toHaveBeenCalledTimes(1);
  });

  it('full mode (no scoped flags) still lists monolith in members_planned audit while topology uses members', async () => {
    const leader = makeLeader();
    const ctx: PhaseExecutorContext = { requestId: 'r-full', tripPlanRequest: { destination: 'JP' } };
    const out = await leader.run(dso, ctx);
    const planAudit = out.teamAuditLog.find((e) => e.action === 'plan_members');
    expect(planAudit?.detail?.members_planned).toEqual(['ResearchExecutorMonolith']);
  });

  it('scoped commerce+transport runs parallel hotel+flight then sequential transport', async () => {
    const leader = makeLeader();
    const exec = (leader as any).researchPipeline;
    exec.prepareLeaderResearchWorkspace.mockResolvedValue({
      researchData: {},
      evidenceRefs: [],
      effectiveTrip: { destination: 'Osaka' },
      effectiveMode: 'scoped_partial',
      scopesForTopology: ['hotel', 'flight', 'transport'],
    });
    const ctx: PhaseExecutorContext = {
      requestId: 'topo-1',
      researchMode: 'scoped_partial',
      priorResearchData: { hotel_search_meta: { a: 1 } },
      researchScopesToRecompute: ['hotel', 'flight', 'transport'],
      tripPlanRequest: { destination: 'Osaka' },
    };
    const out = await leader.run(dso, ctx);
    const r = sharedRegistry as any;
    expect(r.hotel.runScopedCommerce).toHaveBeenCalled();
    expect(r.flight.runScopedCommerce).toHaveBeenCalled();
    expect(r.transport.runTransportSearch).toHaveBeenCalledTimes(1);
    expect(out.teamAuditLog.some((e) => e.action === 'run_member_topology')).toBe(true);
    expect(out.teamAuditLog.some((e) => e.action === 'finalize_workspace')).toBe(true);
  });

  it('scoped leader runs destination bundle when topology includes destination', async () => {
    const leader = makeLeader();
    const exec = (leader as any).researchPipeline;
    exec.prepareLeaderResearchWorkspace.mockResolvedValue({
      researchData: {},
      evidenceRefs: [],
      effectiveTrip: { destination: 'Osaka' },
      effectiveMode: 'scoped_partial',
      scopesForTopology: ['destination', 'hotel', 'flight', 'transport'],
    });
    const ctx: PhaseExecutorContext = {
      requestId: 'topo-dest-1',
      researchMode: 'scoped_partial',
      priorResearchData: { hotel_search_meta: { a: 1 } },
      researchScopesToRecompute: ['destination', 'hotel', 'flight', 'transport'],
      tripPlanRequest: { destination: 'Osaka' },
      routeDirectionId: 'rd-1',
      userId: 'u-1',
    };
    await leader.run(dso, ctx);
    const r = sharedRegistry as any;
    expect(r.destination.runDestinationBundle).toHaveBeenCalledWith({
      requestId: 'topo-dest-1',
      routeDirectionId: 'rd-1',
      userId: 'u-1',
      dso,
      tripPlanRequest: ctx.tripPlanRequest,
      researchData: {},
      evidenceRefs: [],
      itinerary: undefined,
      recentMessages: undefined,
    });
    expect(r.hotel.runScopedCommerce).toHaveBeenCalled();
    expect(r.flight.runScopedCommerce).toHaveBeenCalled();
    expect(r.transport.runTransportSearch).toHaveBeenCalledTimes(1);
  });
});
