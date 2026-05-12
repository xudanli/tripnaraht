/**
 * Legacy SYSTEM1/SYSTEM2 tier strings — **observability & runner adapter only**, never ECPS decision inputs.
 */

import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type { ExecutionEngineType } from '../contracts/execution-control-policy.types';

/** @deprecated Logging/UI projection — maps kernel → historical engine enum for dashboards. */
export function projectKernelToLegacyTier(
  kernel: ExecutionKernel,
  _modeHint?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM',
): ExecutionEngineType {
  switch (kernel) {
    case 'REFLEX_KERNEL':
      return 'SYSTEM1';
    case 'LIGHTWEIGHT_KERNEL':
      return 'LIGHTWEIGHT_QA';
    case 'REASONING_KERNEL':
      return 'SYSTEM2_REACT';
    case 'WORKFLOW_KERNEL':
      return 'SYSTEM2_STATE_MACHINE';
    default: {
      const _x: never = kernel;
      return _x;
    }
  }
}

/** Inverse of `projectKernelToLegacyTier` for trace replay where only legacy engine was recorded. */
export function legacyTierToKernel(engine: ExecutionEngineType): ExecutionKernel {
  switch (engine) {
    case 'SYSTEM1':
      return 'REFLEX_KERNEL';
    case 'LIGHTWEIGHT_QA':
      return 'LIGHTWEIGHT_KERNEL';
    case 'SYSTEM2_REACT':
      return 'REASONING_KERNEL';
    case 'SYSTEM2_STATE_MACHINE':
      return 'WORKFLOW_KERNEL';
    default: {
      const _e: never = engine;
      return _e;
    }
  }
}

/** Map expanded depth to legacy ECPS IR slot labels / backward compat. */
export function executionToolDepthToLegacyDepth(d: import('../contracts/execution-semantic-field.types').ExecutionToolDepth): 'NONE' | 'LIGHT' | 'FULL' {
  switch (d) {
    case 'NONE':
      return 'NONE';
    case 'LOW':
    case 'MEDIUM':
      return 'LIGHT';
    case 'HIGH':
      return 'FULL';
    default: {
      const _e: never = d;
      return _e;
    }
  }
}
