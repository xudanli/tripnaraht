/**
 * P0/P1 Incident 闭环：Trace → Root Cause → Fix → Regression。
 * 缺任一环节不得结案。
 */

import type { NaraIncidentRecordV1 } from './nara-incident-record.util';
import type { RealWorldRegressionGoldenV1 } from './real-world-regression-golden.util';
import { createRealWorldRegressionGolden } from './real-world-regression-golden.util';

export const INCIDENT_CLOSURE_PIPELINE_SCHEMA =
  'nara.incident_closure_pipeline@v1' as const;

export type IncidentClosurePipelineV1 = {
  schemaId: typeof INCIDENT_CLOSURE_PIPELINE_SCHEMA;
  version: 1;
  incidentId: string;
  traceRef: string | null;
  rootCauseZh: string | null;
  fixRef: string | null;
  regression: RealWorldRegressionGoldenV1 | null;
  complete: boolean;
  reasonsZh: string[];
};

export function startIncidentClosurePipeline(
  incident: NaraIncidentRecordV1,
): IncidentClosurePipelineV1 {
  return {
    schemaId: INCIDENT_CLOSURE_PIPELINE_SCHEMA,
    version: 1,
    incidentId: incident.incidentId,
    traceRef: null,
    rootCauseZh: null,
    fixRef: null,
    regression: null,
    complete: false,
    reasonsZh: ['待完成 Trace → Root Cause → Fix → Regression'],
  };
}

export function attachIncidentTrace(
  pipeline: IncidentClosurePipelineV1,
  traceRef: string,
): IncidentClosurePipelineV1 {
  if (!traceRef.trim()) {
    throw new Error('[IncidentClosure] traceRef_required');
  }
  return { ...pipeline, traceRef, complete: false, reasonsZh: ['Trace 已挂接'] };
}

export function attachIncidentRootCause(
  pipeline: IncidentClosurePipelineV1,
  rootCauseZh: string,
): IncidentClosurePipelineV1 {
  if (!rootCauseZh.trim()) {
    throw new Error('[IncidentClosure] rootCause_required');
  }
  return {
    ...pipeline,
    rootCauseZh,
    complete: false,
    reasonsZh: ['Root Cause 已记录'],
  };
}

export function attachIncidentFix(
  pipeline: IncidentClosurePipelineV1,
  fixRef: string,
): IncidentClosurePipelineV1 {
  if (!fixRef.trim()) {
    throw new Error('[IncidentClosure] fixRef_required');
  }
  return { ...pipeline, fixRef, complete: false, reasonsZh: ['Fix 已记录'] };
}

export function attachIncidentRegression(
  pipeline: IncidentClosurePipelineV1,
  input: {
    tripId: string;
    journeyId: RealWorldRegressionGoldenV1['journeyId'];
    titleZh: string;
    goldenId?: string;
  },
): IncidentClosurePipelineV1 {
  const regression = createRealWorldRegressionGolden({
    goldenId: input.goldenId ?? `rwg_closure_${pipeline.incidentId}`,
    tripId: input.tripId,
    journeyId: input.journeyId,
    incidentId: pipeline.incidentId,
    titleZh: input.titleZh,
    mandatory: true,
  });
  return {
    ...pipeline,
    regression,
    complete: false,
    reasonsZh: ['Regression 已沉淀'],
  };
}

/**
 * 结案门禁：P0/P1 必须 Trace→RootCause→Fix→Regression 齐全。
 */
export function closeIncidentPipeline(input: {
  incident: NaraIncidentRecordV1;
  pipeline: IncidentClosurePipelineV1;
}): IncidentClosurePipelineV1 {
  const p0p1 =
    input.incident.severity === 'P0' || input.incident.severity === 'P1';
  const reasonsZh: string[] = [];
  if (!input.pipeline.traceRef) reasonsZh.push('缺少 Trace');
  if (!input.pipeline.rootCauseZh) reasonsZh.push('缺少 Root Cause');
  if (!input.pipeline.fixRef) reasonsZh.push('缺少 Fix');
  if (p0p1 && !input.pipeline.regression) {
    reasonsZh.push('P0/P1 缺少 Regression');
  }
  if (input.pipeline.incidentId !== input.incident.incidentId) {
    reasonsZh.push('pipeline 与 incident 不匹配');
  }

  if (reasonsZh.length > 0) {
    return {
      ...input.pipeline,
      complete: false,
      reasonsZh: [
        ...reasonsZh,
        '每一个 P0/P1 必须完成 Trace → Root Cause → Fix → Regression',
      ],
    };
  }

  return {
    ...input.pipeline,
    complete: true,
    reasonsZh: ['Incident 闭环完成：Trace → Root Cause → Fix → Regression'],
  };
}
