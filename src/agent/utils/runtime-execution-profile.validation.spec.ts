import type { RuntimeExecutionProfile } from '../contracts/runtime-execution-profile.types';
import {
  AGGREGATE_COGNITION_REPLAY_DOMAIN,
  INV_DEDUP_ENGINE,
  INV_DEPTH_NONE_TOOL_NONE,
  INV_FAST_REACT_LATENCY,
  INV_FRESH_REQUIRES_ENGINE,
  INV_REACT_NOT_FULLY_DETERMINISTIC,
  INV_REPLAY_WORLD_STATE_DRIFT,
  INV_SM_WORKFLOW_STYLE,
  mergeRuntimeExecutionAnomaliesByCode,
  validateRuntimeExecutionProfile,
} from './runtime-execution-profile.validation';

const coherentReact: RuntimeExecutionProfile = {
  cognition: { depth: 'DELIBERATIVE', style: 'REASONING' },
  execution: {
    engine: 'REACT_ORCHESTRATOR',
    toolDepth: 'MULTI',
    determinism: 'OPEN_ENDED',
  },
  runtime: { reusePolicy: 'FRESH', latencyClass: 'LONG_RUNNING' },
  observability: { userFacingMode: 'DEEP_REASONING' },
};

describe('validateRuntimeExecutionProfile', () => {
  it('passes for coherent REACT profile', () => {
    const r = validateRuntimeExecutionProfile(coherentReact);
    expect(r.anomalies).toHaveLength(0);
  });

  it('Rule 1: DEDUP_REPLAY without NOT_RUN → ERROR IMPOSSIBLE_STATE', () => {
    const r = validateRuntimeExecutionProfile({
      ...coherentReact,
      runtime: { reusePolicy: 'DEDUP_REPLAY', latencyClass: 'FAST' },
      cognition: { depth: 'NONE', style: 'RETRIEVAL' },
      execution: {
        engine: 'REACT_ORCHESTRATOR',
        toolDepth: 'NONE',
        determinism: 'OPEN_ENDED',
      },
    });
    const a = r.anomalies.find((x) => x.code === INV_DEDUP_ENGINE);
    expect(a?.severity).toBe('ERROR');
    expect(a?.category).toBe('IMPOSSIBLE_STATE');
    expect(a?.suggestedAction).toBe('INVALIDATE_REPLAY');
  });

  it('Rule 2: STATE_MACHINE without WORKFLOW style', () => {
    const r = validateRuntimeExecutionProfile({
      ...coherentReact,
      cognition: { depth: 'PLANNING', style: 'REASONING' },
      execution: {
        engine: 'STATE_MACHINE',
        toolDepth: 'SINGLE',
        determinism: 'DETERMINISTIC',
      },
    });
    const a = r.anomalies.find((x) => x.code === INV_SM_WORKFLOW_STYLE);
    expect(a?.severity).toBe('ERROR');
    expect(a?.category).toBe('IMPOSSIBLE_STATE');
  });

  it('Rule 3: REACT with DETERMINISTIC → WARNING SEMANTIC_DRIFT', () => {
    const r = validateRuntimeExecutionProfile({
      ...coherentReact,
      execution: {
        engine: 'REACT_ORCHESTRATOR',
        toolDepth: 'MULTI',
        determinism: 'DETERMINISTIC',
      },
    });
    const a = r.anomalies.find((x) => x.code === INV_REACT_NOT_FULLY_DETERMINISTIC);
    expect(a?.severity).toBe('WARNING');
    expect(a?.category).toBe('SEMANTIC_DRIFT');
    expect(a?.metadata?.determinism).toBe('DETERMINISTIC');
  });

  it('Rule 4: depth NONE with tool depth', () => {
    const r = validateRuntimeExecutionProfile({
      ...coherentReact,
      cognition: { depth: 'NONE', style: 'RETRIEVAL' },
      execution: {
        engine: 'LIGHTWEIGHT_QA',
        toolDepth: 'SINGLE',
        determinism: 'HYBRID',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'INTERACTIVE' },
    });
    const a = r.anomalies.find((x) => x.code === INV_DEPTH_NONE_TOOL_NONE);
    expect(a?.severity).toBe('ERROR');
    expect(a?.category).toBe('IMPOSSIBLE_STATE');
  });

  it('Rule 5: FAST + REACT → WARNING', () => {
    const r = validateRuntimeExecutionProfile({
      ...coherentReact,
      runtime: { reusePolicy: 'FRESH', latencyClass: 'FAST' },
    });
    const a = r.anomalies.find((x) => x.code === INV_FAST_REACT_LATENCY);
    expect(a?.severity).toBe('WARNING');
    expect(a?.suggestedAction).toBe('DOWNGRADE_TO_LIGHTWEIGHT');
  });

  it('FRESH + NOT_RUN anomaly', () => {
    const r = validateRuntimeExecutionProfile({
      cognition: { depth: 'NONE', style: 'RETRIEVAL' },
      execution: {
        engine: 'NOT_RUN',
        toolDepth: 'NONE',
        determinism: 'DETERMINISTIC',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'FAST' },
      observability: { userFacingMode: 'FAST_PATH' },
    });
    const a = r.anomalies.find((x) => x.code === INV_FRESH_REQUIRES_ENGINE);
    expect(a?.severity).toBe('ERROR');
    expect(a?.category).toBe('IMPOSSIBLE_STATE');
  });

  it('INV.REPLAY_WORLD_STATE_DRIFT legacy aggregate version mismatch → FULL_COGNITION_REPLAY', () => {
    const profile: RuntimeExecutionProfile = {
      cognition: { depth: 'NONE', style: 'RETRIEVAL' },
      execution: {
        engine: 'NOT_RUN',
        toolDepth: 'NONE',
        determinism: 'DETERMINISTIC',
      },
      runtime: { reusePolicy: 'DEDUP_REPLAY', latencyClass: 'FAST' },
      observability: { userFacingMode: 'FAST_PATH', orchestration_mode_hint: 'DEDUP' },
    };
    const r = validateRuntimeExecutionProfile(profile, {
      replay_cached_world_state_version: 'ws-v1',
      replay_current_world_state_version: 'ws-v2',
    });
    const a = r.anomalies.find((x) => x.code === INV_REPLAY_WORLD_STATE_DRIFT);
    expect(a).toBeDefined();
    expect(a?.severity).toBe('ERROR');
    expect(a?.category).toBe('SEMANTIC_DRIFT');
    expect(a?.suggestedAction).toBe('INVALIDATE_REPLAY');
    expect(a?.metadata?.replay_cached_world_state_version).toBe('ws-v1');
    expect(a?.affectedCognitiveDomains).toEqual([AGGREGATE_COGNITION_REPLAY_DOMAIN]);
    expect(a?.metadata?.invalidationMode).toBe('AGGREGATE_WORLD_VERSION');
  });

  it('INV.REPLAY_WORLD_STATE_DRIFT WorldFreshnessVector weather drift → selective domains', () => {
    const profile: RuntimeExecutionProfile = {
      cognition: { depth: 'NONE', style: 'RETRIEVAL' },
      execution: {
        engine: 'NOT_RUN',
        toolDepth: 'NONE',
        determinism: 'DETERMINISTIC',
      },
      runtime: { reusePolicy: 'PARTIAL_REUSE', latencyClass: 'FAST' },
      observability: { userFacingMode: 'FAST_PATH' },
    };
    const r = validateRuntimeExecutionProfile(profile, {
      replay_cached_freshness: { weatherVersion: 'w1', mapVersion: 'm-same' },
      replay_current_freshness: { weatherVersion: 'w2', mapVersion: 'm-same' },
    });
    const a = r.anomalies.find((x) => x.code === INV_REPLAY_WORLD_STATE_DRIFT);
    expect(a?.metadata?.invalidationMode).toBe('PER_DIMENSION_FRESHNESS');
    expect(a?.metadata?.driftedDimensions).toEqual(['weatherVersion']);
    expect(a?.affectedCognitiveDomains).toContain('OUTDOOR_ROUTE');
    expect(a?.affectedCognitiveDomains).toContain('TRANSPORT_TIMING');
  });
});

describe('mergeRuntimeExecutionAnomaliesByCode', () => {
  it('later incoming replaces same code', () => {
    const merged = mergeRuntimeExecutionAnomaliesByCode(
      [
        {
          code: 'X',
          severity: 'WARNING',
          category: 'SEMANTIC_DRIFT',
          message: 'old',
        },
      ],
      [
        {
          code: 'X',
          severity: 'ERROR',
          category: 'SEMANTIC_DRIFT',
          message: 'new',
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe('ERROR');
    expect(merged[0].message).toBe('new');
  });
});
