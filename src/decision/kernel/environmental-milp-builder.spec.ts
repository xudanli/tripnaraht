import {
  buildEnvironmentalMilp,
  buildEnvironmentalMilpWithSlack,
  edgeRiskBreakdown,
  type EnvIndexedJson,
  type MilpModel,
  type MilpVar,
} from './environmental-milp-builder';

type RecordedConstr =
  | { kind: 'LEQ'; name: string; lhs: Array<{ coef: number; v: MilpVar }>; rhs: number }
  | { kind: 'GEQ'; name: string; lhs: Array<{ coef: number; v: MilpVar }>; rhs: number };

class RecordingModel implements MilpModel {
  vars: Record<string, MilpVar> = {};
  constrs: RecordedConstr[] = [];

  addBinaryVar(name: string): MilpVar {
    const v = { name };
    this.vars[name] = v;
    return v;
  }
  addContVar(name: string, _lb?: number, _ub?: number): MilpVar {
    const v = { name };
    this.vars[name] = v;
    return v;
  }
  addLeq(name: string, lhs: Array<{ coef: number; v: MilpVar }>, rhs: number): void {
    this.constrs.push({ kind: 'LEQ', name, lhs, rhs });
  }
  addGeq(name: string, lhs: Array<{ coef: number; v: MilpVar }>, rhs: number): void {
    this.constrs.push({ kind: 'GEQ', name, lhs, rhs });
  }
}

