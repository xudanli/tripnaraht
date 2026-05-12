import { Injectable } from '@nestjs/common';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { ExecutionPolicyIR } from '../contracts/execution-policy-ir.types';
import type { PolicyConstraints } from '../contracts/execution-policy-ir.types';
import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import type { PolicyCorrectionSignal } from '../contracts/policy-correction.types';
import type { SpclCalibrationOptions, SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import type { GlobalSpclFlushSummary } from '../contracts/global-spcl.types';
import { applyPolicyCorrectionSignals } from '../utils/policy-correction-kernel.util';
import { applyGlobalSpclToBias, GlobalSpclRingBuffer } from '../utils/global-spcl-optimizer.util';
import { applySpclCalibrationStep } from '../utils/shadow-policy-calibration.util';
import { compilePolicy } from '../utils/execution-policy.compiler';

/**
 * Process-local ECPS bias surface — updated by PCK after trace analysis (TD-PCL)
 * and optionally by SPCL (shadow vs execution ΔΦ error).
 *
 * Persistence / multi-tenant isolation can replace this implementation later.
 */
@Injectable()
export class EcpsRuntimeBiasService {
  private bias: ECPSRuntimeBias = { ...DEFAULT_ECPS_RUNTIME_BIAS };

  getBias(): ECPSRuntimeBias {
    return { ...this.bias };
  }

  /** Replace bias (tests / admin). */
  setBias(next: ECPSRuntimeBias): void {
    this.bias = { ...next };
  }

  reset(): void {
    this.bias = { ...DEFAULT_ECPS_RUNTIME_BIAS };
  }

  applySignals(signals: PolicyCorrectionSignal[]): void {
    if (signals.length === 0) return;
    this.bias = applyPolicyCorrectionSignals(this.bias, signals);
  }

  /**
   * SPCL: ε = ΔΦ_exec − ΔΦ_shadow → bounded bias nudge (shadow as critic).
   * Caller supplies observed exec deltas when telemetry exists; dedup-only paths often omit exec signal.
   */
  applySpclCalibration(sample: SpclObservationSample, options?: SpclCalibrationOptions): void {
    this.bias = applySpclCalibrationStep(this.bias, sample, options);
  }

  /**
   * Global SPCL: merge ε across buffered observations (cross-request), single bias merge, then clear buffer.
   */
  applyGlobalSpclBuffer(buffer: GlobalSpclRingBuffer, options?: SpclCalibrationOptions): GlobalSpclFlushSummary {
    const n = buffer.length();
    const { next, applied } = applyGlobalSpclToBias(this.bias, buffer, options);
    if (applied) {
      this.bias = next;
      buffer.clear();
    }
    return { sampleCount: n, applied };
  }

  /** Compiled artifact for ECPS runtime (`interpretExecutionPolicyIR`). */
  compileExecutionPolicy(traces: ExecutionTrace[] = [], constraints: PolicyConstraints = {}): ExecutionPolicyIR {
    return compilePolicy(traces, this.bias, constraints);
  }
}
