import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import type {
  DecisionTrajectoryHarnessTraceRef,
  DecisionTrajectoryOrchestrationStep,
} from '../interfaces/decision-trajectory.types';
import type { DecisionLogEntry } from '../../interfaces/trip-plan.interface';

const HARNESS_TO_ORCH: Record<string, string> = {
  INTAKE: 'INTAKE',
  RESEARCH: 'RESEARCH',
  GATE_EVAL: 'GATE_EVAL',
  PLAN_GEN: 'PLAN_GEN',
  VERIFY: 'VERIFY',
  REPAIR: 'REPAIR',
  NARRATE: 'NARRATE',
};

export type HarnessTraceStepSpan = {
  harness_step: string;
  duration_ms?: number;
  run_status?: string;
};

export function mapHarnessStepToOrchestration(harnessStep: string): string | undefined {
  return HARNESS_TO_ORCH[harnessStep] ?? harnessStep;
}

/** 从落盘 JSON 读取 Harness trace 步跨度（失败时返回空数组，不抛错）。 */
export function tryLoadHarnessTraceStepSpans(exportPath: string | null | undefined): HarnessTraceStepSpan[] {
  if (!exportPath?.trim()) return [];
  try {
    const full = path.isAbsolute(exportPath)
      ? exportPath
      : path.join(process.cwd(), exportPath);
    if (!fs.existsSync(full)) return [];
    const raw = fs.readFileSync(full, 'utf8');
    const body = JSON.parse(raw) as { trace?: { steps?: Array<{ step?: string; durationMs?: number; runStatus?: string }> } };
    const steps = body?.trace?.steps;
    if (!Array.isArray(steps)) return [];
    return steps
      .filter((s) => s?.step)
      .map((s) => ({
        harness_step: String(s.step),
        duration_ms: typeof s.durationMs === 'number' ? s.durationMs : undefined,
        run_status: s.runStatus ? String(s.runStatus) : undefined,
      }));
  } catch {
    return [];
  }
}

export function shadowHarnessEventsToSpans(
  decisionState?: DecisionState,
): HarnessTraceStepSpan[] {
  const events = decisionState?.harnessRuntime?.shadow_harness_events;
  if (!events?.length) return [];
  return events.map((e) => ({
    harness_step: e.harness_step,
    run_status: e.run_status,
  }));
}

function mergeSpanMaps(
  fileSpans: HarnessTraceStepSpan[],
  shadowSpans: HarnessTraceStepSpan[],
): Map<string, HarnessTraceStepSpan> {
  const map = new Map<string, HarnessTraceStepSpan>();
  for (const s of shadowSpans) {
    map.set(s.harness_step, { ...s });
  }
  for (const s of fileSpans) {
    const prev = map.get(s.harness_step);
    map.set(s.harness_step, {
      harness_step: s.harness_step,
      duration_ms: s.duration_ms ?? prev?.duration_ms,
      run_status: s.run_status ?? prev?.run_status,
    });
  }
  return map;
}

/**
 * 将 decision_log 步与 Harness trace 对齐，补全 harness_duration_ms / harness_run_status。
 */
export function alignOrchestrationStepsWithHarness(
  logSteps: DecisionTrajectoryOrchestrationStep[],
  params: {
    decisionLog?: DecisionLogEntry[];
    harnessTracePath?: string | null;
    decisionState?: DecisionState;
  },
): DecisionTrajectoryOrchestrationStep[] {
  const fileSpans = tryLoadHarnessTraceStepSpans(params.harnessTracePath);
  const shadowSpans = shadowHarnessEventsToSpans(params.decisionState);
  const spanByHarness = mergeSpanMaps(fileSpans, shadowSpans);

  const verifyFailed = (params.decisionLog ?? []).some(
    (e) =>
      e.step === 'VERIFY' &&
      (String(e.outputs_summary ?? '').toLowerCase().includes('fail') ||
        (e.metadata as { verify_failed?: boolean })?.verify_failed === true),
  );

  return logSteps.map((step) => {
    const harnessKey = step.step as HarnessStepName;
    const span =
      spanByHarness.get(step.step) ??
      spanByHarness.get(harnessKey) ??
      [...spanByHarness.values()].find((s) => mapHarnessStepToOrchestration(s.harness_step) === step.step);

    let status = step.status;
    if (step.step === 'VERIFY' && verifyFailed) {
      status = 'FAILED';
    }

    return {
      ...step,
      status,
      ...(span?.duration_ms != null ? { harness_duration_ms: span.duration_ms } : {}),
      ...(span?.run_status ? { harness_run_status: span.run_status } : {}),
    };
  });
}

export function buildHarnessTraceRef(params: {
  exportPath: string | null;
  traceId?: string | null;
  decisionState?: DecisionState;
}): DecisionTrajectoryHarnessTraceRef {
  const fileSpans = tryLoadHarnessTraceStepSpans(params.exportPath);
  const shadowSpans = shadowHarnessEventsToSpans(params.decisionState);
  const merged = mergeSpanMaps(fileSpans, shadowSpans);

  return {
    export_path: params.exportPath,
    active_trace_id: params.traceId ?? params.decisionState?.harnessRuntime?.activeTraceId ?? null,
    step_spans: [...merged.values()].map((s) => ({
      harness_step: s.harness_step,
      orchestration_step: mapHarnessStepToOrchestration(s.harness_step),
      duration_ms: s.duration_ms,
      run_status: s.run_status,
    })),
  };
}
