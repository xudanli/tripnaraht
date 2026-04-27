import { createHash } from 'node:crypto';

function stableSortObject(x: any): any {
  if (Array.isArray(x)) return x.map(stableSortObject);
  if (!x || typeof x !== 'object') return x;
  const out: Record<string, any> = {};
  for (const k of Object.keys(x).sort()) out[k] = stableSortObject(x[k]);
  return out;
}

export function sha256Signature(payload: unknown): string {
  const json = JSON.stringify(stableSortObject(payload));
  const hex = createHash('sha256').update(json).digest('hex');
  return `sha256:${hex}`;
}

export type AllowedVarianceRule =
  | {
      metric: string;
      op: 'abs_delta_lte';
      threshold: number;
      unit?: string;
    }
  | {
      metric: string;
      op: 'pct_delta_lte';
      threshold: number;
      unit?: string;
    }
  | {
      metric: string;
      op: 'range_inclusive';
      threshold: { min: number; max: number };
      unit?: string;
    };

export type ExpectedStateDelta = {
  deltas: Array<{
    path: string;
    op: 'set' | 'inc' | 'dec';
    value: number | string | boolean | object | null;
    unit?: string;
  }>;
};

export type PhysicsFactV1 = {
  rule_id: string;
  actual_value?: number | string | boolean | null;
  threshold?: number | string | null;
  unit?: string;
  is_violated: boolean;
  severity?: 'HARD' | 'SOFT';
  evidence?: Record<string, unknown>;
  at?: string;
};

export type DecisionContractV1 = {
  version: 'v1';
  semantic_signature: {
    env_hash: string;
    constraint_hash: string;
    risk_profile_hash?: string;
    feasibility_snapshot?: {
      feasible: boolean;
      hard_violation_count?: number;
      violated_rules?: Array<{ rule_id: string; severity: 'HARD' | 'SOFT' }>;
    };
  };
  allowed_variance: AllowedVarianceRule[];
  expected_state_delta: ExpectedStateDelta;
  evidence_refs?: string[];
  physics_facts?: PhysicsFactV1[];
};

