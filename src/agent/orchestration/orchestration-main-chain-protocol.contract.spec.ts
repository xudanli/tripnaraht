import {
  MAIN_CHAIN_OBSERVED_NODE_ORDER,
  MAIN_CHAIN_POST_PLAN_NODES,
  MAIN_CHAIN_PRE_PLAN_NODES,
  MAIN_CHAIN_PROTOCOL_VERSION,
  MAIN_CHAIN_SHORT_CIRCUITS,
  MAIN_CHAIN_USER_CONFIRM_POINTS,
  MAIN_CHAIN_PLAN_VERIFY_ENTRY,
  assertPrePlanOrderAligned,
  buildMainChainHappyPathNextMap,
} from './orchestration-main-chain-protocol.constants';
import { MAIN_CHAIN_STATIC_EDGES } from './graph/edges/main-chain.edges';
import { PLAN_VERIFY_LOOP_EDGES, PLAN_VERIFY_LOOP_ENTRY } from './graph/edges/plan-verify-loop.edges';
import { PRE_PLAN_NODE_ORDER } from './graph/pre-plan-graph.runner';

describe('Orchestration Main Chain Protocol contract', () => {
  it('freezes protocol version envelope', () => {
    expect(MAIN_CHAIN_PROTOCOL_VERSION).toBe('1.0.0');
  });

  it('pre_plan order matches runner PRE_PLAN_NODE_ORDER', () => {
    expect(assertPrePlanOrderAligned()).toBe(true);
    expect([...MAIN_CHAIN_PRE_PLAN_NODES]).toEqual([...PRE_PLAN_NODE_ORDER]);
  });

  it('plan_verify entry is optimize', () => {
    expect(MAIN_CHAIN_PLAN_VERIFY_ENTRY).toBe('optimize');
    expect(PLAN_VERIFY_LOOP_ENTRY).toBe('optimize');
  });

  it('static edges cover pre_plan happy path and post_plan', () => {
    const fromTo = new Map(MAIN_CHAIN_STATIC_EDGES.map((e) => [e.from, e.to]));
    expect(fromTo.get('intake')).toBe('state_update');
    expect(fromTo.get('state_update')).toBe('research');
    expect(fromTo.get('research')).toBe('poi_selection');
    expect(fromTo.get('poi_selection')).toBe('gate_eval');
    expect(fromTo.get('gate_eval')).toBe('context_build');
    expect(fromTo.get('context_build')).toBe('plan_gen');
    expect(fromTo.get('plan_gen')).toBe('optimize');
    expect(fromTo.get('narrate')).toBe('feedback');
    expect(fromTo.get('feedback')).toBe('hallucination');
    expect(fromTo.get('hallucination')).toBe('END');
  });

  it('plan_verify edges include repair loop and RETURN_TO_RESEARCH', () => {
    const reasons = PLAN_VERIFY_LOOP_EDGES.map((e) => `${e.from}->${e.to}:${e.reason}`);
    expect(reasons).toContain('optimize->verify:happy_path');
    expect(reasons).toContain('verify->repair:repair_triggered');
    expect(reasons).toContain('repair->verify:repair_reverify');
    expect(reasons).toContain('verify->research:RETURN_TO_RESEARCH');
  });

  it('observed node order contains all post_plan nodes', () => {
    for (const n of MAIN_CHAIN_POST_PLAN_NODES) {
      expect(MAIN_CHAIN_OBSERVED_NODE_ORDER).toContain(n);
    }
    expect(MAIN_CHAIN_OBSERVED_NODE_ORDER[0]).toBe('intake');
    expect(MAIN_CHAIN_OBSERVED_NODE_ORDER[MAIN_CHAIN_OBSERVED_NODE_ORDER.length - 1]).toBe(
      'hallucination',
    );
  });

  it('short-circuits and user-confirm points are non-empty frozen inventories', () => {
    expect(MAIN_CHAIN_SHORT_CIRCUITS.length).toBeGreaterThanOrEqual(8);
    expect(MAIN_CHAIN_USER_CONFIRM_POINTS.some((p) => p.id === 'gate_abu_reject')).toBe(true);
    expect(MAIN_CHAIN_USER_CONFIRM_POINTS.some((p) => p.id === 'repair_halt')).toBe(true);
    expect(MAIN_CHAIN_USER_CONFIRM_POINTS.some((p) => p.id === 'flawed_draft_opt_in')).toBe(true);
  });

  it('happy-path next map includes main-chain static edges', () => {
    const m = buildMainChainHappyPathNextMap();
    expect(m.get('intake')).toBe('state_update');
    expect(m.get('plan_gen')).toBe('optimize');
    expect(m.get('optimize')).toBe('verify');
  });
});
