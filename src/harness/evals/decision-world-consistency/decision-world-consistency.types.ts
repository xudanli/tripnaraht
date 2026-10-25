/**
 * Decision-time World Consistency Contract
 *
 * Architecture principle (not a UnifiedWorldState):
 *   One decision, one consistent world.
 *
 * Multi-source stores may remain (ROR, WorldFact, ConstraintStore, WorldModelContext…).
 * Within one Decision Run / Tick they must not present contradictory External Reality
 * to Abu / CGUS / Gate / Neptune.
 *
 * @see From multi-source world representations to decision-time world consistency.
 */

export const DECISION_WORLD_CONSISTENCY_SCHEMA =
  'tripnara.decision_world_consistency_tick@v1' as const;

/** Safety External Reality first; Execution/Human later. */
export type DecisionWorldConsistencyGroup =
  | 'SAFETY_EXTERNAL'
  | 'EXECUTION_HUMAN';

export type DecisionWorldConsistencyScenarioId =
  | 'ROAD_CLOSED'
  | 'STRONG_WIND'
  | 'POI_CLOSED'
  | 'USER_FATIGUE'
  | 'USER_DELAY_90M';

export type RoadStatusView =
  | 'OPEN'
  | 'CLOSED'
  | 'RESTRICTED'
  | 'UNKNOWN'
  | 'UNVERIFIED'
  | 'ABSENT';

export type PoiOpenView =
  | 'OPEN'
  | 'CLOSED'
  | 'UNKNOWN'
  | 'UNVERIFIED'
  | 'ABSENT';

/** Normalized wind reading for table cells (m/s or seasonal label). */
export type WindView =
  | { kind: 'mps'; mps: number; alertLevel?: string }
  | { kind: 'seasonal_typical'; mps: number }
  | { kind: 'absent' };

export type ConsistencyVerdict = 'PASS' | 'FAIL';

/** Shared authority fingerprint for same-tick road (stronger than value-only equality). */
export type DecisionTickRoadSourceVersionView = {
  evidenceId: string;
  observedAt: string;
  source: string;
  authority: string;
  version: string;
};

/**
 * Same-tick views — what each representation / consumer actually holds.
 * Values are already projected for comparison (not raw store dumps).
 */
export interface DecisionTickWorldViews {
  tickId: string;
  scenarioId: DecisionWorldConsistencyScenarioId;
  group: DecisionWorldConsistencyGroup;
  /** Ground truth injected for this harness tick */
  reality: {
    road?: RoadStatusView;
    windMps?: number;
    windAlert?: string;
    poi?: PoiOpenView;
  };
  canonical: {
    road?: RoadStatusView;
    windMps?: number;
    windAlert?: string;
    poi?: PoiOpenView;
    poiSourceVersion?: DecisionTickRoadSourceVersionView;
    snapshotId?: string;
  };
  constraintStore: {
    road?: RoadStatusView;
    weatherStressed?: boolean;
  };
  worldModelContext: {
    road?: RoadStatusView;
    /** What CGUS historically preferred when reading climateSeasonality */
    windFromSeasonalTypicalMps?: number | null;
    /** Authority / observation band if present on physical.weatherEvidence */
    windFromWeatherEvidenceMps?: number | null;
    poi?: PoiOpenView;
    poiSourceVersion?: DecisionTickRoadSourceVersionView;
  };
  lookAssertion?: {
    predicate: string;
    authoritative: boolean;
    impliesRoadClosedHint?: boolean;
  };
  /** Consumer projections for this tick */
  abuSees: {
    road?: RoadStatusView;
    roadSourceVersion?: DecisionTickRoadSourceVersionView;
  };
  cgusSees: {
    road?: RoadStatusView;
    treatAsOpenFact?: boolean;
    roadSourceVersion?: DecisionTickRoadSourceVersionView;
    /** Wind value CGUS scoring actually uses after precedence (or legacy) */
    windMps?: number | null;
    windSource?: 'authority_observation' | 'seasonal_typical' | 'absent';
  };
  gateSees: {
    road?: RoadStatusView;
    disposition?: string;
    roadSourceVersion?: DecisionTickRoadSourceVersionView;
    windMps?: number | null;
    windAlert?: string;
    poi?: PoiOpenView;
    poiSourceVersion?: DecisionTickRoadSourceVersionView;
    snapshotId?: string;
  };
  neptuneSees?: {
    windAlert?: string;
    road?: RoadStatusView;
    poi?: PoiOpenView;
  };
}

export interface DecisionTickConsistencyCell {
  key: string;
  reality: string;
  canonical: string;
  constraint: string;
  worldModelContext: string;
  abuSees: string;
  cgusSees: string;
  gateSees: string;
  neptuneSees: string;
  result: ConsistencyVerdict;
  divergenceNotes: string[];
}

export interface DecisionTickConsistencyReport {
  schemaId: typeof DECISION_WORLD_CONSISTENCY_SCHEMA;
  tickId: string;
  scenarioId: DecisionWorldConsistencyScenarioId;
  group: DecisionWorldConsistencyGroup;
  overall: ConsistencyVerdict;
  cells: DecisionTickConsistencyCell[];
  /** Markdown / log friendly one-liner rows */
  tableRows: string[];
}