describe('environmental-milp-builder', () => {
  it('adds latestEnd (sunset+buffer) for visibility_req and earliestStart for aurora-style window', () => {
    const input: EnvIndexedJson = {
      day: '2026-04-21',
      sunset: '20:15',
      nodes: [
        { id: 'POI_001', dur: 60, visibility_req: true },
        {
          id: 'POI_002',
          dur: 45,
          visibilityWindow: { earliestStartMin: 20 * 60 + 15 + 90 }, // sunset + 90
        },
      ],
      edges: [
        { from: 'POI_001', to: 'POI_002', travel_time: 30, road_open: 1 },
      ],
    };

    const model = new RecordingModel();
    buildEnvironmentalMilp(model, input, {
      envWeatherRisk01: 0.4,
      riskBudgetMax: 0.9,
      twilightBufferMin: 30,
    });

    const hasLatestEnd = model.constrs.some(
      (c) => c.kind === 'LEQ' && c.name === 'VisLatestEnd_2026-04-21_POI_001' && c.rhs === (20 * 60 + 15 + 30 - 60),
    );
    expect(hasLatestEnd).toBe(true);

    const hasEarliestStart = model.constrs.some(
      (c) => c.kind === 'GEQ' && c.name === 'VisEarliestStart_2026-04-21_POI_002' && c.rhs === (20 * 60 + 15 + 90),
    );
    expect(hasEarliestStart).toBe(true);
  });

  it('derives windows from tags: golden_hour => latestEnd; aurora => earliestStart', () => {
    const input: EnvIndexedJson = {
      day: '2026-04-21',
      sunset: '20:15',
      nodes: [
        { id: 'P1', dur: 30, tags: ['golden_hour'], delta_min: 15 },
        { id: 'P2', dur: 60, tags: ['aurora'], aurora_offset: 120 },
      ],
      edges: [{ from: 'P1', to: 'P2', travel_time: 10, road_open: 1 }],
    };
    const model = new RecordingModel();
    buildEnvironmentalMilp(model, input, { envWeatherRisk01: 0.1, riskBudgetMax: 1, twilightBufferMin: 30 });

    const sunsetMin = 20 * 60 + 15;
    expect(
      model.constrs.some(
        (c) => c.kind === 'LEQ' && c.name === 'VisLatestEnd_2026-04-21_P1' && c.rhs === (sunsetMin + 15 - 30),
      ),
    ).toBe(true);
    expect(
      model.constrs.some(
        (c) => c.kind === 'GEQ' && c.name === 'VisEarliestStart_2026-04-21_P2' && c.rhs === (sunsetMin + 120),
      ),
    ).toBe(true);
  });

  it('enforces road closures via y <= road_open', () => {
    const input: EnvIndexedJson = {
      day: '2026-04-21',
      sunset: '20:15',
      nodes: [
        { id: 'A', dur: 10 },
        { id: 'B', dur: 10 },
      ],
      edges: [{ id: 'e1', from: 'A', to: 'B', travel_time: 5, road_open: 0 }],
    };
    const model = new RecordingModel();
    buildEnvironmentalMilp(model, input, { envWeatherRisk01: 0.2, riskBudgetMax: 1, twilightBufferMin: 30 });

    const c = model.constrs.find((x) => x.kind === 'LEQ' && x.name === 'RoadClosure_2026-04-21_e1') as any;
    expect(c).toBeDefined();
    expect(c.rhs).toBe(0);
    expect(c.lhs.length).toBe(1);
    expect(c.lhs[0].v.name).toBe('y_2026-04-21_e1');
  });

  it('adds slack-enabled visibility constraints with expected coefficients', () => {
    const input: EnvIndexedJson = {
      day: '2026-04-21',
      sunset: '20:15',
      nodes: [
        { id: 'A', dur: 30, tags: ['golden_hour'], delta_min: 15 },
        { id: 'B', dur: 60, tags: ['aurora'], aurora_offset: 120 },
      ],
      edges: [{ from: 'A', to: 'B', travel_time: 10, road_open: 1 }],
    };
    const model = new RecordingModel();
    const out = buildEnvironmentalMilpWithSlack(model, input, {
      envWeatherRisk01: 0.2,
      riskBudgetMax: 5,
      twilightBufferMin: 30,
    });

    expect(out.slack.A.late?.name).toBe('slack_late_2026-04-21_A');
    expect(out.slack.B.early?.name).toBe('slack_early_2026-04-21_B');

    const late = model.constrs.find((c) => c.kind === 'LEQ' && c.name === 'VisLatestEndSlack_2026-04-21_A') as any;
    expect(late).toBeDefined();
    // lhs should include +1*s_A and -1*slack_late
    expect(late.lhs.some((t: any) => t.coef === 1 && t.v.name === 's_2026-04-21_A')).toBe(true);
    expect(late.lhs.some((t: any) => t.coef === -1 && t.v.name === 'slack_late_2026-04-21_A')).toBe(true);

    const early = model.constrs.find((c) => c.kind === 'GEQ' && c.name === 'VisEarliestStartSlack_2026-04-21_B') as any;
    expect(early).toBeDefined();
    // lhs should include +1*s_B and +1*slack_early
    expect(early.lhs.some((t: any) => t.coef === 1 && t.v.name === 's_2026-04-21_B')).toBe(true);
    expect(early.lhs.some((t: any) => t.coef === 1 && t.v.name === 'slack_early_2026-04-21_B')).toBe(true);
  });

  it('computes risk cost using table-driven water/surface/steepness penalties (cap=10)', () => {
    const input: EnvIndexedJson = {
      day: '2026-04-21',
      sunset: '20:15',
      nodes: [
        { id: 'A', dur: 10 },
        { id: 'B', dur: 10 },
      ],
      edges: [
        {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          weatherRisk: 0.4,
          exposure: 0.5,
          water_crossing_depth_cm: 80,
          steepness_grade_pct: 21,
          surface_type: 'mud',
        },
      ],
    };
    const model = new RecordingModel();
    buildEnvironmentalMilp(model, input, { envWeatherRisk01: 0.1, riskBudgetMax: 10, twilightBufferMin: 30 });

    const rb = model.constrs.find((c) => c.kind === 'LEQ' && c.name === 'RiskBudget_2026-04-21') as any;
    expect(rb).toBeDefined();
    expect(rb.lhs.length).toBe(1);
    // Base = 0.4*(1+0.5)=0.6
    // Water(>=80)=8.0, Mud=2.5, Steep: (21-10)=11 => ceil(11/5)=3 steps => 0.6, total=11.7 -> cap=10
    expect(rb.lhs[0].coef).toBe(10);

    const breakdown = edgeRiskBreakdown(input.edges[0]!, 0.1);
    expect(breakdown.total).toBe(10);
    expect(breakdown.components.water).toBe(8);
    expect(breakdown.components.terrain).toBeGreaterThan(0);
    expect(breakdown.metadata.critical_factors).toEqual(
      expect.arrayContaining(['water_crossing_depth_cm', 'steepness_grade_pct', 'surface_type']),
    );
    expect(breakdown.metadata.is_hard_closed).toBe(false);
  });
});

